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

  try {
    const cookies = parseCookies(req);
    const sessionUserId = cookies['novavest_session'];

    // 1. Fetch Products
    const rawProducts = await sql`SELECT * FROM products ORDER BY price ASC`.catch(() => []);
    const products = rawProducts.map(p => ({
      id: p.id,
      name: p.name,
      price: Number(p.price || 0),
      daily_yield: Number(p.daily_yield || p.daily_income || 0),
      daily_income: Number(p.daily_yield || p.daily_income || 0),
      duration_days: Number(p.duration_days || p.period_days || 30),
      period_days: Number(p.duration_days || p.period_days || 30),
      total_revenue: Number((p.daily_yield || p.daily_income || 0) * (p.duration_days || p.period_days || 30))
    }));

    // 2. Fetch System Settings
    const settingRows = await sql`SELECT key, value FROM settings`.catch(() => []);
    const settings = {
      withdrawals_enabled: 'true',
      withdrawal_fee_percent: '10',
      min_withdrawal: '1000',
      telegram_group: 'https://t.me/novavest_group',
      telegram_channel: 'https://t.me/novavest_channel'
    };
    settingRows.forEach(r => { settings[r.key] = r.value; });

    // 3. User Details & User Investments (if authenticated)
    let user = null;
    let myProducts = [];

    if (sessionUserId) {
      const userRows = await sql`SELECT * FROM users WHERE id = ${sessionUserId} LIMIT 1`.catch(() => []);
      const rawUser = userRows[0];

      if (rawUser && !rawUser.is_banned) {
        user = {
          id: rawUser.id,
          phone: rawUser.phone || rawUser.phone_number || '',
          referral_code: rawUser.referral_code || '',
          deposit_balance: getDepositBal(rawUser),
          withdrawable_balance: getWithdrawBal(rawUser),
          total_deposited: Number(rawUser.total_deposited || 0),
          total_withdrawn: Number(rawUser.total_withdrawn || 0),
          created_at: rawUser.created_at
        };

        // Fetch User Purchased Investments
        try {
          myProducts = await sql`
            SELECT up.*, p.name, p.price, p.daily_yield, p.duration_days
            FROM user_products up
            LEFT JOIN products p ON up.product_id = p.id
            WHERE up.user_id = ${sessionUserId}
            ORDER BY up.id DESC
          `;
        } catch (e1) {
          try {
            myProducts = await sql`SELECT * FROM user_investments WHERE user_id = ${sessionUserId} ORDER BY id DESC`;
          } catch (e2) {
            myProducts = await sql`SELECT * FROM purchases WHERE user_id = ${sessionUserId} ORDER BY id DESC`.catch(() => []);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      user,
      products,
      settings,
      myProducts
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Error loading dashboard' });
  }
}
