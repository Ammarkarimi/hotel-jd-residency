// Vercel serverless entry. Vercel serves the built site from dist/ and sends
// /api/* and /uploads/* here (see vercel.json).
//
// Vercel functions have no permanent disk, so the database and uploaded photos
// live in /tmp and reset whenever Vercel starts a fresh instance. That is fine
// for a design preview; use a server with a disk for the live site.
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const dbPath = process.env.DATABASE_PATH || '/tmp/jd-residency.db';
const db = openDb(dbPath);
const app = createApp(db, { uploadDir: process.env.UPLOAD_DIR || path.join(path.dirname(dbPath), 'uploads') });

export default app;
