const VIP_PRODUCTS_LIST = [
  { id: 'vip-1', name: 'VIP 1 Equipment', price: 3000, daily: 450, days: 30 },
  { id: 'vip-2', name: 'VIP 2 Equipment', price: 7000, daily: 1100, days: 30 },
  { id: 'vip-3', name: 'VIP 3 Equipment', price: 15000, daily: 2500, days: 30 },
  { id: 'vip-4', name: 'VIP 4 Equipment', price: 35000, daily: 6300, days: 30 },
  { id: 'vip-5', name: 'VIP 5 Equipment', price: 80000, daily: 15200, days: 30 },
  { id: 'vip-6', name: 'VIP 6 Equipment', price: 180000, daily: 36000, days: 30 }
];

let currentUser = null;
let currentBank = null;
let userPurchases = [];
let userDeposits = [];
let userWithdrawals = [];
let userTransactions = [];

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

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal() {
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
}

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', closeModal);
});

document.getElementById('link-show-register').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('auth-subtitle').innerText = 'Create your account';
});

document.getElementById('link-show-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('auth-subtitle').innerText = 'Log in to your account';
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
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

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

function renderHomeProducts() {
  const container = document.getElementById('home-product-list');
  if (!container) return;
  container.innerHTML = VIP_PRODUCTS_LIST.map(prod => `
    <div class="product-card">
      <div class="product-info">
        <h4>${prod.name}</h4>
        <div class="product-spec">Daily Income: <strong>${formatCurrency(prod.daily)}</strong></div>
        <div class="product-spec">Cycle: <strong>${prod.days} Days</strong></div>
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

function renderTeam(teamData) {
  const countEl = document.getElementById('team-count');
  if (countEl) countEl.innerText = teamData.team_count || 0;
  const list = document.getElementById('team-members-list');
  if (!list) return;

  if (!teamData.members || !teamData.members.length) {
    list.innerHTML = '<div class="empty-state">No team members invited yet.</div>';
    return;
  }

  list.innerHTML = teamData.members.map(m => `
    <div class="history-item">
      <div>
        <div class="item-title">${m.phone_number}</div>
        <div class="item-date">${new Date(m.created_at).toLocaleDateString()}</div>
      </div>
      <div class="item-amount in">+${formatCurrency(m.total_income)}</div>
    </div>
  `).join('');
}

function showHistoryModal(title, items, type) {
  document.getElementById('history-modal-title').innerText = title;
  const container = document.getElementById('history-items');

  if (!items || !items.length) {
    container.innerHTML = '<div class="empty-state">No records found.</div>';
  } else {
    container.innerHTML = items.map(it => {
      let amountClass = 'in';
      let sign = '+';
      let titleText = it.title || it.payment_method || it.bank_name || 'Transaction';

      if (type === 'withdraw' || it.direction === 'out') {
        amountClass = 'out';
        sign = '-';
      }

      return `
        <div class="history-item">
          <div>
            <div class="item-title">${titleText}</div>
            <div class="item-date">${new Date(it.created_at).toLocaleString()}</div>
          </div>
          <div class="item-amount ${amountClass}">${sign}${formatCurrency(it.amount)}</div>
        </div>
      `;
    }).join('');
  }
  openModal('modal-history');
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
  }
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
      const bName = document.getElementById('bank-name');
      const bNum = document.getElementById('bank-acc-number');
      const bHold = document.getElementById('bank-acc-name');
      if (bName) bName.value = currentBank.bank_name || '';
      if (bNum) bNum.value = currentBank.account_number || '';
      if (bHold) bHold.value = currentBank.account_name || '';
    }

    renderDashboard();

    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    loadTeam();
  } catch (err) {
    console.error('loadInitialData failed:', err);
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }
}

async function loadTeam() {
  try {
    const data = await fetchAPI('/api/team');
    renderTeam(data);
  } catch {}
}

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm-password').value;

  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref') || '';

  try {
    const res = await fetchAPI('/api/auth?action=register', {
      method: 'POST',
      body: { phone_number: phone, password, confirm_password: confirm, ref }
    });
    if (res.token) {
      localStorage.setItem('nv_token', res.token);
    }
    showToast('Registration successful!');
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetchAPI('/api/auth?action=login', {
      method: 'POST',
      body: { phone_number: phone, password }
    });
    if (res.token) {
      localStorage.setItem('nv_token', res.token);
    }
    showToast('Login successful!');
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try {
    localStorage.removeItem('nv_token');
    await fetchAPI('/api/auth?action=logout');
  } catch {}
  window.location.reload();
});

document.getElementById('form-deposit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = document.getElementById('deposit-amount').value;
  try {
    const res = await fetchAPI('/api/deposit', {
      method: 'POST',
      body: { amount }
    });
    closeModal();
    showToast(res.message);
    document.getElementById('deposit-amount').value = '';
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('form-withdraw').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = document.getElementById('withdraw-amount').value;
  try {
    const res = await fetchAPI('/api/withdraw', {
      method: 'POST',
      body: { amount }
    });
    closeModal();
    showToast(res.message);
    document.getElementById('withdraw-amount').value = '';
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('form-bank').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bank_name = document.getElementById('bank-name').value;
  const account_number = document.getElementById('bank-acc-number').value;
  const account_name = document.getElementById('bank-acc-name').value;

  try {
    const res = await fetchAPI('/api/bank', {
      method: 'POST',
      body: { bank_name, account_number, account_name }
    });
    closeModal();
    showToast(res.message);
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('form-gift').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('gift-code-input').value;
  try {
    const res = await fetchAPI('/api/gift-code', {
      method: 'POST',
      body: { code }
    });
    closeModal();
    showToast(res.message);
    document.getElementById('gift-code-input').value = '';
    await loadInitialData();
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
  if (!currentUser || !currentUser.referral_code) return;
  const shareLink = `${window.location.origin}?ref=${currentUser.referral_code}`;
  navigator.clipboard.writeText(shareLink).then(() => {
    showToast('Referral link copied to clipboard!');
  }).catch(() => {
    showToast(currentUser.referral_code);
  });
});

document.querySelectorAll('[data-action]').forEach(elem => {
  elem.addEventListener('click', () => {
    const action = elem.dataset.action;
    if (action === 'deposit') openModal('modal-deposit');
    if (action === 'withdraw') openModal('modal-withdraw');
    if (action === 'bank') openModal('modal-bank');
    if (action === 'gift') openModal('modal-gift');
    if (action === 'tx-history') showHistoryModal('Transaction History', userTransactions, 'tx');
    if (action === 'dep-history') showHistoryModal('Deposit History', userDeposits, 'deposit');
    if (action === 'with-history') showHistoryModal('Withdrawal History', userWithdrawals, 'withdraw');
  });
});

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
  });
});

loadInitialData();
