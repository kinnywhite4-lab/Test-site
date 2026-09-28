let currentUser = null;
let currentBank = null;
let userPurchases = [];
let userDeposits = [];
let userWithdrawals = [];
let userTransactions = [];
let availableChannels = [];
let selectedChannel = null;
let currentReceiptBase64 = null;
let countdownInterval = null;
let currentTeamData = null;
let currentSelectedTier = 1;

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = msg;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = toast.className.replace('show', '');
  }, 3500);
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
    const error = new Error(data.error || 'Something went wrong, please try again.');
    error.code = data.code;
    throw error;
  }
  return data;
}

// -------------------------------------------------------------
// 1. CAROUSEL & DASHBOARD RENDERING
// -------------------------------------------------------------
function initCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (!slides.length) return;
  let idx = 0;
  setInterval(() => {
    slides[idx].classList.remove('active');
    idx = (idx + 1) % slides.length;
    slides[idx].classList.add('active');
  }, 4000);
}

function renderDashboard() {
  if (!currentUser) return;

  const uidEl = document.getElementById('profile-uid');
  if (uidEl) uidEl.innerText = currentUser.id || '---';

  const phoneEl = document.getElementById('profile-phone');
  if (phoneEl) phoneEl.innerText = currentUser.phone_number;

  const depBalEl = document.getElementById('prof-deposit-bal');
  if (depBalEl) depBalEl.innerText = formatCurrency(currentUser.balance);

  const withBalEl = document.getElementById('prof-withdrawable-bal');
  if (withBalEl) withBalEl.innerText = formatCurrency(currentUser.withdrawable_balance);

  const totalWithEl = document.getElementById('prof-total-withdrawn');
  if (totalWithEl) totalWithEl.innerText = formatCurrency(currentUser.total_withdrawn);

  renderHomeProducts();
  renderMyProducts();
}

