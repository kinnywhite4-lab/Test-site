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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();
  const cookies = parseCookies(req);
  const sessionUserId = cookies['novavest_session'] || req.query.user_id;

  // -------------------------------------------------------------
  // 1. GET: Return Catalog & Active Investments with Income Drops
  // -------------------------------------------------------------
  if (req.method === 'GET') {
    const action = req.query.action;

    // A. CATALOG FOR HOME & PRODUCTS PAGE (Can be viewed even when logged out)
    if (action === 'catalog' || !sessionUserId) {
      try {
        let rawProducts = await sql`SELECT * FROM products ORDER BY price ASC`;
        
        // Filter active products safely without failing on missing status column
        const filtered = rawProducts.filter(p => {
          if (p.is_active !== undefined) return Boolean(p.is_active);
          if (p.status !== undefined) return String(p.status).toLowerCase() === 'active';
          return true;
        });

        const products = filtered.map(p => {
          const price = parseFloat(p.price || 0);
          const daily = parseFloat(p.daily_income || p.daily_yield || 0);
          const period = parseInt(p.period_days || p.duration_days || 30, 10);
          return {
            id: p.id,
            name: p.name,
            price: price,
            daily_income: daily,
            daily_yield: daily,
            period_days: period,
            duration_days: period,
            total_revenue: parseFloat(p.total_revenue || (daily * period)),
            status: 'Active'
          };
        });

        return res.status(200).json({ success: true, products, data: { products } });
      } catch (err) {
        console.error('Catalog fetch error:', err);
        return res.status(500).json({ error: 'Failed to load catalog.' });
      }
    }

    // B. USER ACTIVE EQUIPMENT & INCOME DROP PROCESSING
    try {
      const [user] = await sql`SELECT * FROM users WHERE id = ${sessionUserId}`;
      if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

      // Run pending income drops safely if columns exist
      try {
        const now = new Date();
        const readyPurchases = await sql`
          SELECT * FROM purchases 
          WHERE user_id = ${user.id} AND status = 'Active' AND next_drop_time <= ${now}
        `;

        for (const p of readyPurchases) {
          const daily = parseFloat(p.daily_income || p.daily_yield || 0);
          const period = parseInt(p.period_days || p.duration_days || 30, 10);
          const maxRev = parseFloat(p.total_revenue || (daily * period));
          const currentPaid = parseFloat(p.amount_paid || 0);

          if (currentPaid + daily >= maxRev) {
            const finalPayout = maxRev - currentPaid;
            await sql`
              UPDATE users 
              SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${finalPayout}
              WHERE id = ${user.id}
            `;
            await sql`
              UPDATE purchases 
              SET amount_paid = ${maxRev}, status = 'Completed', last_drop_time = CURRENT_TIMESTAMP
              WHERE id = ${p.id}
            `;
            await sql`
              INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
              VALUES (${user.id}, 'Investment Income', ${p.product_name + ' Cycle Completed'}, ${finalPayout}, 'in', CURRENT_TIMESTAMP)
            `.catch(() => {});
          } else {
            await sql`
              UPDATE users 
              SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${daily}
              WHERE id = ${user.id}
            `;
            await sql`
              UPDATE purchases 
              SET amount_paid = amount_paid + ${daily},
                  next_drop_time = CURRENT_TIMESTAMP + INTERVAL '24 hours',
                  last_drop_time = CURRENT_TIMESTAMP
              WHERE id = ${p.id}
            `;
            await sql`
              INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
              VALUES (${user.id}, 'Investment Income', ${p.product_name + ' Daily Income'}, ${daily}, 'in', CURRENT_TIMESTAMP)
            `.catch(() => {});
          }
        }
      } catch (dropErr) {
        console.warn('Income drop check skipped:', dropErr.message);
      }

      // Fetch active purchases across both purchases and user_products tables
      let purchases = [];
      try {
        purchases = await sql`
          SELECT * FROM purchases WHERE user_id = ${user.id} ORDER BY id DESC
        `;
      } catch (e) {
        purchases = await sql`
          SELECT up.*, p.name as product_name, p.price, p.daily_yield as daily_income, p.duration_days as period_days
          FROM user_products up
          LEFT JOIN products p ON up.product_id = p.id
          WHERE up.user_id = ${user.id} ORDER BY up.id DESC
        `.catch(() => []);
      }

      const formatted = purchases.map(p => ({
        id: p.id,
        product_id: p.product_id,
        name: p.product_name || p.name || 'VIP Equipment',
        product_name: p.product_name || p.name || 'VIP Equipment',
        price: parseFloat(p.price || 0),
        daily_income: parseFloat(p.daily_income || p.daily_yield || 0),
        period_days: parseInt(p.period_days || p.duration_days || 30, 10),
        total_revenue: parseFloat(p.total_revenue || 0),
        status: p.status || 'Active',
        created_at: p.created_at,
        next_drop_time: p.next_drop_time
      }));

      return res.status(200).json({
        success: true,
        purchases: formatted,
        products: formatted,
        myProducts: formatted
      });
    } catch (err) {
      console.error('Error fetching investments:', err);
      return res.status(500).json({ error: 'Failed to load investments.' });
    }
  }

  // -------------------------------------------------------------
  // 2. POST: Purchase Equipment Atomically
  // -------------------------------------------------------------
  if (req.method === 'POST') {
    if (!sessionUserId) return res.status(401).json({ error: 'Please log in to continue.' });

    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const productId = body.productId || body.product_id;
    if (!productId) return res.status(400).json({ error: 'Invalid product selected.' });

    try {
      const productRows = await sql`SELECT * FROM products WHERE id = ${productId}`;
      if (!productRows.length) {
        return res.status(400).json({ error: 'Equipment not found.' });
      }

      const prod = productRows[0];
      const prodPrice = parseFloat(prod.price);
      const dailyIncome = parseFloat(prod.daily_income || prod.daily_yield || 0);
      const periodDays = parseInt(prod.period_days || prod.duration_days || 30, 10);
      const totalRevenue = parseFloat(prod.total_revenue || (dailyIncome * periodDays));

      // ATOMIC BALANCE DEDUCTION (Works across deposit_balance and balance columns)
      const [user] = await sql`SELECT * FROM users WHERE id = ${sessionUserId} FOR UPDATE`;
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const currentBal = getDepositBal(user);
      if (currentBal < prodPrice) {
        return res.status(400).json({
          error: `Insufficient balance. Required: ₦${prodPrice.toLocaleString()}, Available: ₦${currentBal.toLocaleString()}`,
          code: 'INSUFFICIENT_BALANCE'
        });
      }

      const newBal = currentBal - prodPrice;
      if (user.deposit_balance !== undefined) {
        await sql`UPDATE users SET deposit_balance = ${newBal} WHERE id = ${sessionUserId}`;
      } else {
        await sql`UPDATE users SET balance = ${newBal} WHERE id = ${sessionUserId}`;
      }

      // Record in both purchases and user_products to keep Admin and Frontend synced
      let purchaseId = null;
      try {
        const [purchase] = await sql`
          INSERT INTO purchases (
            user_id, product_id, product_name, price, daily_income, total_revenue, 
            period_days, amount_paid, status, next_drop_time, created_at
          ) VALUES (
            ${user.id}, ${prod.id}, ${prod.name}, ${prodPrice}, ${dailyIncome}, ${totalRevenue},
            ${periodDays}, 0.00, 'Active', CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP
          )
          RETURNING id
        `;
        purchaseId = purchase.id;
      } catch (pErr) {
        const [up] = await sql`
          INSERT INTO user_products (user_id, product_id, price, status, created_at)
          VALUES (${user.id}, ${prod.id}, ${prodPrice}, 'Active', CURRENT_TIMESTAMP)
          RETURNING id
        `;
        purchaseId = up.id;
      }

      // Sync into user_products for Admin Panel overview
      await sql`
        INSERT INTO user_products (user_id, product_id, price, status, created_at)
        VALUES (${user.id}, ${prod.id}, ${prodPrice}, 'Active', CURRENT_TIMESTAMP)
      `.catch(() => {});

      // Distribute Level 1 & Level 2 Commissions
      try {
        let l1Rate = 0.20;
        let l2Rate = 0.02;

        const settingsRows = await sql`SELECT key, value FROM settings WHERE key IN ('level1_rate', 'level2_rate')`.catch(() => []);
        settingsRows.forEach(r => {
          if (r.key === 'level1_rate') l1Rate = parseFloat(r.value) / 100;
          if (r.key === 'level2_rate') l2Rate = parseFloat(r.value) / 100;
        });

        // Level 1 Referrer
        const [currentUser] = await sql`SELECT referred_by FROM users WHERE id = ${user.id}`;
        if (currentUser && currentUser.referred_by) {
          const l1Bonus = prodPrice * l1Rate;
          await sql`
            UPDATE users 
            SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${l1Bonus}
            WHERE id = ${currentUser.referred_by}
          `;

          // Level 2 Referrer
          const [l1Parent] = await sql`SELECT referred_by FROM users WHERE id = ${currentUser.referred_by}`;
          if (l1Parent && l1Parent.referred_by) {
            const l2Bonus = prodPrice * l2Rate;
            await sql`
              UPDATE users 
              SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${l2Bonus}
              WHERE id = ${l1Parent.referred_by}
            `;
          }
        }
      } catch (refErr) {
        console.warn('Referral distribution bypassed:', refErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Successfully purchased ${prod.name}!`,
        new_balance: newBal
      });

    } catch (err) {
      console.error('Purchase Error:', err);
      return res.status(500).json({ error: 'Purchase could not be completed.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
