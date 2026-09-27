import { ensureSchema, ensureUser, json, method, sql, num } from './_db.js';
export default async function handler(req,res){
  if(!method(req,res,['POST'])) return;
  try{await ensureSchema();const userId=await ensureUser(req);const amount=num(req.body?.amount);if(!Number.isFinite(amount)||amount<=0)return json(res,400,{ok:false,error:'Enter a valid withdrawal amount.'});
    const bank=await sql`SELECT 1 FROM bank_accounts WHERE user_id=${userId}`;if(!bank.length)return json(res,400,{ok:false,error:'Save a bank account before requesting a withdrawal.'});
    const ref=`W-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const updated=await sql`UPDATE app_users SET withdrawal_balance=withdrawal_balance-${amount},updated_at=NOW() WHERE id=${userId} AND withdrawal_balance>=${amount} RETURNING id`;
    if(!updated.length)return json(res,400,{ok:false,error:'Withdrawal amount exceeds your available withdrawal balance.'});
    await sql`INSERT INTO transactions(user_id,type,amount,status,reference,detail) VALUES(${userId},'withdraw',${amount},'Pending',${ref},'Withdrawal')`;
    return json(res,200,{ok:true,reference:ref,status:'Pending'});
  }catch(e){console.error(e);return json(res,500,{ok:false,error:'Withdrawal could not be recorded.'});}}
