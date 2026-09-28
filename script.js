let currentUser = null;
let currentBank = null;
let userPurchases = [];
let userDeposits = [];
let userWithdrawals = [];
let userTransactions = [];
let availableChannels = [];
let selectedChannel = null;

const VIP_PRODUCTS = [
  { id: 'vip-1', name: 'VIP 1 Equipment', price: 3000, daily_income: 450, period_days: 30 },
  { id: 'vip-2', name: 'VIP 2 Equipment', price: 7000, daily_income: 1100, period_days: 30 },
  { id: 'vip-3', name: 'VIP 3 Equipment', price: 15000, daily_income: 2500, period_days: 30 },
  { id: 'vip-4', name: 'VIP 4 Equipment', price: 35000, daily_income: 6300, period_days: 30 },
  { id: 'vip-5', name: 'VIP 5 Equipment', price: 80000, daily_income: 15200, period_days: 30 },
  { id: 'vip-6', name: 'VIP 6 Equipment', price: 180000, daily_income: 36000, period_days: 30 }
];

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = toast.className.replace('show', '');
  }, 3000);
}

function formatCurrency(amount) {
  return '₦' + parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

  const targetSec = document.getElementById(`view-${viewName}`);
  const targetBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);

  if (targetSec) targetSec.classList.add('active');
  if (targetBtn) targetBtn.classList.add('active');
}

// Back navigation buttons
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.back);
  });
});

async function fetchAPI(url, options = {}) {
  options.headers = options.headers || {};
  if (options.body && typeof options.body === 'object') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const localToken = localStorage.getItem('nv_token');
  if (localToken) {
    options.headers['Authorization'] = `Bearer ${localToken}`;
  }
  options.credentials = 'same-origin';

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong.');
    error.code = data.code;
    throw error;
  }
  return data;
}

// Render Dashboard Data
function renderDashboard() {
  if (!currentUser) return;

  document.getElementById('home-balance').innerText = formatCurrency(currentUser.balance);
  document.getElementById('home-withdrawable').innerText = formatCurrency(currentUser.withdrawable_balance);
  document.getElementById('home-income').innerText = formatCurrency(currentUser.total_income);

  document.getElementById('profile-phone').innerText = currentUser.phone_number;
  document.getElementById('prof-income').innerText = formatCurrency(currentUser.total_income);
  document.getElementById('prof-withdrawn').innerText = formatCurrency(currentUser.total_withdrawn);

  document.getElementById('team-ref-code').innerText = currentUser.referral_code || '------';

  renderHomeProducts();
  renderMyProducts();
}

async function renderHomeProducts() {
  const container = document.getElementById('home-product-list');
  if (!container) return;

  let products = VIP_PRODUCTS;
  try {
    const data = await fetchAPI('/api/purchase?action=catalog');
    if (data.products && data.products.length > 0) {
      products = data.products;
    }
  } catch {}

  container.innerHTML = products.map(prod => `
    <div class="product-card">
      <div class="product-info">
        <h4>${prod.name}</h4>
        <div class="product-spec">Daily Income: <strong>${formatCurrency(prod.daily_income || prod.daily)}</strong></div>
        <div class="product-spec">Cycle: <strong>${prod.period_days || prod.days} Days</strong></div>
        <div class="product-price">Price: ${formatCurrency(prod.price)}</div>
      </div>
      <button class="btn btn-primary btn-sm btn-buy" data-id="${prod.id}">Buy Now</button>
    </div>
  `).join('');

  container.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', () => buyProduct(btn.dataset.id));
  });
}

function renderMyProducts() {
  const container = document.getElementById('my-product-list');
  if (!container) return;
  if (!userPurchases.length) {
    container.innerHTML = '<div class="empty-state">No equipment currently active.</div>';
    return;
  }

  container.innerHTML = userPurchases.map(p => `
    <div class="product-card">
      <div class="product-info">
        <h4>${p.product_name}</h4>
        <div class="product-spec">Cost: <strong>${formatCurrency(p.price)}</strong></div>
        <div class="product-spec">Daily Return: <strong>${formatCurrency(p.daily_income)}</strong></div>
        <div class="product-spec">Status: <span class="badge-active">${p.status}</span></div>
      </div>
    </div>
  `).join('');
}

