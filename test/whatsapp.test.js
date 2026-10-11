import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { addDays, today } from '../server/bookings.js';
import { fillMessage, normalizeNumber } from '../server/whatsapp.js';

// A stand-in for Meta's WhatsApp Cloud API that records every message it receives.
const sent = [];
let failNext = false;
const meta = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    sent.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.setHeader('content-type', 'application/json');
    if (failNext) {
      failNext = false;
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: { message: 'Template name does not exist in the translation' } }));
    }
    res.end(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }));
  });
});

let db;
let server;
let base;
let cookie = '';
const d = (n) => addDays(today(), n);

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return { status: res.status, body: await res.json() };
}

const guest = { guest_name: 'Asha Rao', phone: '98765 43210', adults: 2, room_type_id: 1 };

before(async () => {
  await new Promise((r) => meta.listen(0, r));
  process.env.WHATSAPP_API_BASE = `http://127.0.0.1:${meta.address().port}`;
  db = await openDb({ memory: true });
  server = (await createApp(db)).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await api('POST', '/api/admin/login', { username: 'admin', password: 'jdresidency' });
});

after(async () => {
  server.close();
  meta.close();
  delete process.env.WHATSAPP_API_BASE;
  await db.close();
});

test('phone numbers are normalised for WhatsApp', () => {
  assert.equal(normalizeNumber('+91 98200 12345'), '919820012345');
  assert.equal(normalizeNumber('098200 12345'), '919820012345');
  assert.equal(normalizeNumber('9820012345'), '919820012345');
  assert.equal(normalizeNumber('+44 7700 900123'), '447700900123');
  assert.equal(normalizeNumber('12345'), '');
  assert.equal(fillMessage('Hi {name}, ref {ref} {unknown}', { name: 'Asha', ref: 'JD1' }), 'Hi Asha, ref JD1 {unknown}');
});

test('link mode (default): no automatic owner alert, confirmation opens WhatsApp with the message', async () => {
  const b = await api('POST', '/api/public/bookings', { ...guest, check_in: d(5), check_out: d(7) });
  assert.equal(b.status, 201);
  assert.equal(sent.length, 0);

  const list = await api('GET', `/api/admin/bookings?q=${b.body.booking.ref}`);
  const id = list.body.bookings[0].id;
  // Can't confirm to the guest before the booking itself is confirmed.
  assert.equal((await api('POST', `/api/admin/bookings/${id}/whatsapp-confirmation`)).status, 400);
  await api('PATCH', `/api/admin/bookings/${id}`, { status: 'confirmed', room_id: 1 });

  const r = await api('POST', `/api/admin/bookings/${id}/whatsapp-confirmation`);
  assert.equal(r.status, 200);
  assert.equal(r.body.whatsapp.mode, 'link');
  assert.match(r.body.whatsapp.url, /^https:\/\/wa\.me\/919876543210\?text=/);
  const text = decodeURIComponent(r.body.whatsapp.url.split('text=')[1]);
  assert.match(text, /Hello Asha, your booking at Hotel JD Residency is confirmed/);
  assert.match(text, /Room: Deluxe Room, Room 101/);
  assert.equal(r.body.notifications[0].status, 'opened');
  assert.equal(sent.length, 0);
});

