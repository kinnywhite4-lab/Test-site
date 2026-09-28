import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is missing.');
  return neon(dbUrl);
}

async function verifyAdminAuth(req, sql) {
  const adminKeyHeader = req.headers['x-admin-key'];
  const cookies = req.headers.cookie || '';
  
  const [dbKeyRow] = await sql`SELECT value FROM settings WHERE key = 'admin_key'`;
  const validKey = dbKeyRow?.value || process.env.ADMIN_SECRET_KEY || 'novavest_admin_2026';

  if (adminKeyHeader && adminKeyHeader === validKey) {
    return { authorized: true, identifier: 'key_bearer' };
  }

  const match = cookies.match(/novavest_admin_session=([^;]+)/);
  if (match && match[1] === validKey) {
    return { authorized: true, identifier: 'session_cookie' };
  }

  return { authorized: false };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sql = getDb();
  const auth = await verifyAdminAuth(req, sql);
  if (!auth.authorized) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication failed.' });
  }

  const { action } = req.query;
  const adminIdentifier = auth.identifier;

  try {
    // 1. DASHBOARD METRICS
    if (action === 'dashboard') {
      const [uCount] = await sql`SELECT count(*)::int as count FROM users`;
      const [uBal] = await sql`SELECT COALESCE(sum(deposit_balance + withdrawable_balance), 0)::numeric as total FROM users`;
      
      const [depAppr] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'approved'`;
      const [depPend] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'pending'`;

      const [withAppr] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'approved'`;
      const [withPend] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'pending'`;

      let invStats = { count: 0, total: 0 };
      try {
        const [res] = await sql`SELECT count(*)::int as count, COALESCE(sum(price), 0)::numeric as total FROM user_products WHERE lower(status) = 'active'`;
        invStats = res || invStats;
      } catch (e) {
        const [res] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount_paid), 0)::numeric as total FROM user_investments WHERE lower(status) = 'active'`.catch(() => [invStats]);
        invStats = res || invStats;
      }

      const totalInvestment = Number(invStats.total || 0);
      const platformProfit = totalInvestment - Number(withAppr.total || 0);

      return res.status(200).json({
        success: true,
        stats: {
          total_users: Number(uCount.count || 0),
          total_balance: Number(uBal.total || 0),
          total_deposits: Number(depAppr.total || 0),
          deposits_count: Number(depAppr.count || 0),
          total_investment: totalInvestment,
          investment_count: Number(invStats.count || 0),
          total_payouts: Number(withAppr.total || 0),
          payouts_count: Number(withAppr.count || 0),
          platform_profit: platformProfit,
          pending_withdrawals: Number(withPend.total || 0),
          pending_withdrawals_count: Number(withPend.count || 0),
          pending_deposits: Number(depPend.total || 0),
          pending_deposits_count: Number(depPend.count || 0)
        }
      });
    }

    // 2. USERS
    if (action === 'users') {
      const users = await sql`
        SELECT 
          id, 
          COALESCE(phone, phone_number) as phone_number,
          referral_code, 
          COALESCE(deposit_balance, 0)::numeric as deposit_balance, 
          COALESCE(withdrawable_balance, 0)::numeric as withdrawable_balance,
          COALESCE(is_banned, false) as is_banned,
          created_at
        FROM users 
        ORDER BY id DESC
      `;
      return res.status(200).json({ success: true, users });
    }

    if (action === 'user-detail') {
      const { user_id } = req.query;
      const [user] = await sql`
        SELECT 
          id, 
          COALESCE(phone, phone_number) as phone_number,
          referral_code,
          COALESCE(deposit_balance, 0)::numeric as deposit_balance,
          COALESCE(withdrawable_balance, 0)::numeric as withdrawable_balance,
          COALESCE(total_deposited, 0)::numeric as total_deposited,
          COALESCE(total_withdrawn, 0)::numeric as total_withdrawn,
          COALESCE(is_banned, false) as is_banned,
          created_at
        FROM users WHERE id = ${user_id}
      `;

      if (!user) return res.status(404).json({ error: 'User account not found' });

      const deposits = await sql`SELECT * FROM deposits WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`;
      const withdrawals = await sql`SELECT * FROM withdrawals WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`;
      
      let purchases = [];
      try {
        purchases = await sql`SELECT * FROM user_products WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`;
      } catch (e) {
        purchases = await sql`SELECT * FROM user_investments WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`.catch(() => []);
      }

      return res.status(200).json({ success: true, user, deposits, withdrawals, purchases });
    }

    if (action === 'adjust-balance') {
      const { user_id, wallet_type, direction, amount, reason } = req.body || {};
      const numAmt = parseFloat(amount);
      if (isNaN(numAmt) || numAmt <= 0) return res.status(400).json({ error: 'Please enter a valid numeric amount.' });

      const [targetUser] = await sql`SELECT * FROM users WHERE id = ${user_id} FOR UPDATE`;
      if (!targetUser) return res.status(404).json({ error: 'Target user does not exist.' });

      const isDeposit = wallet_type === 'deposit';
      const currentBal = isDeposit ? Number(targetUser.deposit_balance || 0) : Number(targetUser.withdrawable_balance || 0);
      const newBal = direction === 'add' ? currentBal + numAmt : Math.max(0, currentBal - numAmt);

      if (isDeposit) {
        await sql`UPDATE users SET deposit_balance = ${newBal} WHERE id = ${user_id}`;
      } else {
        await sql`UPDATE users SET withdrawable_balance = ${newBal} WHERE id = ${user_id}`;
      }

      await sql`
        INSERT INTO wallet_transactions (user_id, wallet_type, direction, amount, balance_before, balance_after, reference, reason)
        VALUES (${user_id}, ${wallet_type}, ${direction === 'add' ? 'in' : 'out'}, ${numAmt}, ${currentBal}, ${newBal}, ${'ADMIN-ADJ-' + Date.now()}, ${reason || 'Manual Admin Balance Adjustment'})
      `;

      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'adjust_balance', ${String(user_id)}, ${JSON.stringify({ wallet_type, direction, amount: numAmt, previous: currentBal, current: newBal, reason })})
      `;

      return res.status(200).json({ success: true, message: `Balance updated to ₦${newBal.toLocaleString('en-US')}` });
    }

    if (action === 'reset-password') {
      const { user_id } = req.body || {};
      await sql`UPDATE users SET password = '1234' WHERE id = ${user_id}`;
      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'reset_password', ${String(user_id)}, ${JSON.stringify({ new_default: '1234' })})
      `;
      return res.status(200).json({ success: true, message: 'Password reset to 1234 successfully' });
    }

    if (action === 'toggle-ban') {
      const { user_id } = req.body || {};
      const [updated] = await sql`UPDATE users SET is_banned = NOT COALESCE(is_banned, false) WHERE id = ${user_id} RETURNING is_banned`;
      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'toggle_ban', ${String(user_id)}, ${JSON.stringify({ is_banned: updated.is_banned })})
      `;
      return res.status(200).json({ success: true, is_banned: updated.is_banned });
    }

    if (action === 'delete-user') {
      const { user_id } = req.body || {};
      await sql`DELETE FROM users WHERE id = ${user_id}`;
      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'delete_user', ${String(user_id)}, ${JSON.stringify({ timestamp: new Date() })})
      `;
      return res.status(200).json({ success: true, message: 'User permanently deleted' });
    }

    if (action === 'impersonate') {
      const { user_id } = req.body || {};
      const [u] = await sql`SELECT id FROM users WHERE id = ${user_id}`;
      if (!u) return res.status(404).json({ error: 'User does not exist.' });

      res.setHeader('Set-Cookie', `novavest_session=${u.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      
      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'impersonate_user', ${String(user_id)}, ${JSON.stringify({ timestamp: new Date() })})
      `;

      return res.status(200).json({ success: true, token: String(u.id) });
    }

    // 3. INVESTMENTS
    if (action === 'investments') {
      try {
        const investments = await sql`
          SELECT 
            up.id,
            p.name as product_name,
            p.price,
            COALESCE(u.phone, u.phone_number) as phone_number,
            p.price as amount_paid,
            (p.daily_yield * p.duration_days) as total_revenue,
            COALESCE(up.status, 'Active') as status,
            up.created_at,
            (up.created_at + interval '1 day') as next_drop_time
          FROM user_products up
          LEFT JOIN products p ON up.product_id = p.id
          LEFT JOIN users u ON up.user_id = u.id
          ORDER BY up.id DESC
        `;
        return res.status(200).json({ success: true, investments });
      } catch (e) {
        const investments = await sql`
          SELECT ui.*, COALESCE(u.phone, u.phone_number) as phone_number 
          FROM user_investments ui 
          LEFT JOIN users u ON ui.user_id = u.id 
          ORDER BY ui.id DESC
        `.catch(() => []);
        return res.status(200).json({ success: true, investments });
      }
    }

    if (action === 'delete-investment') {
      const { investment_id } = req.body || {};
      try {
        await sql`DELETE FROM user_products WHERE id = ${investment_id}`;
      } catch (e) {
        await sql`DELETE FROM user_investments WHERE id = ${investment_id}`;
      }
      return res.status(200).json({ success: true, message: 'Investment deleted' });
    }

    // 4. DEPOSITS
    if (action === 'deposits') {
      const deposits = await sql`
        SELECT 
          d.id,
          COALESCE(d.reference, concat('DEP-', d.id)) as reference,
          COALESCE(d.channel_name, 'Manual Bank Transfer') as channel_name,
          d.amount,
          COALESCE(d.sender_name, 'N/A') as sender_name,
          COALESCE(u.phone, u.phone_number) as phone_number,
          d.created_at,
          COALESCE(d.proof_url, d.receipt_url) as proof_url,
          INITCAP(d.status) as status
        FROM deposits d
        LEFT JOIN users u ON d.user_id = u.id
        ORDER BY d.id DESC
      `;
      return res.status(200).json({ success: true, deposits });
    }

    if (action === 'review-deposit') {
      const { deposit_id, decision, admin_note } = req.body || {};
      const isApproval = decision === 'approve';

      const [dep] = await sql`SELECT * FROM deposits WHERE id = ${deposit_id} FOR UPDATE`;
      if (!dep) return res.status(404).json({ error: 'Deposit record does not exist' });
      if (String(dep.status).toLowerCase() !== 'pending') {
        return res.status(400).json({ error: `Deposit has already been ${dep.status}.` });
      }

      if (isApproval) {
        const [user] = await sql`SELECT * FROM users WHERE id = ${dep.user_id} FOR UPDATE`;
        if (user) {
          const oldBal = Number(user.deposit_balance || 0);
          const newBal = oldBal + Number(dep.amount);
          const newTotalDep = Number(user.total_deposited || 0) + Number(dep.amount);

          await sql`
            UPDATE users 
            SET deposit_balance = ${newBal}, total_deposited = ${newTotalDep} 
            WHERE id = ${dep.user_id}
          `;

          await sql`
            INSERT INTO wallet_transactions (user_id, wallet_type, direction, amount, balance_before, balance_after, reference, reason)
            VALUES (${dep.user_id}, 'deposit', 'in', ${dep.amount}, ${oldBal}, ${newBal}, ${dep.reference || 'DEP-' + dep.id}, 'Approved Bank Deposit')
          `;
        }
      }

      const targetStatus = isApproval ? 'approved' : 'declined';
      await sql`
        UPDATE deposits 
        SET status = ${targetStatus}, admin_note = ${admin_note || null}, reviewed_by = ${adminIdentifier}, reviewed_at = NOW() 
        WHERE id = ${deposit_id}
      `;

      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, ${'deposit_' + targetStatus}, ${String(deposit_id)}, ${JSON.stringify({ amount: dep.amount, user_id: dep.user_id, note: admin_note })})
      `;

      return res.status(200).json({ success: true, message: `Deposit successfully ${targetStatus}.` });
    }

    // 5. WITHDRAWALS
    if (action === 'withdrawals') {
      const withdrawals = await sql`
        SELECT 
          w.id,
          COALESCE(w.bank_name, 'Linked Bank') as bank_name,
          w.amount,
          COALESCE(w.net_amount, w.amount) as net_amount,
          COALESCE(w.account_name, 'User') as account_name,
          COALESCE(w.account_number, '---') as account_number,
          COALESCE(u.phone, u.phone_number) as phone_number,
          INITCAP(w.status) as status
        FROM withdrawals w
        LEFT JOIN users u ON w.user_id = u.id
        ORDER BY w.id DESC
      `;
      return res.status(200).json({ success: true, withdrawals });
    }

    if (action === 'review-withdrawal') {
      const { withdrawal_id, decision, admin_note } = req.body || {};
      const isApproval = decision === 'approve';

      const [withd] = await sql`SELECT * FROM withdrawals WHERE id = ${withdrawal_id} FOR UPDATE`;
      if (!withd) return res.status(404).json({ error: 'Withdrawal record not found.' });
      if (String(withd.status).toLowerCase() !== 'pending') {
        return res.status(400).json({ error: `Withdrawal has already been ${withd.status}.` });
      }

      if (!isApproval) {
        const [user] = await sql`SELECT * FROM users WHERE id = ${withd.user_id} FOR UPDATE`;
        if (user) {
          const oldBal = Number(user.withdrawable_balance || 0);
          const newBal = oldBal + Number(withd.amount);

          await sql`UPDATE users SET withdrawable_balance = ${newBal} WHERE id = ${withd.user_id}`;

          await sql`
            INSERT INTO wallet_transactions (user_id, wallet_type, direction, amount, balance_before, balance_after, reference, reason)
            VALUES (${withd.user_id}, 'withdrawable', 'in', ${withd.amount}, ${oldBal}, ${newBal}, ${'WITH-REF-' + withd.id}, ${'Declined Withdrawal Refund: ' + (admin_note || 'Admin Review')})
          `;
        }
      } else {
        await sql`
          UPDATE users 
          SET total_withdrawn = COALESCE(total_withdrawn, 0) + ${withd.amount} 
          WHERE id = ${withd.user_id}
        `;
      }

      const targetStatus = isApproval ? 'approved' : 'declined';
      await sql`
        UPDATE withdrawals 
        SET status = ${targetStatus}, admin_note = ${admin_note || null}, reviewed_by = ${adminIdentifier}, reviewed_at = NOW() 
        WHERE id = ${withdrawal_id}
      `;

      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, ${'withdrawal_' + targetStatus}, ${String(withdrawal_id)}, ${JSON.stringify({ amount: withd.amount, user_id: withd.user_id, note: admin_note })})
      `;

      return res.status(200).json({ success: true, message: `Withdrawal marked ${targetStatus}.` });
    }

    // 6. PRODUCTS
    if (action === 'products') {
      const products = await sql`
        SELECT 
          id, 
          name, 
          price, 
          COALESCE(daily_yield, daily_income, 0) as daily_income, 
          COALESCE(duration_days, period_days, 30) as period_days,
          (COALESCE(daily_yield, daily_income, 0) * COALESCE(duration_days, period_days, 30)) as total_revenue
        FROM products 
        ORDER BY price ASC
      `;
      return res.status(200).json({ success: true, products });
    }

    if (action === 'update-product') {
      const { id, price, daily_income, period_days } = req.body || {};
      await sql`
        UPDATE products 
        SET price = ${price}, daily_yield = ${daily_income}, duration_days = ${period_days} 
        WHERE id = ${id}
      `;
      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, target_id, details)
        VALUES (${adminIdentifier}, 'update_product', ${String(id)}, ${JSON.stringify({ price, daily_income, period_days })})
      `;
      return res.status(200).json({ success: true, message: 'Product updated successfully.' });
    }

    // 7. SETTINGS
    if (action === 'settings') {
      if (req.method === 'POST') {
        const updates = req.body || {};
        for (const [k, v] of Object.entries(updates)) {
          await sql`
            INSERT INTO settings (key, value) VALUES (${k}, ${String(v)})
            ON CONFLICT (key) DO UPDATE SET value = ${String(v)}
          `;
        }
        await sql`
          INSERT INTO admin_audit_logs (admin_identifier, action, details)
          VALUES (${adminIdentifier}, 'update_settings', ${JSON.stringify(updates)})
        `;
        return res.status(200).json({ success: true, message: 'Settings saved' });
      }

      const rows = await sql`SELECT key, value FROM settings`;
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return res.status(200).json({ success: true, settings });
    }

    // 8. GIFT CODES
    if (action === 'generate-gift-code') {
      const { amount, max_claims, expires_in_minutes } = req.body || {};
      const cleanCode = 'NV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = expires_in_minutes ? new Date(Date.now() + Number(expires_in_minutes) * 60000) : null;

      await sql`
        INSERT INTO gift_codes (code, amount, max_claims, claimed_count, expires_at)
        VALUES (${cleanCode}, ${amount}, ${max_claims || 100}, 0, ${expiresAt})
      `;

      await sql`
        INSERT INTO admin_audit_logs (admin_identifier, action, details)
        VALUES (${adminIdentifier}, 'generate_gift_code', ${JSON.stringify({ code: cleanCode, amount, max_claims })})
      `;

      return res.status(200).json({ success: true, code: cleanCode });
    }

    return res.status(400).json({ error: 'Unknown or unsupported action parameter.' });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
