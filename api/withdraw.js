import { sql, getAuthUser } from './_db.js';

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
    // -------------------------------------------------------------
    // BACKEND ENFORCEMENT: Check Global Withdrawal OPEN/CLOSE Status
    // -------------------------------------------------------------
    try {
      const statusSetting = await sql`SELECT val FROM platform_settings WHERE id = 'withdrawals_enabled'`;
      const isEnabled = statusSetting.length ? statusSetting[0].val === 'true' : true;
      if (!isEnabled) {
        return res.status(403).json({
          error: 'Withdrawals are currently unavailable. Please check back later.'
        });
      }
    } catch (err) {
      console.error('Failed to check withdrawal global status:', err);
    }

    const { amount } = req.body || {};
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || parsedAmount < 1000) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is ₦1,000.' });
    }

    try {
      const userRows = await sql`SELECT withdrawable_balance FROM users WHERE id = ${user.id}`;
      const withdrawable = parseFloat(userRows[0]?.withdrawable_balance || 0);

      if (withdrawable < parsedAmount) {
        return res.status(400).json({ error: 'Insufficient withdrawable balance.' });
      }

      const bankCards = await sql`SELECT * FROM bank_cards WHERE user_id = ${user.id}`;
      if (bankCards.length === 0) {
        return res.status(400).json({ error: 'Please add your bank account before requesting a withdrawal.' });
      }

      const bank = bankCards[0];

      // Retrieve dynamic fee rate if configured, defaulting to existing 10%
      let feeRate = 0.10;
      try {
        const feeSetting = await sql`SELECT val FROM platform_settings WHERE id = 'withdrawal_fee_percent'`;
        if (feeSetting.length) feeRate = parseFloat(feeSetting[0].val) / 100;
      } catch {}

      const fee = parsedAmount * feeRate;
      const netAmount = parsedAmount - fee;

      // Atomically reserve funds
      await sql`
        UPDATE users 
        SET withdrawable_balance = withdrawable_balance - ${parsedAmount},
            total_withdrawn = total_withdrawn + ${parsedAmount}
        WHERE id = ${user.id}
      `;

      await sql`
        INSERT INTO withdrawals (user_id, amount, fee, net_amount, bank_name, account_number, account_name, status)
        VALUES (${user.id}, ${parsedAmount}, ${fee}, ${netAmount}, ${bank.bank_name}, ${bank.account_number}, ${bank.account_name}, 'Pending')
      `;

      await sql`
        INSERT INTO transactions (user_id, type, title, amount, direction)
        VALUES (${user.id}, 'Withdrawal', 'Withdrawal Request (Pending)', ${parsedAmount}, 'out')
      `;

      return res.status(200).json({
        success: true,
        message: 'Withdrawal submitted successfully and is pending review.'
      });
    } catch (err) {
      console.error('Withdrawal error:', err);
      return res.status(500).json({ error: 'Failed to process withdrawal.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
