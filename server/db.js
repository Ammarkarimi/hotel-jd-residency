import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),
  max_guests  INTEGER NOT NULL DEFAULT 2 CHECK (max_guests > 0),
  beds        TEXT NOT NULL DEFAULT '',
  size_sqft   INTEGER,
  amenities   TEXT NOT NULL DEFAULT '[]',
  image_url   TEXT NOT NULL DEFAULT '',
  accent      TEXT NOT NULL DEFAULT '#e8b04b',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rooms (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       TEXT NOT NULL UNIQUE,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE RESTRICT,
  floor        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bookings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
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
                   CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  source           TEXT NOT NULL DEFAULT 'website',
  special_requests TEXT NOT NULL DEFAULT '',
  admin_notes      TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (check_out > check_in)
);

CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings (check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_type ON bookings (room_type_id, status);
`;

export const DEFAULT_SETTINGS = {
  hotel_name: 'Hotel JD Residency',
  tagline: 'Stay above the ordinary.',
  phone: '+91 00000 00000',
  whatsapp: '',
  email: 'stay@jdresidency.in',
  address: '17/A, S.V. Road, Opp. Subway, Near Andheri Market, Andheri West, Mumbai 400058',
  map_query: 'Hotel J D Residency, S V Road, Andheri West, Mumbai',
  check_in_time: '12:00',
  check_out_time: '11:00',
  currency: 'INR',
  booking_note: 'No advance payment needed. Pay at the hotel when you check in.',
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
    amenities: ['Air conditioning', 'Free Wi-Fi', 'Smart TV', 'Hot water 24/7', 'Work desk'],
    accent: '#e8b04b',
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
    amenities: ['Air conditioning', 'Free Wi-Fi', 'Smart TV', 'Lounge chair', 'Wardrobe', 'Toiletries'],
    accent: '#ff5d8f',
    rooms: ['201', '202', '203', '204'],
    floor: '2',
  },
  {
    name: 'Family Suite',
    tagline: 'Room for the whole crew.',
    description:
      'Our biggest room: a king bed plus a twin, a sitting area and extra storage. Comfortable for families of up to four.',
    price: 4499,
    max_guests: 4,
    beds: '1 King + 1 Single bed',
    size_sqft: 320,
    amenities: ['Air conditioning', 'Free Wi-Fi', 'Smart TV', 'Sitting area', 'Extra storage', 'Toiletries'],
    accent: '#5de0e6',
    rooms: ['301', '302'],
    floor: '3',
  },
];

export function openDb(file = process.env.DATABASE_PATH || 'data/jd-residency.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  seed(db);
  return db;
}

function seed(db) {
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);
  insertSetting.run('session_secret', crypto.randomBytes(32).toString('hex'));

  const { n: admins } = db.prepare('SELECT COUNT(*) AS n FROM admins').get();
  if (admins === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'jdresidency';
    db.prepare('INSERT INTO admins (username, password_hash, must_change_password) VALUES (?, ?, ?)').run(
      username,
      hashPassword(password),
      process.env.ADMIN_PASSWORD ? 0 : 1,
    );
  }

  const { n: types } = db.prepare('SELECT COUNT(*) AS n FROM room_types').get();
  if (types === 0) {
    const insertType = db.prepare(`
      INSERT INTO room_types (name, tagline, description, price, max_guests, beds, size_sqft, amenities, accent, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertRoom = db.prepare('INSERT INTO rooms (number, room_type_id, floor) VALUES (?, ?, ?)');
    SEED_ROOM_TYPES.forEach((t, i) => {
      const { lastInsertRowid } = insertType.run(
        t.name, t.tagline, t.description, t.price, t.max_guests, t.beds, t.size_sqft,
        JSON.stringify(t.amenities), t.accent, i,
      );
      for (const number of t.rooms) insertRoom.run(number, lastInsertRowid, t.floor);
    });
  }
}

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function publicSettings(db) {
  const all = getSettings(db);
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, all[k] ?? DEFAULT_SETTINGS[k]]));
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
