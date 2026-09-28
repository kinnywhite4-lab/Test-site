const { pool, getAuthenticatedUser } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (req.method === 'POST') {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Gift code is required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const codeRes = await client.query('SELECT * FROM gift_codes WHERE code = $1 FOR UPDATE', [cleanCode]);
      if (codeRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid gift code.' });
      }

      const gift = codeRes.rows[0];
      if (gift.used_count >= gift.max_uses) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'This gift code has reached its usage limit.' });
      }

      const alreadyUsed = await client.query(
        'SELECT id FROM gift_code_redemptions WHERE code_id = $1 AND user_id = $2',
        [gift.id, user.id]
      );

      if (alreadyUsed.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'You have already redeemed this gift code.' });
      }

      await client.query(
        'INSERT INTO gift_code_redemptions (code_id, user_id, amount) VALUES ($1, $2, $3)',
        [gift.id, user.id, gift.amount]
      );

      await client.query(
        'UPDATE gift_codes SET used_count = used_count + 1 WHERE id = $1',
        [gift.id]
      );

      await client.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [gift.amount, user.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, title, amount, direction)
         VALUES ($1, 'Bonus', 'Gift Code Reward', $2, 'in')`,
        [user.id, gift.amount]
      );

      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        message: `Successfully redeemed ${gift.amount} reward!`
      });
    } catch {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
