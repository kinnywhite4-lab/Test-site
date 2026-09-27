/* =========================================================
   NOVAVEST - APPLICATION LOGIC
   Frontend persistence layer for the current prototype.
   ========================================================= */

const STORAGE_KEY = "novavest_app_v1";

const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll(".nav-item")];
const toast = document.getElementById("toast");

let previousPage = "home";

const products = [
  {id:"vip-1",name:"Product 1",category:"VIP",price:3000,cycle:35,daily:900,total:31500,hourly:38},
  {id:"vip-2",name:"Product 2",category:"VIP",price:5000,cycle:35,daily:1500,total:52500,hourly:63},
  {id:"vip-3",name:"Product 3",category:"VIP",price:10000,cycle:35,daily:3000,total:105000,hourly:125},
  {id:"vip-4",name:"Product 4",category:"VIP",price:20000,cycle:40,daily:4200,total:168000,hourly:175},
  {id:"vip-5",name:"Product 5",category:"VIP",price:30000,cycle:45,daily:6000,total:270000,hourly:250},
  {id:"vip-6",name:"Product 6",category:"VIP",price:50000,cycle:45,daily:11000,total:495000,hourly:458},
  {id:"vip-7",name:"Product 7",category:"VIP",price:75000,cycle:50,daily:16500,total:825000,hourly:688},
  {id:"vip-8",name:"Product 8",category:"VIP",price:100000,cycle:55,daily:23000,total:1265000,hourly:958},
  {id:"vip-9",name:"Product 9",category:"VIP",price:200000,cycle:60,daily:48000,total:2880000,hourly:2000},
  {id:"vip-10",name:"Product 10",category:"VIP",price:300000,cycle:60,daily:72000,total:4320000,hourly:3000}
];

const defaultState = {
  account:{
    name:"Nova User",email:"demo@example.com",referralCode:"NOVA-123456",
    depositBalance:0,withdrawalBalance:0,dailyReturn:0,
    commissionReturn:0,totalIncome:0,totalWithdrawn:0
  },
  bank:null,products:[],deposits:[],withdrawals:[],transactions:[],
  giftCodes:[],level1:[],level2:[],
  settings:{minimumWithdrawal:1500}
};

function cloneDefault(){ return JSON.parse(JSON.stringify(defaultState)); }

function loadState(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    if(!saved) return cloneDefault();
    const p=JSON.parse(saved);
    const d=cloneDefault();
    return {...d,...p,
      account:{...d.account,...(p.account||{})},
      settings:{...d.settings,...(p.settings||{})}
    };
  }catch(e){ console.error(e); return cloneDefault(); }
}
let state=loadState();

function saveState(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }

