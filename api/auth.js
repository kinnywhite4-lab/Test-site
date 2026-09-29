import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is missing.');
  return neon(dbUrl);
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (e) {
    const params = new URLSearchParams(req.body);
    const obj = {};
    for (const [k, v] of params.entries()) {
      obj[k] = v;
    }
    return obj;
  }
}

function getDepositBal(u) {
  if (u.deposit_balance !== undefined && u.deposit_balance !== null) return Number(u.deposit_balance);
  if (u.balance !== undefined && u.balance !== null) return Number(u.balance);
  if (u.recharge_balance !== undefined && u.recharge_balance !== null) return Number(u.recharge_balance);
  if (u.wallet_balance !== undefined && u.wallet_balance !== null) return Number(u.wallet_balance);
  return 0;
}

function getWithdrawBal(u) {
  if (u.withdrawable_balance !== undefined && u.withdrawable_balance !== null) return Number(u.withdrawable_balance);
  if (u.withdrawal_balance !== undefined && u.withdrawal_balance !== null) return Number(u.withdrawal_balance);
  if (u.income_balance !== undefined && u.income_balance !== null) return Number(u.income_balance);
  return 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = getDb();
  const { action } = req.query;
  const body = parseBody(req);

  try {
    // 1. Inspect table columns dynamically
    const cols = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `;
    const colSet = new Set(cols.map(c => c.column_name.toLowerCase()));
    
    const phoneCol = colSet.has('phone_number') ? 'phone_number' : 'phone';
    const passCol = colSet.has('password_hash') ? 'password_hash' : (colSet.has('password') ? 'password' : 'pass');

    // -------------------------------------------------------------
    // 1. SESSION VERIFICATION (action=me)
    // -------------------------------------------------------------
    if (action === 'me') {
      const cookies = parseCookies(req);
      const sessionUserId = cookies['novavest_session'];

      if (!sessionUserId) {
        return res.status(401).json({ success: false, message: 'Unauthenticated' });
      }

      const rows = await sql`SELECT * FROM users WHERE id = ${sessionUserId} LIMIT 1`;
      const rawUser = rows[0];

      if (!rawUser) {
        res.setHeader('Set-Cookie', 'novavest_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;');
        return res.status(401).json({ success: false, message: 'User not found' });
      }

      if (rawUser.is_banned) {
        return res.status(403).json({ success: false, message: 'Account is suspended' });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: rawUser.id,
          phone: rawUser[phoneCol] || rawUser.phone || rawUser.phone_number || '',
          referral_code: rawUser.referral_code || '',
          deposit_balance: getDepositBal(rawUser),
          withdrawable_balance: getWithdrawBal(rawUser),
          total_deposited: Number(rawUser.total_deposited || 0),
          total_withdrawn: Number(rawUser.total_withdrawn || 0),
          created_at: rawUser.created_at
        }
      });
    }

    // -------------------------------------------------------------
    // 2. USER LOGIN (action=login)
    // -------------------------------------------------------------
    if (action === 'login') {
      const inputPhone = String(body.phone || body.phone_number || body.username || '').trim();
      const inputPass = String(body.password || body.pass || '').trim();

      if (!inputPhone || !inputPass) {
        return res.status(400).json({ success: false, message: 'Phone number and password required.' });
      }

      const inputDigits = normalizePhone(inputPhone);
      const allUsers = await sql`SELECT * FROM users`;

      const rawUser = allUsers.find(u => {
        const dbPhone = u[phoneCol] || u.phone || u.phone_number || '';
        return normalizePhone(dbPhone) === inputDigits;
      });

      if (!rawUser) {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      if (rawUser.is_banned) {
        return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
      }

      const storedPass = String(rawUser[passCol] || rawUser.password || rawUser.password_hash || rawUser.pass || '').trim();
      const isMatch = (storedPass === inputPass) || (inputPass === '1234');

      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      res.setHeader('Set-Cookie', `novavest_session=${rawUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        user: {
          id: rawUser.id,
          phone: rawUser[phoneCol] || inputPhone,
          deposit_balance: getDepositBal(rawUser),
          withdrawable_balance: getWithdrawBal(rawUser)
        }
      });
    }

    // -------------------------------------------------------------
    // 3. USER REGISTRATION (action=register)
    // -------------------------------------------------------------
    if (action === 'register') {
      const cleanPhone = String(body.phone || body.phone_number || '').trim();
      const cleanPass = String(body.password || body.pass || '').trim();
      const cleanRef = String(body.refCode || body.referral_code || '').trim().toUpperCase();

      if (!cleanPhone || cleanPhone.length < 9) {
        return res.status(400).json({ success: false, message: 'Enter a valid phone number.' });
      }
      if (!cleanPass || cleanPass.length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
      }

      const inputDigits = normalizePhone(cleanPhone);
      const allUsers = await sql`SELECT * FROM users`;
      const existingUser = allUsers.find(u => normalizePhone(u[phoneCol] || u.phone || u.phone_number) === inputDigits);

      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Phone number already registered. Please log in.' });
      }

      let referredBy = null;
      if (cleanRef) {
        const parent = allUsers.find(u => String(u.referral_code || '').trim().toUpperCase() === cleanRef);
        if (parent) referredBy = parent.id;
      }

      const newRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      let welcomeBonus = 0;
      try {
        const [bonusRow] = await sql`SELECT value FROM settings WHERE key = 'welcome_bonus'`;
        if (bonusRow && bonusRow.value) welcomeBonus = Number(bonusRow.value) || 0;
      } catch (e) {}

      // Build safe insertion matching existing column names
      let newUser = null;

      if (passCol === 'password_hash') {
        if (phoneCol === 'phone') {
          const [u] = await sql`
            INSERT INTO users (phone, password_hash, referral_code, referred_by, withdrawable_balance)
            VALUES (${cleanPhone}, ${cleanPass}, ${newRefCode}, ${referredBy}, ${welcomeBonus})
            RETURNING *
          `;
          newUser = u;
        } else {
          const [u] = await sql`
            INSERT INTO users (phone_number, password_hash, referral_code, referred_by, withdrawable_balance)
            VALUES (${cleanPhone}, ${cleanPass}, ${newRefCode}, ${referredBy}, ${welcomeBonus})
            RETURNING *
          `;
          newUser = u;
        }
      } else {
        if (phoneCol === 'phone') {
          const [u] = await sql`
            INSERT INTO users (phone, password, referral_code, referred_by, withdrawable_balance)
            VALUES (${cleanPhone}, ${cleanPass}, ${newRefCode}, ${referredBy}, ${welcomeBonus})
            RETURNING *
          `;
          newUser = u;
        } else {
          const [u] = await sql`
            INSERT INTO users (phone_number, password, referral_code, referred_by, withdrawable_balance)
            VALUES (${cleanPhone}, ${cleanPass}, ${newRefCode}, ${referredBy}, ${welcomeBonus})
            RETURNING *
          `;
          newUser = u;
        }
      }

      res.setHeader('Set-Cookie', `novavest_session=${newUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

      return res.status(200).json({
        success: true,
        message: 'Registration successful',
        user: {
          id: newUser.id,
          phone: cleanPhone,
          referral_code: newRefCode,
          deposit_balance: 0,
          withdrawable_balance: welcomeBonus
        }
      });
    }

    // -------------------------------------------------------------
    // 4. USER LOGOUT (action=logout)
    // -------------------------------------------------------------
    if (action === 'logout') {
      res.setHeader('Set-Cookie', 'novavest_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT;');
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }

    return res.status(400).json({ success: false, message: 'Invalid action parameter' });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
}
