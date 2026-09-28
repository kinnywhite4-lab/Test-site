import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  try {
    // 1. Team 1: Direct Referrals
    const team1Users = await sql`
      SELECT id, phone_number, created_at FROM users WHERE referred_by = ${user.id} ORDER BY created_at DESC
    `;

    // 2. Team 2: Secondary Referrals
    const t1Ids = team1Users.map(u => u.id);
    let team2Users = [];
    if (t1Ids.length > 0) {
      team2Users = await sql`
        SELECT id, phone_number, created_at, referred_by FROM users WHERE referred_by = ANY(${t1Ids}) ORDER BY created_at DESC
      `;
    }

    // 3. Team Commissions
    const [l1Comms, l2Comms] = await Promise.all([
      sql`SELECT COALESCE(SUM(commission_amount), 0)::numeric AS sum FROM referral_commissions WHERE referrer_id = ${user.id} AND level = 1`,
      sql`SELECT COALESCE(SUM(commission_amount), 0)::numeric AS sum FROM referral_commissions WHERE referrer_id = ${user.id} AND level = 2`
    ]);

    // Mask phone numbers for privacy
    const mask = (p) => p && p.length > 6 ? p.substring(0, 3) + '****' + p.substring(p.length - 2) : '****';

    return res.status(200).json({
      success: true,
      referral_code: user.referral_code,
      team1: {
        count: team1Users.length,
        total_commission: parseFloat(l1Comms[0]?.sum || 0),
        members: team1Users.map(m => ({ id: m.id, phone: mask(m.phone_number), date: m.created_at }))
      },
      team2: {
        count: team2Users.length,
        total_commission: parseFloat(l2Comms[0]?.sum || 0),
        members: team2Users.map(m => ({ id: m.id, phone: mask(m.phone_number), date: m.created_at }))
      }
    });
  } catch (err) {
    console.error('Team API error:', err);
    return res.status(500).json({ error: 'Failed to load team data.' });
  }
}
