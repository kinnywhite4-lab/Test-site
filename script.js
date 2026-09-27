const pages=[...document.querySelectorAll('.page')];
const navItems=[...document.querySelectorAll('.nav-item')];
const toast=document.getElementById('toast');
let previousPage='home';

const products=[
  {name:'Product 1',category:'VIP',price:3000,cycle:35,daily:900,total:31500,hourly:38},
  {name:'Product 2',category:'VIP',price:5000,cycle:35,daily:1500,total:52500,hourly:63},
  {name:'Product 3',category:'VIP',price:10000,cycle:35,daily:3000,total:105000,hourly:125},
  {name:'Product 4',category:'VIP',price:20000,cycle:40,daily:4200,total:168000,hourly:175},
  {name:'Product 5',category:'VIP',price:30000,cycle:45,daily:6000,total:270000,hourly:250},
  {name:'Product 6',category:'VIP',price:50000,cycle:45,daily:11000,total:495000,hourly:458},
  {name:'Product 7',category:'VIP',price:75000,cycle:50,daily:16500,total:825000,hourly:688},
  {name:'Product 8',category:'VIP',price:100000,cycle:55,daily:23000,total:1265000,hourly:958},
  {name:'Product 9',category:'VIP',price:200000,cycle:60,daily:48000,total:2880000,hourly:2000},
  {name:'Product 10',category:'VIP',price:300000,cycle:60,daily:72000,total:4320000,hourly:3000}
];

const defaultState={
  account:{depositBalance:0,withdrawalBalance:0,dailyReturn:0,commissionReturn:0,totalIncome:0,totalWithdrawn:0},
  purchases:[],
  transactions:[]
};
let state=JSON.parse(localStorage.getItem('novaVestAppState')||'null')||defaultState;
state.account={...defaultState.account,...(state.account||{})};
state.purchases=Array.isArray(state.purchases)?state.purchases:[];
state.transactions=Array.isArray(state.transactions)?state.transactions:[];

