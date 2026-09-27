const pages=[...document.querySelectorAll('.page')];
const navItems=[...document.querySelectorAll('.nav-item')];
const toast=document.getElementById('toast');
let previousPage='home';

const demoAccount={
  depositBalance:0,
  withdrawalBalance:0,
  dailyReturn:0,
  commissionReturn:0,
  totalIncome:0,
  totalWithdrawn:0
};

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

function money(value){return '₦'+Number(value).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}
function showPage(name){const target=document.querySelector(`[data-page="${name}"]`);if(!target)return;const current=document.querySelector('.page.active');if(current)previousPage=current.dataset.page;pages.forEach(p=>p.classList.toggle('active',p===target));navItems.forEach(n=>n.classList.toggle('active',n.dataset.nav===name));window.scrollTo({top:0,behavior:'smooth'});document.getElementById('topbarSubtitle').textContent=['home','products','team','profile'].includes(name)?'Welcome back':'Account';}
function updateBalances(){
  const totalBalance=demoAccount.depositBalance+demoAccount.withdrawalBalance;
  const values={
    homeTotalBalance:money(totalBalance),homeDailyReturn:money(demoAccount.dailyReturn),homeCommission:money(demoAccount.commissionReturn),
    profileDepositBalance:money(demoAccount.depositBalance),profileWithdrawalBalance:money(demoAccount.withdrawalBalance),profileTotalIncome:money(demoAccount.totalIncome),profileTotalWithdrawn:money(demoAccount.totalWithdrawn),
    depositPageBalance:money(demoAccount.depositBalance),withdrawAvailableBalance:money(demoAccount.withdrawalBalance)
  };
  Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.textContent=value});
}

function renderProducts(category='VIP'){
  const list=document.getElementById('productList');
  if(!list)return;
  const shown=products.filter(p=>p.category==='VIP' && (category==='VIP' || category==='All'));
  list.innerHTML=shown.map((p,index)=>`<article class="product-card product-reference-card">
    <div class="product-image-wrap"><span class="hot-badge">Demo</span><div class="product-image-placeholder"><span>${String(products.indexOf(p)+1).padStart(2,'0')}</span></div></div>
    <div class="product-content">
      <div class="product-title-row"><h2>${p.name}</h2><strong>${money(p.price)} <small>NGN</small></strong></div>
      <div class="product-metrics">
        <div><span>Revenue Cycle</span><b>${p.cycle} days</b></div>
        <div><span>Daily income</span><b>${p.daily.toLocaleString('en-NG')}</b></div>
        <div><span>Total revenue</span><b>${p.total.toLocaleString('en-NG')}</b></div>
        <div><span>Hourly income</span><b>${p.hourly.toLocaleString('en-NG')}</b></div>
      </div>
      <button class="full-btn" data-toast="${p.name} is a demo product. Product purchase logic will be connected to the backend/admin settings later.">Buy it now</button>
    </div>
  </article>`).join('');
}

navItems.forEach(item=>item.addEventListener('click',()=>showPage(item.dataset.nav)));
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open]');
  if(open){showPage(open.dataset.open);return}
  const navTarget=e.target.closest('[data-nav-target]');
  if(navTarget){showPage(navTarget.dataset.navTarget);return}
  const back=e.target.closest('[data-back]');
  if(back){showPage(['deposit','withdraw','bank','transactions','depositHistory','withdrawalHistory'].includes(previousPage)?'profile':previousPage);return}
  const toastBtn=e.target.closest('[data-toast]');
  if(toastBtn){showToast(toastBtn.dataset.toast);return}
  const amount=e.target.closest('.amount');
  if(amount){document.querySelectorAll('.amount').forEach(a=>a.classList.remove('active'));amount.classList.add('active');document.getElementById('depositAmount').value=amount.textContent.replace(/,/g,'');return}
  const filter=e.target.closest('.filter');
  if(filter){document.querySelectorAll('.filter').forEach(f=>f.classList.remove('active'));filter.classList.add('active');showToast('Transaction filtering will use live database records later.');return}
  const copy=e.target.closest('[data-action="copy"]');
  if(copy){const link=document.getElementById('referralLink').textContent;navigator.clipboard?.writeText(link);showToast('Referral link copied.');return}
  const productTab=e.target.closest('.product-tab');
  if(productTab){document.querySelectorAll('.product-tab').forEach(t=>t.classList.remove('active'));productTab.classList.add('active');renderProducts(productTab.dataset.category);return}
});

const saved=JSON.parse(localStorage.getItem('novaBank')||'null');
function renderBank(){if(!saved)return;document.getElementById('savedBankName').textContent=saved.bankName+' • '+saved.accountName;document.getElementById('savedBankAccount').textContent='****'+saved.accountNumber.slice(-4)}
if(saved){document.getElementById('bankName').value=saved.bankName;document.getElementById('accountName').value=saved.accountName;document.getElementById('accountNumber').value=saved.accountNumber;renderBank()}
document.getElementById('saveBank').addEventListener('click',()=>{const bankName=document.getElementById('bankName').value.trim(),accountName=document.getElementById('accountName').value.trim(),accountNumber=document.getElementById('accountNumber').value.trim();if(!bankName||!accountName||!/^[0-9]{10}$/.test(accountNumber)){showToast('Enter a bank name, account name and valid 10-digit account number.');return}localStorage.setItem('novaBank',JSON.stringify({bankName,accountName,accountNumber}));renderBank();showToast('Bank account saved for this demo.');showPage('withdraw')});

renderProducts('VIP');
updateBalances();