async function buyProduct(productId) {
  try {
    const res = await fetchAPI('/api/purchase', {
      method: 'POST',
      body: { productId }
    });
    showToast(res.message);
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
    if (err.code === 'INSUFFICIENT_BALANCE') {
      setTimeout(() => openRechargePage(), 1000);
    }
  }
}

// Dedicated Recharge Flow
async function openRechargePage() {
  switchView('recharge');
  try {
    const data = await fetchAPI('/api/deposit?action=channels');
    availableChannels = data.channels || [];
    renderChannels();
  } catch {
    showToast('Failed to load channels.');
  }
}

function renderChannels() {
  const container = document.getElementById('payment-channels-list');
  if (!container) return;

  if (!availableChannels.length) {
    container.innerHTML = '<p class="field-hint">No payment channels active right now.</p>';
    return;
  }

  container.innerHTML = availableChannels.map((c, idx) => `
    <div class="channel-option ${idx === 0 ? 'active' : ''}" data-id="${c.id}">
      <div class="chan-left">
        <i class="fa-solid fa-credit-card"></i>
        <span>${c.name}</span>
      </div>
      <div class="radio-circle"></div>
    </div>
  `).join('');

  selectChannel(availableChannels[0].id);

  container.querySelectorAll('.channel-option').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.channel-option').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      selectChannel(parseInt(el.dataset.id, 10));
    });
  });
}

function selectChannel(channelId) {
  selectedChannel = availableChannels.find(c => c.id === channelId);
  const card = document.getElementById('channel-details-box');
  if (!selectedChannel) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  document.getElementById('det-bank-name').innerText = selectedChannel.bank_name;
  document.getElementById('det-acc-name').innerText = selectedChannel.account_name;
  document.getElementById('det-acc-number').innerText = selectedChannel.account_number;
  document.getElementById('det-instructions').innerText = selectedChannel.instructions || '';
}

const copyAccBtn = document.getElementById('btn-copy-account');
if (copyAccBtn) {
  copyAccBtn.addEventListener('click', () => {
    if (!selectedChannel) return;
    navigator.clipboard.writeText(selectedChannel.account_number).then(() => {
      showToast('Account number copied!');
    });
  });
}

document.querySelectorAll('.amount-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('recharge-amount-input').value = btn.dataset.amt;
  });
});

