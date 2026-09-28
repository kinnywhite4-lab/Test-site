const { pool, getAuthenticatedUser } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  try {
    const [bankRes, purchasesRes, depositsRes, withdrawalsRes, transactionsRes] = await Promise.all([
      pool.query('SELECT bank_name, account_number, account_name FROM bank_cards WHERE user_id = $1', [user.id]),
      pool.query('SELECT * FROM purchases WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
      pool.query('SELECT * FROM deposits WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
      pool.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
      pool.query('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [user.id])
    ]);

    return res.status(200).json({
      success: true,
      user,
      bank: bankRes.rows[0] || null,
      purchases: purchasesRes.rows,
      deposits: depositsRes.rows,
      withdrawals: withdrawalsRes.rows,
      transactions: transactionsRes.rows
    });
  } catch (err) {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
