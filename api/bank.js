import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        SELECT bank_name, account_number, account_name FROM bank_cards WHERE user_id = ${user.id}
      `;
      return res.status(200).json({ success: true, bank: rows[0] || null });
    } catch {
      return res.status(500).json({ error: 'Failed to load bank card.' });
    }
  }

  if (req.method === 'POST') {
    const { bank_name, account_number, account_name } = req.body || {};
    if (!bank_name || !account_number || !account_name) {
      return res.status(400).json({ error: 'All bank fields are required.' });
    }

    if (!/^\d{10}$/.test(account_number.trim())) {
      return res.status(400).json({ error: 'Account number must be exactly 10 digits.' });
    }

    try {
      await sql`
        INSERT INTO bank_cards (user_id, bank_name, account_number, account_name, updated_at)
        VALUES (${user.id}, ${bank_name.trim()}, ${account_number.trim()}, ${account_name.trim()}, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET bank_name = EXCLUDED.bank_name,
                      account_number = EXCLUDED.account_number,
                      account_name = EXCLUDED.account_name,
                      updated_at = CURRENT_TIMESTAMP
      `;
      return res.status(200).json({ success: true, message: 'Bank details saved successfully.' });
    } catch {
      return res.status(500).json({ error: 'Failed to save bank details.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
