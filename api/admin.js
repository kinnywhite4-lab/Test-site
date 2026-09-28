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
    // 1. GET ALL USERS (List View)
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

    // -------------------------------------------------------------
    // 2. GET SINGLE USER FULL PROFILE (Action View)
    // -------------------------------------------------------------
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

      // Calculate separate historical totals
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

    // -------------------------------------------------------------
    // 3. BALANCE ADJUSTMENT (Add / Subtract from Deposit or Withdrawal)
    // -------------------------------------------------------------
    if (action === 'adjust-balance' && req.method === 'POST') {
      const { user_id, wallet_type, direction, amount } = req.body;
      const numAmount = parseFloat(amount);

      if (!user_id || isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'Valid positive amount is required.' });
      }
      if (!['deposit', 'withdrawal'].includes(wallet_type)) {
        return res.status(400).json({ error: 'Invalid wallet type specified.' });
      }
      if (!['add', 'subtract'].includes(direction)) {
        return res.status(400).json({ error: 'Invalid operation direction.' });
      }

      const userRows = await sql`SELECT balance, withdrawable_balance FROM users WHERE id = ${user_id}`;
      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });

      const currentBalance = parseFloat(
        wallet_type === 'deposit' ? userRows[0].balance : userRows[0].withdrawable_balance
      );

      if (direction === 'subtract' && currentBalance < numAmount) {
        return res.status(400).json({
          error: `Insufficient balance for this deduction. Current ${wallet_type} balance is ₦${currentBalance.toLocaleString()}.`
        });
      }

      const signedDelta = direction === 'add' ? numAmount : -numAmount;

      if (wallet_type === 'deposit') {
        await sql`UPDATE users SET balance = balance + ${signedDelta} WHERE id = ${user_id}`;
      } else {
        await sql`UPDATE users SET withdrawable_balance = withdrawable_balance + ${signedDelta} WHERE id = ${user_id}`;
      }

      const txTitle = `Admin Adjustment (${direction.toUpperCase()} ${wallet_type.toUpperCase()} WALLET)`;
      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction)
        VALUES (${user_id}, 'Admin Adjustment', ${txTitle}, ${numAmount}, ${direction === 'add' ? 'in' : 'out'})
      `;

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, 'BALANCE_ADJUST', ${`${direction.toUpperCase()} ₦${numAmount.toLocaleString()} to${wallet_type} wallet`})
      `;

      return res.status(200).json({
        success: true,
        message: `${wallet_type === 'deposit' ? 'Deposit' : 'Withdrawal'} balance successfully ${direction === 'add' ? 'increased' : 'decreased'} by ₦${numAmount.toLocaleString()}.`
      });
    }

    // -------------------------------------------------------------
    // 4. PASSWORD RESET (Defaults to 1234)
    // -------------------------------------------------------------
    if (action === 'reset-password' && req.method === 'POST') {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'User ID is required.' });

      const newHash = hashPassword('1234');
      const result = await sql`
        UPDATE users SET password_hash = ${newHash} WHERE id = ${user_id} RETURNING id, phone_number
      `;

      if (!result.length) return res.status(404).json({ error: 'User not found.' });

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, 'PASSWORD_RESET', 'Password reset to default (1234)')
      `;

      return res.status(200).json({
        success: true,
        message: 'Password reset successfully. Default password: 1234'
      });
    }

    // -------------------------------------------------------------
    // 5. BAN / UNBAN TOGGLE
    // -------------------------------------------------------------
    if (action === 'toggle-ban' && req.method === 'POST') {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'User ID is required.' });

      const result = await sql`
        UPDATE users SET is_banned = NOT is_banned WHERE id = ${user_id} RETURNING is_banned
      `;
      if (!result.length) return res.status(404).json({ error: 'User not found.' });

      const isBanned = result[0].is_banned;
      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, ${isBanned ? 'USER_BAN' : 'USER_UNBAN'}, ${isBanned ? 'Account banned by admin' : 'Account unbanned by admin'})
      `;

      return res.status(200).json({
        success: true,
        is_banned: isBanned,
        message: isBanned ? 'User has been banned.' : 'User account has been restored.'
      });
    }

    // -------------------------------------------------------------
    // 6. TOGGLE PROMOTER / PACKAGE WITHDRAWAL RULE
    // -------------------------------------------------------------
    if (action === 'toggle-package-rule' && req.method === 'POST') {
      const { user_id } = req.body;
      const result = await sql`
        UPDATE users SET withdraw_without_package = NOT withdraw_without_package WHERE id = ${user_id} RETURNING withdraw_without_package
      `;
      return res.status(200).json({ success: true, enabled: result[0]?.withdraw_without_package });
    }

    if (action === 'toggle-promoter' && req.method === 'POST') {
      const { user_id } = req.body;
      const result = await sql`
        UPDATE users SET is_promoter = NOT is_promoter WHERE id = ${user_id} RETURNING is_promoter
      `;
      return res.status(200).json({ success: true, is_promoter: result[0]?.is_promoter });
    }

    // -------------------------------------------------------------
    // 7. LOGIN AS USER / IMPERSONATION
    // -------------------------------------------------------------
    if (action === 'impersonate' && req.method === 'POST') {
      const { user_id } = req.body;
      const userRows = await sql`SELECT id, phone_number FROM users WHERE id = ${user_id}`;
      if (!userRows.length) return res.status(404).json({ error: 'User not found.' });

      const token = createSessionToken(userRows[0].id);

      await sql`
        INSERT INTO admin_audit_logs (user_id, action_type, details)
        VALUES (${user_id}, 'ADMIN_IMPERSONATION', 'Admin logged into account')
      `;

      // Set session cookie for the client
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax; Secure`);

      return res.status(200).json({
        success: true,
        token,
        message: `Impersonation session created for ${userRows[0].phone_number}.`
      });
    }

    // -------------------------------------------------------------
    // 8. DELETE USER (Cascading Deletion)
    // -------------------------------------------------------------
    if (action === 'delete-user' && req.method === 'POST') {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'User ID is required.' });

      // Clean all references sequentially if DB CASCADE was not pre-applied
      await sql`DELETE FROM admin_audit_logs WHERE user_id = ${user_id}`;
      await sql`DELETE FROM transactions WHERE user_id = ${user_id}`;
      await sql`DELETE FROM purchases WHERE user_id = ${user_id}`;
      await sql`DELETE FROM withdrawals WHERE user_id = ${user_id}`;
      await sql`DELETE FROM deposits WHERE user_id = ${user_id}`;
      await sql`DELETE FROM bank_cards WHERE user_id = ${user_id}`;
      const deleted = await sql`DELETE FROM users WHERE id = ${user_id} RETURNING id`;

      if (!deleted.length) return res.status(404).json({ error: 'User not found.' });

      return res.status(200).json({ success: true, message: 'User has been deleted.' });
    }

    // Retain Dashboard Metrics
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
          total_investment: purchases[0]?.sum || 0,
          total_payouts: withdrawals[0]?.sum || 0,
          platform_profit: withdrawals[0]?.fees || 0,
          pending_withdrawals: pendingWith[0]?.sum || 0,
          pending_deposits: pendingDep[0]?.sum || 0
        }
      });
    }

    return res.status(404).json({ error: 'Admin action not found' });
  } catch (err) {
    console.error('Admin API Error:', err);
    return res.status(500).json({ error: err.message || 'Database error occurred.' });
  }
}
