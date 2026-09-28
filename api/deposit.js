import { sql, getAuthUser } from './_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  // -----------------------------------------------------------
  // 1. GET: Fetch Channels or User Deposit History
  // -----------------------------------------------------------
  if (req.method === 'GET') {
    const action = req.query.action;

    // Public / authenticated channels query
    if (action === 'channels') {
      try {
        const channels = await sql`
          SELECT id, name, bank_name, account_name, account_number, instructions 
          FROM payment_channels 
          WHERE status = 'Active' 
          ORDER BY id ASC
        `;
        return res.status(200).json({ success: true, channels });
      } catch (err) {
        console.error('Failed to load payment channels:', err);
        return res.status(500).json({ error: 'Failed to load payment channels.' });
      }
    }

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

    try {
      const deposits = await sql`
        SELECT d.id, d.amount, d.reference, d.status, d.sender_name, d.proof_url, d.created_at,
               c.name AS channel_name, c.bank_name, c.account_name, c.account_number
        FROM deposits d
        LEFT JOIN payment_channels c ON d.channel_id = c.id
        WHERE d.user_id = ${user.id} 
        ORDER BY d.created_at DESC
      `;
      return res.status(200).json({ success: true, deposits });
    } catch (err) {
      console.error('Failed to load user deposits:', err);
      return res.status(500).json({ error: 'Failed to load deposits.' });
    }
  }

  // -----------------------------------------------------------
  // 2. POST: Submit Deposit Request
  // -----------------------------------------------------------
  if (req.method === 'POST') {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

    const { amount, channel_id, sender_name, proof_url } = req.body || {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum recharge amount is ₦1,000.' });
    }
    if (!channel_id) {
      return res.status(400).json({ error: 'Please select a deposit channel.' });
    }
    if (!sender_name || !sender_name.trim()) {
      return res.status(400).json({ error: 'Please enter the depositor/sender full name.' });
    }

    try {
      // Verify selected channel exists
      const channelRows = await sql`
        SELECT id, name FROM payment_channels WHERE id = ${channel_id} AND status = 'Active'
      `;
      if (!channelRows.length) {
        return res.status(400).json({ error: 'Selected payment channel is no longer active.' });
      }

      const ref = 'DEP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

      // Clean, validated image string or empty
      const receiptData = (proof_url && typeof proof_url === 'string' && proof_url.startsWith('data:image'))
        ? proof_url
        : null;

      // 1. Insert Deposit Record
      const insertResult = await sql`
        INSERT INTO deposits (user_id, amount, payment_method, status, reference, channel_id, sender_name, proof_url, created_at)
        VALUES (${user.id}, ${parsedAmount}, 'Bank Transfer', 'Pending', ${ref}, ${channel_id}, ${sender_name.trim()}, ${receiptData}, CURRENT_TIMESTAMP)
        RETURNING id, reference, amount, status
      `;

      const newDeposit = insertResult[0];

      // 2. Create Transaction Record safely
      try {
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
          VALUES (${user.id}, 'Deposit', ${'Recharge Pending (' + ref + ')'}, ${parsedAmount}, 'in', CURRENT_TIMESTAMP)
        `;
      } catch (txErr) {
        console.warn('Could not record pending transaction history, continuing:', txErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Recharge request submitted successfully. Awaiting administrator review.',
        reference: newDeposit.reference,
        deposit_id: newDeposit.id
      });
    } catch (err) {
      console.error('Critical Deposit Insert Error:', err);
      return res.status(500).json({ error: err.message || 'Database error processing your deposit.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
