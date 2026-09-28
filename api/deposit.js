import { sql, getAuthUser } from './_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    const action = req.query.action;

    // Fetch active channels for deposit page
    if (action === 'channels') {
      try {
        const channels = await sql`SELECT id, name, bank_name, account_name, account_number, instructions FROM payment_channels WHERE status = 'Active' ORDER BY id ASC`;
        return res.status(200).json({ success: true, channels });
      } catch (err) {
        return res.status(500).json({ error: 'Failed to load channels.' });
      }
    }

    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

    try {
      const deposits = await sql`
        SELECT d.*, c.name as channel_name 
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

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum recharge amount is ₦1,000.' });
    }
    if (!channel_id) {
      return res.status(400).json({ error: 'Please select a recharge payment channel.' });
    }

    try {
      const ref = 'DEP' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();

      await sql`
        INSERT INTO deposits (user_id, amount, payment_method, status, reference, channel_id, sender_name, proof_url)
        VALUES (${user.id}, ${parsedAmount}, 'Bank Transfer', 'Pending', ${ref}, ${channel_id}, ${sender_name || ''}, ${proof_url || ''})
      `;

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction)
        VALUES (${user.id}, 'Deposit', ${'Recharge Pending (' + ref + ')'}, ${parsedAmount}, 'in')
      `;

      return res.status(200).json({
        success: true,
        message: 'Recharge request submitted. Awaiting administrator approval.',
        reference: ref
      });
    } catch (err) {
      console.error('Deposit Error:', err);
      return res.status(500).json({ error: 'Failed to submit deposit. Please try again.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