function saveState(){localStorage.setItem('novaVestAppState',JSON.stringify(state))}
function money(value){return '₦'+Number(value||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}
function moneyPlain(value){return Number(value||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}
function showPage(name){const target=document.querySelector(`[data-page="${name}"]`);if(!target)return;const current=document.querySelector('.page.active');if(current)previousPage=current.dataset.page;pages.forEach(p=>p.classList.toggle('active',p===target));navItems.forEach(n=>n.classList.toggle('active',n.dataset.nav===name));window.scrollTo({top:0,behavior:'smooth'});document.getElementById('topbarSubtitle').textContent=['home','products','team','profile'].includes(name)?'Welcome back':'Account';if(name==='myProducts')renderMyProducts();if(['transactions','depositHistory','withdrawalHistory'].includes(name))renderHistories()}
function updateBalances(){
  const a=state.account,totalBalance=a.depositBalance+a.withdrawalBalance;
  const values={homeTotalBalance:money(totalBalance),homeDailyReturn:money(a.dailyReturn),homeCommission:money(a.commissionReturn),profileDepositBalance:money(a.depositBalance),profileWithdrawalBalance:money(a.withdrawalBalance),profileTotalIncome:money(a.totalIncome),profileTotalWithdrawn:money(a.totalWithdrawn),depositPageBalance:money(a.depositBalance),withdrawAvailableBalance:money(a.withdrawalBalance)};
  Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value});
}
function formatDate(ts){return new Date(ts).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
function iconFor(type){return {deposit:'＋',withdraw:'↗',income:'↗',commission:'♟',purchase:'▣'}[type]||'↔'}
function titleFor(type){return {deposit:'Deposit',withdraw:'Withdraw',income:'Income',commission:'Commission',purchase:'VIP Product Purchase'}[type]||'Transaction'}
function renderProducts(category='VIP'){
  const list=document.getElementById('productList');if(!list)return;
  const shown=products.filter(p=>p.category==='VIP' && (category==='VIP'||category==='All'));
  list.innerHTML=shown.map(p=>`<article class="product-card product-reference-card">
    <div class="product-image-wrap"><span class="hot-badge">Demo</span><div class="product-image-placeholder"><span>${String(products.indexOf(p)+1).padStart(2,'0')}</span></div></div>
    <div class="product-content"><div class="product-title-row"><h2>${p.name}</h2><strong>${money(p.price)} <small>NGN</small></strong></div>
      <div class="product-metrics"><div><span>Revenue Cycle</span><b>${p.cycle} days</b></div><div><span>Daily income</span><b>${p.daily.toLocaleString('en-NG')}</b></div><div><span>Total revenue</span><b>${p.total.toLocaleString('en-NG')}</b></div><div><span>Hourly income</span><b>${p.hourly.toLocaleString('en-NG')}</b></div></div>
      <button class="full-btn buy-product" data-product-id="${products.indexOf(p)}">Buy it now</button>
    </div></article>`).join('');
}
function purchaseProduct(index){
  const p=products[index];if(!p)return;
  if(state.account.depositBalance<p.price){showToast(`Insufficient deposit balance. ${money(p.price)} is required.`);return}
  state.account.depositBalance-=p.price;
  const purchase={id:'P'+Date.now(),productName:p.name,price:p.price,cycle:p.cycle,daily:p.daily,total:p.total,purchasedAt:Date.now(),status:'Active'};
  state.purchases.unshift(purchase);
  state.transactions.unshift({type:'purchase',amount:p.price,status:'Completed',reference:purchase.id,time:purchase.purchasedAt,detail:p.name});
  saveState();updateBalances();renderMyProducts();showToast(`${p.name} was added to My Products.`);
}
function renderMyProducts(){
  const list=document.getElementById('myProductsList');if(!list)return;
  if(!state.purchases.length){list.innerHTML='<div class="empty-card"><div class="empty-icon">▣</div><p>No VIP products yet</p><small>Products you buy from the VIP Products page will appear here.</small></div>';return}
  list.innerHTML=state.purchases.map(p=>`<article class="owned-product-card"><div class="owned-product-top"><div><span class="status-pill">${p.status}</span><h2>${p.productName}</h2><small>Purchased ${formatDate(p.purchasedAt)}</small></div><strong>${money(p.price)}</strong></div><div class="owned-product-metrics"><div><span>Cycle</span><b>${p.cycle} days</b></div><div><span>Daily income</span><b>${moneyPlain(p.daily)}</b></div><div><span>Total revenue</span><b>${moneyPlain(p.total)}</b></div></div></article>`).join('');
}
function historyRow(t){return `<article class="history-row"><div class="history-icon">${iconFor(t.type)}</div><div class="history-main"><strong>${t.detail||titleFor(t.type)}</strong><small>${formatDate(t.time)}</small><span>${t.reference||''}</span></div><div class="history-amount"><b>${money(t.amount)}</b><small>${t.status||'Completed'}</small></div></article>`}
function renderHistories(filter='all'){
  const all=state.transactions;
  const filtered=filter==='all'?all:all.filter(t=>t.type===filter);
  const make=(id,arr,title,empty)=>{const el=document.getElementById(id);if(!el)return;el.innerHTML=arr.length?`<div class="history-list">${arr.map(historyRow).join('')}</div>`:`<div class="empty-card"><div class="empty-icon">↔</div><p>${empty}</p><small>No records have been created in this demo yet.</small></div>`};
  make('transactionHistoryList',filtered,'','No transaction history');
  make('depositHistoryList',all.filter(t=>t.type==='deposit'),'','No deposits yet');
  make('withdrawalHistoryList',all.filter(t=>t.type==='withdraw'),'','No withdrawals yet');
}

navItems.forEach(item=>item.addEventListener('click',()=>showPage(item.dataset.nav)));
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open]');if(open){showPage(open.dataset.open);return}
  const navTarget=e.target.closest('[data-nav-target]');if(navTarget){showPage(navTarget.dataset.navTarget);return}
  const back=e.target.closest('[data-back]');if(back){showPage(['deposit','withdraw','bank','transactions','depositHistory','withdrawalHistory','myProducts'].includes(previousPage)?'profile':'products');return}
  const toastBtn=e.target.closest('[data-toast]');if(toastBtn){showToast(toastBtn.dataset.toast);return}
  const amount=e.target.closest('.amount');if(amount){document.querySelectorAll('.amount').forEach(a=>a.classList.remove('active'));amount.classList.add('active');document.getElementById('depositAmount').value=amount.textContent.replace(/,/g,'');return}
  const filter=e.target.closest('.filter');if(filter){document.querySelectorAll('.filter').forEach(f=>f.classList.remove('active'));filter.classList.add('active');renderHistories(filter.dataset.historyFilter||'all');return}
  const copy=e.target.closest('[data-action="copy"]');if(copy){const link=document.getElementById('referralLink').textContent;navigator.clipboard?.writeText(link);showToast('Referral link copied.');return}
  const productTab=e.target.closest('.product-tab');if(productTab){document.querySelectorAll('.product-tab').forEach(t=>t.classList.remove('active'));productTab.classList.add('active');renderProducts(productTab.dataset.category);return}
  const buy=e.target.closest('.buy-product');if(buy){purchaseProduct(Number(buy.dataset.productId));return}
});

