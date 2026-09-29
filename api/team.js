import { sql, getAuthUser } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  let user;
  try {
    user = await getAuthUser(req);
  } catch (err) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const action = req.query?.action || url.searchParams.get('action');

  // -------------------------------------------------------------
  // 1. INVITE ROUTE (?action=invite)
  // -------------------------------------------------------------
  if (action === 'invite') {
    try {
      let l1Rate = 20;
      let l2Rate = 2;

      try {
        const settingsRows = await sql`
          SELECT id, val FROM platform_settings 
          WHERE id IN ('referral_l1_rate', 'referral_l2_rate')
        `;
        settingsRows.forEach(r => {
          if (r.id === 'referral_l1_rate') l1Rate = parseFloat(r.val) || 20;
          if (r.id === 'referral_l2_rate') l2Rate = parseFloat(r.val) || 2;
        });
      } catch {}

      const host = req.headers['host'] || 'test-site-henna-rho.vercel.app';
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const refCode = user.referral_code || 'NV' + user.id;
      const referralLink = `${proto}://${host}/?ref=${refCode}`;

      return res.status(200).json({
        success: true,
        referral_code: refCode,
        referral_link: referralLink,
        rates: {
          level1: l1Rate,
          level2: l2Rate
        }
      });
    } catch (err) {
      console.error('Invite route error:', err);
      return res.status(500).json({ error: 'Failed to load invitation details.' });
    }
  }

  // -------------------------------------------------------------
  // 2. TEAM MEMBERS & COMMISSIONS ROUTE
  // -------------------------------------------------------------
  try {
    const team1Users = await sql`
      SELECT id, phone_number, created_at 
      FROM users 
      WHERE referred_by = ${user.id} 
      ORDER BY created_at DESC
    `.catch(() => []);

    const t1Ids = (team1Users || []).map(u => u.id);

    let team2Users = [];
    if (t1Ids.length > 0) {
      try {
        team2Users = await sql`
          SELECT id, phone_number, created_at, referred_by 
          FROM users 
          WHERE referred_by = ANY(${t1Ids}) 
          ORDER BY created_at DESC
        `;
      } catch (e) {
        team2Users = [];
      }
    }

    let t1Commissions = [];
    let t2Commissions = [];

    try {
      t1Commissions = await sql`
        SELECT 
          rc.buyer_id, 
          u.phone_number, 
          COALESCE(p.product_name, 'VIP Equipment') AS product_name,
          rc.purchase_amount, 
          rc.commission_amount, 
          rc.created_at
        FROM referral_commissions rc
        JOIN users u ON rc.buyer_id = u.id
        LEFT JOIN purchases p ON rc.purchase_id = p.id
        WHERE rc.referrer_id = ${user.id} AND rc.level = 1
        ORDER BY rc.created_at DESC
      `;
    } catch {}

    try {
      t2Commissions = await sql`
        SELECT 
          rc.buyer_id, 
          u.phone_number, 
          COALESCE(p.product_name, 'VIP Equipment') AS product_name,
          rc.purchase_amount, 
          rc.commission_amount, 
          rc.created_at
        FROM referral_commissions rc
        JOIN users u ON rc.buyer_id = u.id
        LEFT JOIN purchases p ON rc.purchase_id = p.id
        WHERE rc.referrer_id = ${user.id} AND rc.level = 2
        ORDER BY rc.created_at DESC
      `;
    } catch {}

    const team1TotalIncome = (t1Commissions || []).reduce((acc, c) => acc + parseFloat(c.commission_amount || 0), 0);
    const team2TotalIncome = (t2Commissions || []).reduce((acc, c) => acc + parseFloat(c.commission_amount || 0), 0);
    const mask = (p) => (p && String(p).length > 6 ? String(p).substring(0, 3) + '****' + String(p).substring(String(p).length - 2) : 'User #' + p);

    return res.status(200).json({
      success: true,
      team1: {
        total_members: (team1Users || []).length,
        total_income: team1TotalIncome,
        records: (t1Commissions || []).map(c => ({
          user_id: c.buyer_id,
          phone: mask(c.phone_number || String(c.buyer_id)),
          product_name: c.product_name,
          amount_bought: parseFloat(c.purchase_amount || 0),
          commission: parseFloat(c.commission_amount || 0),
          created_at: c.created_at
        }))
      },
      team2: {
        total_members: (team2Users || []).length,
        total_income: team2TotalIncome,
        records: (t2Commissions || []).map(c => ({
          user_id: c.buyer_id,
          phone: mask(c.phone_number || String(c.buyer_id)),
          product_name: c.product_name,
          amount_bought: parseFloat(c.purchase_amount || 0),
          commission: parseFloat(c.commission_amount || 0),
          created_at: c.created_at
        }))
      }
    });
  } catch (err) {
    console.error('Team API error:', err);
    return res.status(500).json({ error: 'Failed to load team data.' });
  }
}
