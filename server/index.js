import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb();
const app = createApp(db, { staticDir: path.join(root, 'dist') });
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`JD Residency running on http://localhost:${port}`);
  console.log(`Admin panel: http://localhost:${port}/admin`);
});