async function renderHomeProducts() {
  const container = document.getElementById('home-product-list');
  if (!container) return;

  try {
    const data = await fetchAPI('/api/purchase?action=catalog');
    const products = data.products || [];

    if (!products.length) {
      container.innerHTML = '<div class="empty-state">No equipment available currently.</div>';
      return;
    }

    container.innerHTML = products.map(prod => `
      <div class="product-card">
        <div class="product-info">
          <h4>${prod.name}</h4>
          <div class="product-spec">Daily Income: <strong>${formatCurrency(prod.daily_income)}</strong></div>
          <div class="product-spec">Cycle: <strong>${prod.period_days} Days</strong></div>
          <div class="product-spec">Max Revenue: <strong>${formatCurrency(prod.total_revenue || (prod.daily_income * prod.period_days))}</strong></div>
          <div class="product-price">Price: ${formatCurrency(prod.price)}</div>
        </div>
        <button class="btn btn-primary btn-sm btn-buy" data-id="${prod.id}">Buy Now</button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-buy').forEach(btn => {
      btn.addEventListener('click', () => buyProduct(btn.dataset.id, btn));
    });
  } catch {}
}

function renderMyProducts() {
  const container = document.getElementById('my-product-list');
  if (!container) return;
  if (!userPurchases.length) {
    container.innerHTML = '<div class="empty-state">No equipment currently active.</div>';
    return;
  }

  container.innerHTML = userPurchases.map(p => `
    <div class="product-card" id="inv-card-${p.id}">
      <div class="product-info" style="width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h4>${p.product_name}</h4>
          <span class="sub-badge" style="background:${p.status === 'Active' ? '#dcfce7' : '#fee2e2'};color:${p.status === 'Active' ? '#166534' : '#b91c1c'};font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700;">
            ${p.status}
          </span>
        </div>
        <div class="product-spec">Cost: <strong>${formatCurrency(p.price)}</strong></div>
        <div class="product-spec">Amount Paid: <strong class="text-success">${formatCurrency(p.amount_paid || 0)}</strong> / ${formatCurrency(p.total_revenue)}</div>
        <div class="product-spec">Purchased: ${new Date(p.created_at).toLocaleString()}</div>
        ${p.status === 'Active' ? `
          <div class="drop-timer-box">
            <i class="fa-solid fa-clock"></i> Next Income: <span class="countdown-span" data-target="${p.next_drop_time}">Calculating...</span>
          </div>
        ` : '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">Cycle completed</div>'}
      </div>
    </div>
  `).join('');

  startIncomeCountdowns();
}

function startIncomeCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  const updateTimers = () => {
    const timerSpans = document.querySelectorAll('.countdown-span');
    const now = Date.now();
    let requiresRefresh = false;

    timerSpans.forEach(el => {
      const targetTime = new Date(el.dataset.target).getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        el.innerText = 'Drop processing...';
        requiresRefresh = true;
      } else {
        const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        el.innerText = `${hrs}:${mins}:${secs}`;
      }
    });

    if (requiresRefresh) {
      clearInterval(countdownInterval);
      setTimeout(() => loadInitialData(), 3000);
    }
  };

  updateTimers();
  countdownInterval = setInterval(updateTimers, 1000);
}

// -------------------------------------------------------------
// 2. PRODUCT PURCHASE
// -------------------------------------------------------------
async function buyProduct(productId, btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Processing...';
  }

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
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Buy Now';
    }
  }
}

// -------------------------------------------------------------
// 3. SEPARATE INVITE PAGE LOGIC
// -------------------------------------------------------------
async function openInvitePage() {
  switchView('invite');

  if (currentUser && currentUser.referral_code) {
    const linkInput = document.getElementById('invite-link-val');
    const codeInput = document.getElementById('invite-code-val');
    if (linkInput) linkInput.value = `${window.location.origin}/?ref=${currentUser.referral_code}`;
    if (codeInput) codeInput.value = currentUser.referral_code;
  }

  try {
    const data = await fetchAPI('/api/team?action=invite');
    const linkInput = document.getElementById('invite-link-val');
    const codeInput = document.getElementById('invite-code-val');
    const r1 = document.getElementById('invite-rate-l1');
    const r2 = document.getElementById('invite-rate-l2');

    if (linkInput && data.referral_link) linkInput.value = data.referral_link;
    if (codeInput && data.referral_code) codeInput.value = data.referral_code;
    if (r1 && data.rates?.level1) r1.innerText = `${data.rates.level1}%`;
    if (r2 && data.rates?.level2) r2.innerText = `${data.rates.level2}%`;
  } catch (err) {
    console.error('Invite Load Error:', err);
    showToast(err.message || 'Failed to load invite details.');
  }
}

document.getElementById('btn-copy-invite-link')?.addEventListener('click', () => {
  const val = document.getElementById('invite-link-val')?.value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => showToast('Referral link copied to clipboard!'));
});

document.getElementById('btn-copy-invite-code')?.addEventListener('click', () => {
  const val = document.getElementById('invite-code-val')?.value;
  if (!val) return;
  navigator.clipboard.writeText(val).then(() => showToast('Referral code copied to clipboard!'));
});

// -------------------------------------------------------------
// 4. SEPARATE TEAM PAGE LOGIC
// -------------------------------------------------------------
async function openTeamPage() {
  switchView('team');
  try {
    const data = await fetchAPI('/api/team');
    currentTeamData = data;

    const t1Count = document.getElementById('team1-members-count');
    const t1Income = document.getElementById('team1-members-income');
    const t2Count = document.getElementById('team2-members-count');
    const t2Income = document.getElementById('team2-members-income');

    if (t1Count) t1Count.innerText = data.team1?.total_members || 0;
    if (t1Income) t1Income.innerText = formatCurrency(data.team1?.total_income || 0);
    if (t2Count) t2Count.innerText = data.team2?.total_members || 0;
    if (t2Income) t2Income.innerText = formatCurrency(data.team2?.total_income || 0);

    selectTeamTier(currentSelectedTier);
  } catch (err) {
    console.error('Team Load Error:', err);
    showToast(err.message || 'Failed to load team data.');
  }
}

function selectTeamTier(tier) {
  currentSelectedTier = tier;
  const card1 = document.getElementById('card-team-tier-1');
  const card2 = document.getElementById('card-team-tier-2');
  const titleEl = document.getElementById('team-active-title');
  const tbody = document.getElementById('team-table-body');

  if (tier === 1) {
    card1?.classList.add('active');
    card2?.classList.remove('active');
    if (titleEl) titleEl.innerText = 'First Referral (Team 1) Members History';
  } else {
    card2?.classList.add('active');
    card1?.classList.remove('active');
    if (titleEl) titleEl.innerText = 'Second Referral (Team 2) Members History';
  }

  if (!currentTeamData || !tbody) return;

  const records = tier === 1 ? currentTeamData.team1?.records : currentTeamData.team2?.records;

  if (!records || !records.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No investments or commissions recorded for Tier ${tier} yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td>
        <strong>${r.phone}</strong>
        <div style="font-size:10px; color:var(--text-muted);">${new Date(r.created_at).toLocaleDateString()}</div>
      </td>
      <td>
        <div>${r.product_name}</div>
        <strong style="color:var(--text-main); font-size:11px;">${formatCurrency(r.amount_bought)}</strong>
      </td>
      <td>
        <strong class="text-success">+${formatCurrency(r.commission)}</strong>
      </td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// 5. STRICT DEPOSIT FLOW (NAME & PROOF MANDATORY)
// -------------------------------------------------------------
async function openRechargePage() {
  switchView('recharge');
  document.getElementById('recharge-stage-select').style.display = 'block';
  document.getElementById('recharge-stage-pay').style.display = 'none';
  currentReceiptBase64 = null;
  const previewWrap = document.getElementById('receipt-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';

  try {
    const data = await fetchAPI('/api/deposit?action=channels');
    availableChannels = data.channels || [];
    renderChannels();
  } catch {
    showToast('Failed to load payment channels.');
  }
}

function renderChannels() {
  const container = document.getElementById('payment-channels-list');
  if (!container) return;

  if (!availableChannels.length) {
    container.innerHTML = '<p class="field-hint">No payment channels active at this time.</p>';
    selectedChannel = null;
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

  selectedChannel = availableChannels[0];

  container.querySelectorAll('.channel-option').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.channel-option').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      const foundId = parseInt(el.dataset.id, 10);
      selectedChannel = availableChannels.find(c => c.id === foundId);
    });
  });
}

const btnProceed = document.getElementById('btn-proceed-to-payment');
if (btnProceed) {
  btnProceed.addEventListener('click', () => {
    const amountVal = document.getElementById('recharge-amount-input').value;
    const numAmount = parseFloat(amountVal);

    if (isNaN(numAmount) || numAmount < 1000) {
      return showToast('Please enter an amount of at least ₦1,000.');
    }
    if (!selectedChannel) {
      return showToast('Please select a payment channel.');
    }

    document.getElementById('det-channel-title').innerText = selectedChannel.name;
    document.getElementById('det-pay-amount').innerText = formatCurrency(numAmount);
    document.getElementById('det-bank-name').innerText = selectedChannel.bank_name;
    document.getElementById('det-acc-name').innerText = selectedChannel.account_name;
    document.getElementById('det-acc-number').innerText = selectedChannel.account_number;
    document.getElementById('det-instructions').innerText = selectedChannel.instructions || 'Transfer the exact amount and upload your payment slip.';

    document.getElementById('recharge-stage-select').style.display = 'none';
    document.getElementById('recharge-stage-pay').style.display = 'block';
  });
}

const btnChangeChan = document.getElementById('btn-change-channel');
if (btnChangeChan) {
  btnChangeChan.addEventListener('click', () => {
    document.getElementById('recharge-stage-pay').style.display = 'none';
    document.getElementById('recharge-stage-select').style.display = 'block';
  });
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

const fileInput = document.getElementById('recharge-receipt-file');
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 900;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        currentReceiptBase64 = canvas.toDataURL('image/jpeg', 0.7);

        const previewWrap = document.getElementById('receipt-preview-wrap');
        const previewImg = document.getElementById('receipt-preview-img');
        if (previewWrap && previewImg) {
          previewImg.src = currentReceiptBase64;
          previewWrap.style.display = 'block';
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

const confirmRechargeBtn = document.getElementById('btn-confirm-recharge');
if (confirmRechargeBtn) {
  confirmRechargeBtn.addEventListener('click', async () => {
    const amount = document.getElementById('recharge-amount-input').value;
    const senderName = document.getElementById('recharge-sender-name').value;

    const nameEmpty = !senderName || !senderName.trim();
    const receiptEmpty = !currentReceiptBase64;

    if (nameEmpty && receiptEmpty) {
      return showToast('Please enter your name and upload payment receipt.');
    }
    if (nameEmpty) {
      return showToast('Please enter your name before submitting the deposit.');
    }
    if (receiptEmpty) {
      return showToast('Please upload your payment receipt before submitting the deposit.');
    }

    confirmRechargeBtn.disabled = true;
    confirmRechargeBtn.innerText = 'Submitting...';

    try {
      const res = await fetchAPI('/api/deposit', {
        method: 'POST',
        body: {
          amount,
          channel_id: selectedChannel.id,
          sender_name: senderName.trim(),
          proof_url: currentReceiptBase64
        }
      });

      showToast(res.message || 'Deposit request submitted successfully!');
      document.getElementById('recharge-sender-name').value = '';
      if (fileInput) fileInput.value = '';
      currentReceiptBase64 = null;

      switchView('home');
      loadInitialData().catch(() => {});
    } catch (err) {
      showToast(err.message || 'Failed to submit deposit.');
    } finally {
      confirmRechargeBtn.disabled = false;
      confirmRechargeBtn.innerText = 'Submit Deposit for Review';
    }
  });
}

// -------------------------------------------------------------
// 6. WITHDRAWAL SUBMISSION
// -------------------------------------------------------------
function openWithdrawPage() {
  document.getElementById('withdraw-available-bal').innerText = formatCurrency(currentUser.withdrawable_balance);
  const bankBox = document.getElementById('withdraw-bank-summary');

  if (!currentBank) {
    bankBox.innerHTML = `
      <p style="color: var(--danger);">No bank account added.</p>
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
    if (!amount || parseFloat(amount) <= 0) {
      return showToast('Please enter a valid withdrawal amount.');
    }

    submitWithdrawBtn.disabled = true;
    submitWithdrawBtn.innerText = 'Processing...';

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
      if (err.code === 'NO_BANK_ACCOUNT') {
        setTimeout(() => switchView('bank-card'), 1000);
      }
    } finally {
      submitWithdrawBtn.disabled = false;
      submitWithdrawBtn.innerText = 'Submit Withdrawal';
    }
  });
}

