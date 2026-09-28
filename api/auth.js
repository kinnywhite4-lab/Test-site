import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);

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
  const rc = req && req.headers && req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^\d+]/g, '').trim();
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const action = req.query.action || (req.body && req.body.action);

  if (action === 'register' && req.method === 'POST') {
    const { phone_number, password, confirm_password, ref } = req.body || {};
    const cleanNumber = cleanPhoneNumber(phone_number);

    if (!cleanNumber) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    try {
      const existing = await sql`SELECT id FROM users WHERE phone_number = ${cleanNumber}`;
      if (existing.length > 0) {
        return res.status(400).json({ error: 'This phone number is already registered. Please log in.' });
      }

      let referredById = null;
      if (ref && typeof ref === 'string') {
        const refUser = await sql`SELECT id FROM users WHERE referral_code = ${ref.trim()}`;
        if (refUser.length > 0) referredById = refUser[0].id;
      }

      const refCode = 'NV' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const pwdHash = hashPassword(password);

      const rows = await sql`
        INSERT INTO users (phone_number, password_hash, referral_code, referred_by)
        VALUES (${cleanNumber}, ${pwdHash}, ${refCode}, ${referredById})
        RETURNING id, phone_number, referral_code, balance, withdrawable_balance, total_income, total_withdrawn
      `;

      const user = rows[0];
      const token = createSessionToken(user.id);
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return res.status(200).json({ success: true, token, user });
    } catch (err) {
      console.error('Registration Error:', err);
      return res.status(500).json({ error: err.message || 'Database error during registration.' });
    }
  }

  if (action === 'login' && req.method === 'POST') {
    const { phone_number, password } = req.body || {};
    const cleanNumber = cleanPhoneNumber(phone_number);

    if (!cleanNumber || !password) {
      return res.status(400).json({ error: 'Incorrect phone number or password.' });
    }

    try {
      const rows = await sql`
        SELECT id, phone_number, password_hash, referral_code, balance, withdrawable_balance, total_income, total_withdrawn 
        FROM users WHERE phone_number = ${cleanNumber}
      `;

      if (rows.length === 0) {
        return res.status(400).json({ error: 'Incorrect phone number or password.' });
      }

      const user = rows[0];
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(400).json({ error: 'Incorrect phone number or password.' });
      }

      delete user.password_hash;
      const token = createSessionToken(user.id);
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return res.status(200).json({ success: true, token, user });
    } catch (err) {
      console.error('Login Error:', err);
      return res.status(500).json({ error: err.message || 'Database error during login.' });
    }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', 'novavest_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
    return res.status(200).json({ success: true });
  }

  if (action === 'me') {
    try {
      const cookies = parseCookies(req);
      const authHeader = req.headers && req.headers.authorization;
      const token = cookies.novavest_session || (authHeader && authHeader.replace('Bearer ', ''));
      const userId = verifySessionToken(token);
      if (!userId) {
        return res.status(401).json({ error: 'Please log in to continue.' });
      }

      const rows = await sql`
        SELECT id, phone_number, balance, withdrawable_balance, total_income, total_withdrawn, referral_code, referred_by 
        FROM users WHERE id = ${userId}
      `;
      if (!rows.length) {
        return res.status(401).json({ error: 'Please log in to continue.' });
      }
      return res.status(200).json({ success: true, user: rows[0] });
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in.' });
    }
  }

  return res.status(404).json({ error: 'Not found.' });
}
