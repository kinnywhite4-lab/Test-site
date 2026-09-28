import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is missing.');
  return neon(dbUrl);
}

// Resilient Admin Auth Verification
async function verifyAdminAuth(req, sql) {
  const adminKeyHeader = req.headers['x-admin-key'];
  const cookies = req.headers.cookie || '';
  
  let validKey = process.env.ADMIN_SECRET_KEY || 'novavest_admin_2026';

  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'admin_key' LIMIT 1`;
    if (rows && rows.length > 0 && rows[0].value) {
      validKey = rows[0].value;
    }
  } catch (err) {}

  if (adminKeyHeader && adminKeyHeader === validKey) {
    return { authorized: true, identifier: 'key_bearer' };
  }

  const match = cookies.match(/novavest_admin_session=([^;]+)/);
  if (match && match[1] === validKey) {
    return { authorized: true, identifier: 'session_cookie' };
  }

  return { authorized: false };
}

// Auto-provision settings table if missing
async function ensureTables(sql) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO settings (key, value) VALUES
        ('withdrawals_enabled', 'true'),
        ('withdrawal_fee_percent', '10'),
        ('min_withdrawal', '1000'),
        ('welcome_bonus', '0'),
        ('level1_rate', '20'),
        ('level2_rate', '2'),
        ('telegram_group', 'https://t.me/novavest_group'),
        ('telegram_channel', 'https://t.me/novavest_channel'),
        ('admin_key', 'novavest_admin_2026')
      ON CONFLICT (key) DO NOTHING;
    `;
  } catch (e) {}
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

  await ensureTables(sql);

  const { action } = req.query;
  const adminIdentifier = auth.identifier;

  try {
    // -------------------------------------------------------------
    // 1. DASHBOARD METRICS
    // -------------------------------------------------------------
    if (action === 'dashboard') {
      const [uCount] = await sql`SELECT count(*)::int as count FROM users`.catch(() => [{ count: 0 }]);
      const [uBal] = await sql`SELECT COALESCE(sum(deposit_balance + withdrawable_balance), 0)::numeric as total FROM users`.catch(() => [{ total: 0 }]);
      
      const [depAppr] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'approved'`.catch(() => [{ count: 0, total: 0 }]);
      const [depPend] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'pending'`.catch(() => [{ count: 0, total: 0 }]);

      const [withAppr] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'approved'`.catch(() => [{ count: 0, total: 0 }]);
      const [withPend] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'pending'`.catch(() => [{ count: 0, total: 0 }]);

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

    // -------------------------------------------------------------
    // 2. USERS
    // -------------------------------------------------------------
    if (action === 'users') {
      const rawUsers = await sql`SELECT * FROM users ORDER BY id DESC`;
      const users = rawUsers.map(u => ({
        id: u.id,
        phone_number: u.phone_number || u.phone || 'Investor',
        referral_code: u.referral_code || '---',
        deposit_balance: Number(u.deposit_balance || 0),
        withdrawable_balance: Number(u.withdrawable_balance || 0),
        is_banned: Boolean(u.is_banned),
        created_at: u.created_at
      }));
      return res.status(200).json({ success: true, users });
    }

    if (action === 'user-detail') {
      const { user_id } = req.query;
      const rows = await sql`SELECT * FROM users WHERE id = ${user_id}`;
      const rawUser = rows[0];

      if (!rawUser) return res.status(404).json({ error: 'User account not found' });

      const user = {
        id: rawUser.id,
        phone_number: rawUser.phone_number || rawUser.phone || 'Investor',
        referral_code: rawUser.referral_code || '---',
        deposit_balance: Number(rawUser.deposit_balance || 0),
        withdrawable_balance: Number(rawUser.withdrawable_balance || 0),
        total_deposited: Number(rawUser.total_deposited || 0),
        total_withdrawn: Number(rawUser.total_withdrawn || 0),
        is_banned: Boolean(rawUser.is_banned),
        created_at: rawUser.created_at
      };

      const deposits = await sql`SELECT * FROM deposits WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`.catch(() => []);
      const withdrawals = await sql`SELECT * FROM withdrawals WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 20`.catch(() => []);
      
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

      try {
        await sql`
          INSERT INTO wallet_transactions (user_id, wallet_type, direction, amount, balance_before, balance_after, reference, reason)
          VALUES (${user_id}, ${wallet_type}, ${direction === 'add' ? 'in' : 'out'}, ${numAmt}, ${currentBal}, ${newBal}, ${'ADMIN-ADJ-' + Date.now()}, ${reason || 'Manual Admin Balance Adjustment'})
        `;
      } catch (e) {}

      return res.status(200).json({ success: true, message: `Balance updated to ₦${newBal.toLocaleString('en-US')}` });
    }

    if (action === 'reset-password') {
      const { user_id } = req.body || {};
      await sql`UPDATE users SET password = '1234' WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'Password reset to 1234 successfully' });
    }

    if (action === 'toggle-ban') {
      const { user_id } = req.body || {};
      const [updated] = await sql`UPDATE users SET is_banned = NOT COALESCE(is_banned, false) WHERE id = ${user_id} RETURNING is_banned`;
      return res.status(200).json({ success: true, is_banned: updated.is_banned });
    }

    if (action === 'delete-user') {
      const { user_id } = req.body || {};
      await sql`DELETE FROM users WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'User permanently deleted' });
    }

    if (action === 'impersonate') {
      const { user_id } = req.body || {};
      const [u] = await sql`SELECT id FROM users WHERE id = ${user_id}`;
      if (!u) return res.status(404).json({ error: 'User does not exist.' });

      res.setHeader('Set-Cookie', `novavest_session=${u.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      return res.status(200).json({ success: true, token: String(u.id) });
    }

    // -------------------------------------------------------------
    // 3. INVESTMENTS
    // -------------------------------------------------------------
    if (action === 'investments') {
      try {
        const [rawInvestments, allUsers] = await Promise.all([
          sql`
            SELECT 
              up.id,
              p.name as product_name,
              p.price,
              up.user_id,
              p.price as amount_paid,
              (p.daily_yield * p.duration_days) as total_revenue,
              COALESCE(up.status, 'Active') as status,
              up.created_at,
              (up.created_at + interval '1 day') as next_drop_time
            FROM user_products up
            LEFT JOIN products p ON up.product_id = p.id
            ORDER BY up.id DESC
          `,
          sql`SELECT * FROM users`
        ]);

        const userMap = new Map();
        allUsers.forEach(u => userMap.set(u.id, u.phone_number || u.phone || `User #${u.id}`));

        const investments = rawInvestments.map(inv => ({
          ...inv,
          phone_number: userMap.get(inv.user_id) || 'Investor'
        }));

        return res.status(200).json({ success: true, investments });
      } catch (e) {
        const fallback = await sql`SELECT * FROM user_investments ORDER BY id DESC`.catch(() => []);
        return res.status(200).json({ success: true, investments: fallback });
      }
    }

    if (action === 'delete-investment') {
      const { investment_id } = req.body || {};
      try {
        await sql`DELETE FROM user_products WHERE id = ${investment_id}`;
      } catch (e) {
        await sql`DELETE FROM user_investments WHERE id = ${investment_id}`.catch(() => {});
      }
      return res.status(200).json({ success: true, message: 'Investment deleted' });
    }

    // -------------------------------------------------------------
    // 4. DEPOSITS (NO SCHEMA CRASHES)
    // -------------------------------------------------------------
    if (action === 'deposits') {
      const [rawDeposits, allUsers] = await Promise.all([
        sql`SELECT * FROM deposits ORDER BY id DESC`,
        sql`SELECT * FROM users`
      ]);

      const userMap = new Map();
      allUsers.forEach(u => userMap.set(u.id, u.phone_number || u.phone || `User #${u.id}`));

      const deposits = rawDeposits.map(d => ({
        id: d.id,
        reference: d.reference || `DEP-${d.id}`,
        channel_name: d.channel_name || 'Manual Bank Transfer',
        amount: d.amount,
        sender_name: d.sender_name || 'N/A',
        phone_number: userMap.get(d.user_id) || 'Investor',
        created_at: d.created_at,
        proof_url: d.proof_url || d.receipt_url || null,
        status: (d.status || 'Pending').charAt(0).toUpperCase() + (d.status || 'Pending').slice(1).toLowerCase()
      }));
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
        }
      }

      const targetStatus = isApproval ? 'approved' : 'declined';
      await sql`
        UPDATE deposits 
        SET status = ${targetStatus}, admin_note = ${admin_note || null}, reviewed_by = ${adminIdentifier}, reviewed_at = NOW() 
        WHERE id = ${deposit_id}
      `;

      return res.status(200).json({ success: true, message: `Deposit successfully ${targetStatus}.` });
    }

    // -------------------------------------------------------------
    // 5. WITHDRAWALS (NO SCHEMA CRASHES)
    // -------------------------------------------------------------
    if (action === 'withdrawals') {
      const [rawWithdrawals, allUsers] = await Promise.all([
        sql`SELECT * FROM withdrawals ORDER BY id DESC`,
        sql`SELECT * FROM users`
      ]);

      const userMap = new Map();
      allUsers.forEach(u => userMap.set(u.id, u.phone_number || u.phone || `User #${u.id}`));

      const withdrawals = rawWithdrawals.map(w => ({
        id: w.id,
        bank_name: w.bank_name || 'Linked Bank',
        amount: w.amount,
        net_amount: w.net_amount || w.amount,
        account_name: w.account_name || 'User',
        account_number: w.account_number || '---',
        phone_number: userMap.get(w.user_id) || 'Investor',
        status: (w.status || 'Pending').charAt(0).toUpperCase() + (w.status || 'Pending').slice(1).toLowerCase()
      }));
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

      return res.status(200).json({ success: true, message: `Withdrawal marked ${targetStatus}.` });
    }

    // -------------------------------------------------------------
    // 6. PRODUCTS
    // -------------------------------------------------------------
    if (action === 'products') {
      const rawProducts = await sql`SELECT * FROM products ORDER BY price ASC`;
      const products = rawProducts.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        daily_income: p.daily_yield || p.daily_income || 0,
        period_days: p.duration_days || p.period_days || 30,
        total_revenue: (p.daily_yield || p.daily_income || 0) * (p.duration_days || p.period_days || 30)
      }));
      return res.status(200).json({ success: true, products });
    }

    if (action === 'update-product') {
      const { id, price, daily_income, period_days } = req.body || {};
      await sql`
        UPDATE products 
        SET price = ${price}, daily_yield = ${daily_income}, duration_days = ${period_days} 
        WHERE id = ${id}
      `;
      return res.status(200).json({ success: true, message: 'Product updated successfully.' });
    }

    // -------------------------------------------------------------
    // 7. SETTINGS
    // -------------------------------------------------------------
    if (action === 'settings') {
      if (req.method === 'POST') {
        const updates = req.body || {};
        for (const [k, v] of Object.entries(updates)) {
          await sql`
            INSERT INTO settings (key, value) VALUES (${k}, ${String(v)})
            ON CONFLICT (key) DO UPDATE SET value = ${String(v)}
          `;
        }
        return res.status(200).json({ success: true, message: 'Settings saved' });
      }

      const rows = await sql`SELECT key, value FROM settings`.catch(() => []);
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return res.status(200).json({ success: true, settings });
    }

    // -------------------------------------------------------------
    // 8. GIFT CODES
    // -------------------------------------------------------------
    if (action === 'generate-gift-code') {
      const { amount, max_claims, expires_in_minutes } = req.body || {};
      const cleanCode = 'NV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = expires_in_minutes ? new Date(Date.now() + Number(expires_in_minutes) * 60000) : null;

      await sql`
        CREATE TABLE IF NOT EXISTS gift_codes (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          amount NUMERIC(15,2) NOT NULL,
          max_claims INT DEFAULT 1,
          claimed_count INT DEFAULT 0,
          expires_at TIMESTAMP WITH TIME ZONE
        );
      `.catch(() => {});

      await sql`
        INSERT INTO gift_codes (code, amount, max_claims, claimed_count, expires_at)
        VALUES (${cleanCode}, ${amount}, ${max_claims || 100}, 0, ${expiresAt})
      `;

      return res.status(200).json({ success: true, code: cleanCode });
    }

    return res.status(400).json({ error: 'Unknown or unsupported action parameter.' });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
