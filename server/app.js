import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getSettings } from './db.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

export async function createApp(db, { staticDir } = {}) {
  const app = express();
  const secret = process.env.SESSION_SECRET || (await getSettings(db)).session_secret;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Photo uploads arrive as base64 JSON, so that one route gets a larger body limit.
  app.use('/api/admin/uploads', express.json({ limit: '6mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/public', publicRoutes(db));
  app.use('/api/admin', adminRoutes(db, secret));
  // Uploaded photos live in the database; names are unique, so they can be cached for good.
  app.get('/uploads/:name', async (req, res) => {
    const photo = await db.one('SELECT mime, data FROM photos WHERE id = ?', [req.params.name]);
    if (!photo) return res.status(404).json({ error: 'Not found' });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.type(photo.mime).send(Buffer.from(photo.data));
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '7d', setHeaders: noCacheHtml }));
    app.get('/{*splat}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
  });

  return app;
}

function noCacheHtml(res, file) {
  if (file.endsWith('.html')) res.set('Cache-Control', 'no-cache');
}
