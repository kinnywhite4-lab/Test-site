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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const userId = cookies['novavest_session'] || req.headers['x-user-id'] || req.body?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }

  const sql = getDb();

  if (req.method === 'POST') {
    const { amount } = req.body || {};
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid withdrawal amount.' });
    }

    if (withdrawAmount < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is ₦1,000.00.' });
    }

    try {
      // 1. Fetch User
      let users = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`.catch(() => []);
      if (!users || users.length === 0) {
        users = await sql`SELECT * FROM users WHERE id::text = ${String(userId)} LIMIT 1`.catch(() => []);
      }
      const user = users[0];
      if (!user) {
        return res.status(404).json({ success: false, message: 'User account not found.' });
      }

      // 2. Strict Bank Verification Check
      let banks = [];
      try {
        banks = await sql`
          SELECT * FROM user_banks 
          WHERE user_id::text = ${String(user.id)} 
          ORDER BY id DESC LIMIT 1
        `;
      } catch (e1) {
        try {
          banks = await sql`
            SELECT * FROM banks 
            WHERE user_id::text = ${String(user.id)} 
            ORDER BY id DESC LIMIT 1
          `;
        } catch (e2) {
          banks = [];
        }
      }

      const linkedBank = banks[0];
      if (!linkedBank || !linkedBank.account_number) {
        return res.status(400).json({
          success: false,
          code: 'NO_BANK',
          message: 'No bank account linked. Please link your bank details first before withdrawing.'
        });
      }

      // 3. Balance Verification
      const availableBalance = Number(user.withdrawable_balance !== undefined ? user.withdrawable_balance : (user.income_balance || 0));

      if (availableBalance < withdrawAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient withdrawable balance. You have ₦${availableBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })} available.`
        });
      }

      // 4. Deduct Balance Atomically
      await sql`
        UPDATE users 
        SET withdrawable_balance = withdrawable_balance - ${withdrawAmount},
            total_withdrawn = COALESCE(total_withdrawn, 0) + ${withdrawAmount}
        WHERE id = ${user.id}
      `;

      // 5. Create Withdrawal Record
      try {
        await sql`
          INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_holder, status, created_at)
          VALUES (
            ${user.id},
            ${withdrawAmount},
            ${linkedBank.bank_name || 'Bank'},
            ${linkedBank.account_number},
            ${linkedBank.account_holder || linkedBank.account_name || 'User'},
            'pending',
            NOW()
          )
        `;
      } catch (eW) {
        try {
          await sql`
            INSERT INTO user_withdrawals (user_id, amount, status, created_at)
            VALUES (${user.id}, ${withdrawAmount}, 'pending', NOW())
          `;
        } catch (eW2) {}
      }

      // 6. Log to Transactions
      try {
        await sql`
          INSERT INTO transactions (user_id, title, type, amount, direction, status, created_at)
          VALUES (
            ${String(user.id)},
            ${'Withdrawal to ' + (linkedBank.bank_name || 'Bank')},
            'withdrawal',
            ${withdrawAmount},
            'out',
            'pending',
            NOW()
          )
        `;
      } catch (eT) {}

      return res.status(200).json({
        success: true,
        message: 'Withdrawal submitted successfully and is being processed!'
      });

    } catch (err) {
      console.error('Withdrawal route error:', err);
      return res.status(500).json({ success: false, message: 'Server error processing withdrawal. Please try again.' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}
