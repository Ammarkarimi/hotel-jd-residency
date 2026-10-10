import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { addDays, today } from '../server/bookings.js';

let db;
let server;
let server2;
let base;
let base2;
let cookie = '';
const d = (n) => addDays(today(), n);

async function api(method, url, body, { auth = false } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(auth && cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && auth) cookie = setCookie.split(';')[0];
  return { status: res.status, body: await res.json() };
}

const guest = { guest_name: 'Asha Rao', phone: '+91 98765 43210', email: 'asha@example.com', adults: 2 };

const listen = async (app) => {
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  return s;
};

before(async () => {
  // TEST_DATABASE_URL runs the suite against a real Postgres server instead of the built-in one.
  db = await openDb(process.env.TEST_DATABASE_URL ? { url: process.env.TEST_DATABASE_URL } : { memory: true });
  server = await listen(await createApp(db));
  base = `http://127.0.0.1:${server.address().port}`;
  // A second app on the same database, like a second Vercel instance.
  server2 = await listen(await createApp(db));
  base2 = `http://127.0.0.1:${server2.address().port}`;
});

after(async () => {
  server.close();
  server2.close();
  await db.close();
});

test('public info lists active room types and settings', async () => {
  const { status, body } = await api('GET', '/api/public/info');
  assert.equal(status, 200);
  assert.equal(body.room_types.length, 3);
  assert.equal(body.settings.hotel_name, 'Hotel JD Residency');
  assert.equal(body.settings.session_secret, undefined);
});

test('admin routes require login', async () => {
  const { status } = await api('GET', '/api/admin/dashboard');
  assert.equal(status, 401);
});

test('wrong password is rejected, right one logs in', async () => {
  assert.equal((await api('POST', '/api/admin/login', { username: 'admin', password: 'nope' }, { auth: true })).status, 401);
  const ok = await api('POST', '/api/admin/login', { username: 'admin', password: 'jdresidency' }, { auth: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.admin.must_change_password, true);
  assert.equal((await api('GET', '/api/admin/me', null, { auth: true })).status, 200);
});

test('a login works on every server instance', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(base2 + '/api/admin/me', { headers: { cookie } });
    assert.equal(res.status, 200);
  }
});

test('booking validation', async () => {
  const bad = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 1, check_in: d(-1), check_out: d(1) });
  assert.equal(bad.status, 400);
  const reversed = await api('POST', '/api/public/bookings', { ...guest, room_type_id: 1, check_in: d(3), check_out: d(2) });
  assert.equal(reversed.status, 400);
  const tooMany = await api('POST', '/api/public/bookings', { ...guest, adults: 3, room_type_id: 1, check_in: d(2), check_out: d(3) });
  assert.equal(tooMany.status, 400);
});

test('Family Suite (2 rooms) sells out after two overlapping bookings', async () => {
  const stay = { room_type_id: 3, check_in: d(10), check_out: d(13) };
  const a = await api('POST', '/api/public/bookings', { ...guest, ...stay });
  assert.equal(a.status, 201);
  assert.match(a.body.booking.ref, /^JD[A-Z0-9]{6}$/);
  assert.equal(a.body.booking.total_amount, 4499 * 3);
  // Overlaps only the last night.
  assert.equal((await api('POST', '/api/public/bookings', { ...guest, ...stay, check_in: d(12), check_out: d(14) })).status, 201);
  const full = await api('POST', '/api/public/bookings', { ...guest, ...stay });
  assert.equal(full.status, 409);
  // Back-to-back stay (check-in on the other guest's check-out day) is fine.
  const avail = await api('GET', `/api/public/availability?check_in=${d(14)}&check_out=${d(15)}`);
  assert.equal(avail.body.results.find((r) => r.room_type_id === 3).available, 2);
  const busy = await api('GET', `/api/public/availability?check_in=${d(11)}&check_out=${d(13)}`);
  assert.equal(busy.body.results.find((r) => r.room_type_id === 3).available, 0);

  // Guest lookup needs the matching phone.
  const ref = a.body.booking.ref;
  assert.equal((await api('GET', `/api/public/bookings/${ref}?phone=0000000000`)).status, 404);
  assert.equal((await api('GET', `/api/public/bookings/${ref}?phone=9876543210`)).status, 200);
});

