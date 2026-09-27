import { ensureSchema, ensureUser, json, method, sql } from './_db.js';
export default async function handler(req,res){
  if(!method(req,res,['GET'])) return;
  try {
    await ensureSchema();
    const userId=await ensureUser(req);
    const [accountRows,bankRows,purchases,transactions,products,referrals]=await Promise.all([
      sql`SELECT id,display_name,email,referral_code,deposit_balance,withdrawal_balance,daily_return,commission_return,total_income,total_withdrawn FROM app_users WHERE id=${userId}`,
      sql`SELECT bank_name,account_name,account_number,updated_at FROM bank_accounts WHERE user_id=${userId}`,
      sql`SELECT id,product_id,product_name,price,cycle_days,daily_income,total_revenue,status,purchased_at,expires_at FROM product_purchases WHERE user_id=${userId} ORDER BY purchased_at DESC`,
      sql`SELECT id,type,amount,status,reference,detail,created_at FROM transactions WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT id,name,category,price,cycle_days,daily_income,total_revenue,hourly_income FROM vip_products WHERE active=true AND category='VIP' ORDER BY created_at ASC`,
      sql`SELECT r.level,r.commission_earned,u.display_name,u.email,u.referral_code,r.created_at FROM referrals r JOIN app_users u ON u.id=r.referred_user_id WHERE r.referrer_id=${userId} ORDER BY r.created_at DESC`
    ]);
    const a=accountRows[0];
    return json(res,200,{ok:true,userId,account:a,bank:bankRows[0]||null,purchases,transactions,products,referrals});
  } catch(e){console.error(e);return json(res,500,{ok:false,error:'Backend initialization failed'});}
}
