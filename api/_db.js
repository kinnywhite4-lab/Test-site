import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
export const sql = neon(process.env.DATABASE_URL);

let schemaPromise;
export function ensureSchema() {
  if (!schemaPromise) schemaPromise = (async () => {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await sql`CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Nova User',
      email TEXT NOT NULL DEFAULT 'demo@example.com',
      referral_code TEXT UNIQUE NOT NULL,
      deposit_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      withdrawal_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      daily_return NUMERIC(18,2) NOT NULL DEFAULT 0,
      commission_return NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_income NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_withdrawn NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS vip_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL DEFAULT 'VIP',
      price NUMERIC(18,2) NOT NULL,
      cycle_days INTEGER NOT NULL,
      daily_income NUMERIC(18,2) NOT NULL DEFAULT 0,
      total_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
      hourly_income NUMERIC(18,2) NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS product_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES vip_products(id),
      product_name TEXT NOT NULL,
      price NUMERIC(18,2) NOT NULL,
      cycle_days INTEGER NOT NULL,
      daily_income NUMERIC(18,2) NOT NULL,
      total_revenue NUMERIC(18,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    )`;
    await sql`CREATE TABLE IF NOT EXISTS bank_accounts (
      user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      bank_name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      status TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS gift_codes (
      code TEXT PRIMARY KEY,
      amount NUMERIC(18,2) NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      max_redemptions INTEGER NOT NULL DEFAULT 1,
      redeemed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS gift_redemptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL REFERENCES gift_codes(code),
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      amount NUMERIC(18,2) NOT NULL,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(code, user_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS referrals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      referred_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      level INTEGER NOT NULL CHECK(level IN (1,2)),
      commission_earned NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(referrer_id, referred_user_id)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS transactions_user_created_idx ON transactions(user_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS purchases_user_created_idx ON product_purchases(user_id, purchased_at DESC)`;
    await seedProducts();
    await seedGiftCodes();
  })();
  return schemaPromise;
}

async function seedProducts() {
  const rows = [
    ['Product 1',3000,35,900,31500,38],['Product 2',5000,35,1500,52500,63],['Product 3',10000,35,3000,105000,125],
    ['Product 4',20000,40,4200,168000,175],['Product 5',30000,45,6000,270000,250],['Product 6',50000,45,11000,495000,458],
    ['Product 7',75000,50,16500,825000,688],['Product 8',100000,55,23000,1265000,958],['Product 9',200000,60,48000,2880000,2000],['Product 10',300000,60,72000,4320000,3000]
  ];
  for (const [name,price,cycle,daily,total,hourly] of rows) {
    await sql`INSERT INTO vip_products(name,price,cycle_days,daily_income,total_revenue,hourly_income)
      VALUES(${name},${price},${cycle},${daily},${total},${hourly})
      ON CONFLICT(name) DO NOTHING`;
  }
}

async function seedGiftCodes() {
  for (const [code,amount] of [['WELCOME1000',1000],['NOVA500',500],['BONUS1500',1500]]) {
    await sql`INSERT INTO gift_codes(code,amount,max_redemptions) VALUES(${code},${amount},1000) ON CONFLICT(code) DO NOTHING`;
  }
}

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type','application/json');
  return res.end(JSON.stringify(body));
}
export function method(req, res, allowed) {
  if (!allowed.includes(req.method)) { json(res,405,{ok:false,error:'Method not allowed'}); return false; }
  return true;
}
export function getUserId(req) {
  const raw = req.headers['x-novavest-user-id'];
  const id = Array.isArray(raw) ? raw[0] : raw;
  return typeof id === 'string' && /^[0-9a-fA-F-]{36}$/.test(id) ? id : null;
}
export async function ensureUser(req) {
  let id = getUserId(req);
  if (!id) id = crypto.randomUUID();
  const referralCode = `NOVA-${id.replaceAll('-','').slice(0,8).toUpperCase()}`;
  await sql`INSERT INTO app_users(id, referral_code) VALUES(${id},${referralCode}) ON CONFLICT(id) DO NOTHING`;
  return id;
}
export function num(v) { return Number(v || 0); }
