import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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
  const token = cookies.novavest_session;
  const userId = verifySessionToken(token);

  if (!userId) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  try {
    const userRes = await pool.query(
      'SELECT id, phone_number, balance, withdrawable_balance, total_income, total_withdrawn, referral_code, referred_by FROM users WHERE id = $1',
      [userId]
    );

    const user = userRes.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const [bankRes, purchasesRes, depositsRes, withdrawalsRes, transactionsRes] = await Promise.all([
      pool.query('SELECT bank_name, account_number, account_name FROM bank_cards WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM purchases WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId])
    ]);

    return res.status(200).json({
      success: true,
      user,
      bank: bankRes.rows[0] || null,
      purchases: purchasesRes.rows,
      deposits: depositsRes.rows,
      withdrawals: withdrawalsRes.rows,
      transactions: transactionsRes.rows
    });
  } catch (err) {
    console.error('Bootstrap Error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
