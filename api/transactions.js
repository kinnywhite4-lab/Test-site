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
    return res.status(200).json({ success: true, records: [] });
  }

  const sql = getDb();
  const type = req.query.type || 'all';

  try {
    let records = [];

    // Query standard transactions table
    try {
      if (type === 'all') {
        records = await sql`
          SELECT * FROM transactions 
          WHERE user_id::text = ${String(userId)} 
          ORDER BY created_at DESC 
          LIMIT 50
        `;
      } else {
        records = await sql`
          SELECT * FROM transactions 
          WHERE user_id::text = ${String(userId)} AND type = ${type}
          ORDER BY created_at DESC 
          LIMIT 50
        `;
      }
    } catch (e1) {
      // Fallback table name
      try {
        records = await sql`
          SELECT * FROM user_transactions 
          WHERE user_id::text = ${String(userId)} 
          ORDER BY created_at DESC 
          LIMIT 50
        `;
      } catch (e2) {
        records = [];
      }
    }

    return res.status(200).json({
      success: true,
      records: records.map(r => ({
        id: r.id,
        title: r.title || (r.type === 'income' ? 'Daily Yield Income' : (r.type === 'deposit' ? 'Recharge Deposit' : 'Withdrawal Request')),
        type: r.type || 'transaction',
        amount: Number(r.amount || 0),
        direction: r.direction || (r.type === 'withdrawal' ? 'out' : 'in'),
        status: (r.status || 'completed').toLowerCase(),
        created_at: r.created_at || new Date().toISOString()
      }))
    });
  } catch (err) {
    console.error("Transactions API Error:", err);
    return res.status(200).json({ success: true, records: [] });
  }
}