const confirmRechargeBtn = document.getElementById('btn-confirm-recharge');
if (confirmRechargeBtn) {
  confirmRechargeBtn.addEventListener('click', async () => {
    const amount = document.getElementById('recharge-amount-input').value;
    const sender_name = document.getElementById('recharge-sender-name').value;

    if (!selectedChannel) {
      return showToast('Please select a payment channel.');
    }

    try {
      const res = await fetchAPI('/api/deposit', {
        method: 'POST',
        body: {
          amount,
          channel_id: selectedChannel.id,
          sender_name
        }
      });

      showToast(res.message);
      document.getElementById('recharge-sender-name').value = '';
      await loadInitialData();
      switchView('home');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openWithdrawPage() {
  document.getElementById('withdraw-available-bal').innerText = formatCurrency(currentUser.withdrawable_balance);
  const bankBox = document.getElementById('withdraw-bank-summary');

  if (!currentBank) {
    bankBox.innerHTML = `
      <p style="color: var(--danger);">No bank account linked.</p>
      <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" id="btn-goto-add-bank">Add Bank Account</button>
    `;
    const addBtn = document.getElementById('btn-goto-add-bank');
    if (addBtn) addBtn.onclick = () => switchView('bank-card');
  } else {
    const masked = currentBank.account_number.substring(0, 3) + '****' + currentBank.account_number.substring(7);
    bankBox.innerHTML = `
      <div><strong>Bank:</strong> ${currentBank.bank_name}</div>
      <div><strong>Account Name:</strong> ${currentBank.account_name}</div>
      <div><strong>Account Number:</strong> ${masked}</div>
    `;
  }
  switchView('withdrawal');
}

const submitWithdrawBtn = document.getElementById('btn-submit-withdraw');
if (submitWithdrawBtn) {
  submitWithdrawBtn.addEventListener('click', async () => {
    const amount = document.getElementById('input-withdraw-amount').value;
    try {
      const res = await fetchAPI('/api/withdraw', {
        method: 'POST',
        body: { amount }
      });
      showToast(res.message);
      document.getElementById('input-withdraw-amount').value = '';
      await loadInitialData();
      switchView('home');
    } catch (err) {
      showToast(err.message);
    }
  });
}

const bankForm = document.getElementById('form-dedicated-bank');
if (bankForm) {
  bankForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bank_name = document.getElementById('bank-input-name').value;
    const account_number = document.getElementById('bank-input-number').value;
    const account_name = document.getElementById('bank-input-holder').value;

    try {
      const res = await fetchAPI('/api/bank', {
        method: 'POST',
        body: { bank_name, account_number, account_name }
      });
      showToast(res.message);
      await loadInitialData();
      switchView('profile');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function renderDedicatedHistory(title, items, type) {
  document.getElementById('history-page-title').innerText = title;
  const container = document.getElementById('history-page-items');

  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state">No transaction records found.</div>';
  } else {
    container.innerHTML = items.map(it => {
      let statusClass = 'badge-pending';
      const status = it.status || 'Approved';
      if (status === 'Approved') statusClass = 'badge-approved';
      if (status === 'Declined') statusClass = 'badge-declined';

      let amountClass = 'in';
      let sign = '+';
      let titleText = it.title || it.channel_name || it.bank_name || 'Transaction';

      if (type === 'withdraw' || it.direction === 'out') {
        amountClass = 'out';
        sign = '-';
      }

      return `
        <div class="history-item">
          <div>
            <div class="item-title">
              ${titleText}
              <span class="item-badge ${statusClass}">${status}</span>
            </div>
            <div class="item-date">${new Date(it.created_at).toLocaleString()}</div>
          </div>
          <div class="item-amount ${amountClass}">
            ${sign}${formatCurrency(it.amount)}
          </div>
        </div>
      `;
    }).join('');
  }
  switchView('history');
}

async function loadInitialData() {
  try {
    const data = await fetchAPI('/api/bootstrap');
    currentUser = data.user;
    currentBank = data.bank;
    userPurchases = data.purchases || [];
    userDeposits = data.deposits || [];
    userWithdrawals = data.withdrawals || [];
    userTransactions = data.transactions || [];

    if (currentBank) {
      const bName = document.getElementById('bank-input-name');
      const bNum = document.getElementById('bank-input-number');
      const bHold = document.getElementById('bank-input-holder');
      if (bName) bName.value = currentBank.bank_name || '';
      if (bNum) bNum.value = currentBank.account_number || '';
      if (bHold) bHold.value = currentBank.account_name || '';
    }

    renderDashboard();

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    const impersonationBar = document.getElementById('impersonation-bar');
    if (impersonationBar) {
      if (localStorage.getItem('nv_admin_key')) {
        impersonationBar.style.display = 'flex';
      } else {
        impersonationBar.style.display = 'none';
      }
    }

    loadTeam();
  } catch (err) {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }
}

async function loadTeam() {
  try {
    const data = await fetchAPI('/api/team');
    const teamCountEl = document.getElementById('team-count');
    if (teamCountEl) teamCountEl.innerText = data.team_count || 0;
    
    const list = document.getElementById('team-members-list');
    if (!list) return;

    if (!data.members || !data.members.length) {
      list.innerHTML = '<div class="empty-state">No team members invited yet.</div>';
      return;
    }
    list.innerHTML = data.members.map(m => `
      <div class="history-item">
        <div>
          <div class="item-title">${m.phone_number}</div>
          <div class="item-date">${new Date(m.created_at).toLocaleDateString()}</div>
        </div>
        <div class="item-amount in">+${formatCurrency(m.total_income)}</div>
      </div>
    `).join('');
  } catch {}
}

const btnRecharge = document.getElementById('btn-nav-recharge');
if (btnRecharge) btnRecharge.addEventListener('click', openRechargePage);

const btnWithdraw = document.getElementById('btn-nav-withdraw');
if (btnWithdraw) btnWithdraw.addEventListener('click', openWithdrawPage);

const btnBank = document.getElementById('btn-nav-bank');
if (btnBank) btnBank.addEventListener('click', () => switchView('bank-card'));

const btnGift = document.getElementById('btn-nav-gift');
if (btnGift) {
  btnGift.addEventListener('click', () => {
    const modal = document.getElementById('modal-gift');
    if (modal) modal.classList.add('open');
  });
}

const menuBank = document.getElementById('menu-bank-card');
if (menuBank) menuBank.addEventListener('click', () => switchView('bank-card'));

const menuDep = document.getElementById('menu-dep-history');
if (menuDep) {
  menuDep.addEventListener('click', async () => {
    try {
      const res = await fetchAPI('/api/deposit');
      renderDedicatedHistory('Deposit History', res.deposits, 'deposit');
    } catch {
      renderDedicatedHistory('Deposit History', userDeposits, 'deposit');
    }
  });
}

const menuWith = document.getElementById('menu-with-history');
if (menuWith) {
  menuWith.addEventListener('click', async () => {
    try {
      const res = await fetchAPI('/api/withdraw');
      renderDedicatedHistory('Withdrawal History', res.withdrawals, 'withdraw');
    } catch {
      renderDedicatedHistory('Withdrawal History', userWithdrawals, 'withdraw');
    }
  });
}

const menuTx = document.getElementById('menu-tx-history');
if (menuTx) {
  menuTx.addEventListener('click', async () => {
    try {
      const res = await fetchAPI('/api/transactions');
      renderDedicatedHistory('Transaction History', res.transactions, 'tx');
    } catch {
      renderDedicatedHistory('Transaction History', userTransactions, 'tx');
    }
  });
}

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  });
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
  });
});

