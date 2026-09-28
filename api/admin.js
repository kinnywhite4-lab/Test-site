import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is missing.');
  return neon(dbUrl);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    const sql = getDb();

    // -------------------------------------------------------------
    // 1. DASHBOARD METRICS
    // -------------------------------------------------------------
    if (action === 'dashboard') {
      const [uCount] = await sql`SELECT count(*)::int as count FROM users`;
      const [uBal] = await sql`SELECT COALESCE(sum(deposit_balance + withdrawable_balance), 0)::numeric as total FROM users`;
      
      const [depSuccess] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'approved'`;
      const [depPending] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM deposits WHERE lower(status) = 'pending'`;

      const [withSuccess] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'approved'`;
      const [withPending] = await sql`SELECT count(*)::int as count, COALESCE(sum(amount), 0)::numeric as total FROM withdrawals WHERE lower(status) = 'pending'`;

      const [invStats] = await sql`
        SELECT count(*)::int as count, COALESCE(sum(price), 0)::numeric as total 
        FROM user_products 
        WHERE lower(status) = 'active'
      `.catch(async () => {
        return (await sql`SELECT count(*)::int as count, COALESCE(sum(amount_paid), 0)::numeric as total FROM user_investments WHERE lower(status) = 'active'`)[0] || { count: 0, total: 0 };
      });

      const totalInvestment = Number(invStats?.total || 0);
      const totalPayouts = Number(depSuccess?.total || 0);
      const platformProfit = totalInvestment - Number(withSuccess?.total || 0);

      return res.status(200).json({
        success: true,
        stats: {
          total_users: Number(uCount?.count || 0),
          total_balance: Number(uBal?.total || 0),
          total_deposits: Number(depSuccess?.total || 0),
          deposits_count: Number(depSuccess?.count || 0),
          total_investment: totalInvestment,
          investment_count: Number(invStats?.count || 0),
          total_payouts: Number(withSuccess?.total || 0),
          payouts_count: Number(withSuccess?.count || 0),
          platform_profit: platformProfit,
          pending_withdrawals: Number(withPending?.total || 0),
          pending_withdrawals_count: Number(withPending?.count || 0),
          pending_deposits: Number(depPending?.total || 0),
          pending_deposits_count: Number(depPending?.count || 0)
        }
      });
    }

    // -------------------------------------------------------------
    // 2. USERS MANAGEMENT
    // -------------------------------------------------------------
    if (action === 'users') {
      const users = await sql`
        SELECT 
          id, 
          COALESCE(phone, phone_number) as phone_number,
          referral_code, 
          COALESCE(deposit_balance, 0)::numeric as deposit_balance, 
          COALESCE(withdrawable_balance, 0)::numeric as withdrawable_balance,
          COALESCE(is_banned, false) as is_banned
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
          COALESCE(is_banned, false) as is_banned
        FROM users WHERE id = ${user_id}
      `;

      if (!user) return res.status(404).json({ error: 'User not found' });

      const deposits = await sql`SELECT * FROM deposits WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 10`;
      const withdrawals = await sql`SELECT * FROM withdrawals WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 10`;
      
      let purchases = [];
      try {
        purchases = await sql`SELECT * FROM user_products WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 10`;
      } catch (e) {
        purchases = await sql`SELECT * FROM user_investments WHERE user_id = ${user_id} ORDER BY id DESC LIMIT 10`.catch(() => []);
      }

      return res.status(200).json({ success: true, user, deposits, withdrawals, purchases });
    }

    if (action === 'adjust-balance') {
      const { user_id, wallet_type, direction, amount } = req.body || {};
      const numAmt = parseFloat(amount);
      if (isNaN(numAmt) || numAmt <= 0) return res.status(400).json({ error: 'Invalid amount.' });

      const col = wallet_type === 'deposit' ? 'deposit_balance' : 'withdrawable_balance';
      if (direction === 'add') {
        if (col === 'deposit_balance') {
          await sql`UPDATE users SET deposit_balance = deposit_balance + ${numAmt} WHERE id = ${user_id}`;
        } else {
          await sql`UPDATE users SET withdrawable_balance = withdrawable_balance + ${numAmt} WHERE id = ${user_id}`;
        }
      } else {
        if (col === 'deposit_balance') {
          await sql`UPDATE users SET deposit_balance = GREATEST(0, deposit_balance - ${numAmt}) WHERE id = ${user_id}`;
        } else {
          await sql`UPDATE users SET withdrawable_balance = GREATEST(0, withdrawable_balance - ${numAmt}) WHERE id = ${user_id}`;
        }
      }
      return res.status(200).json({ success: true, message: 'Balance adjusted successfully' });
    }

    if (action === 'reset-password') {
      const { user_id } = req.body || {};
      await sql`UPDATE users SET password = '1234' WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'Password reset to 1234' });
    }

    if (action === 'toggle-ban') {
      const { user_id } = req.body || {};
      await sql`UPDATE users SET is_banned = NOT COALESCE(is_banned, false) WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'Ban status toggled' });
    }

    if (action === 'delete-user') {
      const { user_id } = req.body || {};
      await sql`DELETE FROM users WHERE id = ${user_id}`;
      return res.status(200).json({ success: true, message: 'User deleted' });
    }

    if (action === 'impersonate') {
      const { user_id } = req.body || {};
      res.setHeader('Set-Cookie', `novavest_session=${user_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      return res.status(200).json({ success: true, token: String(user_id) });
    }

    // -------------------------------------------------------------
    // 3. INVESTMENTS LIST & DELETION
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // 4. DEPOSITS
    // -------------------------------------------------------------
    if (action === 'deposits') {
      const deposits = await sql`
        SELECT 
          d.id,
          COALESCE(d.reference, concat('DEP-', d.id)) as reference,
          COALESCE(d.channel_name, 'Manual Transfer') as channel_name,
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
      const { deposit_id, decision } = req.body || {};
      const status = decision === 'approve' ? 'approved' : 'declined';
      
      const [dep] = await sql`SELECT * FROM deposits WHERE id = ${deposit_id}`;
      if (!dep) return res.status(404).json({ error: 'Deposit record not found' });

      if (decision === 'approve' && String(dep.status).toLowerCase() !== 'approved') {
        await sql`UPDATE users SET deposit_balance = deposit_balance + ${dep.amount} WHERE id = ${dep.user_id}`;
      }

      await sql`UPDATE deposits SET status = ${status} WHERE id = ${deposit_id}`;
      return res.status(200).json({ success: true, message: `Deposit ${status}` });
    }

    // -------------------------------------------------------------
    // 5. WITHDRAWALS
    // -------------------------------------------------------------
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
      const { withdrawal_id, decision } = req.body || {};
      const status = decision === 'approve' ? 'approved' : 'declined';

      const [withd] = await sql`SELECT * FROM withdrawals WHERE id = ${withdrawal_id}`;
      if (!withd) return res.status(404).json({ error: 'Withdrawal not found' });

      if (decision === 'decline' && String(withd.status).toLowerCase() !== 'declined') {
        await sql`UPDATE users SET withdrawable_balance = withdrawable_balance + ${withd.amount} WHERE id = ${withd.user_id}`;
      }

      await sql`UPDATE withdrawals SET status = ${status} WHERE id = ${withdrawal_id}`;
      return res.status(200).json({ success: true, message: `Withdrawal ${status}` });
    }

    // -------------------------------------------------------------
    // 6. PRODUCTS MANAGEMENT
    // -------------------------------------------------------------
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
        SET 
          price = ${price}, 
          daily_yield = ${daily_income}, 
          duration_days = ${period_days} 
        WHERE id = ${id}
      `;
      return res.status(200).json({ success: true, message: 'Product updated' });
    }

    // -------------------------------------------------------------
    // 7. SETTINGS & SYSTEM CONTROLS
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

      const rows = await sql`SELECT key, value FROM settings`;
      const settings = {};
      rows.forEach(r => { settings[r.key] = r.value; });
      return res.status(200).json({ success: true, settings });
    }

    // -------------------------------------------------------------
    // 8. GIFT CODES
    // -------------------------------------------------------------
    if (action === 'generate-gift-code') {
      const { amount, max_claims } = req.body || {};
      const randomCode = 'NV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      await sql`
        INSERT INTO gift_codes (code, amount, max_claims, claimed_count) 
        VALUES (${randomCode}, ${amount}, ${max_claims || 50}, 0)
      `;
      return res.status(200).json({ success: true, code: randomCode });
    }

    return res.status(400).json({ error: 'Unknown action parameter' });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
