import crypto from 'node:crypto';
import { LOCK_BOOKINGS, getSettings } from './db.js';
import { HOLD_MINUTES, HttpError, availableCount, bookingRow } from './bookings.js';

// Online payment through Razorpay (UPI, cards, netbanking, wallets).
//
// Two modes, chosen in the admin panel:
//   hotel    – guests pay at the hotel; website bookings go straight to staff.
//   razorpay – guests pay the full amount when they book. The booking holds a room
//              ('awaiting_payment') for HOLD_MINUTES and only reaches staff once the
//              payment succeeds. Payments are confirmed twice over: by the guest's
//              browser right after paying, and by Razorpay's webhook (which also
//              covers guests who close the page before returning).

export const PAY_DEFAULTS = {
  pay_mode: 'hotel',
  rzp_key_id: '',
  rzp_key_secret: '',
  rzp_webhook_secret: '',
};

export const PAY_MODES = ['hotel', 'razorpay'];
const ENV = { rzp_key_id: 'RAZORPAY_KEY_ID', rzp_key_secret: 'RAZORPAY_KEY_SECRET', rzp_webhook_secret: 'RAZORPAY_WEBHOOK_SECRET' };
const API_BASE = () => process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com';

/** Payment settings, with RAZORPAY_* env vars taking priority over what was saved in the admin panel. */
export async function payConfig(db) {
  const all = await getSettings(db);
  const cfg = Object.fromEntries(Object.keys(PAY_DEFAULTS).map((k) => [k, all[k] ?? PAY_DEFAULTS[k]]));
  for (const [key, env] of Object.entries(ENV)) if (process.env[env]) cfg[key] = process.env[env];
  return cfg;
}

/** The config as the admin panel sees it: secrets are never sent back, only whether they are set. */
export function payConfigOut(cfg) {
  const { rzp_key_secret: secret, rzp_webhook_secret: webhook, ...rest } = cfg;
  return {
    ...rest,
    rzp_key_secret_set: !!secret,
    rzp_webhook_secret_set: !!webhook,
    from_env: Object.fromEntries(Object.entries(ENV).map(([k, env]) => [k, !!process.env[env]])),
    test_mode: cfg.rzp_key_id.startsWith('rzp_test_'),
    online: payOnline(cfg),
  };
}

export const payOnline = (cfg) => cfg.pay_mode === 'razorpay' && !!cfg.rzp_key_id && !!cfg.rzp_key_secret;

async function razorpay(cfg, method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${API_BASE()}/v1${path}`, {
      method,
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.rzp_key_id}:${cfg.rzp_key_secret}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
    return data;
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Razorpay did not respond in time.' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

export function createOrder(cfg, booking) {
  return razorpay(cfg, 'POST', '/orders', {
    amount: booking.total_amount * 100,
    currency: 'INR',
    receipt: booking.ref,
    notes: { booking_ref: booking.ref, guest: booking.guest_name },
  });
}

/** What the website needs to open Razorpay Checkout for a booking. */
export function checkoutOptions(cfg, booking, settings) {
  return {
    key: cfg.rzp_key_id,
    order_id: booking.payment_order_id,
    amount: booking.total_amount * 100,
    currency: 'INR',
    name: settings.hotel_name,
    description: `${booking.room_type_name} · Booking ${booking.ref}`,
    prefill: { name: booking.guest_name, contact: booking.phone, email: booking.email || undefined },
    // Close the payment window a little before the room hold runs out.
    timeout: (HOLD_MINUTES - 5) * 60,
  };
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

export const validCheckoutSignature = (cfg, orderId, paymentId, signature) =>
  !!signature && safeEqual(hmac(cfg.rzp_key_secret, `${orderId}|${paymentId}`), signature);

export const validWebhookSignature = (secret, rawBody, signature) => !!secret && !!signature && safeEqual(hmac(secret, rawBody), signature);

/**
 * Checks a payment with Razorpay and captures it if the account doesn't capture
 * automatically. Returns the captured payment, or throws if it isn't for this booking.
 */
export async function capturedPayment(cfg, paymentId, booking) {
  let p = await razorpay(cfg, 'GET', `/payments/${encodeURIComponent(paymentId)}`);
  if (p.order_id !== booking.payment_order_id || p.amount !== booking.total_amount * 100) {
    throw new HttpError(400, 'This payment does not match the booking.');
  }
  if (p.status === 'authorized') {
    p = await razorpay(cfg, 'POST', `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: p.amount, currency: p.currency });
  }
  if (p.status !== 'captured') throw new HttpError(402, 'The payment did not go through. Please try again.');
  return p;
}

/**
 * Marks a booking as paid (safe to call more than once for the same payment).
 * A payment that arrives after the room hold ran out still counts: the booking is
 * revived if a room is free, otherwise staff are told to refund it.
 */
export function recordPayment(db, bookingId, payment) {
  return db.tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_BOOKINGS]);
    const cur = await t.one('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (cur.payment_status === 'paid') return { booking: await bookingRow(t, bookingId), newlyPaid: false };

    let status = cur.status;
    let note = '';
    if (status === 'awaiting_payment') status = 'pending';
    else if (status === 'cancelled') {
      const expired = cur.payment_status === 'expired';
      if (expired && (await availableCount(t, cur.room_type_id, cur.check_in, cur.check_out, cur.id)) > 0) status = 'pending';
      else if (expired) note = `Paid online after the room hold ran out, and no room of this type is free any more. Please refund payment ${payment.id} in Razorpay.`;
      else note = `Paid online, but this booking had been cancelled. Refund payment ${payment.id} in Razorpay if needed.`;
    }
    const amount = Math.round(payment.amount / 100);
    await t.query(
      `UPDATE bookings SET status = ?, payment_status = 'paid', amount_paid = ?, payment_id = ?, paid_at = now(),
         admin_notes = CASE WHEN ? = '' THEN admin_notes ELSE trim(admin_notes || E'\\n' || ?) END, updated_at = now()
       WHERE id = ?`,
      [status, amount, payment.id, note, note, bookingId],
    );
    return { booking: await bookingRow(t, bookingId), newlyPaid: true, needsRefund: !!note };
  });
}
