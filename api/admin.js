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
    // -------------------------------------------------------------
    // 1. DASHBOARD METRICS (EXACT PRESERVED LOGIC)
    // -------------------------------------------------------------
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
            COALESCE(SUM(balance), 0)::numeric AS sum_deposit_balance,
            COALESCE(SUM(withdrawable_balance), 0)::numeric AS sum_withdrawal_balance,
            COALESCE(SUM(balance + withdrawable_balance), 0)::numeric AS total_balance
          FROM users
        `,
        sql`
          SELECT 
            COALESCE(SUM(amount), 0)::numeric AS total_deposits,
            COUNT(*)::int AS count
          FROM deposits 
          WHERE status = 'Approved'
        `,
        sql`
          SELECT 
            COALESCE(SUM(price), 0)::numeric AS total_investment,
            COUNT(*)::int AS count
          FROM purchases 
          WHERE status = 'Active'
        `,
        sql`
          SELECT 
            COALESCE(SUM(amount), 0)::numeric AS total_payouts,
            COUNT(*)::int AS count
          FROM withdrawals 
          WHERE status = 'Approved'
        `,
        sql`
          SELECT 
            COALESCE(SUM(amount), 0)::numeric AS pending_deposits,
            COUNT(*)::int AS count
          FROM deposits 
          WHERE status = 'Pending'
        `,
        sql`
          SELECT 
            COALESCE(SUM(amount), 0)::numeric AS pending_withdrawals,
            COUNT(*)::int AS count
          FROM withdrawals 
          WHERE status = 'Pending'
        `
      ]);

      const totalUsers = usersStats[0]?.total_users || 0;
      const totalBalance = parseFloat(usersStats[0]?.total_balance || 0);
      const totalDeposits = parseFloat(approvedDeposits[0]?.total_deposits || 0);
      const totalInvestment = parseFloat(activeInvestments[0]?.total_investment || 0);
      const totalPayouts = parseFloat(approvedWithdrawals[0]?.total_payouts || 0);

      const platformProfit = totalInvestment - totalPayouts;

      const pendingDepAmt = parseFloat(pendingDeposits[0]?.pending_deposits || 0);
      const pendingWithAmt = parseFloat(pendingWithdrawals[0]?.pending_withdrawals || 0);

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
          pending_deposits: pendingDepAmt,
          pending_deposits_count: pendingDeposits[0]?.count || 0,
          pending_withdrawals: pendingWithAmt,
          pending_withdrawals_count: pendingWithdrawals[0]?.count || 0
        }
      });
    }

    // -------------------------------------------------------------
    // 2. USER MANAGEMENT (EXACT PRESERVED LOGIC)
    // -------------------------------------------------------------
    if (action === 'users' && req.method === 'GET') {
      const users = await sql`
        SELECT 
          u.id, 
          u.phone_number, 
          u.referral_code, 
          u.balance AS deposit_balance, 
          u.withdrawable_balance, 
          (u.balance + u.withdrawable_balance) AS total_balance,
          u.is_banned, 
          u.is_promoter, 
          u.withdraw_without_package, 
          u.created_at
        FROM users u
        ORDER BY u.created_at DESC
      `;
      return res.status(200).json({ success: true, users });
    }

    if (action === 'user-detail' && req.method === 'GET') {
      const userId = parseInt(req.query.user_id, 10);
      if (!userId) return res.status(400).json({ error: 'User ID is required.' });

      const userRows = await sql`
        SELECT 
          u.id, 
          u.phone_number, 
          u.referral_code, 
          u.referred_by,
          u.balance AS deposit_balance, 
          u.withdrawable_balance, 
          (u.balance + u.withdrawable_balance) AS total_balance,
          u.is_banned, 
          u.is_promoter, 
          u.withdraw_without_package, 
          u.created_at,
          b.bank_name, 
          b.account_number, 
          b.account_name
        FROM users u
        LEFT JOIN bank_cards b ON u.id = b.user_id
        WHERE u.id = ${userId}
      `;

      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });
      const user = userRows[0];

      const [depSum, withSum] = await Promise.all([
        sql`SELECT COALESCE(SUM(amount), 0)::numeric AS sum FROM deposits WHERE user_id = ${userId} AND status = 'Approved'`,
        sql`SELECT COALESCE(SUM(amount), 0)::numeric AS sum FROM withdrawals WHERE user_id = ${userId} AND status = 'Approved'`
      ]);

      const [deposits, withdrawals, purchases, logs] = await Promise.all([
        sql`SELECT * FROM deposits WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM withdrawals WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM purchases WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`,
        sql`SELECT * FROM admin_audit_logs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50`
      ]);

      return res.status(200).json({
        success: true,
        user: {
          ...user,
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

      const userRows = await sql`SELECT balance, withdrawable_balance FROM users WHERE id = ${user_id}`;
      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });

      const currentBalance = parseFloat(
        wallet_type === 'deposit' ? userRows[0].balance : userRows[0].withdrawable_balance
      );

      if (direction === 'subtract' && currentBalance < numAmount) {
        return res.status(400).json({
          error: `Insufficient balance for deduction. Current ${wallet_type} balance is ₦${currentBalance.toLocaleString()}.`
        });
      }

      const signedDelta = direction === 'add' ? numAmount : -numAmount;

      if (wallet_type === 'deposit') {
        await sql`UPDATE users SET balance = balance + ${signedDelta} WHERE id = ${user_id}`;
      } else {
        await sql`UPDATE users SET withdrawable_balance = withdrawable_balance + ${signedDelta} WHERE id = ${user_id}`;
      }

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction)
        VALUES (${user_id}, 'Admin Adjustment', ${`Admin Adjustment (${direction.toUpperCase()} ${wallet_type.toUpperCase()})`}, ${numAmount}, ${direction === 'add' ? 'in' : 'out'})
      `;

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, 'BALANCE_ADJUST', ${`${direction.toUpperCase()} ₦${numAmount.toLocaleString()} to ${wallet_type} wallet`})
      `;

      return res.status(200).json({
        success: true,
        message: `${wallet_type === 'deposit' ? 'Deposit' : 'Withdrawal'} balance ${direction === 'add' ? 'increased' : 'decreased'} by ₦${numAmount.toLocaleString()}.`
      });
    }

    if (action === 'reset-password' && req.method === 'POST') {
      const { user_id } = req.body;
      const newHash = hashPassword('1234');
      await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user_id}`;
      await sql`INSERT INTO admin_audit_logs (user_id, action_type, details) VALUES (${user_id}, 'PASSWORD_RESET', 'Password reset to 1234')`;
      return res.status(200).json({ success: true, message: 'Password reset to default (1234).' });
    }

    if (action === 'toggle-ban' && req.method === 'POST') {
      const { user_id } = req.body;
      const result = await sql`UPDATE users SET is_banned = NOT is_banned WHERE id = ${user_id} RETURNING is_banned`;
      const isBanned = result[0].is_banned;
      await sql`INSERT INTO admin_audit_logs (user_id, action_type, details) VALUES (${user_id}, ${isBanned ? 'USER_BAN' : 'USER_UNBAN'}, ${isBanned ? 'Banned' : 'Unbanned'})`;
      return res.status(200).json({ success: true, is_banned: isBanned, message: isBanned ? 'User banned.' : 'User restored.' });
    }

    if (action === 'toggle-package-rule' && req.method === 'POST') {
      const { user_id } = req.body;
      const result = await sql`UPDATE users SET withdraw_without_package = NOT withdraw_without_package WHERE id = ${user_id} RETURNING withdraw_without_package`;
      return res.status(200).json({ success: true, enabled: result[0]?.withdraw_without_package });
    }

    if (action === 'toggle-promoter' && req.method === 'POST') {
      const { user_id } = req.body;
      const result = await sql`UPDATE users SET is_promoter = NOT is_promoter WHERE id = ${user_id} RETURNING is_promoter`;
      return res.status(200).json({ success: true, is_promoter: result[0]?.is_promoter });
    }

    if (action === 'impersonate' && req.method === 'POST') {
      const { user_id } = req.body;
      const userRows = await sql`SELECT id, phone_number FROM users WHERE id = ${user_id}`;
      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });

      const token = createSessionToken(userRows[0].id);
      await sql`INSERT INTO admin_audit_logs (user_id, action_type, details) VALUES (${user_id}, 'ADMIN_IMPERSONATION', 'Admin logged into account')`;
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`);

      return res.status(200).json({ success: true, token, message: `Impersonation created for ${userRows[0].phone_number}.` });
    }

    if (action === 'delete-user' && req.method === 'POST') {
      const { user_id } = req.body;
      await sql`DELETE FROM admin_audit_logs WHERE user_id = ${user_id}`;
      await sql`DELETE FROM transactions WHERE user_id = ${user_id}`;
      await sql`DELETE FROM purchases WHERE user_id = ${user_id}`;
      await sql`DELETE FROM withdrawals WHERE user_id = ${user_id}`;
      await sql`DELETE FROM deposits WHERE user_id = ${user_id}`;
      await sql`DELETE FROM bank_cards WHERE user_id = ${user_id}`;
      await sql`DELETE FROM users WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'User deleted.' });
    }

    // -------------------------------------------------------------
    // 3. DEPOSITS REVIEW
    // -------------------------------------------------------------
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
        return res.status(200).json({ success: true, message: 'Deposit declined.' });
      }
    }

    // -------------------------------------------------------------
    // 4. WITHDRAWALS REVIEW
    // -------------------------------------------------------------
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
        return res.status(200).json({ success: true, message: 'Withdrawal approved.' });
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
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${w.user_id}, 'Refund', 'Withdrawal Declined (Refunded)', ${w.amount}, 'in')
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal declined and refunded.' });
      }
    }

    // -------------------------------------------------------------
    // 5. PRODUCTS MANAGEMENT & SYNC (UPDATED)
    // -------------------------------------------------------------
    if (action === 'products' && req.method === 'GET') {
      const products = await sql`SELECT * FROM products ORDER BY price ASC`;
      return res.status(200).json({ success: true, products });
    }

    if (action === 'update-product' && req.method === 'POST') {
      const { id, price, daily_income, period_days, total_revenue, status } = req.body;

      const pPrice = parseFloat(price);
      const pDaily = parseFloat(daily_income);
      const pDays = parseInt(period_days, 10);
      const pRev = total_revenue ? parseFloat(total_revenue) : (pDaily * pDays);
      const pStatus = status === 'Inactive' ? 'Inactive' : 'Active';

      await sql`
        UPDATE products 
        SET price = ${pPrice},
            daily_income = ${pDaily},
            period_days = ${pDays},
            total_revenue = ${pRev},
            status = ${pStatus}
        WHERE id = ${id}
      `;

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (NULL, 'PRODUCT_SYNC', ${`Updated product ${id}: Price ₦${pPrice}, Daily ₦${pDaily}, Days ${pDays}, Status ${pStatus}`})
      `;

      return res.status(200).json({
        success: true,
        message: `Product ${id} synchronized successfully to live database.`
      });
    }

    // -------------------------------------------------------------
    // 6. SETTINGS & RATES (INCLUDES WITHDRAWAL OPEN/CLOSE)
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // 7. GIFT CODES
    // -------------------------------------------------------------
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

    return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    console.error('Admin API Error:', err);
    return res.status(500).json({ error: err.message || 'Database error occurred.' });
  }
}
