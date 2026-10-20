import { Router } from 'express';
import { LOCK_BOOKINGS, publicSettings } from '../db.js';
import { notifyOwner } from '../whatsapp.js';
import {
  HOLD_MINUTES, HttpError, availability, availableCount, bookingRow, expireHolds, newRef, parseGuest, today, validateStay,
} from '../bookings.js';
import {
  capturedPayment, checkoutOptions, createOrder, payConfig, payOnline, recordPayment, validCheckoutSignature,
  validWebhookSignature,
} from '../payments.js';

export function roomTypeOut(t) {
  return { ...t, amenities: JSON.parse(t.amenities || '[]'), active: !!t.active };
}

export function publicRoutes(db) {
  const r = Router();

  r.get('/info', async (_req, res) => {
    const types = await db.query('SELECT * FROM room_types WHERE active = 1 ORDER BY sort_order, id');
    const { n: rooms } = await db.one("SELECT COUNT(*)::int AS n FROM rooms WHERE status = 'active'");
    // `today` is the hotel's date, which can differ from the visitor's around midnight.
    const pay = await payConfig(db);
    res.json({
      settings: await publicSettings(db),
      room_types: types.map(roomTypeOut),
      room_count: rooms,
      today: today(),
      payments: { online: payOnline(pay), hold_minutes: HOLD_MINUTES },
    });
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
    const pay = await payConfig(db);
    const online = payOnline(pay);

    let booking = await db.tx(async (t) => {
      // One booking write at a time, so two guests can't both take the last room.
      await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_BOOKINGS]);
      await expireHolds(t);
      const type = await t.one('SELECT * FROM room_types WHERE id = ? AND active = 1', [roomTypeId]);
      if (!type) throw new HttpError(400, 'Please choose a room.');
      if (guest.adults + guest.children > type.max_guests) {
        throw new HttpError(400, `${type.name} fits up to ${type.max_guests} guests.`);
      }
      if ((await availableCount(t, type.id, body.check_in, body.check_out)) < 1) {
        throw new HttpError(409, `Sorry, ${type.name} is sold out for those dates. Try other dates or another room.`);
      }
      // With online payment the room is only held until the guest pays.
      const { id } = await t.one(
        `INSERT INTO bookings (ref, room_type_id, guest_name, phone, email, adults, children, check_in, check_out,
                               total_amount, status, source, special_requests, payment_status, hold_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website', ?, ?, ${online ? `now() + interval '${HOLD_MINUTES} minutes'` : 'NULL'})
         RETURNING id`,
        [
          await newRef(t), type.id, guest.guest_name, guest.phone, guest.email, guest.adults, guest.children,
          body.check_in, body.check_out, type.price * nights, online ? 'awaiting_payment' : 'pending', guest.special_requests,
          online ? 'awaiting' : 'none',
        ],
      );
      return bookingRow(t, id);
    });

    if (!online) {
      // Awaited (not fire-and-forget) because serverless functions may pause once the response is sent.
      await notifyOwner(db, booking, { adminUrl: adminUrl(req) });
      return res.status(201).json({ booking: guestView(booking) });
    }

    try {
      const order = await createOrder(pay, booking);
      await db.query('UPDATE bookings SET payment_order_id = ? WHERE id = ?', [order.id, booking.id]);
      booking = { ...booking, payment_order_id: order.id };
    } catch (err) {
      console.error('Razorpay order failed:', err);
      await db.query(
        `UPDATE bookings SET status = 'cancelled', payment_status = 'failed', admin_notes = ?, updated_at = now() WHERE id = ?`,
        [`Online payment could not be started: ${err.message}`.slice(0, 500), booking.id],
      );
      throw new HttpError(502, 'Online payment could not be started. Please try again in a minute, or call us to book.');
    }
    res.status(201).json({ booking: guestView(booking), payment: checkoutOptions(pay, booking, await publicSettings(db)) });
  });

  // The guest's browser reports a successful Razorpay payment.
  r.post('/bookings/:ref/payment', async (req, res) => {
    const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = req.body || {};
    const b = await db.one('SELECT * FROM bookings WHERE ref = ?', [String(req.params.ref).toUpperCase()]);
    const pay = await payConfig(db);
    if (!b || !b.payment_order_id || orderId !== b.payment_order_id || !validCheckoutSignature(pay, orderId, paymentId, signature)) {
      throw new HttpError(400, 'We could not verify this payment. If money was taken, please call us with your booking reference.');
    }
    const result = await recordPayment(db, b.id, await capturedPayment(pay, String(paymentId), b));
    if (result.newlyPaid) await notifyOwner(db, result.booking, { adminUrl: adminUrl(req) });
    res.json({ booking: guestView(result.booking) });
  });

  // Razorpay calls this when a payment is captured, even if the guest closed the page.
  r.post('/payments/razorpay/webhook', async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const pay = await payConfig(db);
    if (!validWebhookSignature(pay.rzp_webhook_secret, raw, req.get('x-razorpay-signature'))) {
      throw new HttpError(400, 'Invalid signature.');
    }
    const event = JSON.parse(raw.toString('utf8'));
    const payment = event.payload?.payment?.entity;
    if (!['payment.captured', 'payment.authorized', 'order.paid'].includes(event.event) || !payment?.order_id) {
      return res.json({ ok: true, ignored: true });
    }
    const b = await db.one('SELECT * FROM bookings WHERE payment_order_id = ?', [payment.order_id]);
    if (!b) return res.json({ ok: true, ignored: true });
    // Re-checked with Razorpay (and captured if needed) rather than trusting the event alone.
    const result = await recordPayment(db, b.id, await capturedPayment(pay, payment.id, b));
    if (result.newlyPaid) await notifyOwner(db, result.booking, { adminUrl: adminUrl(req) });
    res.json({ ok: true });
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
    payment_status: b.payment_status,
    amount_paid: b.amount_paid,
  };
}

const adminUrl = (req) => `${req.protocol}://${req.get('host')}/admin`;
