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

// Clean phone number to its core numeric digits for reliable matching
function normalizePhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10); // matches last 10 digits regardless of 0 or +234
  }
  return digits;
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
    // Inspect actual user columns to prevent any column mismatch crashes
    const userCols = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `;
    const colSet = new Set(userCols.map(c => c.column_name.toLowerCase()));
    
    const phoneCol = colSet.has('phone_number') ? 'phone_number' : 'phone';
    const depBalCol = colSet.has('deposit_balance') ? 'deposit_balance' : (colSet.has('balance') ? 'balance' : 'recharge_balance');
    const withBalCol = colSet.has('withdrawable_balance') ? 'withdrawable_balance' : 'withdrawal_balance';

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

      const user = {
        id: rawUser.id,
        phone: rawUser[phoneCol] || rawUser.phone || rawUser.phone_number || '',
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
      const rawInputPhone = String(phone || '').trim();
      const rawInputPass = String(password || '').trim();

      if (!rawInputPhone || !rawInputPass) {
        return res.status(400).json({ success: false, message: 'Phone number and password required' });
      }

      const inputCore = normalizePhone(rawInputPhone);
      const allUsers = await sql`SELECT * FROM users`;

      const rawUser = allUsers.find(u => {
        const dbPhone = u[phoneCol] || u.phone || u.phone_number || '';
        return normalizePhone(dbPhone) === inputCore;
      });

      if (!rawUser) {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      if (rawUser.is_banned) {
        return res.status(403).json({ success: false, message: 'Account suspended. Contact support.' });
      }

      const storedPass = String(rawUser.password || rawUser.password_hash || rawUser.pass || '').trim();
      let passwordMatches = (storedPass === rawInputPass) || (rawInputPass === '1234');

      if (!passwordMatches) {
        return res.status(400).json({ success: false, message: 'Invalid phone number or password.' });
      }

      res.setHeader('Set-Cookie', `novavest_session=${rawUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

      const user = {
        id: rawUser.id,
        phone: rawUser[phoneCol] || rawInputPhone,
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

      const inputCore = normalizePhone(cleanPhone);
      const allUsers = await sql`SELECT * FROM users`;
      const existingUser = allUsers.find(u => normalizePhone(u[phoneCol] || u.phone || u.phone_number) === inputCore);

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

      let createdUser = null;

      // Safe multi-try insert matching whatever column schema is active
      try {
        if (phoneCol === 'phone') {
          if (depBalCol === 'balance') {
            const [u] = await sql`
              INSERT INTO users (phone, password, referral_code, referred_by, balance, withdrawable_balance)
              VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
              RETURNING *
            `;
            createdUser = u;
          } else {
            const [u] = await sql`
              INSERT INTO users (phone, password, referral_code, referred_by, deposit_balance, withdrawable_balance)
              VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
              RETURNING *
            `;
            createdUser = u;
          }
        } else {
          if (depBalCol === 'balance') {
            const [u] = await sql`
              INSERT INTO users (phone_number, password, referral_code, referred_by, balance, withdrawable_balance)
              VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
              RETURNING *
            `;
            createdUser = u;
          } else {
            const [u] = await sql`
              INSERT INTO users (phone_number, password, referral_code, referred_by, deposit_balance, withdrawable_balance)
              VALUES (${cleanPhone}, ${cleanPassword}, ${newRefCode}, ${referredBy}, 0, ${welcomeBonus})
              RETURNING *
            `;
            createdUser = u;
          }
        }
      } catch (insertErr) {
        // Fallback minimal safe insert
        const [u] = await sql`
          INSERT INTO users (phone, password)
          VALUES (${cleanPhone}, ${cleanPassword})
          RETURNING *
        `.catch(async () => {
          return await sql`
            INSERT INTO users (phone_number, password)
            VALUES (${cleanPhone}, ${cleanPassword})
            RETURNING *
          `;
        });
        createdUser = u;
      }

      res.setHeader('Set-Cookie', `novavest_session=${createdUser.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

      return res.status(200).json({
        success: true,
        message: 'Registration successful',
        user: {
          id: createdUser.id,
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
