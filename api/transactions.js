const { pool, getAuthenticatedUser } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, type, title, amount, direction, created_at 
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [user.id]
    );
    return res.status(200).json({ success: true, transactions: rows });
  } catch {
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