function money(v){
  return "₦"+Number(v||0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function numberValue(v){
  return Number(String(v||"").replace(/₦/g,"").replace(/,/g,"").trim());
}
function dateText(v){
  return new Date(v).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"});
}
function escapeHtml(v){
  return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function showToast(message){
  if(!toast)return;
  toast.textContent=message; toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove("show"),2600);
}

function showPage(name){
  const target=document.querySelector(`[data-page="${name}"]`);
  if(!target){showToast("This page is not available.");return;}
  const current=document.querySelector(".page.active");
  if(current&&current.dataset.page!==name) previousPage=current.dataset.page;
  pages.forEach(p=>p.classList.toggle("active",p===target));
  navItems.forEach(i=>i.classList.toggle("active",i.dataset.nav===name));
  document.getElementById("topbarSubtitle").textContent=
    ["home","products","team","profile"].includes(name)?"Welcome back":"Account";
  window.scrollTo({top:0,behavior:"smooth"});
  renderCurrentPage(name);
}
function goBack(){ showPage(["deposit","withdraw","bank","transactions","depositHistory","withdrawalHistory","giftCode"].includes(previousPage)?"profile":(previousPage||"home")); }

function updateBalances(){
  const total=Number(state.account.depositBalance||0)+Number(state.account.withdrawalBalance||0);
  const values={
    homeTotalBalance:money(total),homeDailyReturn:money(state.account.dailyReturn),
    homeCommission:money(state.account.commissionReturn),
    profileDepositBalance:money(state.account.depositBalance),
    profileWithdrawalBalance:money(state.account.withdrawalBalance),
    profileTotalIncome:money(state.account.totalIncome),
    profileTotalWithdrawn:money(state.account.totalWithdrawn),
    depositPageBalance:money(state.account.depositBalance),
    withdrawAvailableBalance:money(state.account.withdrawalBalance)
  };
  Object.entries(values).forEach(([id,val])=>{const e=document.getElementById(id);if(e)e.textContent=val;});
}

function addTransaction(type,amount,description,extra={}){
  const tx={id:"TX-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),
    type,amount:Number(amount||0),description,status:extra.status||"Completed",
    createdAt:new Date().toISOString(),...extra};
  state.transactions.unshift(tx); return tx;
}

function processDeposit(){
  const input=document.getElementById("depositAmount");
  const amount=numberValue(input?.value);
  if(!amount||amount<=0){showToast("Enter a valid deposit amount.");return;}
  const deposit={id:"DEP-"+Date.now(),amount,channel:"Deposit Channel 1",status:"Completed",createdAt:new Date().toISOString()};
  state.deposits.unshift(deposit);
  state.account.depositBalance+=amount;
  addTransaction("Deposit",amount,"Account deposit",{reference:deposit.id,status:deposit.status});
  saveState(); updateBalances(); renderDepositHistory(); renderTransactions();
  if(input)input.value="";
  document.querySelectorAll(".amount").forEach(b=>b.classList.remove("active"));
  showToast(`Deposit of ${money(amount)} recorded.`);
}

function processWithdrawal(){
  const input=document.getElementById("withdrawAmount");
  const amount=numberValue(input?.value);
  const available=Number(state.account.withdrawalBalance||0);
  if(!amount||amount<=0){showToast("Enter a valid withdrawal amount.");return;}
  if(amount>available){showToast(`Insufficient withdrawal balance. Available: ${money(available)}`);return;}
  if(amount<Number(state.settings.minimumWithdrawal||0)){showToast(`Minimum withdrawal is ${money(state.settings.minimumWithdrawal)}.`);return;}
  if(!state.bank){showToast("Please save your bank account first.");showPage("bank");return;}
  const withdrawal={
    id:"WTH-"+Date.now(),amount,bankName:state.bank.bankName,
    accountName:state.bank.accountName,accountNumber:state.bank.accountNumber,
    status:"Pending",createdAt:new Date().toISOString()
  };
  state.account.withdrawalBalance-=amount;
  state.withdrawals.unshift(withdrawal);
  addTransaction("Withdrawal",amount,"Withdrawal request",{reference:withdrawal.id,status:withdrawal.status});
  saveState(); updateBalances(); renderWithdrawalHistory(); renderTransactions();
  if(input)input.value="";
  showToast(`Withdrawal request of ${money(amount)} submitted.`);
}

function isProductPurchased(id){return state.products.some(p=>p.productId===id);}

function purchaseProduct(id){
  const product=products.find(p=>p.id===id);
  if(!product){showToast("Product not found.");return;}
  if(isProductPurchased(id)){showToast("You already purchased this product.");return;}
  const available=Number(state.account.depositBalance||0);
  if(available<product.price){showToast(`Insufficient deposit balance. You need ${money(product.price)}.`);showPage("deposit");return;}
  state.account.depositBalance-=product.price;
  const purchase={id:"PUR-"+Date.now(),productId:product.id,productName:product.name,
    category:product.category,price:product.price,cycle:product.cycle,daily:product.daily,
    total:product.total,purchasedAt:new Date().toISOString(),status:"Active"};
  state.products.unshift(purchase);
  addTransaction("Product",product.price,`${product.name} purchase`,{reference:purchase.id,status:"Completed"});
  saveState(); updateBalances(); renderProducts();
  showToast(`${product.name} purchased successfully.`);
}

function renderProducts(category="VIP"){
  const list=document.getElementById("productList"); if(!list)return;
  const shown=products.filter(p=>p.category==="VIP"&&(category==="VIP"||category==="All"));
  list.innerHTML=shown.map((p,i)=>{
    const purchased=isProductPurchased(p.id);
    return `<article class="product-card product-reference-card">
      <div class="product-image-wrap"><span class="hot-badge">${purchased?"Purchased":"VIP"}</span>
      <div class="product-image-placeholder"><span>${String(i+1).padStart(2,"0")}</span></div></div>
      <div class="product-content"><div class="product-title-row"><h2>${escapeHtml(p.name)}</h2>
      <strong>${money(p.price)} <small>NGN</small></strong></div>
      <div class="product-metrics">
      <div><span>Revenue Cycle</span><b>${p.cycle} days</b></div>
      <div><span>Daily income</span><b>${Number(p.daily).toLocaleString("en-NG")}</b></div>
      <div><span>Total revenue</span><b>${Number(p.total).toLocaleString("en-NG")}</b></div>
      <div><span>Hourly income</span><b>${Number(p.hourly).toLocaleString("en-NG")}</b></div>
      </div><button class="full-btn" data-buy-product="${p.id}" ${purchased?"disabled":""}>${purchased?"Purchased":"Buy it now"}</button></div>
    </article>`;
  }).join("");
}

function renderBank(){
  const name=document.getElementById("savedBankName"),account=document.getElementById("savedBankAccount");
  if(!name||!account)return;
  if(!state.bank){name.textContent="No bank saved";account.textContent="Add a bank account in Profile → Bank";return;}
  name.textContent=`${state.bank.bankName} • ${state.bank.accountName}`;
  account.textContent="****"+String(state.bank.accountNumber).slice(-4);
}
function loadBankForm(){
  if(!state.bank)return;
  const a=document.getElementById("bankName"),b=document.getElementById("accountName"),c=document.getElementById("accountNumber");
  if(a)a.value=state.bank.bankName;if(b)b.value=state.bank.accountName;if(c)c.value=state.bank.accountNumber;
}
function saveBank(){
  const bankName=document.getElementById("bankName")?.value.trim();
  const accountName=document.getElementById("accountName")?.value.trim();
  const accountNumber=document.getElementById("accountNumber")?.value.trim();
  if(!bankName||!accountName){showToast("Complete all bank details.");return;}
  if(!/^[0-9]{10}$/.test(accountNumber)){showToast("Enter a valid 10-digit account number.");return;}
  state.bank={bankName,accountName,accountNumber,updatedAt:new Date().toISOString()};
  saveState();renderBank();showToast("Bank account saved.");showPage("withdraw");
}

function redeemGiftCode(){
  const input=document.getElementById("giftCodeInput"); if(!input)return;
  const code=input.value.trim().toUpperCase();
  const demoCodes={WELCOME1000:1000,NOVA500:500,BONUS1500:1500};
  if(!code){showToast("Enter a gift code.");return;}
  if(!demoCodes[code]){showToast("Invalid or expired gift code.");return;}
  if(state.giftCodes.includes(code)){showToast("This gift code has already been used.");return;}
  const amount=demoCodes[code];
  state.giftCodes.push(code);
  state.account.withdrawalBalance+=amount;
  state.account.totalIncome+=amount;
  addTransaction("Gift Code",amount,`Gift code ${code} redeemed`,{status:"Completed"});
  saveState();updateBalances();renderTransactions();input.value="";
  showToast(`${money(amount)} added to withdrawal balance.`);
}

function getReferralLink(){return `${window.location.origin}/?ref=${state.account.referralCode}`;}
function renderReferral(){
  const link=document.getElementById("referralLink");if(link)link.textContent=getReferralLink();
  const code=document.querySelector(".referral-card strong");if(code)code.textContent=state.account.referralCode;
  const l1=document.getElementById("level1List"),l2=document.getElementById("level2List");
  if(l1)l1.innerHTML=state.level1.length?state.level1.map(m=>`<div class="team-member"><strong>${escapeHtml(m.name)}</strong><small>Joined ${dateText(m.joinedAt)}</small></div>`).join(""):`<div class="empty-card compact"><div class="empty-icon">1</div><p>No Level 1 members</p><small>People you refer directly will appear here.</small></div>`;
  if(l2)l2.innerHTML=state.level2.length?state.level2.map(m=>`<div class="team-member"><strong>${escapeHtml(m.name)}</strong><small>Joined ${dateText(m.joinedAt)}</small></div>`).join(""):`<div class="empty-card compact"><div class="empty-icon">2</div><p>No Level 2 members</p><small>Members referred by your Level 1 team will appear here.</small></div>`;
  const pills=document.querySelectorAll(".count-pill");if(pills[0])pills[0].textContent=`${state.level1.length} member${state.level1.length===1?"":"s"}`;if(pills[1])pills[1].textContent=`${state.level2.length} member${state.level2.length===1?"":"s"}`;
}
async function copyReferralLink(){const link=getReferralLink();try{await navigator.clipboard.writeText(link);showToast("Referral link copied.");}catch{showToast(link);}}

function historyEmpty(icon,title,sub){return `<div class="empty-card"><div class="empty-icon">${icon}</div><p>${title}</p><small>${sub}</small></div>`;}

function renderDepositHistory(){
  const page=document.querySelector('[data-page="depositHistory"]');if(!page)return;
  const html=state.deposits.length?`<div class="history-list">${state.deposits.map(d=>`<div class="history-item"><div><strong>${money(d.amount)}</strong><small>${escapeHtml(d.channel)}</small><small>${dateText(d.createdAt)}</small></div><span class="status completed">${escapeHtml(d.status)}</span></div>`).join("")}</div>`:historyEmpty("＋","No deposits yet","Deposit records will appear here.");
  const old=page.querySelector(".history-list,.empty-card");if(old)old.outerHTML=html;
}
function renderWithdrawalHistory(){
  const page=document.querySelector('[data-page="withdrawalHistory"]');if(!page)return;
  const html=state.withdrawals.length?`<div class="history-list">${state.withdrawals.map(w=>`<div class="history-item"><div><strong>${money(w.amount)}</strong><small>${escapeHtml(w.bankName)}</small><small>****${String(w.accountNumber).slice(-4)}</small><small>${dateText(w.createdAt)}</small></div><span class="status ${w.status.toLowerCase()}">${escapeHtml(w.status)}</span></div>`).join("")}</div>`:historyEmpty("↗","No withdrawals yet","Withdrawal records will appear here.");
  const old=page.querySelector(".history-list,.empty-card");if(old)old.outerHTML=html;
}
function renderTransactions(filter="All"){
  const page=document.querySelector('[data-page="transactions"]');if(!page)return;
  const arr=filter==="All"?state.transactions:state.transactions.filter(t=>t.type===filter);
  const html=arr.length?`<div class="history-list">${arr.map(t=>`<div class="history-item"><div><strong>${escapeHtml(t.type)} · ${money(t.amount)}</strong><small>${escapeHtml(t.description)}</small><small>${dateText(t.createdAt)}</small></div><span class="status ${t.status.toLowerCase()}">${escapeHtml(t.status)}</span></div>`).join("")}</div>`:historyEmpty("↔","No transaction history","Transactions will appear here when account activity is recorded.");
  const old=page.querySelector(".history-list,.empty-card");if(old)old.outerHTML=html;
}

function selectDepositAmount(button){
  document.querySelectorAll(".amount").forEach(b=>b.classList.remove("active"));
  button.classList.add("active");
  const input=document.getElementById("depositAmount");if(input)input.value=button.textContent.replace(/,/g,"");
}

function renderCurrentPage(name){
  updateBalances();
  if(name==="products")renderProducts("VIP");
  if(name==="team")renderReferral();
  if(name==="profile")renderBank();
  if(name==="withdraw")renderBank();
  if(name==="bank")loadBankForm();
  if(name==="transactions")renderTransactions("All");
  if(name==="depositHistory")renderDepositHistory();
  if(name==="withdrawalHistory")renderWithdrawalHistory();
}

document.addEventListener("click",event=>{
  const nav=event.target.closest("[data-nav]");if(nav){showPage(nav.dataset.nav);return;}
  const open=event.target.closest("[data-open]");if(open){showPage(open.dataset.open);return;}
  const target=event.target.closest("[data-nav-target]");if(target){showPage(target.dataset.navTarget);return;}
  const back=event.target.closest("[data-back]");if(back){goBack();return;}
  const amount=event.target.closest(".amount");if(amount){selectDepositAmount(amount);return;}
  const buy=event.target.closest("[data-buy-product]");if(buy&&!buy.disabled){purchaseProduct(buy.dataset.buyProduct);return;}
  const copy=event.target.closest('[data-action="copy"]');if(copy){copyReferralLink();return;}
  const tab=event.target.closest(".product-tab");if(tab){document.querySelectorAll(".product-tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");renderProducts(tab.dataset.category);return;}
  const filter=event.target.closest(".filter");if(filter){document.querySelectorAll(".filter").forEach(f=>f.classList.remove("active"));filter.classList.add("active");renderTransactions(filter.textContent.trim());return;}
  if(event.target.closest('[data-action="deposit"]')){processDeposit();return;}
  if(event.target.closest('[data-action="withdraw"]')){processWithdrawal();return;}
  if(event.target.closest('[data-action="gift-code"]')){redeemGiftCode();return;}
  if(event.target.closest('[data-action="notifications"]')){showToast("No new notifications.");return;}
  if(event.target.closest('[data-action="security"]')){showToast("Security settings will be connected to account authentication.");return;}
});

document.getElementById("saveBank")?.addEventListener("click",saveBank);

renderProducts("VIP");
renderBank();
renderReferral();
renderDepositHistory();
renderWithdrawalHistory();
renderTransactions("All");
updateBalances();