const saved=JSON.parse(localStorage.getItem('novaBank')||'null');
function renderBank(){if(!saved)return;document.getElementById('savedBankName').textContent=saved.bankName+' • '+saved.accountName;document.getElementById('savedBankAccount').textContent='****'+saved.accountNumber.slice(-4)}
if(saved){document.getElementById('bankName').value=saved.bankName;document.getElementById('accountName').value=saved.accountName;document.getElementById('accountNumber').value=saved.accountNumber;renderBank()}
const saveBankBtn=document.getElementById('saveBank');if(saveBankBtn)saveBankBtn.addEventListener('click',()=>{const bankName=document.getElementById('bankName').value.trim(),accountName=document.getElementById('accountName').value.trim(),accountNumber=document.getElementById('accountNumber').value.trim();if(!bankName||!accountName||!/^[0-9]{10}$/.test(accountNumber)){showToast('Enter a bank name, account name and valid 10-digit account number.');return}localStorage.setItem('novaBank',JSON.stringify({bankName,accountName,accountNumber}));renderBank();showToast('Bank account saved for this demo.');showPage('withdraw')});

const depositBtn=[...document.querySelectorAll('[data-page="deposit"] .full-btn')][0];
if(depositBtn)depositBtn.addEventListener('click',()=>{const input=document.getElementById('depositAmount'),amount=Number(input.value.replace(/,/g,''));if(!amount||amount<=0){showToast('Enter a valid deposit amount.');return}state.account.depositBalance+=amount;state.transactions.unshift({type:'deposit',amount,status:'Completed',reference:'DEP'+Date.now(),time:Date.now(),detail:'Deposit'});saveState();updateBalances();showToast('Demo deposit completed and added to your deposit balance.');input.value='';});
const withdrawBtn=[...document.querySelectorAll('[data-page="withdraw"] .full-btn')][0];
if(withdrawBtn)withdrawBtn.addEventListener('click',()=>{const input=document.getElementById('withdrawAmount'),amount=Number(input.value.replace(/,/g,''));if(!amount||amount<=0){showToast('Enter a valid withdrawal amount.');return}if(amount>state.account.withdrawalBalance){showToast('Withdrawal amount exceeds your available withdrawal balance.');return}state.account.withdrawalBalance-=amount;state.transactions.unshift({type:'withdraw',amount,status:'Pending',reference:'W'+Date.now(),time:Date.now(),detail:'Withdrawal'});saveState();updateBalances();renderHistories();showToast('Withdrawal request recorded as Pending in this demo.');input.value='';});

renderProducts('VIP');renderMyProducts();renderHistories();updateBalances();
