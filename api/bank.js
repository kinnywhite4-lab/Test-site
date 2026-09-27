import { ensureSchema, ensureUser, json, method, sql } from './_db.js';
export default async function handler(req,res){
  if(!method(req,res,['GET','POST']))return;
  try{await ensureSchema();const userId=await ensureUser(req);
    if(req.method==='GET'){const r=await sql`SELECT bank_name,account_name,account_number,updated_at FROM bank_accounts WHERE user_id=${userId}`;return json(res,200,{ok:true,bank:r[0]||null});}
    const {bankName='',accountName='',accountNumber=''}=req.body||{};if(!bankName.trim()||!accountName.trim()||!/^[0-9]{10}$/.test(String(accountNumber)))return json(res,400,{ok:false,error:'Enter a bank name, account name and valid 10-digit account number.'});
    await sql`INSERT INTO bank_accounts(user_id,bank_name,account_name,account_number) VALUES(${userId},${bankName.trim()},${accountName.trim()},${accountNumber}) ON CONFLICT(user_id) DO UPDATE SET bank_name=EXCLUDED.bank_name,account_name=EXCLUDED.account_name,account_number=EXCLUDED.account_number,updated_at=NOW()`;
    return json(res,200,{ok:true});
  }catch(e){console.error(e);return json(res,500,{ok:false,error:'Bank account could not be saved.'});}}
