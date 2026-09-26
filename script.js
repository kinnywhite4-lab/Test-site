const pages=[...document.querySelectorAll('.page')];
const navItems=[...document.querySelectorAll('.nav-item')];
const toast=document.getElementById('toast');
let previousPage='home';

function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600)}
function showPage(name){const target=document.querySelector(`[data-page="${name}"]`);if(!target)return;const current=document.querySelector('.page.active');if(current)previousPage=current.dataset.page;pages.forEach(p=>p.classList.toggle('active',p===target));navItems.forEach(n=>n.classList.toggle('active',n.dataset.nav===name));window.scrollTo({top:0,behavior:'smooth'});document.getElementById('topbarSubtitle').textContent=['home','products','team','profile'].includes(name)?'Welcome back':'Account';}

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
});

const saved=JSON.parse(localStorage.getItem('novaBank')||'null');
function renderBank(){if(!saved)return;document.getElementById('savedBankName').textContent=saved.bankName+' • '+saved.accountName;document.getElementById('savedBankAccount').textContent='****'+saved.accountNumber.slice(-4)}
if(saved){document.getElementById('bankName').value=saved.bankName;document.getElementById('accountName').value=saved.accountName;document.getElementById('accountNumber').value=saved.accountNumber;renderBank()}
document.getElementById('saveBank').addEventListener('click',()=>{const bankName=document.getElementById('bankName').value.trim(),accountName=document.getElementById('accountName').value.trim(),accountNumber=document.getElementById('accountNumber').value.trim();if(!bankName||!accountName||!/^\d{10}$/.test(accountNumber)){showToast('Enter a bank name, account name and valid 10-digit account number.');return}localStorage.setItem('novaBank',JSON.stringify({bankName,accountName,accountNumber}));renderBank();showToast('Bank account saved for this demo.');showPage('withdraw')});
