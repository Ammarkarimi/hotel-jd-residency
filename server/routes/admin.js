import { Router } from 'express';
import crypto from 'node:crypto';
import { DEFAULT_SETTINGS, LOCK_BOOKINGS, publicSettings } from '../db.js';
import {
  createToken, setSessionCookie, clearSessionCookie, requireAdmin, verifyPassword, hashPassword, loginLimiter,
} from '../auth.js';
import {
  ACTIVE_STATUSES, ALL_STATUSES, HttpError, addDays, availableCount, bookingRow, freeRoomFor, isDate, newRef,
  parseGuest, roomConflict, today, validateStay,
} from '../bookings.js';
import { roomTypeOut } from './public.js';

const int = (v) => Number.parseInt(v, 10);
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const isUniqueViolation = (err) => err?.code === '23505' || /unique|duplicate key/i.test(String(err?.message));

export function adminRoutes(db, secret) {
  const r = Router();
  const limiter = loginLimiter();

  /* ---------- auth ---------- */

  r.post('/login', async (req, res) => {
    const ip = req.ip;
    if (limiter.blocked(ip)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
    const { username, password } = req.body || {};
    const admin = await db.one('SELECT * FROM admins WHERE lower(username) = lower(?)', [str(username, 80)]);
    if (!admin || !verifyPassword(String(password || ''), admin.password_hash)) {
      limiter.fail(ip);
      throw new HttpError(401, 'Wrong username or password.');
    }
    limiter.reset(ip);
    setSessionCookie(res, createToken(admin, secret));
    res.json({ admin: adminOut(admin) });
  });

  r.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  r.use(requireAdmin(db, secret));

  r.get('/me', (req, res) => res.json({ admin: adminOut(req.admin) }));

  r.post('/change-password', async (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!verifyPassword(String(current_password || ''), req.admin.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    if (String(new_password || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
    const admin = await db.one(
      'UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ? RETURNING *',
      [hashPassword(String(new_password)), req.admin.id],
    );
    setSessionCookie(res, createToken(admin, secret));
    res.json({ admin: adminOut(admin) });
  });

  /* ---------- dashboard ---------- */

  r.get('/dashboard', async (_req, res) => {
    const t = today();
    const count = async (sql, args = []) => (await db.one(sql, args)).n;
    const monthStart = t.slice(0, 8) + '01';
    const nextMonth = addDays(monthStart, 32).slice(0, 8) + '01';

    const [sellable, totalRooms, nights, arrivals, departures, inHouse, pending, monthRevenue, arrivalsList, departuresList, recent] =
      await Promise.all([
        count("SELECT COUNT(*)::int AS n FROM rooms WHERE status = 'active'"),
        count('SELECT COUNT(*)::int AS n FROM rooms'),
        db.query(
          `SELECT to_char(night, 'YYYY-MM-DD') AS date, COUNT(b.id)::int AS booked
           FROM generate_series(?::date, ?::date, interval '1 day') AS night
           LEFT JOIN bookings b
             ON b.status IN ('pending','confirmed','checked_in')
            AND b.check_in <= to_char(night, 'YYYY-MM-DD') AND b.check_out > to_char(night, 'YYYY-MM-DD')
           GROUP BY night ORDER BY night`,
          [t, addDays(t, 13)],
        ),
        count("SELECT COUNT(*)::int AS n FROM bookings WHERE check_in = ? AND status IN ('pending','confirmed')", [t]),
        count("SELECT COUNT(*)::int AS n FROM bookings WHERE check_out <= ? AND status = 'checked_in'", [t]),
        count("SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'checked_in'"),
        count("SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'pending'"),
        count(
          `SELECT COALESCE(SUM(total_amount), 0)::int AS n FROM bookings
           WHERE status IN ('confirmed','checked_in','checked_out') AND check_in >= ? AND check_in < ?`,
          [monthStart, nextMonth],
        ),
        listBookings("b.check_in = ? AND b.status IN ('pending','confirmed')", [t]),
        listBookings("b.check_out <= ? AND b.status = 'checked_in'", [t]),
        listBookings('1 = 1', [], 'b.created_at DESC, b.id DESC', 8),
      ]);
    const forecast = nights.map((n) => ({ ...n, rooms: sellable }));

    res.json({
      today: t,
      rooms: { total: totalRooms, sellable },
      arrivals,
      departures,
      in_house: inHouse,
      pending,
      occupied_tonight: forecast[0].booked,
      month_revenue: monthRevenue,
      forecast,
      arrivals_list: arrivalsList,
      departures_list: departuresList,
      recent,
    });
  });

  function listBookings(where, args, order = 'b.check_in, b.id', limit = 500, q = db) {
    return q.query(
      `SELECT b.*, t.name AS room_type_name, r.number AS room_number
       FROM bookings b
       JOIN room_types t ON t.id = b.room_type_id
       LEFT JOIN rooms r ON r.id = b.room_id
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${limit}`,
      args,
    );
  }

  /* ---------- bookings ---------- */

  r.get('/bookings', async (req, res) => {
    const where = [];
    const args = [];
    const { status, q, view } = req.query;
    if (status && ALL_STATUSES.includes(status)) {
      where.push('b.status = ?');
      args.push(status);
    }
    if (view === 'upcoming') {
      where.push("b.check_out >= ? AND b.status IN ('pending','confirmed','checked_in')");
      args.push(today());
    }
    if (isDate(req.query.from)) {
      where.push('b.check_out > ?');
      args.push(req.query.from);
    }
    if (isDate(req.query.to)) {
      where.push('b.check_in <= ?');
      args.push(req.query.to);
    }
    if (q) {
      where.push('(b.guest_name ILIKE ? OR b.phone ILIKE ? OR b.ref ILIKE ? OR b.email ILIKE ?)');
      const like = `%${str(q, 80)}%`;
      args.push(like, like, like, like);
    }
    const order = view === 'upcoming' ? 'b.check_in, b.id' : 'b.check_in DESC, b.id DESC';
    res.json({ bookings: await listBookings(where.join(' AND ') || '1 = 1', args, order) });
  });

  r.get('/bookings/:id', async (req, res) => {
    const b = await bookingRow(db, int(req.params.id));
    if (!b) throw new HttpError(404, 'Booking not found.');
    res.json({ booking: b });
  });

  r.post('/bookings', async (req, res) => {
    const body = req.body || {};
    const nights = validateStay(body.check_in, body.check_out, { allowPast: true });
    const guest = parseGuest(body);
    const status = ALL_STATUSES.includes(body.status) ? body.status : 'confirmed';
    const source = ['walk_in', 'phone', 'website', 'ota', 'other'].includes(body.source) ? body.source : 'walk_in';

    const booking = await db.tx(async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_BOOKINGS]);
      const type = await t.one('SELECT * FROM room_types WHERE id = ?', [int(body.room_type_id)]);
      if (!type) throw new HttpError(400, 'Please choose a room type.');
      if (ACTIVE_STATUSES.includes(status) && (await availableCount(t, type.id, body.check_in, body.check_out)) < 1) {
        throw new HttpError(409, `No ${type.name} is free for those dates.`);
      }
      let roomId = body.room_id ? int(body.room_id) : null;
      if (roomId) await checkRoom(t, roomId, type.id, body.check_in, body.check_out, 0);
      if (status === 'checked_in' && !roomId) roomId = await autoRoom(t, type.id, body.check_in, body.check_out, 0);
      const total = body.total_amount !== undefined && body.total_amount !== '' ? int(body.total_amount) : type.price * nights;
      if (!Number.isInteger(total) || total < 0) throw new HttpError(400, 'Total amount must be a positive number.');
      const { id } = await t.one(
        `INSERT INTO bookings (ref, room_type_id, room_id, guest_name, phone, email, adults, children, check_in,
                               check_out, total_amount, status, source, special_requests, admin_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          await newRef(t), type.id, roomId, guest.guest_name, guest.phone, guest.email, guest.adults, guest.children,
          body.check_in, body.check_out, total, status, source, guest.special_requests, str(body.admin_notes, 2000),
        ],
      );
      return bookingRow(t, id);
    });
    res.status(201).json({ booking });
  });

  r.patch('/bookings/:id', async (req, res) => {
    const id = int(req.params.id);
    const body = req.body || {};
    const booking = await db.tx(async (t) => {
      await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_BOOKINGS]);
      const cur = await t.one('SELECT * FROM bookings WHERE id = ?', [id]);
      if (!cur) throw new HttpError(404, 'Booking not found.');
      const next = { ...cur };

      if (['guest_name', 'phone', 'email', 'adults', 'children', 'special_requests'].some((k) => k in body)) {
        Object.assign(next, parseGuest({ ...cur, ...body }));
      }
      if ('admin_notes' in body) next.admin_notes = str(body.admin_notes, 2000);
      if ('status' in body) {
        if (!ALL_STATUSES.includes(body.status)) throw new HttpError(400, 'Unknown status.');
        next.status = body.status;
      }
      if ('check_in' in body) next.check_in = body.check_in;
      if ('check_out' in body) next.check_out = body.check_out;
      if ('room_type_id' in body) next.room_type_id = int(body.room_type_id);

      const datesChanged = next.check_in !== cur.check_in || next.check_out !== cur.check_out;
      const typeChanged = next.room_type_id !== cur.room_type_id;
      const nights = validateStay(next.check_in, next.check_out, { allowPast: true });
      const type = await t.one('SELECT * FROM room_types WHERE id = ?', [next.room_type_id]);
      if (!type) throw new HttpError(400, 'Unknown room type.');

      const isActive = ACTIVE_STATUSES.includes(next.status);
      const wasActive = ACTIVE_STATUSES.includes(cur.status);
      if (isActive && (datesChanged || typeChanged || !wasActive)) {
        if ((await availableCount(t, type.id, next.check_in, next.check_out, id)) < 1) {
          throw new HttpError(409, `No ${type.name} is free for those dates.`);
        }
      }

      if ('room_id' in body) next.room_id = body.room_id ? int(body.room_id) : null;
      else if (typeChanged) next.room_id = null;
      if (next.room_id && isActive) await checkRoom(t, next.room_id, type.id, next.check_in, next.check_out, id);
      if (next.status === 'checked_in' && !next.room_id) {
        next.room_id = await autoRoom(t, type.id, next.check_in, next.check_out, id);
      }

      if ('total_amount' in body && body.total_amount !== '' && body.total_amount !== null) {
        next.total_amount = int(body.total_amount);
        if (!Number.isInteger(next.total_amount) || next.total_amount < 0) {
          throw new HttpError(400, 'Total amount must be a positive number.');
        }
      } else if (datesChanged || typeChanged) {
        next.total_amount = type.price * nights;
      }

      await t.query(
        `UPDATE bookings SET room_type_id = ?, room_id = ?, guest_name = ?, phone = ?, email = ?, adults = ?,
           children = ?, check_in = ?, check_out = ?, total_amount = ?, status = ?, special_requests = ?,
           admin_notes = ?, updated_at = now()
         WHERE id = ?`,
        [
          next.room_type_id, next.room_id, next.guest_name, next.phone, next.email, next.adults, next.children,
          next.check_in, next.check_out, next.total_amount, next.status, next.special_requests, next.admin_notes, id,
        ],
      );
      return bookingRow(t, id);
    });
    res.json({ booking });
  });

  r.delete('/bookings/:id', async (req, res) => {
    const gone = await db.one('DELETE FROM bookings WHERE id = ? RETURNING id', [int(req.params.id)]);
    if (!gone) throw new HttpError(404, 'Booking not found.');
    res.json({ ok: true });
  });

  async function checkRoom(q, roomId, roomTypeId, checkIn, checkOut, bookingId) {
    const room = await q.one('SELECT * FROM rooms WHERE id = ?', [roomId]);
    if (!room) throw new HttpError(400, 'Unknown room.');
    if (room.room_type_id !== roomTypeId) throw new HttpError(400, `Room ${room.number} is a different room type.`);
    if (room.status !== 'active') throw new HttpError(409, `Room ${room.number} is under maintenance.`);
    const clash = await roomConflict(q, roomId, checkIn, checkOut, bookingId);
    if (clash) throw new HttpError(409, `Room ${room.number} is already given to ${clash.guest_name} (${clash.ref}) on those dates.`);
  }

  async function autoRoom(q, roomTypeId, checkIn, checkOut, bookingId) {
    const room = await freeRoomFor(q, roomTypeId, checkIn, checkOut, bookingId);
    if (!room) throw new HttpError(409, 'No free room of this type to check the guest into.');
    return room.id;
  }

  /* ---------- calendar ---------- */

  r.get('/calendar', async (req, res) => {
    const from = isDate(req.query.from) ? req.query.from : today();
    const days = Math.min(62, Math.max(7, int(req.query.days) || 14));
    const to = addDays(from, days);
    const [rooms, bookings] = await Promise.all([
      db.query(
        `SELECT r.*, t.name AS room_type_name, t.accent FROM rooms r
         JOIN room_types t ON t.id = r.room_type_id
         ORDER BY t.sort_order, t.id, r.number`,
      ),
      listBookings(
        "b.check_in < ? AND b.check_out > ? AND b.status IN ('pending','confirmed','checked_in','checked_out')",
        [to, from],
      ),
    ]);
    res.json({ from, days, rooms, bookings });
  });

  /* ---------- room types ---------- */

  r.get('/room-types', async (_req, res) => {
    const types = await db.query(
      `SELECT t.*, (SELECT COUNT(*)::int FROM rooms r WHERE r.room_type_id = t.id) AS room_count
       FROM room_types t ORDER BY t.sort_order, t.id`,
    );
    res.json({ room_types: types.map(roomTypeOut) });
  });

  function parseRoomType(body) {
    const t = {
      name: str(body.name, 80),
      tagline: str(body.tagline, 160),
      description: str(body.description, 2000),
      price: int(body.price),
      max_guests: int(body.max_guests),
      beds: str(body.beds, 80),
      size_sqft: body.size_sqft ? int(body.size_sqft) : null,
      amenities: JSON.stringify(
        (Array.isArray(body.amenities) ? body.amenities : String(body.amenities || '').split(','))
          .map((a) => str(a, 60))
          .filter(Boolean)
          .slice(0, 20),
      ),
      image_url: str(body.image_url, 500),
      accent: /^#[0-9a-f]{6}$/i.test(body.accent) ? body.accent : '#b8862f',
      sort_order: int(body.sort_order) || 0,
      active: body.active === false || body.active === 0 ? 0 : 1,
    };
    if (t.name.length < 2) throw new HttpError(400, 'Room type needs a name.');
    if (!Number.isInteger(t.price) || t.price < 0) throw new HttpError(400, 'Price must be a positive number.');
    if (!Number.isInteger(t.max_guests) || t.max_guests < 1) throw new HttpError(400, 'Max guests must be at least 1.');
    if (t.image_url && !/^(https?:\/\/|\/)/.test(t.image_url)) throw new HttpError(400, 'Image must be a web link (https://…).');
    return t;
  }

  const TYPE_COLS = ['name', 'tagline', 'description', 'price', 'max_guests', 'beds', 'size_sqft', 'amenities', 'image_url', 'accent', 'sort_order', 'active'];

  r.post('/room-types', async (req, res) => {
    const t = parseRoomType(req.body || {});
    const row = await db.one(
      `INSERT INTO room_types (${TYPE_COLS.join(', ')}) VALUES (${TYPE_COLS.map(() => '?').join(', ')}) RETURNING *`,
      TYPE_COLS.map((c) => t[c]),
    );
    res.status(201).json({ room_type: roomTypeOut(row) });
  });

  r.put('/room-types/:id', async (req, res) => {
    const t = parseRoomType(req.body || {});
    const row = await db.one(
      `UPDATE room_types SET ${TYPE_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ? RETURNING *`,
      [...TYPE_COLS.map((c) => t[c]), int(req.params.id)],
    );
    if (!row) throw new HttpError(404, 'Room type not found.');
    res.json({ room_type: roomTypeOut(row) });
  });

  r.delete('/room-types/:id', async (req, res) => {
    const id = int(req.params.id);
    const { n: used } = await db.one(
      `SELECT (SELECT COUNT(*) FROM rooms WHERE room_type_id = ?) + (SELECT COUNT(*) FROM bookings WHERE room_type_id = ?) AS n`,
      [id, id],
    );
    if (Number(used)) throw new HttpError(409, 'This room type has rooms or bookings. Hide it from the website instead.');
    await db.query('DELETE FROM room_types WHERE id = ?', [id]);
    res.json({ ok: true });
  });

  /* ---------- rooms ---------- */

  r.get('/rooms', async (_req, res) => {
    const rooms = await db.query(
      `SELECT r.*, t.name AS room_type_name, t.accent,
         (SELECT b.guest_name FROM bookings b WHERE b.room_id = r.id AND b.status = 'checked_in' LIMIT 1) AS current_guest,
         (SELECT b.id FROM bookings b WHERE b.room_id = r.id AND b.status = 'checked_in' LIMIT 1) AS current_booking_id,
         (SELECT MIN(b.check_in) FROM bookings b WHERE b.room_id = r.id AND b.status IN ('pending','confirmed') AND b.check_in >= ?) AS next_arrival
       FROM rooms r JOIN room_types t ON t.id = r.room_type_id
       ORDER BY t.sort_order, t.id, r.number`,
      [today()],
    );
    res.json({ rooms });
  });

  async function parseRoom(body) {
    const room = {
      number: str(body.number, 20),
      room_type_id: int(body.room_type_id),
      floor: str(body.floor, 20),
      status: body.status === 'maintenance' ? 'maintenance' : 'active',
      notes: str(body.notes, 500),
    };
    if (!room.number) throw new HttpError(400, 'Room number is required.');
    if (!Number.isInteger(room.room_type_id) || !(await db.one('SELECT 1 FROM room_types WHERE id = ?', [room.room_type_id]))) {
      throw new HttpError(400, 'Choose a room type.');
    }
    return room;
  }

  async function uniqueNumber(promise) {
    try {
      return await promise;
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'A room with that number already exists.');
      throw err;
    }
  }

  r.post('/rooms', async (req, res) => {
    const room = await parseRoom(req.body || {});
    const row = await uniqueNumber(
      db.one('INSERT INTO rooms (number, room_type_id, floor, status, notes) VALUES (?, ?, ?, ?, ?) RETURNING *', [
        room.number, room.room_type_id, room.floor, room.status, room.notes,
      ]),
    );
    res.status(201).json({ room: row });
  });

  r.put('/rooms/:id', async (req, res) => {
    const id = int(req.params.id);
    const room = await parseRoom(req.body || {});
    const cur = await db.one('SELECT * FROM rooms WHERE id = ?', [id]);
    if (!cur) throw new HttpError(404, 'Room not found.');
    if (cur.room_type_id !== room.room_type_id && (await hasActiveBookings(id))) {
      throw new HttpError(409, 'This room has upcoming guests. Move them to another room before changing its type.');
    }
    const row = await uniqueNumber(
      db.one('UPDATE rooms SET number = ?, room_type_id = ?, floor = ?, status = ?, notes = ? WHERE id = ? RETURNING *', [
        room.number, room.room_type_id, room.floor, room.status, room.notes, id,
      ]),
    );
    res.json({ room: row });
  });

  r.delete('/rooms/:id', async (req, res) => {
    const id = int(req.params.id);
    if (await hasActiveBookings(id)) throw new HttpError(409, 'This room has upcoming guests. Move them to another room first.');
    await db.query('DELETE FROM rooms WHERE id = ?', [id]);
    res.json({ ok: true });
  });

  async function hasActiveBookings(roomId) {
    return !!(await db.one(
      "SELECT 1 FROM bookings WHERE room_id = ? AND status IN ('pending','confirmed','checked_in') LIMIT 1",
      [roomId],
    ));
  }

  /* ---------- settings ---------- */

  r.get('/settings', async (_req, res) => res.json({ settings: await publicSettings(db) }));

  r.put('/settings', async (req, res) => {
    const body = req.body || {};
    if ('gallery' in body) body.gallery = JSON.stringify(parseGallery(body.gallery));
    if ('hero_image' in body && body.hero_image && !isImagePath(body.hero_image)) {
      throw new HttpError(400, 'Hero image must be an uploaded photo or a web link.');
    }
    await db.tx(async (t) => {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!(key in body)) continue;
        await t.query(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          [key, str(body[key], key === 'gallery' ? 20000 : 500)],
        );
      }
    });
    res.json({ settings: await publicSettings(db) });
  });

  /* ---------- photo uploads (stored in the database) ---------- */

  r.post('/uploads', async (req, res) => {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''));
    if (!match) throw new HttpError(400, 'Please choose a JPG, PNG or WebP photo.');
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'Photo is too large (max 4 MB).');
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    await db.query('INSERT INTO photos (id, mime, data) VALUES (?, ?, ?)', [name, `image/${match[1]}`, buf]);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  return r;
}

function isImagePath(s) {
  return /^(\/uploads\/[\w.-]+|\/images\/[\w./-]+|https:\/\/\S+)$/.test(String(s));
}

function parseGallery(v) {
  let list = v;
  if (typeof v === 'string') {
    try {
      list = JSON.parse(v || '[]');
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) throw new HttpError(400, 'Gallery must be a list of photos.');
  const clean = list.map((s) => String(s).trim()).filter(Boolean);
  if (clean.some((s) => !isImagePath(s))) throw new HttpError(400, 'Gallery photos must be uploaded photos or web links.');
  return clean.slice(0, 40);
}

function adminOut(a) {
  return { id: a.id, username: a.username, must_change_password: !!a.must_change_password };
}