test('two guests racing for the last room: only one gets it', async () => {
  // Family Suite has 2 rooms; book one so a single room is left.
  const stay = { ...guest, guest_name: 'Race Guest', email: 'race@example.com', room_type_id: 3, check_in: d(30), check_out: d(31) };
  assert.equal((await api('POST', '/api/public/bookings', stay)).status, 201);
  const results = await Promise.all([1, 2, 3].map(() => api('POST', '/api/public/bookings', stay)));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
});

test('cancelling frees the room again', async () => {
  const list = await api('GET', '/api/admin/bookings?q=Asha', null, { auth: true });
  const first = list.body.bookings.find((b) => b.room_type_id === 3);
  const res = await api('PATCH', `/api/admin/bookings/${first.id}`, { status: 'cancelled' }, { auth: true });
  assert.equal(res.status, 200);
  const avail = await api('GET', `/api/public/availability?check_in=${d(10)}&check_out=${d(13)}`);
  assert.equal(avail.body.results.find((r) => r.room_type_id === 3).available, 1);
});

test('check-in auto-assigns a room and blocks double assignment', async () => {
  const created = await api(
    'POST',
    '/api/admin/bookings',
    { ...guest, guest_name: 'Walk In', room_type_id: 1, check_in: today(), check_out: d(2), status: 'checked_in' },
    { auth: true },
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.room_number, '101');

  const other = await api('POST', '/api/admin/bookings', { ...guest, room_type_id: 1, check_in: d(1), check_out: d(3) }, { auth: true });
  const clash = await api('PATCH', `/api/admin/bookings/${other.body.booking.id}`, { room_id: created.body.booking.room_id }, { auth: true });
  assert.equal(clash.status, 409);

  const dash = await api('GET', '/api/admin/dashboard', null, { auth: true });
  assert.equal(dash.body.in_house, 1);
  assert.equal(dash.body.forecast.length, 14);
});

test('room and room type management', async () => {
  const type = await api('POST', '/api/admin/room-types', { name: 'Studio', price: 2000, max_guests: 2, amenities: 'Wi-Fi, AC' }, { auth: true });
  assert.equal(type.status, 201);
  assert.deepEqual(type.body.room_type.amenities, ['Wi-Fi', 'AC']);
  const room = await api('POST', '/api/admin/rooms', { number: '401', room_type_id: type.body.room_type.id }, { auth: true });
  assert.equal(room.status, 201);
  assert.equal((await api('POST', '/api/admin/rooms', { number: '401', room_type_id: type.body.room_type.id }, { auth: true })).status, 409);
  assert.equal((await api('DELETE', `/api/admin/room-types/${type.body.room_type.id}`, null, { auth: true })).status, 409);
  assert.equal((await api('DELETE', `/api/admin/rooms/${room.body.room.id}`, null, { auth: true })).status, 200);
  assert.equal((await api('DELETE', `/api/admin/room-types/${type.body.room_type.id}`, null, { auth: true })).status, 200);
});

test('photo upload and gallery settings', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('fake-png-bytes').toString('base64');
  const up = await api('POST', '/api/admin/uploads', { data: png }, { auth: true });
  assert.equal(up.status, 201);
  assert.match(up.body.url, /^\/uploads\/[\w-]+\.png$/);
  const file = await fetch(base + up.body.url);
  assert.equal(file.status, 200);
  assert.equal((await api('POST', '/api/admin/uploads', { data: 'data:text/html;base64,PGI+' }, { auth: true })).status, 400);

  const ok = await api('PUT', '/api/admin/settings', { hero_image: up.body.url, gallery: [up.body.url] }, { auth: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(ok.body.settings.gallery), [up.body.url]);
  const bad = await api('PUT', '/api/admin/settings', { gallery: ['javascript:alert(1)'] }, { auth: true });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(base + '/uploads/missing.jpg')).status, 404);
});

test('settings update and password change', async () => {
  const s = await api('PUT', '/api/admin/settings', { phone: '+91 22 1234 5678', session_secret: 'hack' }, { auth: true });
  assert.equal(s.body.settings.phone, '+91 22 1234 5678');
  assert.equal(s.body.settings.session_secret, undefined);

  const oldCookie = cookie;
  const pw = await api('POST', '/api/admin/change-password', { current_password: 'jdresidency', new_password: 'new-secret-123' }, { auth: true });
  assert.equal(pw.status, 200);
  assert.equal(pw.body.admin.must_change_password, false);
  // Old session token is invalidated by the password change.
  const stale = await fetch(base + '/api/admin/me', { headers: { cookie: oldCookie } });
  assert.equal(stale.status, 401);
  assert.equal((await api('GET', '/api/admin/me', null, { auth: true })).status, 200);
});
