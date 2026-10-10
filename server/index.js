import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = await openDb();
const app = await createApp(db, { staticDir: path.join(root, 'dist') });
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`JD Residency running on http://localhost:${port}`);
  console.log(`Admin panel: http://localhost:${port}/admin`);
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log(`Using the built-in database in ${process.env.PGLITE_DIR || 'data/pglite'}`);
  }
});
