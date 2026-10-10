import crypto from 'node:crypto';

const COOKIE = 'jd_admin';
const SESSION_HOURS = 12;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

// Tokens carry a fingerprint of the password hash so changing the password logs out other sessions.
function fingerprint(passwordHash) {
  return crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 12);
}

export function createToken(admin, secret) {
  const payload = Buffer.from(
    JSON.stringify({ uid: admin.id, fp: fingerprint(admin.password_hash), exp: Date.now() + SESSION_HOURS * 3600e3 }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function readToken(token, secret) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    maxAge: SESSION_HOURS * 3600e3,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function requireAdmin(db, secret) {
  return async (req, res, next) => {
    const data = readToken(getCookie(req, COOKIE), secret);
    const admin = data && (await db.one('SELECT * FROM admins WHERE id = ?', [data.uid]));
    if (!admin || fingerprint(admin.password_hash) !== data.fp) {
      return res.status(401).json({ error: 'Please log in again.' });
    }
    req.admin = admin;
    next();
  };
}

// Small in-memory limiter: 8 failed attempts per IP per 15 minutes.
export function loginLimiter() {
  const attempts = new Map();
  const WINDOW = 15 * 60e3;
  const MAX = 8;
  return {
    blocked(ip) {
      const entry = attempts.get(ip);
      if (!entry || Date.now() - entry.start > WINDOW) return false;
      return entry.count >= MAX;
    },
    fail(ip) {
      const entry = attempts.get(ip);
      if (!entry || Date.now() - entry.start > WINDOW) attempts.set(ip, { start: Date.now(), count: 1 });
      else entry.count++;
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
}
