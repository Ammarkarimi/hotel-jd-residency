import crypto from 'node:crypto';

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'checked_in'];
export const ALL_STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
const ACTIVE_SQL = `('${ACTIVE_STATUSES.join("','")}')`;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const TZ = process.env.HOTEL_TIMEZONE || 'Asia/Kolkata';

export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  );
}

export function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400e3);
}

export function validateStay(checkIn, checkOut, { allowPast = false } = {}) {
  if (!isDate(checkIn) || !isDate(checkOut)) throw new HttpError(400, 'Please choose valid check-in and check-out dates.');
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw new HttpError(400, 'Check-out must be at least one night after check-in.');
  if (nights > 60) throw new HttpError(400, 'Stays longer than 60 nights need to be booked by phone.');
  if (!allowPast && checkIn < today()) throw new HttpError(400, 'Check-in date cannot be in the past.');
  if (checkIn > addDays(today(), 365)) throw new HttpError(400, 'Bookings open up to one year in advance.');
  return nights;
}

/** Rooms of a type still free on every night of [checkIn, checkOut). */
export async function availableCount(db, roomTypeId, checkIn, checkOut, excludeBookingId = 0) {
  const { sellable, booked } = await db.one(
    `SELECT
       (SELECT COUNT(*)::int FROM rooms WHERE room_type_id = ? AND status = 'active') AS sellable,
       (SELECT COALESCE(MAX(c), 0)::int FROM (
          SELECT COUNT(b.id) AS c
          FROM generate_series(?::date, ?::date - 1, interval '1 day') AS night
          LEFT JOIN bookings b
            ON b.room_type_id = ? AND b.status IN ${ACTIVE_SQL} AND b.id <> ?
           AND b.check_in <= to_char(night, 'YYYY-MM-DD') AND b.check_out > to_char(night, 'YYYY-MM-DD')
          GROUP BY night) per_night) AS booked`,
    [roomTypeId, checkIn, checkOut, roomTypeId, excludeBookingId],
  );
  return Math.max(0, sellable - booked);
}

export async function availability(db, checkIn, checkOut, guests = 1) {
  const nights = validateStay(checkIn, checkOut);
  const types = await db.query('SELECT * FROM room_types WHERE active = 1 ORDER BY sort_order, id');
  return Promise.all(
    types.map(async (t) => ({
      room_type_id: t.id,
      name: t.name,
      price: t.price,
      nights,
      total: t.price * nights,
      max_guests: t.max_guests,
      fits: guests <= t.max_guests,
      available: await availableCount(db, t.id, checkIn, checkOut),
    })),
  );
}

/** Is a specific room free for the dates (ignoring one booking, e.g. the one being edited)? */
export function roomConflict(db, roomId, checkIn, checkOut, excludeBookingId = 0) {
  return db.one(
    `SELECT ref, guest_name FROM bookings
     WHERE room_id = ? AND id <> ? AND status IN ${ACTIVE_SQL}
       AND check_in < ? AND check_out > ?
     LIMIT 1`,
    [roomId, excludeBookingId, checkOut, checkIn],
  );
}

export function freeRoomFor(db, roomTypeId, checkIn, checkOut, excludeBookingId = 0) {
  return db.one(
    `SELECT r.* FROM rooms r
     WHERE r.room_type_id = ? AND r.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.room_id = r.id AND b.id <> ? AND b.status IN ${ACTIVE_SQL}
           AND b.check_in < ? AND b.check_out > ?)
     ORDER BY r.number
     LIMIT 1`,
    [roomTypeId, excludeBookingId, checkOut, checkIn],
  );
}

export async function newRef(db) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.randomBytes(6);
    const ref = 'JD' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    if (!(await db.one('SELECT 1 FROM bookings WHERE ref = ?', [ref]))) return ref;
  }
}

const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export function parseGuest(body) {
  const guest = {
    guest_name: clean(body.guest_name, 120),
    phone: clean(body.phone, 30),
    email: clean(body.email, 160),
    adults: Number.parseInt(body.adults, 10),
    children: Number.parseInt(body.children ?? 0, 10),
    special_requests: clean(body.special_requests, 1000),
  };
  if (guest.guest_name.length < 2) throw new HttpError(400, 'Please enter the guest name.');
  if (!/^[+\d][\d\s-]{6,}$/.test(guest.phone)) throw new HttpError(400, 'Please enter a valid phone number.');
  if (guest.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email)) throw new HttpError(400, 'Please enter a valid email.');
  if (!Number.isInteger(guest.adults) || guest.adults < 1 || guest.adults > 10) throw new HttpError(400, 'Adults must be between 1 and 10.');
  if (!Number.isInteger(guest.children) || guest.children < 0 || guest.children > 10) guest.children = 0;
  return guest;
}

export function bookingRow(db, id) {
  return db.one(
    `SELECT b.*, t.name AS room_type_name, r.number AS room_number
     FROM bookings b
     JOIN room_types t ON t.id = b.room_type_id
     LEFT JOIN rooms r ON r.id = b.room_id
     WHERE b.id = ?`,
    [id],
  );
}