// -------------------------------------------------------------
// 7. GIFT CODE REDEEM PAGE
// -------------------------------------------------------------
async function openGiftPage() {
  switchView('gift');
  try {
    const data = await fetchAPI('/api/gift-code');
    document.getElementById('gift-total-claimed').innerText = formatCurrency(data.total_claimed || 0);
    const list = document.getElementById('gift-claims-list');
    if (!data.claims || !data.claims.length) {
      list.innerHTML = '<div class="empty-state">No gift codes claimed yet.</div>';
    } else {
      list.innerHTML = data.claims.map(c => `
        <div class="history-item">
          <div>
            <div class="item-title">${c.code}</div>
            <div class="item-date">${new Date(c.created_at).toLocaleString()}</div>
          </div>
          <div class="item-amount in">+${formatCurrency(c.amount)}</div>
        </div>
      `).join('');
    }
  } catch {}
}

const formPageGift = document.getElementById('form-page-gift');
if (formPageGift) {
  formPageGift.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('input-page-gift-code');
    const btn = document.getElementById('btn-claim-gift');
    const code = input.value.trim();

    btn.disabled = true;
    btn.innerText = 'Claiming...';

    try {
      const res = await fetchAPI('/api/gift-code', {
        method: 'POST',
        body: { code }
      });
      showToast(res.message);
      input.value = '';
      await openGiftPage();
      loadInitialData().catch(() => {});
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.innerText = 'Claim Reward';
    }
  });
}

