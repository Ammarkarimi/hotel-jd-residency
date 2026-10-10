// Vercel serverless entry. Vercel serves the built site from dist/ and sends
// /api/* and /uploads/* here (see vercel.json). Data lives in the Postgres
// database linked to the Vercel project (DATABASE_URL), so every instance of
// this function sees the same bookings, logins and photos.
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  console.error('DATABASE_URL is not set. Connect a Neon database to this Vercel project (Storage tab).');
}

let ready;
function getApp() {
  ready ??= openDb().then((db) => createApp(db)).catch((err) => {
    ready = undefined; // try again on the next request
    throw err;
  });
  return ready;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'The booking system is starting up. Please try again in a moment.' }));
  }
}
