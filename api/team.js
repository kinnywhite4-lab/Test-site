import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is missing.');
  return neon(dbUrl);
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(c => {
      const parts = c.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const userId = cookies['novavest_session'] || req.query.user_id || req.headers['x-user-id'];

  if (!userId) {
    return res.status(200).json({
      success: false,
      message: 'Please log in to view team details.',
      referral_code: '------',
      referral_link: '',
      team1: { total_members: 0, total_income: 0, records: [] },
      team2: { total_members: 0, total_income: 0, records: [] }
    });
  }

  const sql = getDb();

  try {
    const userRows = await sql`SELECT id, referral_code, phone, phone_number FROM users WHERE id = ${userId} LIMIT 1`;
    const user = userRows[0];

    if (!user) {
      return res.status(200).json({
        success: false,
        message: 'User account not found.',
        team1: { total_members: 0, total_income: 0, records: [] },
        team2: { total_members: 0, total_income: 0, records: [] }
      });
    }

    const host = req.headers['host'] || 'test-site-henna-rho.vercel.app';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const refCode = user.referral_code || ('NV' + user.id);
    const referralLink = `${proto}://${host}/?ref=${refCode}`;

    const url = new URL(req.url, `https://${host}`);
    const action = req.query?.action || url.searchParams.get('action');

    // 1. Invite Action
    if (action === 'invite') {
      return res.status(200).json({
        success: true,
        referral_code: refCode,
        referral_link: referralLink,
        rates: { level1: 20, level2: 2 }
      });
    }

    // 2. Team & Commission Overview
    // Query directly by user ID or user referral code
    const team1Users = await sql`
      SELECT id, phone, phone_number, created_at 
      FROM users 
      WHERE referred_by = ${String(user.id)} OR referred_by = ${refCode}
      ORDER BY created_at DESC
    `.catch(() => []);

    const t1Ids = (team1Users || []).map(u => String(u.id));

    let team2Users = [];
    if (t1Ids.length > 0) {
      try {
        team2Users = await sql`
          SELECT id, phone, phone_number, created_at, referred_by 
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
          u.phone,
          u.phone_number,
          COALESCE(rc.product_name, 'VIP Equipment') AS product_name,
          rc.purchase_amount, 
          rc.commission_amount, 
          rc.created_at
        FROM referral_commissions rc
        LEFT JOIN users u ON rc.buyer_id = u.id
        WHERE rc.referrer_id = ${user.id} AND rc.level = 1
        ORDER BY rc.created_at DESC
      `;
    } catch {}

    try {
      t2Commissions = await sql`
        SELECT 
          rc.buyer_id, 
          u.phone,
          u.phone_number,
          COALESCE(rc.product_name, 'VIP Equipment') AS product_name,
          rc.purchase_amount, 
          rc.commission_amount, 
          rc.created_at
        FROM referral_commissions rc
        LEFT JOIN users u ON rc.buyer_id = u.id
        WHERE rc.referrer_id = ${user.id} AND rc.level = 2
        ORDER BY rc.created_at DESC
      `;
    } catch {}

    const team1TotalIncome = (t1Commissions || []).reduce((acc, c) => acc + parseFloat(c.commission_amount || 0), 0);
    const team2TotalIncome = (t2Commissions || []).reduce((acc, c) => acc + parseFloat(c.commission_amount || 0), 0);
    const mask = (p) => (p && String(p).length > 6 ? String(p).substring(0, 3) + '****' + String(p).substring(String(p).length - 2) : 'User #' + p);

    // If no commission logs exist yet, show registered downline members directly
    const t1Records = (t1Commissions && t1Commissions.length > 0)
      ? t1Commissions.map(c => ({
          user_id: c.buyer_id,
          phone: mask(c.phone || c.phone_number || String(c.buyer_id)),
          product_name: c.product_name,
          amount_bought: parseFloat(c.purchase_amount || 0),
          commission: parseFloat(c.commission_amount || 0),
          created_at: c.created_at
        }))
      : (team1Users || []).map(u => ({
          user_id: u.id,
          phone: mask(u.phone || u.phone_number || String(u.id)),
          product_name: 'Registered Member',
          amount_bought: 0,
          commission: 0,
          created_at: u.created_at
        }));

    const t2Records = (t2Commissions && t2Commissions.length > 0)
      ? t2Commissions.map(c => ({
          user_id: c.buyer_id,
          phone: mask(c.phone || c.phone_number || String(c.buyer_id)),
          product_name: c.product_name,
          amount_bought: parseFloat(c.purchase_amount || 0),
          commission: parseFloat(c.commission_amount || 0),
          created_at: c.created_at
        }))
      : (team2Users || []).map(u => ({
          user_id: u.id,
          phone: mask(u.phone || u.phone_number || String(u.id)),
          product_name: 'Registered Member',
          amount_bought: 0,
          commission: 0,
          created_at: u.created_at
        }));

    return res.status(200).json({
      success: true,
      referral_code: refCode,
      referral_link: referralLink,
      team1: {
        total_members: (team1Users || []).length,
        total_income: team1TotalIncome,
        records: t1Records
      },
      team2: {
        total_members: (team2Users || []).length,
        total_income: team2TotalIncome,
        records: t2Records
      }
    });

  } catch (err) {
    console.error('Team API error:', err);
    return res.status(200).json({
      success: true,
      referral_code: 'NV' + userId,
      referral_link: '',
      team1: { total_members: 0, total_income: 0, records: [] },
      team2: { total_members: 0, total_income: 0, records: [] }
    });
  }
}