// -------------------------------------------------------------
// 8. BANK FORM
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 9. TRANSACTION HISTORY
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// 10. APP INITIALIZATION & RECOVERY
// -------------------------------------------------------------
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
      impersonationBar.style.display = localStorage.getItem('nv_impersonating') === 'true' ? 'flex' : 'none';
    }
  } catch (err) {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }
}

// Navigation Actions
document.getElementById('btn-nav-recharge')?.addEventListener('click', openRechargePage);
document.getElementById('btn-nav-withdraw')?.addEventListener('click', openWithdrawPage);
document.getElementById('btn-nav-invite')?.addEventListener('click', openInvitePage);
document.getElementById('btn-nav-gift')?.addEventListener('click', openGiftPage);
document.getElementById('menu-bank-card')?.addEventListener('click', () => switchView('bank-card'));

document.getElementById('menu-dep-history')?.addEventListener('click', async () => {
  try {
    const res = await fetchAPI('/api/deposit');
    renderDedicatedHistory('Deposit History', res.deposits, 'deposit');
  } catch {
    renderDedicatedHistory('Deposit History', userDeposits, 'deposit');
  }
});

document.getElementById('menu-with-history')?.addEventListener('click', async () => {
  try {
    const res = await fetchAPI('/api/withdraw');
    renderDedicatedHistory('Withdrawal History', res.withdrawals, 'withdraw');
  } catch {
    renderDedicatedHistory('Withdrawal History', userWithdrawals, 'withdraw');
  }
});

