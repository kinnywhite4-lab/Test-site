const { pool, getAuthenticatedUser } = require('./_db');

const VIP_PRODUCTS = {
  'vip-1': { id: 'vip-1', name: 'VIP 1 Equipment', price: 3000, daily: 450, days: 30 },
  'vip-2': { id: 'vip-2', name: 'VIP 2 Equipment', price: 7000, daily: 1100, days: 30 },
  'vip-3': { id: 'vip-3', name: 'VIP 3 Equipment', price: 15000, daily: 2500, days: 30 },
  'vip-4': { id: 'vip-4', name: 'VIP 4 Equipment', price: 35000, daily: 6300, days: 30 },
  'vip-5': { id: 'vip-5', name: 'VIP 5 Equipment', price: 80000, daily: 15200, days: 30 },
  'vip-6': { id: 'vip-6', name: 'VIP 6 Equipment', price: 180000, daily: 36000, days: 30 }
};

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM purchases WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      return res.status(200).json({ success: true, purchases: rows });
    } catch {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  }

  if (req.method === 'POST') {
    const { productId } = req.body || {};
    const product = VIP_PRODUCTS[productId];

    if (!product) {
      return res.status(400).json({ error: 'Invalid product selected.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userRes = await client.query('SELECT balance FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const currentBalance = parseFloat(userRes.rows[0].balance);

      if (currentBalance < product.price) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance to purchase this product.' });
      }

      const totalRevenue = product.daily * product.days;

      await client.query(
        `UPDATE users SET balance = balance - $1 WHERE id = $2`,
        [product.price, user.id]
      );

      await client.query(
        `INSERT INTO purchases (user_id, product_id, product_name, price, daily_income, total_revenue, period_days, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active')`,
        [user.id, product.id, product.name, product.price, product.daily, totalRevenue, product.days]
      );

      await client.query(
        `INSERT INTO transactions (user_id, type, title, amount, direction)
         VALUES ($1, 'Purchase', $2, $3, 'out')`,
        [user.id, `Bought ${product.name}`, product.price]
      );

      await client.query('COMMIT');
      return res.status(200).json({ success: true, message: `Successfully purchased ${product.name}!` });
    } catch {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    } finally {
      client.release();
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};
