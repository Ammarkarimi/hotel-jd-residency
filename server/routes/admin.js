import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, publicSettings, transaction } from '../db.js';
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

export function adminRoutes(db, secret, uploadDir) {
  const r = Router();
  const limiter = loginLimiter();

  /* ---------- auth ---------- */

  r.post('/login', (req, res) => {
    const ip = req.ip;
    if (limiter.blocked(ip)) throw new HttpError(429, 'Too many attempts. Please wait 15 minutes and try again.');
    const { username, password } = req.body || {};
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(str(username, 80));
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

  r.post('/change-password', (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (!verifyPassword(String(current_password || ''), req.admin.password_hash)) {
      throw new HttpError(400, 'Current password is incorrect.');
    }
    if (String(new_password || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');
    const hash = hashPassword(String(new_password));
    db.prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, req.admin.id);
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    setSessionCookie(res, createToken(admin, secret));
    res.json({ admin: adminOut(admin) });
  });

  /* ---------- dashboard ---------- */

  r.get('/dashboard', (_req, res) => {
    const t = today();
    const { n: sellable } = db.prepare("SELECT COUNT(*) AS n FROM rooms WHERE status = 'active'").get();
    const { n: totalRooms } = db.prepare('SELECT COUNT(*) AS n FROM rooms').get();
    const count = (sql, ...args) => db.prepare(sql).get(...args).n;
    const occupiedOn = db.prepare(`
      SELECT COUNT(*) AS n FROM bookings
      WHERE status IN ('pending','confirmed','checked_in') AND check_in <= ? AND check_out > ?`);

    const forecast = [];
    for (let i = 0; i < 14; i++) {
      const date = addDays(t, i);
      forecast.push({ date, booked: occupiedOn.get(date, date).n, rooms: sellable });
    }
    const monthStart = t.slice(0, 8) + '01';
    const nextMonth = addDays(monthStart, 32).slice(0, 8) + '01';

    res.json({
      today: t,
      rooms: { total: totalRooms, sellable },
      arrivals: count("SELECT COUNT(*) AS n FROM bookings WHERE check_in = ? AND status IN ('pending','confirmed')", t),
      departures: count("SELECT COUNT(*) AS n FROM bookings WHERE check_out <= ? AND status = 'checked_in'", t),
      in_house: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'checked_in'"),
      pending: count("SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending'"),
      occupied_tonight: forecast[0].booked,
      month_revenue: db
        .prepare(`
          SELECT COALESCE(SUM(total_amount), 0) AS n FROM bookings
          WHERE status IN ('confirmed','checked_in','checked_out') AND check_in >= ? AND check_in < ?`)
        .get(monthStart, nextMonth).n,
      forecast,
      arrivals_list: listBookings("b.check_in = ? AND b.status IN ('pending','confirmed')", [t]),
      departures_list: listBookings("b.check_out <= ? AND b.status = 'checked_in'", [t]),
      recent: listBookings('1 = 1', [], 'b.created_at DESC, b.id DESC', 8),
    });
  });

  function listBookings(where, args, order = 'b.check_in, b.id', limit = 500) {
    return db
      .prepare(`
        SELECT b.*, t.name AS room_type_name, r.number AS room_number
        FROM bookings b
        JOIN room_types t ON t.id = b.room_type_id
        LEFT JOIN rooms r ON r.id = b.room_id
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${limit}`)
      .all(...args);
  }

  /* ---------- bookings ---------- */

  r.get('/bookings', (req, res) => {
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
      where.push('(b.guest_name LIKE ? OR b.phone LIKE ? OR b.ref LIKE ? OR b.email LIKE ?)');
      const like = `%${str(q, 80)}%`;
      args.push(like, like, like, like);
    }
    const order = view === 'upcoming' ? 'b.check_in, b.id' : 'b.check_in DESC, b.id DESC';
    res.json({ bookings: listBookings(where.join(' AND ') || '1 = 1', args, order) });
  });

  r.get('/bookings/:id', (req, res) => {
    const b = bookingRow(db, int(req.params.id));
    if (!b) throw new HttpError(404, 'Booking not found.');
    res.json({ booking: b });
  });

  r.post('/bookings', (req, res) => {
    const body = req.body || {};
    const nights = validateStay(body.check_in, body.check_out, { allowPast: true });
    const guest = parseGuest(body);
    const status = ALL_STATUSES.includes(body.status) ? body.status : 'confirmed';
    const source = ['walk_in', 'phone', 'website', 'ota', 'other'].includes(body.source) ? body.source : 'walk_in';

    const booking = transaction(db, () => {
      const type = db.prepare('SELECT * FROM room_types WHERE id = ?').get(int(body.room_type_id));
      if (!type) throw new HttpError(400, 'Please choose a room type.');
      if (ACTIVE_STATUSES.includes(status) && availableCount(db, type.id, body.check_in, body.check_out) < 1) {
        throw new HttpError(409, `No ${type.name} is free for those dates.`);
      }
      let roomId = body.room_id ? int(body.room_id) : null;
      if (roomId) checkRoom(roomId, type.id, body.check_in, body.check_out, 0);
      if (status === 'checked_in' && !roomId) roomId = autoRoom(type.id, body.check_in, body.check_out, 0);
      const total = body.total_amount !== undefined && body.total_amount !== '' ? int(body.total_amount) : type.price * nights;
      if (!Number.isInteger(total) || total < 0) throw new HttpError(400, 'Total amount must be a positive number.');
      const { lastInsertRowid } = db
        .prepare(`
          INSERT INTO bookings (ref, room_type_id, room_id, guest_name, phone, email, adults, children, check_in,
                                check_out, total_amount, status, source, special_requests, admin_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          newRef(db), type.id, roomId, guest.guest_name, guest.phone, guest.email, guest.adults, guest.children,
          body.check_in, body.check_out, total, status, source, guest.special_requests, str(body.admin_notes, 2000),
        );
      return bookingRow(db, lastInsertRowid);
    });
    res.status(201).json({ booking });
  });

  r.patch('/bookings/:id', (req, res) => {
    const id = int(req.params.id);
    const body = req.body || {};
    const booking = transaction(db, () => {
      const cur = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
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
      const type = db.prepare('SELECT * FROM room_types WHERE id = ?').get(next.room_type_id);
      if (!type) throw new HttpError(400, 'Unknown room type.');

      const isActive = ACTIVE_STATUSES.includes(next.status);
      const wasActive = ACTIVE_STATUSES.includes(cur.status);
      if (isActive && (datesChanged || typeChanged || !wasActive)) {
        if (availableCount(db, type.id, next.check_in, next.check_out, id) < 1) {
          throw new HttpError(409, `No ${type.name} is free for those dates.`);
        }
      }

      if ('room_id' in body) next.room_id = body.room_id ? int(body.room_id) : null;
      else if (typeChanged) next.room_id = null;
      if (next.room_id && isActive) checkRoom(next.room_id, type.id, next.check_in, next.check_out, id);
      if (next.status === 'checked_in' && !next.room_id) {
        next.room_id = autoRoom(type.id, next.check_in, next.check_out, id);
      }

      if ('total_amount' in body && body.total_amount !== '' && body.total_amount !== null) {
        next.total_amount = int(body.total_amount);
        if (!Number.isInteger(next.total_amount) || next.total_amount < 0) {
          throw new HttpError(400, 'Total amount must be a positive number.');
        }
      } else if (datesChanged || typeChanged) {
        next.total_amount = type.price * nights;
      }

      db.prepare(`
        UPDATE bookings SET room_type_id = ?, room_id = ?, guest_name = ?, phone = ?, email = ?, adults = ?,
          children = ?, check_in = ?, check_out = ?, total_amount = ?, status = ?, special_requests = ?,
          admin_notes = ?, updated_at = datetime('now')
        WHERE id = ?`).run(
        next.room_type_id, next.room_id, next.guest_name, next.phone, next.email, next.adults, next.children,
        next.check_in, next.check_out, next.total_amount, next.status, next.special_requests, next.admin_notes, id,
      );
      return bookingRow(db, id);
    });
    res.json({ booking });
  });

  r.delete('/bookings/:id', (req, res) => {
    const { changes } = db.prepare('DELETE FROM bookings WHERE id = ?').run(int(req.params.id));
    if (!changes) throw new HttpError(404, 'Booking not found.');
    res.json({ ok: true });
  });

  function checkRoom(roomId, roomTypeId, checkIn, checkOut, bookingId) {
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!room) throw new HttpError(400, 'Unknown room.');
    if (room.room_type_id !== roomTypeId) throw new HttpError(400, `Room ${room.number} is a different room type.`);
    if (room.status !== 'active') throw new HttpError(409, `Room ${room.number} is under maintenance.`);
    const clash = roomConflict(db, roomId, checkIn, checkOut, bookingId);
    if (clash) throw new HttpError(409, `Room ${room.number} is already given to ${clash.guest_name} (${clash.ref}) on those dates.`);
  }

  function autoRoom(roomTypeId, checkIn, checkOut, bookingId) {
    const room = freeRoomFor(db, roomTypeId, checkIn, checkOut, bookingId);
    if (!room) throw new HttpError(409, 'No free room of this type to check the guest into.');
    return room.id;
  }

  /* ---------- calendar ---------- */

  r.get('/calendar', (req, res) => {
    const from = isDate(req.query.from) ? req.query.from : today();
    const days = Math.min(62, Math.max(7, int(req.query.days) || 14));
    const to = addDays(from, days);
    const rooms = db
      .prepare(`
        SELECT r.*, t.name AS room_type_name, t.accent FROM rooms r
        JOIN room_types t ON t.id = r.room_type_id
        ORDER BY t.sort_order, t.id, r.number`)
      .all();
    const bookings = listBookings(
      "b.check_in < ? AND b.check_out > ? AND b.status IN ('pending','confirmed','checked_in','checked_out')",
      [to, from],
    );
    res.json({ from, days, rooms, bookings });
  });

  /* ---------- room types ---------- */

  r.get('/room-types', (_req, res) => {
    const types = db
      .prepare(`
        SELECT t.*, (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = t.id) AS room_count
        FROM room_types t ORDER BY t.sort_order, t.id`)
      .all();
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

  r.post('/room-types', (req, res) => {
    const t = parseRoomType(req.body || {});
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO room_types (${TYPE_COLS.join(', ')}) VALUES (${TYPE_COLS.map(() => '?').join(', ')})`)
      .run(...TYPE_COLS.map((c) => t[c]));
    res.status(201).json({ room_type: roomTypeOut(db.prepare('SELECT * FROM room_types WHERE id = ?').get(lastInsertRowid)) });
  });

  r.put('/room-types/:id', (req, res) => {
    const t = parseRoomType(req.body || {});
    const { changes } = db
      .prepare(`UPDATE room_types SET ${TYPE_COLS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...TYPE_COLS.map((c) => t[c]), int(req.params.id));
    if (!changes) throw new HttpError(404, 'Room type not found.');
    res.json({ room_type: roomTypeOut(db.prepare('SELECT * FROM room_types WHERE id = ?').get(int(req.params.id))) });
  });

  r.delete('/room-types/:id', (req, res) => {
    const id = int(req.params.id);
    const used =
      db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE room_type_id = ?').get(id).n +
      db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE room_type_id = ?').get(id).n;
    if (used) throw new HttpError(409, 'This room type has rooms or bookings. Hide it from the website instead.');
    db.prepare('DELETE FROM room_types WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  /* ---------- rooms ---------- */

  r.get('/rooms', (_req, res) => {
    const t = today();
    const rooms = db
      .prepare(`
        SELECT r.*, t.name AS room_type_name, t.accent,
          (SELECT b.guest_name FROM bookings b WHERE b.room_id = r.id AND b.status = 'checked_in' LIMIT 1) AS current_guest,
          (SELECT b.id FROM bookings b WHERE b.room_id = r.id AND b.status = 'checked_in' LIMIT 1) AS current_booking_id,
          (SELECT MIN(b.check_in) FROM bookings b WHERE b.room_id = r.id AND b.status IN ('pending','confirmed') AND b.check_in >= ?) AS next_arrival
        FROM rooms r JOIN room_types t ON t.id = r.room_type_id
        ORDER BY t.sort_order, t.id, r.number`)
      .all(t);
    res.json({ rooms });
  });

  function parseRoom(body) {
    const room = {
      number: str(body.number, 20),
      room_type_id: int(body.room_type_id),
      floor: str(body.floor, 20),
      status: body.status === 'maintenance' ? 'maintenance' : 'active',
      notes: str(body.notes, 500),
    };
    if (!room.number) throw new HttpError(400, 'Room number is required.');
    if (!db.prepare('SELECT 1 FROM room_types WHERE id = ?').get(room.room_type_id)) throw new HttpError(400, 'Choose a room type.');
    return room;
  }

  function uniqueNumber(fn) {
    try {
      return fn();
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'A room with that number already exists.');
      throw err;
    }
  }

  r.post('/rooms', (req, res) => {
    const room = parseRoom(req.body || {});
    const { lastInsertRowid } = uniqueNumber(() =>
      db
        .prepare('INSERT INTO rooms (number, room_type_id, floor, status, notes) VALUES (?, ?, ?, ?, ?)')
        .run(room.number, room.room_type_id, room.floor, room.status, room.notes),
    );
    res.status(201).json({ room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(lastInsertRowid) });
  });

  r.put('/rooms/:id', (req, res) => {
    const id = int(req.params.id);
    const room = parseRoom(req.body || {});
    const cur = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id);
    if (!cur) throw new HttpError(404, 'Room not found.');
    if (cur.room_type_id !== room.room_type_id && hasActiveBookings(id)) {
      throw new HttpError(409, 'This room has upcoming guests. Move them to another room before changing its type.');
    }
    uniqueNumber(() =>
      db
        .prepare('UPDATE rooms SET number = ?, room_type_id = ?, floor = ?, status = ?, notes = ? WHERE id = ?')
        .run(room.number, room.room_type_id, room.floor, room.status, room.notes, id),
    );
    res.json({ room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) });
  });

  r.delete('/rooms/:id', (req, res) => {
    const id = int(req.params.id);
    if (hasActiveBookings(id)) throw new HttpError(409, 'This room has upcoming guests. Move them to another room first.');
    db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  function hasActiveBookings(roomId) {
    return !!db
      .prepare("SELECT 1 FROM bookings WHERE room_id = ? AND status IN ('pending','confirmed','checked_in') LIMIT 1")
      .get(roomId);
  }

  /* ---------- settings ---------- */

  r.get('/settings', (_req, res) => res.json({ settings: publicSettings(db) }));

  r.put('/settings', (req, res) => {
    const body = req.body || {};
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    if ('gallery' in body) body.gallery = JSON.stringify(parseGallery(body.gallery));
    if ('hero_image' in body && body.hero_image && !isImagePath(body.hero_image)) {
      throw new HttpError(400, 'Hero image must be an uploaded photo or a web link.');
    }
    transaction(db, () => {
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (key in body) upsert.run(key, str(body[key], key === 'gallery' ? 20000 : 500));
      }
    });
    res.json({ settings: publicSettings(db) });
  });

  /* ---------- photo uploads ---------- */

  r.post('/uploads', (req, res) => {
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.data || ''));
    if (!match) throw new HttpError(400, 'Please choose a JPG, PNG or WebP photo.');
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 6 * 1024 * 1024) throw new HttpError(413, 'Photo is too large (max 6 MB).');
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(path.join(uploadDir, name), buf);
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
