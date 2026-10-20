import crypto from 'node:crypto';
import { hashPassword } from './auth.js';
import { addDays, newRef, today } from './bookings.js';

// Data lives in Postgres. On Vercel that's the Neon database linked to the project
// (DATABASE_URL); locally, without DATABASE_URL, an embedded Postgres (PGlite) stores
// data in data/pglite so nothing needs to be installed.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id                   SERIAL PRIMARY KEY,
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),
  max_guests  INTEGER NOT NULL DEFAULT 2 CHECK (max_guests > 0),
  beds        TEXT NOT NULL DEFAULT '',
  size_sqft   INTEGER,
  amenities   TEXT NOT NULL DEFAULT '[]',
  image_url   TEXT NOT NULL DEFAULT '',
  accent      TEXT NOT NULL DEFAULT '#b8862f',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rooms (
  id           SERIAL PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  floor        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id               SERIAL PRIMARY KEY,
  ref              TEXT NOT NULL UNIQUE,
  room_type_id     INTEGER NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  room_id          INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  guest_name       TEXT NOT NULL,
  phone            TEXT NOT NULL,
  email            TEXT NOT NULL DEFAULT '',
  adults           INTEGER NOT NULL DEFAULT 1,
  children         INTEGER NOT NULL DEFAULT 0,
  check_in         TEXT NOT NULL,
  check_out        TEXT NOT NULL,
  total_amount     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('awaiting_payment','pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  source           TEXT NOT NULL DEFAULT 'website',
  special_requests TEXT NOT NULL DEFAULT '',
  admin_notes      TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

-- Added for online payments; ALTERs bring older databases up to date.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status   TEXT NOT NULL DEFAULT 'none';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_id       TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hold_until       TIMESTAMPTZ;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'bookings_status_check' AND pg_get_constraintdef(oid) LIKE '%awaiting_payment%') THEN
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('awaiting_payment','pending','confirmed','checked_in','checked_out','cancelled','no_show'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_order ON bookings (payment_order_id) WHERE payment_order_id <> '';
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings (check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_type ON bookings (room_type_id, status);

CREATE TABLE IF NOT EXISTS photos (
  id         TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp messages sent (or attempted) for a booking, shown in the admin panel.
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  recipient  TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications (booking_id);
`;

/** Any fixed number: serialises schema setup and booking writes across server instances. */
export const LOCK_SETUP = 727001;
export const LOCK_BOOKINGS = 727002;

export const DEFAULT_SETTINGS = {
  hotel_name: 'Hotel JD Residency',
  tagline: 'Clean, comfortable rooms close to everything.',
  phone: '+91 00000 00000',
  whatsapp: '',
  email: 'stay@jdresidency.in',
  address: '17/A, S.V. Road, Opp. Subway, Near Andheri Market, Andheri West, Mumbai 400058',
  map_query: 'Hotel J D Residency, S V Road, Andheri West, Mumbai',
  check_in_time: '09:00',
  check_out_time: '11:00',
  currency: 'INR',
  booking_note: 'Full payment at the time of booking.',
  hero_image: '',
  gallery: '[]',
};

const SEED_ROOM_TYPES = [
  {
    name: 'Deluxe Room',
    tagline: 'Compact, calm, everything you need.',
    description:
      'A smart, well-lit room with a plush queen bed, work desk and fast Wi-Fi. Ideal for solo travellers and couples in the city for business or a quick getaway.',
    price: 2499,
    max_guests: 2,
    beds: '1 Queen bed',
    size_sqft: 180,
    amenities: ['Air conditioning', 'Free Wi-Fi', 'TV', 'Hot water 24/7', 'Work desk'],
    accent: '#b8862f',
    image_url: '/images/rooms/deluxe.jpg',
    rooms: ['101', '102', '103', '104'],
    floor: '1',
  },
  {
    name: 'Executive Room',
    tagline: 'More space. More light. More you.',
    description:
      'A larger room with a king bed, a lounge chair by the window and premium linen. Made for longer stays and travellers who like room to breathe.',
    price: 3299,
    max_guests: 3,
    beds: '1 King bed',
    size_sqft: 240,
    amenities: ['Air conditioning', 'Free Wi-Fi', 'TV', 'Lounge chair', 'Wardrobe', 'Toiletries'],
    accent: '#2f6f8f',
    image_url: '/images/rooms/executive.jpg',
    rooms: ['201', '202', '203', '204'],
    floor: '2',
  },
  {
    name: 'Family Suite',
    tagline: 'Room for the whole crew.',
    description:
      'Our biggest room: a king bed plus a twin and extra storage. Comfortable for families of up to four.',
    price: 4499,
    max_guests: 4,
    beds: '1 King + 1 Single bed',
    size_sqft: 320,
    amenities: ['Air conditioning', 'Free Wi-Fi', 'TV', 'Extra storage', 'Toiletries'],
    accent: '#5f8a4c',
    image_url: '/images/rooms/family.jpg',
    rooms: ['301', '302'],
    floor: '3',
  },
];

/** Lets queries be written with `?` placeholders, as Postgres wants `$1, $2, …`. */
function numbered(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function wrap(run, exec) {
  const query = async (sql, params = []) => (await run(numbered(sql), params)).rows;
  return {
    query,
    one: async (sql, params) => (await query(sql, params))[0],
    exec,
  };
}

async function pgDriver(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX) || 5, idleTimeoutMillis: 10_000 });
  const db = wrap((sql, params) => pool.query(sql, params), (sql) => pool.query(sql));
  db.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrap((sql, params) => client.query(sql, params), (sql) => client.query(sql)));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  db.close = () => pool.end();
  return db;
}

async function pgliteDriver(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const db = wrap((sql, params) => pg.query(sql, params), (sql) => pg.exec(sql));
  db.tx = (fn) => pg.transaction((t) => fn(wrap((sql, params) => t.query(sql, params), (sql) => t.exec(sql))));
  db.close = () => pg.close();
  return db;
}

/**
 * Opens the database, creating tables and starter data the first time.
 * `memory: true` gives a throwaway in-memory database (used by tests).
 */
export async function openDb({ url = process.env.DATABASE_URL || process.env.POSTGRES_URL, memory = false } = {}) {
  const db = url && !memory ? await pgDriver(url) : await pgliteDriver(memory ? null : process.env.PGLITE_DIR || 'data/pglite');
  await db.tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock(?)', [LOCK_SETUP]);
    await t.exec(SCHEMA);
    const fresh = await seed(t);
    if (fresh && process.env.DEMO_DATA === '1') await seedDemoBookings(t);
  });
  return db;
}

/** Fills in starter data. Returns true when the database was brand new. */
async function seed(db) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [key, value]);
  }
  await db.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [
    'session_secret',
    crypto.randomBytes(32).toString('hex'),
  ]);

  const { n: admins } = await db.one('SELECT COUNT(*)::int AS n FROM admins');
  if (admins === 0) {
    const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'jdresidency';
    await db.query('INSERT INTO admins (username, password_hash, must_change_password) VALUES (?, ?, ?)', [
      username,
      hashPassword(password),
      process.env.ADMIN_PASSWORD ? 0 : 1,
    ]);
  }

  const { n: types } = await db.one('SELECT COUNT(*)::int AS n FROM room_types');
  if (types === 0) {
    for (const [i, t] of SEED_ROOM_TYPES.entries()) {
      const { id } = await db.one(
        `INSERT INTO room_types (name, tagline, description, price, max_guests, beds, size_sqft, amenities, image_url, accent, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [t.name, t.tagline, t.description, t.price, t.max_guests, t.beds, t.size_sqft, JSON.stringify(t.amenities), t.image_url, t.accent, i],
      );
      for (const number of t.rooms) {
        await db.query('INSERT INTO rooms (number, room_type_id, floor) VALUES (?, ?, ?)', [number, id, t.floor]);
      }
    }
  }
  return types === 0;
}

/** Sample guests so a fresh demo deployment shows a realistic admin panel. */
async function seedDemoBookings(db) {
  const t = today();
  const room = (number) => db.one('SELECT id, room_type_id FROM rooms WHERE number = ?', [number]);
  const samples = [
    ['Rohan Mehta', '98200 11111', '201', 2, 0, -1, 2, 'checked_in', 'phone', ''],
    ['Priya Shah', '98200 22222', '301', 2, 2, -2, 0, 'checked_in', 'walk_in', ''],
    ['Arjun Nair', '98200 33333', '101', 1, 0, 0, 1, 'confirmed', 'website', 'Arrival: 3 PM – 6 PM'],
    ['Sneha Kulkarni', '98200 44444', null, 2, 0, 0, 3, 'pending', 'website', 'Early check-in if possible'],
    ['Vikram Desai', '98200 55555', '202', 2, 1, 2, 5, 'confirmed', 'ota', ''],
    ['Fatima Sheikh', '98200 66666', '102', 2, 0, 3, 4, 'confirmed', 'phone', ''],
    ['Kabir Singh', '98200 77777', null, 4, 0, 6, 9, 'pending', 'website', 'Need an extra pillow'],
  ];
  for (const [name, phone, number, adults, children, from, to, status, source, notes] of samples) {
    const r = number ? await room(number) : null;
    const typeId = r ? r.room_type_id : (await room(adults > 3 ? '301' : '103')).room_type_id;
    const { price } = await db.one('SELECT price FROM room_types WHERE id = ?', [typeId]);
    await db.query(
      `INSERT INTO bookings (ref, room_type_id, room_id, guest_name, phone, adults, children, check_in, check_out,
                            total_amount, status, source, special_requests)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [await newRef(db), typeId, r?.id ?? null, name, `+91 ${phone}`, adults, children, addDays(t, from), addDays(t, to),
        price * (to - from), status, source, notes],
    );
  }
}

export async function getSettings(db) {
  const rows = await db.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function publicSettings(db) {
  const all = await getSettings(db);
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, all[k] ?? DEFAULT_SETTINGS[k]]));
}
