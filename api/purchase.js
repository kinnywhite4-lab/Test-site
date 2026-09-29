import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is missing.');
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const userId = cookies['novavest_session'] || req.headers['x-user-id'] || req.body?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }

  const sql = getDb();
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const action = req.query?.action || url.searchParams.get('action');

  // =============================================================
  // 1. CLAIM DAILY YIELD WHEN COUNTDOWN ENDS (?action=claim)
  // =============================================================
  if (action === 'claim' && req.method === 'POST') {
    try {
      const { purchaseId } = req.body || {};
      if (!purchaseId) {
        return res.status(400).json({ success: false, message: 'Missing purchaseId' });
      }

      // Check purchase in all potential tables
      let purchases = await sql`SELECT * FROM purchases WHERE id = ${purchaseId} LIMIT 1`.catch(() => []);
      let table = 'purchases';
      if (!purchases || purchases.length === 0) {
        purchases = await sql`SELECT * FROM user_products WHERE id = ${purchaseId} LIMIT 1`.catch(() => []);
        table = 'user_products';
      }

      const item = purchases[0];
      if (!item) {
        return res.status(404).json({ success: false, message: 'Equipment not found' });
      }

      const now = Date.now();
      const intervalMs = 24 * 60 * 60 * 1000;
      const nextDropMs = item.next_drop_time ? new Date(item.next_drop_time).getTime() : 0;

      // Anti-cheat verification: Verify countdown has actually hit 0
      if (now < nextDropMs) {
        return res.status(400).json({ success: false, message: 'Countdown is not finished yet.' });
      }

      const daily = Number(item.daily_yield || item.daily_income || 0);
      if (daily <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid yield amount.' });
      }

      const newNextDropIso = new Date(now + intervalMs).toISOString();
      const nowIso = new Date(now).toISOString();
      const newTotalEarned = Number(item.total_earned || 0) + daily;

      // Lock next drop time 24 hours into the future
      if (table === 'purchases') {
        await sql`
          UPDATE purchases 
          SET next_drop_time = ${newNextDropIso},
              last_drop_time = ${nowIso},
              total_earned = ${newTotalEarned}
          WHERE id = ${item.id}
        `;
      } else {
        await sql`
          UPDATE user_products 
          SET next_drop_time = ${newNextDropIso},
              last_drop_time = ${nowIso},
              total_earned = ${newTotalEarned}
          WHERE id = ${item.id}
        `;
      }

      // Add to user withdrawable balance
      await sql`
        UPDATE users 
        SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${daily}
        WHERE id = ${userId} OR id::text = ${String(userId)}
      `;

      // Log into Transaction History
      try {
        await sql`
          INSERT INTO transactions (user_id, title, type, amount, direction, status, created_at)
          VALUES (
            ${String(userId)},
            ${(item.name || item.product_name || 'Equipment') + ' Daily Yield (#' + item.id + ')'},
            'income',
            ${daily},
            'in',
            'completed',
            NOW()
          )
        `;
      } catch (txErr) {
        try {
          await sql`
            INSERT INTO user_transactions (user_id, type, amount, status, created_at)
            VALUES (${String(userId)}, 'income', ${daily}, 'completed', NOW())
          `;
        } catch (tx2) {}
      }

      return res.status(200).json({
        success: true,
        reward: daily,
        next_drop_time: newNextDropIso
      });
    } catch (err) {
      console.error('Claim yield error:', err);
      return res.status(500).json({ success: false, message: 'Failed to process claim.' });
    }
  }

  // =============================================================
  // 2. BUY EQUIPMENT (DEFAULT POST /api/purchase)
  // =============================================================
  if (req.method === 'POST') {
    try {
      const { productId } = req.body || {};
      if (!productId) {
        return res.status(400).json({ success: false, message: 'Select a valid product.' });
      }

      // Check product details
      const products = await sql`SELECT * FROM products WHERE id = ${productId} LIMIT 1`.catch(() => []);
      const product = products[0];
      if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found.' });
      }

      // Check user balance
      const users = await sql`SELECT * FROM users WHERE id = ${userId} OR id::text = ${String(userId)} LIMIT 1`;
      const user = users[0];
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const price = Number(product.price || 0);
      const balance = Number(user.deposit_balance || user.balance || 0);

      if (balance < price) {
        return res.status(400).json({ success: false, message: 'Insufficient deposit balance. Please recharge.' });
      }

      const now = new Date();
      const nextDrop = new Date(now.getTime() + (24 * 60 * 60 * 1000));

      // Deduct balance
      await sql`
        UPDATE users 
        SET deposit_balance = deposit_balance - ${price}
        WHERE id = ${user.id}
      `;

      // Insert purchase record with initial 24h drop countdown
      try {
        await sql`
          INSERT INTO purchases (user_id, product_id, product_name, price, daily_yield, duration_days, total_earned, last_drop_time, next_drop_time, status, created_at)
          VALUES (
            ${user.id},
            ${product.id},
            ${product.name},
            ${price},
            ${Number(product.daily_yield || product.daily_income || 0)},
            ${Number(product.duration_days || product.period_days || 30)},
            0,
            ${now.toISOString()},
            ${nextDrop.toISOString()},
            'Active',
            ${now.toISOString()}
          )
        `;
      } catch (eInsert) {
        await sql`
          INSERT INTO user_products (user_id, product_id, product_name, price, daily_yield, duration_days, total_earned, last_drop_time, next_drop_time, status, created_at)
          VALUES (
            ${user.id},
            ${product.id},
            ${product.name},
            ${price},
            ${Number(product.daily_yield || product.daily_income || 0)},
            ${Number(product.duration_days || product.period_days || 30)},
            0,
            ${now.toISOString()},
            ${nextDrop.toISOString()},
            'Active',
            ${now.toISOString()}
          )
        `;
      }

      // Log purchase in transactions
      try {
        await sql`
          INSERT INTO transactions (user_id, title, type, amount, direction, status, created_at)
          VALUES (
            ${String(user.id)},
            ${'Purchased ' + product.name},
            'purchase',
            ${price},
            'out',
            'completed',
            NOW()
          )
        `;
      } catch (txP) {}

      return res.status(200).json({ success: true, message: 'Equipment purchased successfully!' });
    } catch (err) {
      console.error('Purchase error:', err);
      return res.status(500).json({ success: false, message: 'Failed to process purchase.' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
