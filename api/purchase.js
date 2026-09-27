import { ensureSchema, ensureUser, json, method, sql } from './_db.js';
export default async function handler(req,res){
  if(!method(req,res,['POST']))return;
  try{await ensureSchema();const userId=await ensureUser(req);const productId=req.body?.productId;const p=(await sql`SELECT id,name,price,cycle_days,daily_income,total_revenue FROM vip_products WHERE id=${productId} AND active=true AND category='VIP'`)[0];if(!p)return json(res,404,{ok:false,error:'VIP product not found.'});
    const purchaseId=crypto.randomUUID();const ref=`P-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const updated=await sql`UPDATE app_users SET deposit_balance=deposit_balance-${p.price},updated_at=NOW() WHERE id=${userId} AND deposit_balance>=${p.price} RETURNING id`;
    if(!updated.length)return json(res,400,{ok:false,error:`Insufficient deposit balance. ₦${Number(p.price).toLocaleString('en-NG')} is required.`});
    await sql`INSERT INTO product_purchases(id,user_id,product_id,product_name,price,cycle_days,daily_income,total_revenue,status,expires_at) VALUES(${purchaseId},${userId},${p.id},${p.name},${p.price},${p.cycle_days},${p.daily_income},${p.total_revenue},'Active',NOW()+(${p.cycle_days} * INTERVAL '1 day'))`;
    await sql`INSERT INTO transactions(user_id,type,amount,status,reference,detail) VALUES(${userId},'purchase',${p.price},'Completed',${ref},${p.name})`;
    return json(res,200,{ok:true,purchaseId,reference:ref});
  }catch(e){console.error(e);return json(res,500,{ok:false,error:'Purchase could not be recorded.'});}}
