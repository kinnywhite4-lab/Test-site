import { sql, hashPassword, createSessionToken } from './_db.js';

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
      const [
        usersStats,
        approvedDeposits,
        activeInvestments,
        approvedWithdrawals,
        pendingDeposits,
        pendingWithdrawals
      ] = await Promise.all([
        sql`
          SELECT 
            COUNT(*)::int AS total_users,
            COALESCE(SUM(balance + withdrawable_balance), 0)::numeric AS total_balance
          FROM users
        `,
        sql`
          SELECT COALESCE(SUM(amount), 0)::numeric AS total_deposits, COUNT(*)::int AS count
          FROM deposits WHERE status = 'Approved'
        `,
        sql`
          SELECT COALESCE(SUM(price), 0)::numeric AS total_investment, COUNT(*)::int AS count
          FROM purchases WHERE status = 'Active'
        `,
        sql`
          SELECT COALESCE(SUM(amount), 0)::numeric AS total_payouts, COUNT(*)::int AS count
          FROM withdrawals WHERE status = 'Approved'
        `,
        sql`
          SELECT COALESCE(SUM(amount), 0)::numeric AS pending_deposits, COUNT(*)::int AS count
          FROM deposits WHERE status = 'Pending'
        `,
        sql`
          SELECT COALESCE(SUM(amount), 0)::numeric AS pending_withdrawals, COUNT(*)::int AS count
          FROM withdrawals WHERE status = 'Pending'
        `
      ]);

      const totalUsers = usersStats[0]?.total_users || 0;
      const totalBalance = parseFloat(usersStats[0]?.total_balance || 0);
      const totalDeposits = parseFloat(approvedDeposits[0]?.total_deposits || 0);
      const totalInvestment = parseFloat(activeInvestments[0]?.total_investment || 0);
      const totalPayouts = parseFloat(approvedWithdrawals[0]?.total_payouts || 0);
      const platformProfit = totalInvestment - totalPayouts;

      return res.status(200).json({
        success: true,
        stats: {
          total_users: totalUsers,
          total_balance: totalBalance,
          total_deposits: totalDeposits,
          deposits_count: approvedDeposits[0]?.count || 0,
          total_investment: totalInvestment,
          investment_count: activeInvestments[0]?.count || 0,
          total_payouts: totalPayouts,
          payouts_count: approvedWithdrawals[0]?.count || 0,
          platform_profit: platformProfit,
          pending_deposits: parseFloat(pendingDeposits[0]?.pending_deposits || 0),
          pending_deposits_count: pendingDeposits[0]?.count || 0,
          pending_withdrawals: parseFloat(pendingWithdrawals[0]?.pending_withdrawals || 0),
          pending_withdrawals_count: pendingWithdrawals[0]?.count || 0
        }
      });
    }

    // 2. USER MANAGEMENT
    if (action === 'users' && req.method === 'GET') {
      const users = await sql`
        SELECT 
          u.id, u.phone_number, u.referral_code, 
          u.balance AS deposit_balance, u.withdrawable_balance, 
          (u.balance + u.withdrawable_balance) AS total_balance,
          u.is_banned, u.is_promoter, u.withdraw_without_package, u.created_at
        FROM users u ORDER BY u.created_at DESC
      `;
      return res.status(200).json({ success: true, users });
    }

    if (action === 'user-detail' && req.method === 'GET') {
      const userId = parseInt(req.query.user_id, 10);
      if (!userId) return res.status(400).json({ error: 'User ID is required.' });

      const userRows = await sql`
        SELECT u.id, u.phone_number, u.referral_code, u.referred_by,
               u.balance AS deposit_balance, u.withdrawable_balance, 
               u.is_banned, u.is_promoter, u.withdraw_without_package, u.created_at,
               b.bank_name, b.account_number, b.account_name
        FROM users u
        LEFT JOIN bank_cards b ON u.id = b.user_id
        WHERE u.id = ${userId}
      `;
      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });

      const [depSum, withSum, deposits, withdrawals, purchases, logs] = await Promise.all([
        sql`SELECT COALESCE(SUM(amount), 0)::numeric AS sum FROM deposits WHERE user_id = ${userId} AND status = 'Approved'`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric AS sum FROM withdrawals WHERE user_id = ${userId} AND status = 'Approved'`,
        sql`SELECT * FROM deposits WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM withdrawals WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM purchases WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM admin_audit_logs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`
      ]);

      return res.status(200).json({
        success: true,
        user: {
          ...userRows[0],
          total_deposited: depSum[0]?.sum || 0,
          total_withdrawn: withSum[0]?.sum || 0
        },
        deposits,
        withdrawals,
        purchases,
        logs
      });
    }

    if (action === 'adjust-balance' && req.method === 'POST') {
      const { user_id, wallet_type, direction, amount } = req.body;
      const numAmount = parseFloat(amount);
      if (!user_id || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Valid positive amount is required.' });
      }

      const signedDelta = direction === 'add' ? numAmount : -numAmount;
      if (wallet_type === 'deposit') {
        const resUp = await sql`
          UPDATE users SET balance = balance + ${signedDelta} 
          WHERE id = ${user_id} AND (balance + ${signedDelta}) >= 0
          RETURNING balance
        `;
        if (!resUp.length) return res.status(400).json({ error: 'Insufficient balance for deduction.' });
      } else {
        const resUp = await sql`
          UPDATE users SET withdrawable_balance = withdrawable_balance + ${signedDelta} 
          WHERE id = ${user_id} AND (withdrawable_balance + ${signedDelta}) >= 0
          RETURNING withdrawable_balance
        `;
        if (!resUp.length) return res.status(400).json({ error: 'Insufficient balance for deduction.' });
      }

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, 'BALANCE_ADJUST', ${`${direction.toUpperCase()} ₦${numAmount} to ${wallet_type}`})
      `;

      return res.status(200).json({ success: true, message: 'Balance adjusted successfully.' });
    }

    if (action === 'reset-password' && req.method === 'POST') {
      const { user_id } = req.body;
      const newHash = hashPassword('1234');
      await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'Password reset successfully to default (1234).' });
    }

    if (action === 'toggle-ban' && req.method === 'POST') {
      const { user_id } = req.body;
      const r = await sql`UPDATE users SET is_banned = NOT is_banned WHERE id = ${user_id} RETURNING is_banned`;
      return res.status(200).json({ success: true, is_banned: r[0]?.is_banned });
    }

    if (action === 'delete-user' && req.method === 'POST') {
      const { user_id } = req.body;
      await sql`DELETE FROM users WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'User deleted.' });
    }

    // 3. ADMIN INVESTMENTS VIEW & DELETE
    if (action === 'investments' && req.method === 'GET') {
      const investments = await sql`
        SELECT p.*, u.phone_number 
        FROM purchases p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC LIMIT 150
      `;
      return res.status(200).json({ success: true, investments });
    }

    if (action === 'delete-investment' && req.method === 'POST') {
      const { investment_id } = req.body;
      await sql`DELETE FROM purchases WHERE id = ${investment_id}`;
      return res.status(200).json({ success: true, message: 'Investment record deleted from database.' });
    }

    // 4. DEPOSIT REVIEW
    if (action === 'deposits' && req.method === 'GET') {
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
      if (!rows.length) return res.status(404).json({ error: 'Deposit not found' });
      const dep = rows[0];

      if (dep.status !== 'Pending') {
        return res.status(400).json({ error: 'Deposit has already been processed.' });
      }

      if (decision === 'approve') {
        await sql`UPDATE users SET balance = balance + ${dep.amount} WHERE id = ${dep.user_id}`;
        await sql`
          UPDATE deposits 
          SET status = 'Approved', admin_note = ${admin_note || ''}, approved_at = CURRENT_TIMESTAMP
          WHERE id = ${deposit_id}
        `;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
          VALUES (${dep.user_id}, 'Deposit', ${'Recharge Approved (' + dep.reference + ')'}, ${dep.amount}, 'in', CURRENT_TIMESTAMP)
        `;
        return res.status(200).json({ success: true, message: 'Deposit approved and credited.' });
      } else {
        await sql`
          UPDATE deposits 
          SET status = 'Declined', admin_note = ${admin_note || 'Rejected by Admin'} 
          WHERE id = ${deposit_id}
        `;
        return res.status(200).json({ success: true, message: 'Deposit declined.' });
      }
    }

    // 5. WITHDRAWAL REVIEW
    if (action === 'withdrawals' && req.method === 'GET') {
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
        return res.status(400).json({ error: 'Withdrawal already processed.' });
      }

      if (decision === 'approve') {
        await sql`
          UPDATE withdrawals 
          SET status = 'Approved', admin_note = ${admin_note || ''}, approved_at = CURRENT_TIMESTAMP
          WHERE id = ${withdrawal_id}
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal marked approved.' });
      } else {
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
          INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
          VALUES (${w.user_id}, 'Refund', 'Withdrawal Refunded (Declined)', ${w.amount}, 'in', CURRENT_TIMESTAMP)
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal declined and refunded.' });
      }
    }

    // 6. PRODUCTS & SETTINGS
    if (action === 'products' && req.method === 'GET') {
      const products = await sql`SELECT * FROM products ORDER BY price ASC`;
      return res.status(200).json({ success: true, products });
    }

    if (action === 'update-product' && req.method === 'POST') {
      const { id, price, daily_income, period_days, total_revenue, status } = req.body;
      await sql`
        UPDATE products 
        SET price = ${parseFloat(price)},
            daily_income = ${parseFloat(daily_income)},
            period_days = ${parseInt(period_days, 10)},
            total_revenue = ${parseFloat(total_revenue)},
            status = ${status}
        WHERE id = ${id}
      `;
      return res.status(200).json({ success: true, message: 'Product updated.' });
    }

    if (action === 'settings' && req.method === 'GET') {
      const rows = await sql`SELECT id, val FROM platform_settings`;
      const settings = {};
      rows.forEach(r => { settings[r.id] = r.val; });
      return res.status(200).json({ success: true, settings });
    }

    if (action === 'settings' && req.method === 'POST') {
      for (const [key, val] of Object.entries(req.body)) {
        await sql`
          INSERT INTO platform_settings (id, val) VALUES (${key}, ${String(val)})
          ON CONFLICT (id) DO UPDATE SET val = ${String(val)}
        `;
      }
      return res.status(200).json({ success: true, message: 'Settings saved.' });
    }

    return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: err.message || 'Database error occurred.' });
  }
}
