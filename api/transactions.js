import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  try {
    const transactions = await sql`
      SELECT id, type, title, amount, direction, created_at 
      FROM transactions WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100
    `;
    return res.status(200).json({ success: true, transactions });
  } catch {
    return res.status(500).json({ error: 'Failed to load transactions.' });
  }
}