test('WhatsApp settings: token is write-only and numbers are validated', async () => {
  const bad = await api('PUT', '/api/admin/whatsapp', { wa_owner_numbers: '12345' });
  assert.equal(bad.status, 400);
  const ok = await api('PUT', '/api/admin/whatsapp', {
    wa_mode: 'api',
    wa_owner_numbers: '+91 99999 11111, 98888 22222',
    wa_phone_number_id: '123456789012345',
    wa_token: 'secret-token',
    sender: '+91 90000 12345',
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.whatsapp.wa_token, undefined);
  assert.equal(ok.body.whatsapp.wa_token_set, true);
  assert.equal(ok.body.whatsapp.api_ready, true);
  assert.equal(ok.body.whatsapp.sender, '+91 90000 12345');
  // Saving again without a token keeps the stored one.
  const again = await api('PUT', '/api/admin/whatsapp', { wa_template_lang: 'en_US' });
  assert.equal(again.body.whatsapp.wa_token_set, true);
  // Owner numbers and token never reach the public website.
  const info = await api('GET', '/api/public/info');
  assert.doesNotMatch(JSON.stringify(info.body), /secret-token|99999/);
});

test('api mode: website booking alerts every owner number; staff confirmation is sent to the guest', async () => {
  sent.length = 0;
  const b = await api('POST', '/api/public/bookings', { ...guest, guest_name: 'Rahul Verma', phone: '+91 91234 56789', check_in: d(8), check_out: d(9) });
  assert.equal(b.status, 201);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((m) => m.body.to).sort(), ['919888822222', '919999911111']);
  const alert = sent[0].body;
  assert.equal(sent[0].auth, 'Bearer secret-token');
  assert.match(sent[0].url, /\/123456789012345\/messages$/);
  assert.equal(alert.template.name, 'new_booking_alert');
  assert.equal(alert.template.language.code, 'en_US');
  const params = alert.template.components[0].parameters.map((p) => p.text);
  assert.equal(params[0], b.body.booking.ref);
  assert.equal(params[1], 'Rahul Verma');

  const id = (await api('GET', `/api/admin/bookings?q=${b.body.booking.ref}`)).body.bookings[0].id;
  const detail = await api('GET', `/api/admin/bookings/${id}`);
  assert.equal(detail.body.notifications.filter((n) => n.kind === 'owner_alert' && n.status === 'sent').length, 2);

  sent.length = 0;
  const confirmed = await api('PATCH', `/api/admin/bookings/${id}`, { status: 'confirmed' });
  assert.ok(confirmed.body.booking.room_number, 'confirming allocates a room');
  assert.equal(sent.length, 0, 'auto-send is off by default');
  const r = await api('POST', `/api/admin/bookings/${id}/whatsapp-confirmation`);
  assert.equal(r.body.whatsapp.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to, '919123456789');
  assert.equal(sent[0].body.template.name, 'booking_confirmed');
  const guestParams = sent[0].body.template.components[0].parameters.map((p) => p.text);
  assert.equal(guestParams[0], 'Rahul');
  assert.match(guestParams[3], new RegExp(`Room ${confirmed.body.booking.room_number}$`));
});

test('api mode: auto-send on confirm, and failures are recorded without breaking anything', async () => {
  await api('PUT', '/api/admin/whatsapp', { wa_auto_confirm: true });
  const b = await api('POST', '/api/public/bookings', { ...guest, guest_name: 'Meera Iyer', check_in: d(11), check_out: d(12) });
  const id = (await api('GET', `/api/admin/bookings?q=${b.body.booking.ref}`)).body.bookings[0].id;
  sent.length = 0;
  const confirmed = await api('PATCH', `/api/admin/bookings/${id}`, { status: 'confirmed' });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.whatsapp.ok, true);
  assert.equal(sent.length, 1);

  // WhatsApp rejects the message: the booking still goes through and the error is shown to staff.
  failNext = true;
  const b2 = await api('POST', '/api/public/bookings', { ...guest, guest_name: 'Karan Shah', check_in: d(14), check_out: d(15) });
  assert.equal(b2.status, 201);
  const id2 = (await api('GET', `/api/admin/bookings?q=${b2.body.booking.ref}`)).body.bookings[0].id;
  const notes = (await api('GET', `/api/admin/bookings/${id2}`)).body.notifications;
  assert.ok(notes.some((n) => n.status === 'failed' && /Template name/.test(n.detail)));
});

test('test message goes to the owner numbers', async () => {
  sent.length = 0;
  const r = await api('POST', '/api/admin/whatsapp/test');
  assert.equal(r.status, 200);
  assert.equal(r.body.results.length, 2);
  assert.ok(r.body.results.every((x) => x.ok));
  assert.equal(sent[0].body.template.components[0].parameters[0].text, 'JDTEST01');
});
