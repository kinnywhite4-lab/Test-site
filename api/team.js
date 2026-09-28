import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  try {
    const directMembers = await sql`
      SELECT id, phone_number, created_at, balance, total_income 
      FROM users WHERE referred_by = ${user.id} ORDER BY created_at DESC
    `;

    const maskedMembers = directMembers.map(m => {
      const p = m.phone_number || '';
      const masked = p.length > 5 ? p.substring(0, 3) + '****' + p.substring(p.length - 2) : '****';
      return {
        id: m.id,
        phone_number: masked,
        created_at: m.created_at,
        total_income: m.total_income
      };
    });

    return res.status(200).json({
      success: true,
      referral_code: user.referral_code,
      team_count: maskedMembers.length,
      members: maskedMembers
    });
  } catch (err) {
    console.error('Team Error:', err);
    return res.status(500).json({ error: 'Failed to load team data.' });
  }
}
