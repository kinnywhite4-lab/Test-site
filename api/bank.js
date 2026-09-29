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

// Built-in active bank payment channels in case database records are empty
const DEFAULT_CHANNELS = [
  {
    id: '1',
    channel_name: 'Bank Transfer Direct (Instant)',
    bank_name: 'OPay / PayCom',
    account_number: '8012345678',
    account_name: 'NovaVest Capital Corp',
    instructions: 'Transfer the exact amount to the account details above, and submit your transaction screenshot or payment reference.',
    status: 'active'
  },
  {
    id: '2',
    channel_name: 'Kuda Microfinance Fast Transfer',
    bank_name: 'Kuda Bank',
    account_number: '2098765432',
    account_name: 'NovaVest Investment Solutions',
    instructions: 'Make transfer using your banking mobile app or USSD code and keep your transaction receipt.',
    status: 'active'
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req);
  const userId = cookies['novavest_session'] || req.headers['x-user-id'] || req.query.user_id;
  const sql = getDb();

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const action = req.query?.action || url.searchParams.get('action');

  // =============================================================
  // 1. DEPOSIT CHANNELS LIST (?action=deposit_channels)
  // =============================================================
  if (action === 'deposit_channels') {
    try {
      let channels = [];
      try {
        channels = await sql`
          SELECT * FROM deposit_channels 
          WHERE status = 'active' OR is_active = true 
          ORDER BY id ASC
        `;
      } catch (e1) {
        try {
          channels = await sql`
            SELECT * FROM payment_channels 
            WHERE status = 'active' OR is_active = true 
            ORDER BY id ASC
          `;
        } catch (e2) {
          channels = [];
        }
      }

      if (!channels || channels.length === 0) {
        channels = DEFAULT_CHANNELS;
      }

      return res.status(200).json({
        success: true,
        channels: channels.map(ch => ({
          id: String(ch.id),
          channel_name: ch.channel_name || ch.name || 'Bank Transfer Direct',
          bank_name: ch.bank_name || 'Bank Direct',
          account_name: ch.account_name || ch.account_holder || 'NovaVest Official',
          account_number: ch.account_number || '',
          instructions: ch.instructions || 'Transfer the exact amount and save receipt.',
          status: 'active'
        }))
      });
    } catch (err) {
      console.error('Error fetching deposit channels:', err);
      return res.status(200).json({
        success: true,
        channels: DEFAULT_CHANNELS
      });
    }
  }

  // =============================================================
  // 2. CHANNEL DETAILS (?action=channel_detail&id=...)
  // =============================================================
  if (action === 'channel_detail') {
    const channelId = req.query.id || url.searchParams.get('id');
    try {
      let channel = null;

      try {
        const rows = await sql`
          SELECT * FROM deposit_channels 
          WHERE id::text = ${String(channelId)} 
          LIMIT 1
        `;
        channel = rows[0];
      } catch (e1) {
        try {
          const rows = await sql`
            SELECT * FROM payment_channels 
            WHERE id::text = ${String(channelId)} 
            LIMIT 1
          `;
          channel = rows[0];
        } catch (e2) {}
      }

      if (!channel) {
        channel = DEFAULT_CHANNELS.find(c => String(c.id) === String(channelId)) || DEFAULT_CHANNELS[0];
      }

      return res.status(200).json({
        success: true,
        channel: {
          id: String(channel.id),
          channel_name: channel.channel_name || channel.name || 'Bank Transfer Direct',
          bank_name: channel.bank_name || 'Bank Direct',
          account_name: channel.account_name || channel.account_holder || 'NovaVest Official',
          account_number: channel.account_number || '',
          instructions: channel.instructions || 'Transfer the exact amount to the account details above and upload payment proof.'
        }
      });
    } catch (err) {
      const fallback = DEFAULT_CHANNELS[0];
      return res.status(200).json({ success: true, channel: fallback });
    }
  }

  // =============================================================
  // 3. GET LINKED USER BANK (?action=get_user_bank)
  // =============================================================
  if (action === 'get_user_bank') {
    if (!userId) {
      return res.status(200).json({ success: false, bank: null });
    }

    try {
      let banks = [];
      try {
        banks = await sql`
          SELECT * FROM user_banks 
          WHERE user_id::text = ${String(userId)} 
          ORDER BY id DESC LIMIT 1
        `;
      } catch (e1) {
        try {
          banks = await sql`
            SELECT * FROM banks 
            WHERE user_id::text = ${String(userId)} 
            ORDER BY id DESC LIMIT 1
          `;
        } catch (e2) {}
      }

      const bank = banks[0];
      if (bank) {
        return res.status(200).json({
          success: true,
          bank: {
            bank_name: bank.bank_name,
            account_number: bank.account_number,
            account_holder: bank.account_holder || bank.account_name || 'Verified User'
          }
        });
      }
      return res.status(200).json({ success: false, bank: null });
    } catch (e) {
      return res.status(200).json({ success: false, bank: null });
    }
  }

  // =============================================================
  // 4. SAVE USER BANK (?action=save_user_bank)
  // =============================================================
  if (action === 'save_user_bank' && req.method === 'POST') {
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in.' });
    }

    const { bankName, accountNumber, accountHolder } = req.body || {};
    if (!bankName || !accountNumber || !accountHolder) {
      return res.status(400).json({ success: false, message: 'All bank fields are required.' });
    }

    try {
      try {
        await sql`
          INSERT INTO user_banks (user_id, bank_name, account_number, account_holder, created_at)
          VALUES (${String(userId)}, ${bankName}, ${accountNumber}, ${accountHolder}, NOW())
        `;
      } catch (e1) {
        await sql`
          INSERT INTO banks (user_id, bank_name, account_number, account_holder, created_at)
          VALUES (${String(userId)}, ${bankName}, ${accountNumber}, ${accountHolder}, NOW())
        `;
      }
      return res.status(200).json({ success: true, message: 'Bank details saved.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Failed to save bank.' });
    }
  }

  return res.status(400).json({ success: false, message: 'Invalid action.' });
}
