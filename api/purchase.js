import { sql, getAuthUser } from './_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  // 1. GET: Return Catalog & Active Investments with Income Drops
  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'catalog') {
      try {
        const products = await sql`
          SELECT id, name, price, daily_income, period_days, total_revenue, status 
          FROM products 
          WHERE status = 'Active' 
          ORDER BY price ASC
        `;
        return res.status(200).json({ success: true, products });
      } catch {
        return res.status(500).json({ error: 'Failed to load catalog.' });
      }
    }

    try {
      // Process pending income drops for this user
      const now = new Date();
      const readyPurchases = await sql`
        SELECT * FROM purchases 
        WHERE user_id = ${user.id} AND status = 'Active' AND next_drop_time <= ${now}
      `;

      for (const p of readyPurchases) {
        const daily = parseFloat(p.daily_income);
        const maxRev = parseFloat(p.total_revenue || (daily * p.period_days));
        const currentPaid = parseFloat(p.amount_paid || 0);

        if (currentPaid + daily >= maxRev) {
          const finalPayout = maxRev - currentPaid;
          await sql`
            UPDATE users 
            SET withdrawable_balance = withdrawable_balance + ${finalPayout},
                total_income = total_income + ${finalPayout}
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
          `;
        } else {
          await sql`
            UPDATE users 
            SET withdrawable_balance = withdrawable_balance + ${daily},
                total_income = total_income + ${daily}
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
          `;
        }
      }

      const purchases = await sql`
        SELECT * FROM purchases WHERE user_id = ${user.id} ORDER BY created_at DESC
      `;
      return res.status(200).json({ success: true, purchases });
    } catch (err) {
      console.error('Error fetching investments:', err);
      return res.status(500).json({ error: 'Failed to load investments.' });
    }
  }

  // 2. POST: Purchase Equipment Atomically
  if (req.method === 'POST') {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'Invalid product selected.' });

    try {
      const productRows = await sql`
        SELECT * FROM products WHERE id = ${productId} AND status = 'Active'
      `;
      if (!productRows.length) {
        return res.status(400).json({ error: 'This equipment is currently out of stock or disabled.' });
      }

      const prod = productRows[0];
      const prodPrice = parseFloat(prod.price);
      const dailyIncome = parseFloat(prod.daily_income);
      const periodDays = parseInt(prod.period_days, 10);
      const totalRevenue = parseFloat(prod.total_revenue || (dailyIncome * periodDays));

      // ATOMIC BALANCE DEDUCTION
      const deductionResult = await sql`
        UPDATE users 
        SET balance = balance - ${prodPrice}
        WHERE id = ${user.id} AND balance >= ${prodPrice}
        RETURNING balance
      `;

      if (!deductionResult.length) {
        return res.status(400).json({
          error: 'Insufficient available balance to buy this equipment.',
          code: 'INSUFFICIENT_BALANCE'
        });
      }

      // Create Active Investment
      const purchaseInsert = await sql`
        INSERT INTO purchases (
          user_id, product_id, product_name, price, daily_income, total_revenue, 
          period_days, amount_paid, status, next_drop_time, created_at
        ) VALUES (
          ${user.id}, ${prod.id}, ${prod.name}, ${prodPrice}, ${dailyIncome}, ${totalRevenue},
          ${periodDays}, 0.00, 'Active', CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP
        )
        RETURNING id
      `;

      const purchaseId = purchaseInsert[0].id;
      const ref = 'INV' + Date.now().toString(36).toUpperCase();

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction, reference, created_at)
        VALUES (${user.id}, 'Investment Purchase', ${'Bought ' + prod.name}, ${prodPrice}, 'out', ${ref}, CURRENT_TIMESTAMP)
      `;

      // Distribute Level 1 & Level 2 Commissions
      try {
        const settingsRows = await sql`SELECT id, val FROM platform_settings WHERE id IN ('referral_l1_rate', 'referral_l2_rate')`;
        let l1Rate = 0.20;
        let l2Rate = 0.02;
        settingsRows.forEach(r => {
          if (r.id === 'referral_l1_rate') l1Rate = parseFloat(r.val) / 100;
          if (r.id === 'referral_l2_rate') l2Rate = parseFloat(r.val) / 100;
        });

        // Level 1 Referrer
        const l1User = await sql`SELECT id, referred_by FROM users WHERE id = (SELECT referred_by FROM users WHERE id = ${user.id})`;
        if (l1User.length && l1User[0].id) {
          const l1Bonus = prodPrice * l1Rate;
          await sql`
            UPDATE users 
            SET withdrawable_balance = withdrawable_balance + ${l1Bonus},
                total_income = total_income + ${l1Bonus}
            WHERE id = ${l1User[0].id}
          `;
          await sql`
            INSERT INTO referral_commissions (referrer_id, buyer_id, purchase_id, level, purchase_amount, commission_amount)
            VALUES (${l1User[0].id}, ${user.id}, ${purchaseId}, 1, ${prodPrice}, ${l1Bonus})
          `;
          await sql`
            INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
            VALUES (${l1User[0].id}, 'Referral Commission', ${'Team 1 Bonus (' + prod.name + ')'}, ${l1Bonus}, 'in', CURRENT_TIMESTAMP)
          `;

          // Level 2 Referrer
          if (l1User[0].referred_by) {
            const l2Bonus = prodPrice * l2Rate;
            await sql`
              UPDATE users 
              SET withdrawable_balance = withdrawable_balance + ${l2Bonus},
                  total_income = total_income + ${l2Bonus}
              WHERE id = ${l1User[0].referred_by}
            `;
            await sql`
              INSERT INTO referral_commissions (referrer_id, buyer_id, purchase_id, level, purchase_amount, commission_amount)
              VALUES (${l1User[0].referred_by}, ${user.id}, ${purchaseId}, 2, ${prodPrice}, ${l2Bonus})
            `;
            await sql`
              INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
              VALUES (${l1User[0].referred_by}, 'Referral Commission', ${'Team 2 Bonus (' + prod.name + ')'}, ${l2Bonus}, 'in', CURRENT_TIMESTAMP)
            `;
          }
        }
      } catch (refErr) {
        console.warn('Referral distribution bypassed:', refErr.message);
      }

      return res.status(200).json({
        success: true,
        message: `Successfully purchased ${prod.name}!`
      });
    } catch (err) {
      console.error('Purchase Error:', err);
      return res.status(500).json({ error: 'Purchase could not be completed.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
