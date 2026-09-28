import { sql } from './_db.js';

const ADMIN_KEY = process.env.ADMIN_SECRET || 'novavest_admin_2026';

function isAuthorized(req) {
  const token = req.headers['x-admin-key'] || req.query.admin_key;
  return token === ADMIN_KEY;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!isAuthorized(req)) {
    return res.status(403).json({ error: 'Unauthorized: Invalid Admin Key' });
  }

  const action = req.query.action || (req.body && req.body.action);

  try {
    // 1. DASHBOARD METRICS
    if (action === 'dashboard') {
      const [users, deposits, purchases, withdrawals, pendingDep, pendingWith] = await Promise.all([
        sql`SELECT COUNT(*)::int as count, COALESCE(SUM(balance), 0)::numeric as total_bal FROM users`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric as sum, COUNT(*)::int as count FROM deposits WHERE status = 'Approved'`,
        sql`SELECT COALESCE(SUM(price), 0)::numeric as sum, COUNT(*)::int as count FROM purchases WHERE status = 'Active'`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric as sum, COALESCE(SUM(fee), 0)::numeric as fees, COUNT(*)::int as count FROM withdrawals WHERE status = 'Approved'`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric as sum, COUNT(*)::int as count FROM deposits WHERE status = 'Pending'`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric as sum, COUNT(*)::int as count FROM withdrawals WHERE status = 'Pending'`
      ]);

      return res.status(200).json({
        success: true,
        stats: {
          total_users: users[0]?.count || 0,
          total_balance: users[0]?.total_bal || 0,
          total_deposits: deposits[0]?.sum || 0,
          deposits_count: deposits[0]?.count || 0,
          total_investment: purchases[0]?.sum || 0,
          investment_count: purchases[0]?.count || 0,
          total_payouts: withdrawals[0]?.sum || 0,
          payouts_count: withdrawals[0]?.count || 0,
          platform_profit: withdrawals[0]?.fees || 0,
          pending_withdrawals: pendingWith[0]?.sum || 0,
          pending_deposits: pendingDep[0]?.sum || 0
        }
      });
    }

    // 2. USER MANAGEMENT
    if (action === 'users') {
      const users = await sql`
        SELECT u.id, u.phone_number, u.balance, u.withdrawable_balance, u.total_income, u.total_withdrawn,
               u.referral_code, u.is_banned, u.withdraw_without_package, u.is_promoter, u.created_at,
               b.bank_name, b.account_number, b.account_name
        FROM users u
        LEFT JOIN bank_cards b ON u.id = b.user_id
        ORDER BY u.created_at DESC LIMIT 150
      `;
      return res.status(200).json({ success: true, users });
    }

    // 3. USER ACTIONS (Adjust balance, Ban, Toggle package requirement)
    if (action === 'user-action' && req.method === 'POST') {
      const { user_id, op, amount, wallet_type } = req.body;
      if (op === 'ban') {
        await sql`UPDATE users SET is_banned = NOT is_banned WHERE id = ${user_id}`;
        return res.status(200).json({ success: true, message: 'User ban status toggled.' });
      }
      if (op === 'toggle-package') {
        await sql`UPDATE users SET withdraw_without_package = NOT withdraw_without_package WHERE id = ${user_id}`;
        return res.status(200).json({ success: true, message: 'Package withdrawal rule updated.' });
      }
      if (op === 'adjust') {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return res.status(400).json({ error: 'Invalid adjustment amount' });
        const col = wallet_type === 'withdrawable' ? 'withdrawable_balance' : 'balance';
        
        await sql`UPDATE users SET ${sql(col)} = ${sql(col)} + ${val} WHERE id = ${user_id}`;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${user_id}, 'Admin Adjustment', ${'Admin ' + (val > 0 ? 'Credit' : 'Debit')}, ${Math.abs(val)}, ${val > 0 ? 'in' : 'out'})
        `;
        return res.status(200).json({ success: true, message: 'User wallet adjusted successfully.' });
      }
    }

    // 4. DEPOSIT REQUESTS REVIEW
    if (action === 'deposits') {
      const deposits = await sql`
        SELECT d.*, u.phone_number, c.name as channel_name 
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN payment_channels c ON d.channel_id = c.id
        ORDER BY d.created_at DESC LIMIT 100
      `;
      return res.status(200).json({ success: true, deposits });
    }

    if (action === 'review-deposit' && req.method === 'POST') {
      const { deposit_id, decision, admin_note } = req.body;
      const rows = await sql`SELECT * FROM deposits WHERE id = ${deposit_id}`;
      if (!rows.length) return res.status(404).json({ error: 'Deposit record not found' });
      const dep = rows[0];

      if (dep.status !== 'Pending') {
        return res.status(400).json({ error: 'Deposit already processed' });
      }

      if (decision === 'approve') {
        await sql`UPDATE users SET balance = balance + ${dep.amount} WHERE id = ${dep.user_id}`;
        await sql`
          UPDATE deposits 
          SET status = 'Approved', admin_note = ${admin_note || ''}, approved_at = CURRENT_TIMESTAMP
          WHERE id = ${deposit_id}
        `;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${dep.user_id}, 'Deposit', ${'Recharge Approved (' + dep.reference + ')'}, ${dep.amount}, 'in')
        `;
        return res.status(200).json({ success: true, message: 'Deposit approved and credited.' });
      } else {
        await sql`
          UPDATE deposits 
          SET status = 'Declined', admin_note = ${admin_note || 'Rejected by Admin'} 
          WHERE id = ${deposit_id}
        `;
        return res.status(200).json({ success: true, message: 'Deposit marked declined.' });
      }
    }

    // 5. WITHDRAWAL REQUESTS REVIEW
    if (action === 'withdrawals') {
      const withdrawals = await sql`
        SELECT w.*, u.phone_number 
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        ORDER BY w.created_at DESC LIMIT 100
      `;
      return res.status(200).json({ success: true, withdrawals });
    }

    if (action === 'review-withdrawal' && req.method === 'POST') {
      const { withdrawal_id, decision, admin_note } = req.body;
      const rows = await sql`SELECT * FROM withdrawals WHERE id = ${withdrawal_id}`;
      if (!rows.length) return res.status(404).json({ error: 'Withdrawal not found' });
      const w = rows[0];

      if (w.status !== 'Pending') {
        return res.status(400).json({ error: 'Withdrawal already processed' });
      }

      if (decision === 'approve') {
        await sql`
          UPDATE withdrawals 
          SET status = 'Approved', admin_note = ${admin_note || ''}, approved_at = CURRENT_TIMESTAMP
          WHERE id = ${withdrawal_id}
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal approved.' });
      } else {
        // Refund reserved funds back to user
        await sql`
          UPDATE users 
          SET withdrawable_balance = withdrawable_balance + ${w.amount},
              total_withdrawn = total_withdrawn - ${w.amount}
          WHERE id = ${w.user_id}
        `;
        await sql`
          UPDATE withdrawals 
          SET status = 'Declined', admin_note = ${admin_note || 'Rejected'}
          WHERE id = ${withdrawal_id}
        `;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${w.user_id}, 'Refund', 'Withdrawal Declined (Refunded)', ${w.amount}, 'in')
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal declined and refunded.' });
      }
    }

    // 6. SETTINGS & RATES
    if (action === 'settings' && req.method === 'GET') {
      const rows = await sql`SELECT id, val FROM platform_settings`;
      const settings = {};
      rows.forEach(r => { settings[r.id] = r.val; });
      return res.status(200).json({ success: true, settings });
    }

    if (action === 'settings' && req.method === 'POST') {
      const updates = req.body;
      for (const [key, val] of Object.entries(updates)) {
        await sql`
          INSERT INTO platform_settings (id, val) VALUES (${key}, ${String(val)})
          ON CONFLICT (id) DO UPDATE SET val = ${String(val)}
        `;
      }
      return res.status(200).json({ success: true, message: 'Settings saved successfully.' });
    }

    // 7. GENERATE GIFT CODE
    if (action === 'generate-gift-code' && req.method === 'POST') {
      const { amount, max_claims, expires_in_minutes } = req.body;
      const code = 'GIFT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + (parseInt(expires_in_minutes, 10) || 60) * 60000);

      await sql`
        INSERT INTO gift_codes (code, amount, max_claims, expires_at)
        VALUES (${code}, ${parseFloat(amount)}, ${parseInt(max_claims, 10) || 1}, ${expiresAt})
      `;
      return res.status(200).json({ success: true, code, message: 'Gift code generated.' });
    }

    // 8. PRODUCTS SYNC
    if (action === 'products' && req.method === 'GET') {
      const products = await sql`SELECT * FROM products ORDER BY price ASC`;
      return res.status(200).json({ success: true, products });
    }

    if (action === 'update-product' && req.method === 'POST') {
      const { id, price, daily_income, period_days, status } = req.body;
      await sql`
        UPDATE products 
        SET price = ${parseFloat(price)},
            daily_income = ${parseFloat(daily_income)},
            period_days = ${parseInt(period_days, 10)},
            status = ${status}
        WHERE id = ${id}
      `;
      return res.status(200).json({ success: true, message: 'Product updated successfully.' });
    }

    return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    console.error('Admin API Error:', err);
    return res.status(500).json({ error: err.message || 'Internal admin error.' });
  }
}
