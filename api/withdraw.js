const { pool, getAuthenticatedUser } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      return res.status(200).json({ success: true, withdrawals: rows });
    } catch {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  if (req.method === 'POST') {
    const { amount } = req.body || {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is 1,000.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        'SELECT withdrawable_balance FROM users WHERE id = $1 FOR UPDATE',
        [user.id]
      );
      const currentWithdrawable = parseFloat(userRes.rows[0].withdrawable_balance);

      if (currentWithdrawable < parsedAmount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient withdrawable balance.' });
      }

      const bankRes = await client.query('SELECT * FROM bank_cards WHERE user_id = $1', [user.id]);
      if (bankRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Please add your bank details first.' });
      }

      const bank = bankRes.rows[0];
      const fee = parsedAmount * 0.10;
      const netAmount = parsedAmount - fee;

      await client.query(
        `INSERT INTO withdrawals (user_id, amount, fee, net_amount, bank_name, account_number, account_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending')`,
        [user.id, parsedAmount, fee, netAmount, bank.bank_name, bank.account_number, bank.account_name]
      );

      await client.query(
        `UPDATE users 
         SET withdrawable_balance = withdrawable_balance - $1,
             total_withdrawn = total_withdrawn + $1
         WHERE id = $2`,
        [parsedAmount, user.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, title, amount, direction)
         VALUES ($1, 'Withdrawal', 'Account Withdrawal', $2, 'out')`,
        [user.id, parsedAmount]
      );

      await client.query('COMMIT');
      return res.status(200).json({ success: true, message: 'Withdrawal submitted successfully.' });
    } catch {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
