import { sql } from './_db.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'novavest_admin_super_secret_2026';

function isAuthorized(req) {
  const token = req.headers['x-admin-key'] || req.query.admin_key;
  return token === ADMIN_SECRET;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!isAuthorized(req)) {
    return res.status(403).json({ error: 'Unauthorized admin request.' });
  }

  const { action } = req.query;

  // View Pending Deposits
  if (action === 'deposits' && req.method === 'GET') {
    try {
      const deposits = await sql`
        SELECT d.*, u.phone_number, c.name as channel_name 
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN payment_channels c ON d.channel_id = c.id
        ORDER BY d.created_at DESC LIMIT 100
      `;
      return res.status(200).json({ success: true, deposits });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch deposits.' });
    }
  }

  // Approve or Decline Deposit
  if (action === 'review-deposit' && req.method === 'POST') {
    const { deposit_id, decision, admin_note } = req.body || {};
    try {
      const depRows = await sql`SELECT * FROM deposits WHERE id = ${deposit_id}`;
      if (!depRows.length) return res.status(404).json({ error: 'Deposit record not found.' });
      const dep = depRows[0];

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
        return res.status(200).json({ success: true, message: 'Deposit approved and balance credited.' });
      } else {
        await sql`
          UPDATE deposits 
          SET status = 'Declined', admin_note = ${admin_note || 'Rejected by Admin'} 
          WHERE id = ${deposit_id}
        `;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${dep.user_id}, 'Deposit', ${'Recharge Declined (' + (admin_note || 'Rejected') + ')'}, ${dep.amount}, 'out')
        `;
        return res.status(200).json({ success: true, message: 'Deposit declined.' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Error updating deposit.' });
    }
  }

  // View Pending Withdrawals
  if (action === 'withdrawals' && req.method === 'GET') {
    try {
      const withdrawals = await sql`
        SELECT w.*, u.phone_number 
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        ORDER BY w.created_at DESC LIMIT 100
      `;
      return res.status(200).json({ success: true, withdrawals });
    } catch {
      return res.status(500).json({ error: 'Failed to fetch withdrawals.' });
    }
  }

  // Approve or Decline Withdrawal
  if (action === 'review-withdrawal' && req.method === 'POST') {
    const { withdrawal_id, decision, admin_note } = req.body || {};
    try {
      const withRows = await sql`SELECT * FROM withdrawals WHERE id = ${withdrawal_id}`;
      if (!withRows.length) return res.status(404).json({ error: 'Withdrawal not found.' });
      const w = withRows[0];

      if (w.status !== 'Pending') {
        return res.status(400).json({ error: 'Withdrawal has already been reviewed.' });
      }

      if (decision === 'approve') {
        await sql`
          UPDATE withdrawals 
          SET status = 'Approved', admin_note = ${admin_note || ''}, approved_at = CURRENT_TIMESTAMP
          WHERE id = ${withdrawal_id}
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal marked approved.' });
      } else {
        // Return reserved funds to user's withdrawable balance
        await sql`
          UPDATE users 
          SET withdrawable_balance = withdrawable_balance + ${w.amount},
              total_withdrawn = total_withdrawn - ${w.amount}
          WHERE id = ${w.user_id}
        `;
        await sql`
          UPDATE withdrawals 
          SET status = 'Declined', admin_note = ${admin_note || 'Rejected by Admin'}
          WHERE id = ${withdrawal_id}
        `;
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction)
          VALUES (${w.user_id}, 'Refund', 'Withdrawal Refund (Declined)', ${w.amount}, 'in')
        `;
        return res.status(200).json({ success: true, message: 'Withdrawal declined and funds refunded.' });
      }
    } catch {
      return res.status(500).json({ error: 'Error reviewing withdrawal.' });
    }
  }

  return res.status(404).json({ error: 'Admin action not found.' });
}
