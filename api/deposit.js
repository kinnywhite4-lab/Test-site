import { ensureSchema, ensureUser, json, method, sql, num } from './_db.js';
export default async function handler(req,res){
  if(!method(req,res,['POST'])) return;
  try{await ensureSchema();const userId=await ensureUser(req);const amount=num(req.body?.amount);if(!Number.isFinite(amount)||amount<=0) return json(res,400,{ok:false,error:'Enter a valid deposit amount.'});
    const ref=`DEP-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    await sql`UPDATE app_users SET deposit_balance=deposit_balance+${amount},updated_at=NOW() WHERE id=${userId}`;
    await sql`INSERT INTO transactions(user_id,type,amount,status,reference,detail) VALUES(${userId},'deposit',${amount},'Completed',${ref},'Deposit')`;
    return json(res,200,{ok:true,reference:ref});
  }catch(e){console.error(e);return json(res,500,{ok:false,error:'Deposit could not be recorded.'});}}
