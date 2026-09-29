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

    // 1. Fetch Catalog Products safely
    let rawProducts = [];
    try {
      rawProducts = await sql`SELECT * FROM products ORDER BY price ASC`;
    } catch (e) {
      rawProducts = [];
    }

    if (!rawProducts || rawProducts.length === 0) {
      rawProducts = [
        { id: 1, name: 'VIP Equipment 1', price: 3000, daily_yield: 360, daily_income: 360, duration_days: 30, period_days: 30 },
        { id: 2, name: 'VIP Equipment 2', price: 6000, daily_yield: 780, daily_income: 780, duration_days: 30, period_days: 30 },
        { id: 3, name: 'VIP Equipment 3', price: 15000, daily_yield: 2100, daily_income: 2100, duration_days: 30, period_days: 30 },
        { id: 4, name: 'VIP Equipment 4', price: 40000, daily_yield: 6000, daily_income: 6000, duration_days: 30, period_days: 30 }
      ];
    }

    const products = rawProducts.map(p => {
      const price = Number(p.price || 0);
      const daily = Number(p.daily_yield || p.daily_income || 0);
      const days = Number(p.duration_days || p.period_days || 30);
      const rev = Number(p.total_revenue || (daily * days) || (price * 1.5));

      return {
        id: p.id,
        name: p.name || 'VIP Equipment',
        title: p.name || 'VIP Equipment',
        price: price,
        amount: price,
        daily_yield: daily,
        daily_income: daily,
        duration_days: days,
        period_days: days,
        total_revenue: rev
      };
    });

    // 2. Fetch System Settings
    const settings = {
      withdrawals_enabled: 'true',
      withdrawal_fee_percent: '10',
      min_withdrawal: '1000',
      telegram_group: 'https://t.me/novavest_group',
      telegram_channel: 'https://t.me/novavest_channel'
    };

    try {
      const settingRows = await sql`SELECT key, value FROM settings`;
      settingRows.forEach(r => { settings[r.key] = r.value; });
    } catch (e) {}

    // 3. Fetch User and Purchases
    let user = null;
    let myProducts = [];

    if (sessionUserId) {
      const userRows = await sql`SELECT * FROM users WHERE id = ${sessionUserId} LIMIT 1`.catch(() => []);
      const rawUser = userRows[0];

      if (rawUser && !rawUser.is_banned) {
        user = {
          id: rawUser.id,
          phone: rawUser.phone || rawUser.phone_number || '',
          phone_number: rawUser.phone || rawUser.phone_number || '',
          referral_code: rawUser.referral_code || '',
          deposit_balance: getDepositBal(rawUser),
          withdrawable_balance: getWithdrawBal(rawUser),
          total_deposited: Number(rawUser.total_deposited || 0),
          total_withdrawn: Number(rawUser.total_withdrawn || 0),
          created_at: rawUser.created_at
        };

        let rawPurchases = [];
        try {
          rawPurchases = await sql`SELECT * FROM user_products WHERE user_id = ${sessionUserId} ORDER BY id DESC`;
        } catch (e1) {
          try {
            rawPurchases = await sql`SELECT * FROM user_investments WHERE user_id = ${sessionUserId} ORDER BY id DESC`;
          } catch (e2) {
            try {
              rawPurchases = await sql`SELECT * FROM purchases WHERE user_id = ${sessionUserId} ORDER BY id DESC`;
            } catch (e3) {
              rawPurchases = [];
            }
          }
        }

        const prodMap = new Map();
        products.forEach(p => prodMap.set(p.id, p));

        myProducts = (rawPurchases || []).map(item => {
          const matched = prodMap.get(item.product_id) || {};
          const price = Number(item.price || item.amount_paid || matched.price || 0);
          const daily = Number(item.daily_yield || item.daily_income || matched.daily_income || 0);
          const days = Number(item.duration_days || item.period_days || matched.period_days || 30);
          return {
            id: item.id,
            product_id: item.product_id,
            name: item.name || matched.name || 'Active Equipment',
            product_name: item.name || matched.name || 'Active Equipment',
            price: price,
            amount_paid: price,
            daily_income: daily,
            duration_days: days,
            total_revenue: Number(item.total_revenue || (daily * days)),
            status: (item.status || 'Active').charAt(0).toUpperCase() + (item.status || 'Active').slice(1).toLowerCase(),
            created_at: item.created_at || new Date().toISOString(),
            next_drop_time: item.next_drop_time || new Date(Date.now() + 86400000).toISOString()
          };
        });
      }
    }

    return res.status(200).json({
      success: true,
      user,
      products,
      equipment: products,
      myProducts,
      purchases: myProducts,
      userEquipment: myProducts,
      settings
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Error bootstrapping application' });
  }
}
