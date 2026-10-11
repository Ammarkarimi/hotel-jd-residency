import { Router } from 'express';
import { LOCK_BOOKINGS, publicSettings } from '../db.js';
import { notifyOwner } from '../whatsapp.js';
import {
  HttpError, availability, availableCount, bookingRow, newRef, parseGuest, today, validateStay,
} from '../bookings.js';

export function roomTypeOut(t) {
  return { ...t, amenities: JSON.parse(t.amenities || '[]'), active: !!t.active };
}

export function publicRoutes(db) {
  const r = Router();

  r.get('/info', async (_req, res) => {
    const types = await db.query('SELECT * FROM room_types WHERE active = 1 ORDER BY sort_order, id');
    const { n: rooms } = await db.one("SELECT COUNT(*)::int AS n FROM rooms WHERE status = 'active'");
    // `today` is the hotel's date, which can differ from the visitor's around midnight.
    res.json({ settings: await publicSettings(db), room_types: types.map(roomTypeOut), room_count: rooms, today: today() });
  });

  r.get('/availability', async (req, res) => {
    const guests = Math.max(1, Number.parseInt(req.query.guests, 10) || 1);
    res.json({ results: await availability(db, req.query.check_in, req.query.check_out, guests) });
  });

  r.post('/bookings', async (req, res) => {
    const body = req.body || {};
    // Honeypot field: real visitors never see or fill it.
    if (body.website) throw new HttpError(400, 'Booking could not be submitted.');
    const nights = validateStay(body.check_in, body.check_out);
    const guest = parseGuest(body);
    const roomTypeId = Number.parseInt(body.room_type_id, 10);

    const booking = await db.tx(async (t) => {
      // One booking write at a time, so two guests can't both take the last room.
      await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_BOOKINGS]);
      const type = await t.one('SELECT * FROM room_types WHERE id = ? AND active = 1', [roomTypeId]);
      if (!type) throw new HttpError(400, 'Please choose a room.');
      if (guest.adults + guest.children > type.max_guests) {
        throw new HttpError(400, `${type.name} fits up to ${type.max_guests} guests.`);
      }
      if ((await availableCount(t, type.id, body.check_in, body.check_out)) < 1) {
        throw new HttpError(409, `Sorry, ${type.name} is sold out for those dates. Try other dates or another room.`);
      }
      const { id } = await t.one(
        `INSERT INTO bookings (ref, room_type_id, guest_name, phone, email, adults, children, check_in, check_out,
                               total_amount, status, source, special_requests)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'website', ?) RETURNING id`,
        [
          await newRef(t), type.id, guest.guest_name, guest.phone, guest.email, guest.adults, guest.children,
          body.check_in, body.check_out, type.price * nights, guest.special_requests,
        ],
      );
      return bookingRow(t, id);
    });

    // Awaited (not fire-and-forget) because serverless functions may pause once the response is sent.
    await notifyOwner(db, booking, { adminUrl: `${req.protocol}://${req.get('host')}/admin` });
    res.status(201).json({ booking: guestView(booking) });
  });

  // Guests look up their booking with reference + phone number.
  r.get('/bookings/:ref', async (req, res) => {
    const b = await db.one('SELECT id, phone FROM bookings WHERE ref = ?', [String(req.params.ref).toUpperCase()]);
    const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);
    if (!b || !digits(req.query.phone) || digits(b.phone) !== digits(req.query.phone)) {
      throw new HttpError(404, 'No booking found with that reference and phone number.');
    }
    res.json({ booking: guestView(await bookingRow(db, b.id)) });
  });

  return r;
}

function guestView(b) {
  return {
    ref: b.ref,
    guest_name: b.guest_name,
    room_type_name: b.room_type_name,
    check_in: b.check_in,
    check_out: b.check_out,
    adults: b.adults,
    children: b.children,
    total_amount: b.total_amount,
    status: b.status,
  };
}
