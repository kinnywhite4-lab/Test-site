import { sql, getAuthUser } from './_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = req.query.action;

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
    } catch {
      return res.status(500).json({ error: 'Failed to load deposits.' });
    }
  }

  if (req.method === 'POST') {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

    const { amount, channel_id, sender_name, proof_url } = req.body || {};
    const parsedAmount = parseFloat(amount);

    // Strict Server-Side Validation: Name & Receipt are both mandatory
    if (!sender_name || !sender_name.trim()) {
      return res.status(400).json({ error: 'Please enter your name before submitting the deposit.' });
    }
    if (!proof_url || typeof proof_url !== 'string' || !proof_url.startsWith('data:image')) {
      return res.status(400).json({ error: 'Please upload your payment receipt before submitting the deposit.' });
    }
    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum recharge amount is ₦1,000.' });
    }
    if (!channel_id) {
      return res.status(400).json({ error: 'Please select a deposit channel.' });
    }

    try {
      const channelRows = await sql`
        SELECT id, name FROM payment_channels WHERE id = ${channel_id} AND status = 'Active'
      `;
      if (!channelRows.length) {
        return res.status(400).json({ error: 'Selected payment channel is no longer active.' });
      }

      const ref = 'DEP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

      const insertResult = await sql`
        INSERT INTO deposits (user_id, amount, payment_method, status, reference, channel_id, sender_name, proof_url, created_at)
        VALUES (${user.id}, ${parsedAmount}, 'Bank Transfer', 'Pending', ${ref}, ${channel_id}, ${sender_name.trim()}, ${proof_url}, CURRENT_TIMESTAMP)
        RETURNING id, reference, amount, status
      `;

      try {
        await sql`
          INSERT INTO transactions (user_id, type, title, amount, direction, reference, created_at)
          VALUES (${user.id}, 'Deposit', ${'Recharge Pending (' + ref + ')'}, ${parsedAmount}, 'in', ${ref}, CURRENT_TIMESTAMP)
        `;
      } catch (txErr) {
        console.warn('Could not record pending transaction history:', txErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Recharge request submitted successfully. Awaiting administrator review.',
        reference: insertResult[0].reference
      });
    } catch (err) {
      console.error('Deposit processing error:', err);
      return res.status(500).json({ error: 'Failed to process deposit. Please try again.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
