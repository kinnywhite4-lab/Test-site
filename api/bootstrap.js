import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);

const SESSION_SECRET = process.env.SESSION_SECRET || 'novavest_secure_session_secret_2026';

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
  const rc = req && req.headers && req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const cookies = parseCookies(req);
  const authHeader = req.headers && req.headers.authorization;
  const token = cookies.novavest_session || (authHeader && authHeader.replace('Bearer ', ''));
  const userId = verifySessionToken(token);

  if (!userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  try {
    const userRes = await sql`
      SELECT id, phone_number, balance, withdrawable_balance, total_income, total_withdrawn, referral_code, referred_by 
      FROM users WHERE id = ${userId}
    `;

    const user = userRes[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    let bank = null;
    let purchases = [];
    let deposits = [];
    let withdrawals = [];
    let transactions = [];

    try {
      const bankRes = await sql`SELECT bank_name, account_number, account_name FROM bank_cards WHERE user_id = ${userId}`;
      bank = bankRes[0] || null;
    } catch {}

    try {
      purchases = await sql`SELECT * FROM purchases WHERE user_id = ${userId} ORDER BY created_at DESC`;
    } catch {}

    try {
      deposits = await sql`SELECT * FROM deposits WHERE user_id = ${userId} ORDER BY created_at DESC`;
    } catch {}

    try {
      withdrawals = await sql`SELECT * FROM withdrawals WHERE user_id = ${userId} ORDER BY created_at DESC`;
    } catch {}

    try {
      transactions = await sql`SELECT * FROM transactions WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`;
    } catch {}

    return res.status(200).json({
      success: true,
      user,
      bank,
      purchases,
      deposits,
      withdrawals,
      transactions
    });
  } catch (err) {
    console.error('Bootstrap Critical Error:', err);
    return res.status(500).json({ error: 'Failed to load user profile.' });
  }
}
