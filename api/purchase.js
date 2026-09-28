import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  if (req.method === 'GET') {
    try {
      const purchases = await sql`
        SELECT * FROM purchases WHERE user_id = ${user.id} ORDER BY created_at DESC
      `;
      return res.status(200).json({ success: true, purchases });
    } catch {
      return res.status(500).json({ error: 'Failed to load products.' });
    }
  }

  if (req.method === 'POST') {
    const { productId } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'Invalid product selected.' });

    try {
      const productRows = await sql`SELECT * FROM products WHERE id = ${productId} AND status = 'Active'`;
      if (!productRows.length) {
        return res.status(400).json({ error: 'Selected equipment is no longer available.' });
      }
      const prod = productRows[0];
      const prodPrice = parseFloat(prod.price);

      const userRows = await sql`SELECT balance FROM users WHERE id = ${user.id}`;
      const currentBalance = parseFloat(userRows[0]?.balance || 0);

      if (currentBalance < prodPrice) {
        return res.status(400).json({
          error: 'Insufficient balance to purchase this equipment.',
          code: 'INSUFFICIENT_BALANCE'
        });
      }

      const totalRevenue = parseFloat(prod.daily_income) * parseInt(prod.period_days, 10);

      await sql`UPDATE users SET balance = balance - ${prodPrice} WHERE id = ${user.id}`;

      await sql`
        INSERT INTO purchases (user_id, product_id, product_name, price, daily_income, total_revenue, period_days, status)
        VALUES (${user.id}, ${prod.id}, ${prod.name}, ${prodPrice}, ${prod.daily_income}, ${totalRevenue}, ${prod.period_days}, 'Active')
      `;

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction)
        VALUES (${user.id}, 'Purchase', ${'Bought ' + prod.name}, ${prodPrice}, 'out')
      `;

      return res.status(200).json({
        success: true,
        message: `Successfully purchased ${prod.name}!`
      });
    } catch (err) {
      console.error('Purchase error:', err);
      return res.status(500).json({ error: 'Purchase transaction failed.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
