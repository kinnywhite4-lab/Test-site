import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, id, type } = req.query;

  try {
    // -------------------------------------------------------------
    // 1. DASHBOARD OVERVIEW METRICS
    // -------------------------------------------------------------
    if (action === 'dashboard' || action === 'stats') {
      const { data: users, error: uErr } = await supabase.from('users').select('id, deposit_balance, withdrawable_balance');
      const { data: deposits, error: dErr } = await supabase.from('deposits').select('amount, status');
      const { data: withdrawals, error: wErr } = await supabase.from('withdrawals').select('amount, status');

      if (uErr) throw uErr;

      const totalUsers = users ? users.length : 0;
      const totalDeposits = (deposits || [])
        .filter(d => d.status === 'approved')
        .reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const totalWithdrawals = (withdrawals || [])
        .filter(w => w.status === 'approved')
        .reduce((sum, w) => sum + Number(w.amount || 0), 0);
      const pendingDeposits = (deposits || []).filter(d => d.status === 'pending').length;
      const pendingWithdrawals = (withdrawals || []).filter(w => w.status === 'pending').length;

      return res.status(200).json({
        success: true,
        stats: {
          totalUsers,
          totalDeposits,
          totalWithdrawals,
          pendingDeposits,
          pendingWithdrawals
        }
      });
    }

    // -------------------------------------------------------------
    // 2. USERS MANAGEMENT
    // -------------------------------------------------------------
    if (action === 'users') {
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, users: users || [] });
    }

    // Update user balance directly
    if (action === 'update_user_balance') {
      const { userId, deposit_balance, withdrawable_balance } = req.body || {};
      if (!userId) return res.status(400).json({ success: false, message: 'Missing userId' });

      const updates = {};
      if (deposit_balance !== undefined) updates.deposit_balance = Number(deposit_balance);
      if (withdrawable_balance !== undefined) updates.withdrawable_balance = Number(withdrawable_balance);

      const { error } = await supabase.from('users').update(updates).eq('id', userId);
      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Balance updated successfully' });
    }

    // Impersonate investor account
    if (action === 'impersonate') {
      const { userId } = req.body || {};
      if (!userId) return res.status(400).json({ success: false, message: 'User ID is required' });

      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !user) return res.status(404).json({ success: false, message: 'User not found' });

      res.setHeader('Set-Cookie', `novavest_session=${user.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
      return res.status(200).json({ success: true, user });
    }

    // -------------------------------------------------------------
    // 3. DEPOSIT REQUESTS & APPROVALS
    // -------------------------------------------------------------
    if (action === 'deposits') {
      const { data: deposits, error } = await supabase
        .from('deposits')
        .select('*, users(phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, deposits: deposits || [] });
    }

    if (action === 'approve_deposit') {
      const { depositId } = req.body || {};
      if (!depositId) return res.status(400).json({ success: false, message: 'Missing depositId' });

      const { data: deposit, error: depErr } = await supabase
        .from('deposits')
        .select('*')
        .eq('id', depositId)
        .single();

      if (depErr || !deposit) return res.status(404).json({ success: false, message: 'Deposit not found' });
      if (deposit.status !== 'pending') return res.status(400).json({ success: false, message: 'Deposit is not pending' });

      // Add to user deposit balance
      const { data: user, error: uErr } = await supabase
        .from('users')
        .select('deposit_balance')
        .eq('id', deposit.user_id)
        .single();

      if (uErr || !user) throw new Error('User not found');

      const newBal = Number(user.deposit_balance || 0) + Number(deposit.amount);

      await supabase.from('users').update({ deposit_balance: newBal }).eq('id', deposit.user_id);
      await supabase.from('deposits').update({ status: 'approved' }).eq('id', depositId);

      return res.status(200).json({ success: true, message: 'Deposit approved' });
    }

    if (action === 'decline_deposit') {
      const { depositId } = req.body || {};
      if (!depositId) return res.status(400).json({ success: false, message: 'Missing depositId' });

      await supabase.from('deposits').update({ status: 'declined' }).eq('id', depositId);
      return res.status(200).json({ success: true, message: 'Deposit declined' });
    }

    // -------------------------------------------------------------
    // 4. WITHDRAWAL REQUESTS & REVIEWS
    // -------------------------------------------------------------
    if (action === 'withdrawals') {
      const { data: withdrawals, error } = await supabase
        .from('withdrawals')
        .select('*, users(phone)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, withdrawals: withdrawals || [] });
    }

    if (action === 'approve_withdrawal') {
      const { withdrawalId } = req.body || {};
      if (!withdrawalId) return res.status(400).json({ success: false, message: 'Missing withdrawalId' });

      const { data: withdrawal, error: wErr } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .single();

      if (wErr || !withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });

      await supabase.from('withdrawals').update({ status: 'approved' }).eq('id', withdrawalId);
      return res.status(200).json({ success: true, message: 'Withdrawal approved' });
    }

    if (action === 'decline_withdrawal') {
      const { withdrawalId } = req.body || {};
      if (!withdrawalId) return res.status(400).json({ success: false, message: 'Missing withdrawalId' });

      const { data: withdrawal, error: wErr } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawalId)
        .single();

      if (wErr || !withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found' });

      // Refund the amount back to user's withdrawable balance
      const { data: user } = await supabase
        .from('users')
        .select('withdrawable_balance')
        .eq('id', withdrawal.user_id)
        .single();

      if (user) {
        const refunded = Number(user.withdrawable_balance || 0) + Number(withdrawal.amount);
        await supabase.from('users').update({ withdrawable_balance: refunded }).eq('id', withdrawal.user_id);
      }

      await supabase.from('withdrawals').update({ status: 'declined' }).eq('id', withdrawalId);
      return res.status(200).json({ success: true, message: 'Withdrawal declined and refunded' });
    }

    // -------------------------------------------------------------
    // 5. PAYMENT CHANNELS MANAGEMENT
    // -------------------------------------------------------------
    if (action === 'channels') {
      const { data: channels, error } = await supabase
        .from('deposit_channels')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ success: true, channels: channels || [] });
    }

    if (action === 'save_channel') {
      const { id: channelId, channel_name, bank_name, account_number, account_name, instructions } = req.body || {};
      
      if (channelId) {
        await supabase.from('deposit_channels').update({
          channel_name,
          bank_name,
          account_number,
          account_name,
          instructions
        }).eq('id', channelId);
      } else {
        await supabase.from('deposit_channels').insert([{
          channel_name,
          bank_name,
          account_number,
          account_name,
          instructions
        }]);
      }
      return res.status(200).json({ success: true, message: 'Channel saved' });
    }

    // Fallback for unhandled action
    return res.status(400).json({ success: false, message: 'Invalid or missing action parameter' });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
}
