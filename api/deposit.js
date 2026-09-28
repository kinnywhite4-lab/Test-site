const { pool, getAuthenticatedUser } = require('./_db');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      return res.status(200).json({ success: true, deposits: rows });
    } catch {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  if (req.method === 'POST') {
    const { amount } = req.body || {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum deposit amount is 1,000.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ref = 'DEP' + crypto.randomBytes(4).toString('hex').toUpperCase();

      await client.query(
        `INSERT INTO deposits (user_id, amount, payment_method, status, reference)
         VALUES ($1, $2, 'Bank Transfer', 'Approved', $3)`,
        [user.id, parsedAmount, ref]
      );

      await client.query(
        `UPDATE users SET balance = balance + $1 WHERE id = $2`,
        [parsedAmount, user.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, title, amount, direction)
         VALUES ($1, 'Deposit', 'Account Deposit', $2, 'in')`,
        [user.id, parsedAmount]
      );

      await client.query('COMMIT');

      const updatedUserRes = await client.query('SELECT balance FROM users WHERE id = $1', [user.id]);
      return res.status(200).json({
        success: true,
        message: 'Deposit successful.',
        newBalance: updatedUserRes.rows[0].balance
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
