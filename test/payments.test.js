import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { addDays, today } from '../server/bookings.js';

const KEY_ID = 'rzp_test_abc123';
const KEY_SECRET = 'key-secret';
const WEBHOOK_SECRET = 'hook-secret';

// A stand-in for Razorpay's API: creates orders, and reports payments as the tests set them up.
const orders = new Map();
const payments = new Map();
const calls = [];
let failOrders = false;
const rzp = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json');
    const reply = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    if (req.method === 'POST' && req.url === '/v1/orders') {
      if (failOrders) return reply(401, { error: { description: 'Authentication failed' } });
      const order = { id: `order_${orders.size + 1}`, ...JSON.parse(body), status: 'created' };
      orders.set(order.id, order);
      return reply(200, order);
    }
    const m = /^\/v1\/payments\/([\w]+)(\/capture)?$/.exec(req.url);
    if (m && payments.has(m[1])) {
      const p = payments.get(m[1]);
      if (m[2]) p.status = 'captured';
      return reply(200, p);
    }
    reply(404, { error: { description: 'Not found' } });
  });
});

let db;
let server;
let base;
let cookie = '';
const d = (n) => addDays(today(), n);
const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function api(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
    body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, body: await res.json() };
}

/** The guest pays in Razorpay Checkout: Razorpay now knows the payment and the browser gets a signature. */
function guestPays(order, { status = 'authorized', amount = order.amount } = {}) {
  const id = `pay_${payments.size + 1}`;
  payments.set(id, { id, order_id: order.id, amount, currency: 'INR', status });
  return { razorpay_payment_id: id, razorpay_order_id: order.id, razorpay_signature: sign(KEY_SECRET, `${order.id}|${id}`) };
}

function webhook(event, paymentId, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify({ event, payload: { payment: { entity: payments.get(paymentId) } } });
  return api('POST', '/api/public/payments/razorpay/webhook', raw, { 'x-razorpay-signature': sign(secret, raw) });
}

const guest = { guest_name: 'Asha Rao', phone: '98765 43210', email: 'asha@example.com', adults: 2 };
const adminBooking = async (ref) => (await api('GET', `/api/admin/bookings?q=${ref}`)).body.bookings[0];
const familyLeft = async (from, to) =>
  (await api('GET', `/api/public/availability?check_in=${from}&check_out=${to}`)).body.results.find((r) => r.room_type_id === 3).available;

before(async () => {
  await new Promise((r) => rzp.listen(0, r));
  process.env.RAZORPAY_API_BASE = `http://127.0.0.1:${rzp.address().port}`;
  db = await openDb({ memory: true });
  server = (await createApp(db)).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await api('POST', '/api/admin/login', { username: 'admin', password: 'jdresidency' });
});

after(async () => {
  server.close();
  rzp.close();
  delete process.env.RAZORPAY_API_BASE;
  await db.close();
});

test('pay at hotel is the default; online payment needs keys, and secrets are write-only', async () => {
  assert.equal((await api('GET', '/api/public/info')).body.payments.online, false);
  const b = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 1, check_in: d(3), check_out: d(4) });
  assert.equal(b.body.booking.status, 'pending');
  assert.equal(b.body.payment, undefined);

  assert.equal((await api('PUT', '/api/admin/payments', { pay_mode: 'razorpay' })).status, 400);
  assert.equal((await api('PUT', '/api/admin/payments', { rzp_key_id: 'abc' })).status, 400);
  const saved = await api('PUT', '/api/admin/payments', {
    pay_mode: 'razorpay', rzp_key_id: KEY_ID, rzp_key_secret: KEY_SECRET, rzp_webhook_secret: WEBHOOK_SECRET,
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.payments.online, true);
  assert.equal(saved.body.payments.test_mode, true);
  assert.equal(saved.body.payments.rzp_key_secret, undefined);
  assert.equal(saved.body.payments.rzp_key_secret_set, true);
  assert.match(saved.body.payments.webhook_url, /\/api\/public\/payments\/razorpay\/webhook$/);
  const info = await api('GET', '/api/public/info');
  assert.equal(info.body.payments.online, true);
  assert.doesNotMatch(JSON.stringify(info.body), /key-secret|hook-secret/);
});

