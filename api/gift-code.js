import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  if (req.method === 'GET') {
    try {
      const claims = await sql`
        SELECT code, amount, created_at 
        FROM gift_code_claims 
        WHERE user_id = ${user.id} 
        ORDER BY created_at DESC
      `;
      const totalClaimed = claims.reduce((acc, c) => acc + parseFloat(c.amount), 0);
      return res.status(200).json({ success: true, total_claimed: totalClaimed, claims });
    } catch {
      return res.status(500).json({ error: 'Failed to load gift claims.' });
    }
  }

  if (req.method === 'POST') {
    const { code } = req.body || {};
    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Please enter a valid gift code.' });
    }

    const cleanCode = code.trim().toUpperCase();

    try {
      // 1. Check if already claimed by this user
      const existingClaim = await sql`
        SELECT id FROM gift_code_claims WHERE user_id = ${user.id} AND code = ${cleanCode}
      `;
      if (existingClaim.length > 0) {
        return res.status(400).json({ error: 'You have already redeemed this gift code.' });
      }

      // 2. Fetch code validity
      const codeRows = await sql`
        SELECT * FROM gift_codes WHERE code = ${cleanCode}
      `;
      if (!codeRows.length) {
        return res.status(404).json({ error: 'Invalid gift code. Please verify and try again.' });
      }

      const gift = codeRows[0];
      if (gift.expires_at && new Date() > new Date(gift.expires_at)) {
        return res.status(400).json({ error: 'This gift code has expired.' });
      }
      if (gift.claimed_count >= gift.max_claims) {
        return res.status(400).json({ error: 'This gift code has reached its maximum claim limit.' });
      }

      const reward = parseFloat(gift.amount);

      // 3. Increment claims and award withdrawable balance
      await sql`UPDATE gift_codes SET claimed_count = claimed_count + 1 WHERE code = ${cleanCode}`;
      await sql`
        UPDATE users 
        SET withdrawable_balance = withdrawable_balance + ${reward},
            total_income = total_income + ${reward}
        WHERE id = ${user.id}
      `;

      await sql`
        INSERT INTO gift_code_claims (user_id, code, amount)
        VALUES (${user.id}, ${cleanCode}, ${reward})
      `;

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction, created_at)
        VALUES (${user.id}, 'Gift Code', ${'Redeemed code ' + cleanCode}, ${reward}, 'in', CURRENT_TIMESTAMP)
      `;

      return res.status(200).json({
        success: true,
        message: `Successfully redeemed ₦${reward.toLocaleString()}! Added to your Withdrawable Balance.`
      });
    } catch (err) {
      console.error('Gift code redeem error:', err);
      return res.status(500).json({ error: 'Failed to redeem gift code.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
