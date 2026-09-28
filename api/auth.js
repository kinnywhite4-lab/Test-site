const { pool, hashPassword, verifyPassword, createSessionToken, getAuthenticatedUser } = require('./_db');
const crypto = require('crypto');

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  return String(phone).replace(/[^\d+]/g, '').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const action = req.query.action || (req.body && req.body.action);

  if (action === 'register' && req.method === 'POST') {
    const { phone_number, password, confirm_password, ref } = req.body || {};
    const cleanNumber = cleanPhoneNumber(phone_number);

    if (!cleanNumber) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    try {
      const existing = await pool.query('SELECT id FROM users WHERE phone_number = $1', [cleanNumber]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'This phone number is already registered. Please log in.' });
      }

      let referredById = null;
      if (ref && typeof ref === 'string') {
        const refUser = await pool.query('SELECT id FROM users WHERE referral_code = $1', [ref.trim()]);
        if (refUser.rows.length > 0) referredById = refUser.rows[0].id;
      }

      const refCode = 'NV' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const pwdHash = hashPassword(password);

      const result = await pool.query(
        `INSERT INTO users (phone_number, password_hash, referral_code, referred_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, phone_number, referral_code, balance, withdrawable_balance, total_income, total_withdrawn`,
        [cleanNumber, pwdHash, refCode, referredById]
      );

      const user = result.rows[0];
      const token = createSessionToken(user.id);
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return res.status(200).json({ success: true, user });
    } catch (err) {
      console.error('Registration DB Error:', err);
      // Return specific error message to help identify database discrepancies
      return res.status(500).json({ error: err.message || 'Database error during registration.' });
    }
  }

  if (action === 'login' && req.method === 'POST') {
    const { phone_number, password } = req.body || {};
    const cleanNumber = cleanPhoneNumber(phone_number);

    if (!cleanNumber || !password) {
      return res.status(400).json({ error: 'Incorrect phone number or password.' });
    }

    try {
      const result = await pool.query(
        `SELECT id, phone_number, password_hash, referral_code, balance, withdrawable_balance, total_income, total_withdrawn 
         FROM users WHERE phone_number = $1`,
        [cleanNumber]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Incorrect phone number or password.' });
      }

      const user = result.rows[0];
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(400).json({ error: 'Incorrect phone number or password.' });
      }

      delete user.password_hash;
      const token = createSessionToken(user.id);
      res.setHeader('Set-Cookie', `novavest_session=${token}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax; Secure`);
      return res.status(200).json({ success: true, user });
    } catch (err) {
      console.error('Login DB Error:', err);
      return res.status(500).json({ error: err.message || 'Database error during login.' });
    }
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', 'novavest_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure');
    return res.status(200).json({ success: true });
  }

  if (action === 'me') {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Please log in to continue.' });
      }
      return res.status(200).json({ success: true, user });
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please log in.' });
    }
  }

  return res.status(404).json({ error: 'Not found.' });
};
