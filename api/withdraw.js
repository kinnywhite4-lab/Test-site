import { sql, getAuthUser } from './_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });

  if (req.method === 'GET') {
    try {
      const withdrawals = await sql`
        SELECT * FROM withdrawals WHERE user_id = ${user.id} ORDER BY created_at DESC
      `;
      return res.status(200).json({ success: true, withdrawals });
    } catch {
      return res.status(500).json({ error: 'Failed to load withdrawals.' });
    }
  }

  if (req.method === 'POST') {
    // 1. Check Global Platform Withdrawal Status
    try {
      const statusSetting = await sql`SELECT val FROM platform_settings WHERE id = 'withdrawals_enabled'`;
      const isEnabled = statusSetting.length ? statusSetting[0].val === 'true' : true;
      if (!isEnabled) {
        return res.status(403).json({
          error: 'Withdrawals are currently unavailable. Please check back later.'
        });
      }
    } catch {}

    // 2. Check if user is banned
    const userRow = await sql`SELECT is_banned, withdraw_without_package FROM users WHERE id = ${user.id}`;
    if (userRow[0]?.is_banned) {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    // 3. MANDATORY CHECK: Active Investment
    if (!userRow[0]?.withdraw_without_package) {
      const activeInv = await sql`
        SELECT id FROM purchases WHERE user_id = ${user.id} AND status = 'Active' LIMIT 1
      `;
      if (!activeInv.length) {
        return res.status(400).json({
          error: 'You must have at least one active investment equipment to make a withdrawal.'
        });
      }
    } else {
      const anyActive = await sql`
        SELECT id FROM purchases WHERE user_id = ${user.id} AND status = 'Active' LIMIT 1
      `;
      if (!anyActive.length) {
        return res.status(400).json({
          error: 'Withdrawals require an active equipment purchase. Please purchase a package first.'
        });
      }
    }

    // 4. MANDATORY CHECK: Bank Card Saved
    const bankCards = await sql`SELECT * FROM bank_cards WHERE user_id = ${user.id}`;
    if (!bankCards.length) {
      return res.status(400).json({
        error: 'Please add your bank account before making a withdrawal.',
        code: 'NO_BANK_ACCOUNT'
      });
    }

    const { amount } = req.body || {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is ₦1,000.' });
    }

    const bank = bankCards[0];

    let feeRate = 0.10;
    try {
      const feeSetting = await sql`SELECT val FROM platform_settings WHERE id = 'withdrawal_fee_percent'`;
      if (feeSetting.length) feeRate = parseFloat(feeSetting[0].val) / 100;
    } catch {}

    const fee = parsedAmount * feeRate;
    const netAmount = parsedAmount - fee;
    const ref = 'WTH' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

    // 5. ATOMIC CONCURRENCY PROTECTION: Deduct ONLY if sufficient balance exists
    const updateResult = await sql`
      UPDATE users 
      SET withdrawable_balance = withdrawable_balance - ${parsedAmount},
          total_withdrawn = total_withdrawn + ${parsedAmount}
      WHERE id = ${user.id} AND withdrawable_balance >= ${parsedAmount}
      RETURNING withdrawable_balance
    `;

    if (!updateResult.length) {
      return res.status(400).json({
        error: 'Insufficient withdrawable balance for this request.'
      });
    }

    // 6. Record Withdrawal
    await sql`
      INSERT INTO withdrawals (user_id, amount, fee, net_amount, bank_name, account_number, account_name, status, created_at)
      VALUES (${user.id}, ${parsedAmount}, ${fee}, ${netAmount}, ${bank.bank_name}, ${bank.account_number}, ${bank.account_name}, 'Pending', CURRENT_TIMESTAMP)
    `;

    // 7. Record Transaction
    await sql`
      INSERT INTO transactions (user_id, type, title, amount, direction, reference, created_at)
      VALUES (${user.id}, 'Withdrawal', 'Withdrawal Request (Pending)', ${parsedAmount}, 'out', ${ref}, CURRENT_TIMESTAMP)
    `;

    return res.status(200).json({
      success: true,
      message: 'Withdrawal submitted successfully and is pending review.'
    });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