document.getElementById('menu-tx-history')?.addEventListener('click', async () => {
  try {
    const res = await fetchAPI('/api/transactions');
    renderDedicatedHistory('Transaction History', res.transactions, 'tx');
  } catch {
    renderDedicatedHistory('Transaction History', userTransactions, 'tx');
  }
});

// Bottom navigation buttons
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'team') {
      openTeamPage();
    } else {
      switchView(view);
    }
  });
});

document.getElementById('btn-return-admin')?.addEventListener('click', () => {
  localStorage.removeItem('nv_impersonating');
  window.location.href = '/admin.html';
});

// -------------------------------------------------------------
// 11. AUTH & AUTO-REFERRAL DETECTION
// -------------------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
const autoRef = urlParams.get('ref');
if (autoRef) {
  const regRefInput = document.getElementById('reg-ref-code');
  if (regRefInput) regRefInput.value = autoRef.trim().toUpperCase();
}

document.getElementById('link-show-register')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('auth-subtitle').innerText = 'Create your account';
});

document.getElementById('link-show-login')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('auth-subtitle').innerText = 'Log in to your account';
});

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm-password').value;
  const ref = document.getElementById('reg-ref-code').value;

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

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
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

// -------------------------------------------------------------
// 12. LOGOUT: BULLETPROOF SESSION EVICTION
// -------------------------------------------------------------
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    // 1. Remove all client storage tokens
    localStorage.removeItem('nv_token');
    localStorage.removeItem('nv_impersonating');
    sessionStorage.clear();

    // 2. Kill cookie directly on client
    document.cookie = 'novavest_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';

    // 3. Inform backend to delete the HttpOnly session cookie
    try {
      await fetchAPI('/api/auth?action=logout');
    } catch {}

    // 4. Reset in-memory session
    currentUser = null;
    currentBank = null;

    // 5. Hide app and show Auth screen cleanly
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('auth-subtitle').innerText = 'Log in to your account';

    // Clear form inputs
    const loginPhone = document.getElementById('login-phone');
    const loginPwd = document.getElementById('login-password');
    if (loginPhone) loginPhone.value = '';
    if (loginPwd) loginPwd.value = '';

    showToast('Logged out successfully.');
  });
}

initCarousel();
loadInitialData();
