import { neon } from '@neondatabase/serverless';

function getDb() {
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) throw new Error('DATABASE_URL environment variable is missing.');
  return neon(dbUrl);
}

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function getDepositBal(u) {
  if (u.deposit_balance !== undefined && u.deposit_balance !== null) return Number(u.deposit_balance);
  if (u.balance !== undefined && u.balance !== null) return Number(u.balance);
  if (u.recharge_balance !== undefined && u.recharge_balance !== null) return Number(u.recharge_balance);
  if (u.wallet_balance !== undefined && u.wallet_balance !== null) return Number(u.wallet_balance);
  return 0;
}

function getWithdrawBal(u) {
  if (u.withdrawable_balance !== undefined && u.withdrawable_balance !== null) return Number(u.withdrawable_balance);
  if (u.withdrawal_balance !== undefined && u.withdrawal_balance !== null) return Number(u.withdrawal_balance);
  if (u.income_balance !== undefined && u.income_balance !== null) return Number(u.income_balance);
  return 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = getDb();

  try {
    const cookies = parseCookies(req);
    const sessionUserId = cookies['novavest_session'] || 
                          cookies['token'] || 
                          req.query.user_id || 
                          req.headers['x-user-id'] || 
                          req.headers['authorization']?.replace('Bearer ', '');

    // 1. Fetch catalog products
    let rawProducts = [];
    try {
      rawProducts = await sql`SELECT * FROM products ORDER BY price ASC`;
    } catch (e) {
      rawProducts = [];
    }

    if (!rawProducts || rawProducts.length === 0) {
      rawProducts = [
        { id: 1, name: 'VIP Equipment 1', price: 3000, daily_yield: 360, daily_income: 360, duration_days: 30, period_days: 30 },
        { id: 2, name: 'VIP Equipment 2', price: 6000, daily_yield: 780, daily_income: 780, duration_days: 30, period_days: 30 },
        { id: 3, name: 'VIP Equipment 3', price: 15000, daily_yield: 2100, daily_income: 2100, duration_days: 30, period_days: 30 },
        { id: 4, name: 'VIP Equipment 4', price: 40000, daily_yield: 6000, daily_income: 6000, duration_days: 30, period_days: 30 }
      ];
    }

    const products = rawProducts.map(p => {
      const price = Number(p.price || 0);
      const daily = Number(p.daily_yield || p.daily_income || 0);
      const days = Number(p.duration_days || p.period_days || 30);
      const rev = Number(p.total_revenue || (daily * days));

      return {
        id: p.id,
        product_id: p.id,
        name: p.name || 'VIP Equipment',
        title: p.name || 'VIP Equipment',
        price: price,
        amount: price,
        daily_yield: daily,
        daily_income: daily,
        daily_revenue: daily,
        duration_days: days,
        period_days: days,
        days: days,
        total_revenue: rev,
        total_yield: rev,
        status: 'Active',
        is_active: true
      };
    });

    const settings = {
      withdrawals_enabled: 'true',
      withdrawal_fee_percent: '10',
      min_withdrawal: '1000'
    };

    // 2. User & Synchronous Yield Settlement
    let user = null;
    let myEquipment = [];

    if (sessionUserId && sessionUserId !== 'undefined' && sessionUserId !== 'null') {
      let userRows = [];
      try {
        userRows = await sql`SELECT * FROM users WHERE id::text = ${String(sessionUserId)} LIMIT 1`;
      } catch (e1) {
        try {
          userRows = await sql`SELECT * FROM users WHERE id = ${sessionUserId} LIMIT 1`;
        } catch (e2) {
          userRows = [];
        }
      }

      if ((!userRows || userRows.length === 0) && String(sessionUserId).length >= 10) {
        try {
          userRows = await sql`SELECT * FROM users WHERE phone = ${String(sessionUserId)} OR phone_number = ${String(sessionUserId)} LIMIT 1`;
        } catch (e3) {
          userRows = [];
        }
      }

      let rawUser = userRows[0];

      if (rawUser) {
        let rawPurchases = [];
        let tableName = 'purchases';

        try {
          rawPurchases = await sql`SELECT * FROM purchases WHERE user_id::text = ${String(rawUser.id)} ORDER BY id DESC`;
        } catch (eP1) {
          try {
            rawPurchases = await sql`SELECT * FROM user_products WHERE user_id::text = ${String(rawUser.id)} ORDER BY id DESC`;
            tableName = 'user_products';
          } catch (eP2) {
            try {
              rawPurchases = await sql`SELECT * FROM user_investments WHERE user_id::text = ${String(rawUser.id)} ORDER BY id DESC`;
              tableName = 'user_investments';
            } catch (eP3) {
              rawPurchases = [];
            }
          }
        }

        const now = Date.now();
        let totalIncomeToAddNow = 0;
        const prodMap = new Map();
        products.forEach(p => prodMap.set(String(p.id), p));

        for (const item of rawPurchases) {
          try {
            const matched = prodMap.get(String(item.product_id)) || {};
            const price = Number(item.price || item.amount || item.purchase_amount || item.amount_paid || matched.price || 0);
            const daily = Number(item.daily_yield || item.daily_income || matched.daily_income || matched.daily_yield || 0);
            const days = Number(item.duration_days || item.period_days || matched.duration_days || 30);
            const totalRev = Number(item.total_revenue || (daily * days));

            const createdMs = item.created_at ? new Date(item.created_at).getTime() : now;
            let lastDropMs = item.last_drop_time ? new Date(item.last_drop_time).getTime() : createdMs;

            const intervalMs = 24 * 60 * 60 * 1000; // 24 Hours in ms
            const cyclesDue = Math.floor((now - lastDropMs) / intervalMs);

            let newDropped = Number(item.total_earned || item.dropped_income || 0);

            // ONLY credit if a full 24-hr countdown has completed
            if (cyclesDue > 0 && daily > 0) {
              const incomeGained = cyclesDue * daily;
              totalIncomeToAddNow += incomeGained;
              newDropped += incomeGained;

              lastDropMs = lastDropMs + (cyclesDue * intervalMs);
              const nextDropTimeIso = new Date(lastDropMs + intervalMs).toISOString();
              const lastDropTimeIso = new Date(lastDropMs).toISOString();

              // CRITICAL: Await the database write so it does not repeat on next refresh!
              try {
                if (tableName === 'purchases') {
                  await sql`
                    UPDATE purchases 
                    SET last_drop_time = ${lastDropTimeIso},
                        next_drop_time = ${nextDropTimeIso},
                        total_earned = ${newDropped}
                    WHERE id = ${item.id}
                  `;
                } else if (tableName === 'user_products') {
                  await sql`
                    UPDATE user_products 
                    SET last_drop_time = ${lastDropTimeIso},
                        next_drop_time = ${nextDropTimeIso},
                        total_earned = ${newDropped}
                    WHERE id = ${item.id}
                  `;
                } else {
                  await sql`
                    UPDATE user_investments 
                    SET last_drop_time = ${lastDropTimeIso},
                        next_drop_time = ${nextDropTimeIso},
                        total_earned = ${newDropped}
                    WHERE id = ${item.id}
                  `;
                }
              } catch (updateErr) {
                console.error("Failed to commit drop timestamp:", updateErr);
              }
            }

            const nextDropTime = new Date(lastDropMs + intervalMs).toISOString();
            const remainingIncome = Math.max(0, totalRev - newDropped);

            myEquipment.push({
              id: item.id,
              product_id: item.product_id,
              name: item.name || item.product_name || matched.name || 'VIP Equipment',
              product_name: item.name || item.product_name || matched.name || 'VIP Equipment',
              price: price,
              amount_paid: price,
              daily_income: daily,
              daily_yield: daily,
              duration_days: days,
              period_days: days,
              total_revenue: totalRev,
              dropped_income: newDropped,
              remaining_income: remainingIncome,
              status: (item.status || 'Active').charAt(0).toUpperCase() + (item.status || 'Active').slice(1).toLowerCase(),
              created_at: item.created_at || new Date().toISOString(),
              last_drop_time: new Date(lastDropMs).toISOString(),
              next_drop_time: nextDropTime
            });
          } catch (errItem) {
            console.error("Error processing item:", errItem);
          }
        }

        // Apply completed payout to withdrawable balance in the database
        let currentWithdrawable = getWithdrawBal(rawUser);
        if (totalIncomeToAddNow > 0) {
          currentWithdrawable += totalIncomeToAddNow;
          try {
            await sql`
              UPDATE users 
              SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + ${totalIncomeToAddNow}
              WHERE id::text = ${String(rawUser.id)}
            `;
          } catch (errBal) {
            try {
              await sql`
                UPDATE users 
                SET income_balance = COALESCE(income_balance, 0) + ${totalIncomeToAddNow}
                WHERE id::text = ${String(rawUser.id)}
              `;
            } catch (errBal2) {}
          }
        }

        user = {
          id: rawUser.id,
          phone: rawUser.phone || rawUser.phone_number || '',
          phone_number: rawUser.phone || rawUser.phone_number || '',
          referral_code: rawUser.referral_code || ('NV' + rawUser.id),
          deposit_balance: getDepositBal(rawUser),
          balance: getDepositBal(rawUser),
          withdrawable_balance: currentWithdrawable,
          withdrawal_balance: currentWithdrawable,
          income_balance: currentWithdrawable,
          total_deposited: Number(rawUser.total_deposited || 0),
          total_withdrawn: Number(rawUser.total_withdrawn || 0),
          created_at: rawUser.created_at
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: { user, products, myProducts: myEquipment, settings },
      user,
      products,
      myProducts: myEquipment,
      purchases: myEquipment,
      settings
    });

  } catch (error) {
    return res.status(200).json({
      success: false,
      error: error.message,
      products: [],
      myProducts: []
    });
  }
}
