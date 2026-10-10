import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getSettings } from './db.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

export function createApp(db, { staticDir } = {}) {
  const app = express();
  const secret = process.env.SESSION_SECRET || getSettings(db).session_secret;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
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
