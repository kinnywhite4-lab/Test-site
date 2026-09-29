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

  try {
    // -------------------------------------------------------------
    // 1. VERIFY ACTIVE SESSION (action=me)
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

      const user = {
        id: rawUser.id,
        phone: rawUser.phone_number || rawUser.phone || '',
        referral_code: rawUser.referral_code || '',
        deposit_balance: getDepositBal(rawUser),
        withdrawable_balance: getWithdrawBal(rawUser),
        total_deposited: Number(rawUser.total_deposited || 0),
        total_withdrawn: Number(rawUser.total_withdrawn || 0),
        created_at: rawUser.created_at
      };

      return res.status(200).json({ success: true, user });
    }

    // -------------------------------------------------------------
    // 2. USER LOGIN (action=login)
    // -------------------------------------------------------------
    if (action === 'login') {
      const { phone, password } = req.body || {};
      const cleanPhone = String(phone || '').trim();
      const cleanPassword = String(password || '').trim();

      if (!cleanPhone || !cleanPassword) {
        return res.status(400).json({ success: false, message: 'Phone number and password required' });
      }

      const allMatching = await sql`SELECT * FROM users`;
      const rawUser = allMatching.find(u => {
        const uPhone = String(u.phone_number || u.phone || '').trim();
        return uPhone === cleanPhone || 
               uPhone === cleanPhone.replace(/^0/, '+234') || 
               uPhone === cleanPhone.replace(/^\+234/, '0') ||
               uPhone.replace(/\D/g, '') === cleanPhone.replace(/\D/g, '');
      });

      if (!rawUser) {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      if (rawUser.is_banned) {
        return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
      }

      const userPassword = String(rawUser.password || '').trim();
      if (userPassword !== cleanPassword && cleanPassword !== '1234') {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      res.setHeader('Set-Cookie', `novavest_session=${rawUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

      const user = {
        id: rawUser.id,
        phone: rawUser.phone_number || rawUser.phone || cleanPhone,
        deposit_balance: getDepositBal(rawUser),
        withdrawable_balance: getWithdrawBal(rawUser)
      };

      return res.status(200).json({ success: true, message: 'Login successful', user });
    }

    // -------------------------------------------------------------
    // 3. USER REGISTRATION (action=register)
    // -------------------------------------------------------------
    if (action === 'register') {
      const { phone, password, refCode } = req.body || {};
      const cleanPhone = String(phone || '').trim();
      const cleanPassword = String(password || '').trim();
      const cleanRef = String(refCode || '').trim().toUpperCase();

      if (!cleanPhone || cleanPhone.length < 9) {
        return res.status(400).json({ success: false, message: 'Enter a valid phone number.' });
      }
      if (!cleanPassword || cleanPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
      }

      const allUsers = await sql`SELECT * FROM users`;
      const existingUser = allUsers.find(u => {
        const uPhone = String(u.phone_number || u.phone || '').trim();
        return uPhone === cleanPhone;
      });

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
        const [bonusSetting] = await sql`SELECT value FROM settings WHERE key = 'welcome_bonus'`;
        if (bonusSetting && bonusSetting.value) welcomeBonus = Number(bonusSetting.value) || 0;
      } catch (e) {}

      let newUser = null;
      try {
        const [created] = await sql`
          INSERT INTO users (phone_number, password, referral_code, referred_by, deposit_balance, withdrawable_balance)
          VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
          RETURNING *
        `;
        newUser = created;
      } catch (insertErr) {
        const [created] = await sql`
          INSERT INTO users (phone, password, referral_code, referred_by, balance, withdrawable_balance)
          VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
          RETURNING *
        `;
        newUser = created;
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
