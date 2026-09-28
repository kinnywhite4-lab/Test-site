import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  try {
    // 1. Fetch live platform commission rate configuration
    const settingsRows = await sql`
      SELECT id, val FROM platform_settings 
      WHERE id IN ('referral_l1_rate', 'referral_l2_rate')
    `;

    let l1Rate = 20;
    let l2Rate = 2;

    settingsRows.forEach(r => {
      if (r.id === 'referral_l1_rate') l1Rate = parseFloat(r.val) || 20;
      if (r.id === 'referral_l2_rate') l2Rate = parseFloat(r.val) || 2;
    });

    const host = req.headers['host'] || 'test-site-henna-rho.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const referralLink = `${proto}://${host}/?ref=${user.referral_code}`;

    return res.status(200).json({
      success: true,
      referral_code: user.referral_code,
      referral_link: referralLink,
      rates: {
        level1: l1Rate,
        level2: l2Rate
      }
    });
  } catch (err) {
    console.error('Invite API error:', err);
    return res.status(500).json({ error: 'Failed to load invitation details.' });
  }
}