const copyCodeBtn = document.getElementById('btn-copy-code');
if (copyCodeBtn) {
  copyCodeBtn.addEventListener('click', () => {
    if (!currentUser || !currentUser.referral_code) return;
    const link = `${window.location.origin}?ref=${currentUser.referral_code}`;
    navigator.clipboard.writeText(link).then(() => {
      showToast('Referral link copied to clipboard!');
    });
  });
}

const returnBtn = document.getElementById('btn-return-admin');
if (returnBtn) {
  returnBtn.addEventListener('click', () => {
    window.location.href = '/admin.html';
  });
}

const showRegLink = document.getElementById('link-show-register');
if (showRegLink) {
  showRegLink.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-subtitle').innerText = 'Create your account';
  });
}

const showLoginLink = document.getElementById('link-show-login');
if (showLoginLink) {
  showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('auth-subtitle').innerText = 'Log in to your account';
  });
}

const regForm = document.getElementById('register-form');
if (regForm) {
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm-password').value;
    const ref = new URLSearchParams(window.location.search).get('ref') || '';

    try {
      const res = await fetchAPI('/api/auth?action=register', {
        method: 'POST',
        body: { phone_number: phone, password, confirm_password: confirm, ref }
      });
      if (res.token) localStorage.setItem('nv_token', res.token);
      showToast('Registration successful!');
      await loadInitialData();
    } catch (err) {
      showToast(err.message);
    }
  });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetchAPI('/api/auth?action=login', {
        method: 'POST',
        body: { phone_number: phone, password }
      });
      if (res.token) localStorage.setItem('nv_token', res.token);
      showToast('Login successful!');
      await loadInitialData();
    } catch (err) {
      showToast(err.message);
    }
  });
}

const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    localStorage.removeItem('nv_token');
    try { await fetchAPI('/api/auth?action=logout'); } catch {}
    window.location.reload();
  });
}

loadInitialData();
