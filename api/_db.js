const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SESSION_SECRET = process.env.SESSION_SECRET || 'novavest_secure_session_secret_2026';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const matchBuffer = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, matchBuffer);
}

function createSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 30 * 24 * 3600 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers && req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

async function getAuthenticatedUser(req) {
  try {
    const cookies = parseCookies(req);
    const token = cookies.novavest_session;
    const userId = verifySessionToken(token);
    if (!userId) return null;

    const { rows } = await pool.query(
      `SELECT id, phone_number, balance, withdrawable_balance, total_income, total_withdrawn, referral_code, referred_by 
       FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

module.exports = {
  pool,
  hashPassword,
  verifyPassword,
  createSessionToken,
  getAuthenticatedUser
};