test('online payment: the room is held, and the booking reaches staff once paid', async () => {
  const before = await familyLeft(d(5), d(7));
  const b = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 3, check_in: d(5), check_out: d(7) });
  assert.equal(b.status, 201);
  assert.equal(b.body.booking.status, 'awaiting_payment');
  const { payment } = b.body;
  assert.equal(payment.key, KEY_ID);
  assert.equal(payment.amount, 4499 * 2 * 100);
  const order = orders.get(payment.order_id);
  assert.equal(order.amount, payment.amount);
  assert.equal(order.receipt, b.body.booking.ref);
  assert.equal(calls.at(-1).auth, `Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
  assert.equal(await familyLeft(d(5), d(7)), before - 1, 'room is held while the guest pays');
  assert.equal((await api('GET', '/api/admin/dashboard')).body.pending, 1, 'unpaid booking is not in the to-do list');

  const paid = guestPays(order);
  const forged = await api('POST', `/api/public/bookings/${b.body.booking.ref}/payment`, { ...paid, razorpay_signature: 'f'.repeat(64) });
  assert.equal(forged.status, 400);

  const ok = await api('POST', `/api/public/bookings/${b.body.booking.ref}/payment`, paid);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.booking.status, 'pending');
  assert.equal(ok.body.booking.payment_status, 'paid');
  assert.equal(ok.body.booking.amount_paid, 8998);
  assert.equal(payments.get(paid.razorpay_payment_id).status, 'captured', 'authorized payment is captured');

  // The webhook for the same payment changes nothing.
  assert.equal((await webhook('payment.captured', paid.razorpay_payment_id)).status, 200);
  const row = await adminBooking(b.body.booking.ref);
  assert.equal(row.status, 'pending');
  assert.equal(row.payment_id, paid.razorpay_payment_id);
  assert.equal(row.amount_paid, 8998);
});

test('a payment for a different amount or order is refused', async () => {
  const b = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 1, check_in: d(8), check_out: d(9) });
  const order = orders.get(b.body.payment.order_id);
  const short = guestPays(order, { amount: 100 });
  assert.equal((await api('POST', `/api/public/bookings/${b.body.booking.ref}/payment`, short)).status, 400);
  const other = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 1, check_in: d(8), check_out: d(9) });
  const otherPaid = guestPays(orders.get(other.body.payment.order_id));
  assert.equal((await api('POST', `/api/public/bookings/${b.body.booking.ref}/payment`, otherPaid)).status, 400);
  assert.equal((await adminBooking(b.body.booking.ref)).payment_status, 'awaiting');
});

test('webhook confirms the payment when the guest closed the page, and rejects bad signatures', async () => {
  const b = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 2, check_in: d(10), check_out: d(11) });
  const paid = guestPays(orders.get(b.body.payment.order_id), { status: 'captured' });
  assert.equal((await webhook('payment.captured', paid.razorpay_payment_id, 'wrong-secret')).status, 400);
  assert.equal((await adminBooking(b.body.booking.ref)).status, 'awaiting_payment');
  assert.equal((await webhook('payment.captured', paid.razorpay_payment_id)).status, 200);
  const row = await adminBooking(b.body.booking.ref);
  assert.equal(row.status, 'pending');
  assert.equal(row.payment_status, 'paid');
});

test('unpaid holds expire; a late payment is kept if a room is still free, otherwise flagged for refund', async () => {
  const expire = (ref) => db.query("UPDATE bookings SET hold_until = now() - interval '1 minute' WHERE ref = ?", [ref]);

  const late = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 3, check_in: d(30), check_out: d(31) });
  await expire(late.body.booking.ref);
  assert.equal(await familyLeft(d(30), d(31)), 2, 'expired hold frees the room');
  assert.equal((await adminBooking(late.body.booking.ref)).status, 'cancelled');
  const paid = guestPays(orders.get(late.body.payment.order_id));
  const ok = await api('POST', `/api/public/bookings/${late.body.booking.ref}/payment`, paid);
  assert.equal(ok.body.booking.status, 'pending', 'revived because a room was still free');

  const tooLate = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 3, check_in: d(40), check_out: d(41) });
  await expire(tooLate.body.booking.ref);
  for (const name of ['Walk In One', 'Walk In Two']) {
    const r = await api('POST', '/api/admin/bookings', { ...guest, guest_name: name, room_type_id: 3, check_in: d(40), check_out: d(41) });
    assert.equal(r.status, 201);
  }
  const lost = guestPays(orders.get(tooLate.body.payment.order_id), { status: 'captured' });
  await webhook('payment.captured', lost.razorpay_payment_id);
  const row = await adminBooking(tooLate.body.booking.ref);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.payment_status, 'paid');
  assert.match(row.admin_notes, /refund payment pay_\d+ in Razorpay/);
});

test('if Razorpay is unreachable the guest is told, and no room stays held', async () => {
  failOrders = true;
  const before = await familyLeft(d(50), d(51));
  const r = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 3, check_in: d(50), check_out: d(51) });
  failOrders = false;
  assert.equal(r.status, 502);
  assert.match(r.body.error, /Online payment could not be started/);
  assert.equal(await familyLeft(d(50), d(51)), before);
});
