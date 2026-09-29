/* =============================================================
   NovaVest Main Client Controller
============================================================= */
let currentUser = null;
let currentSettings = null;
let activeTeamTier = 1;
let currentSelectedChannelId = null;

// Helper: Show standard toast
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Helper: Format Naira currency
function formatNaira(num) {
  const val = Number(num) || 0;
  return '₦' + val.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// -------------------------------------------------------------
// THEME SWITCHER LOGIC (Dark Obsidian <--> White & Blue Light)
// -------------------------------------------------------------
function initThemeToggle() {
  const toggleBtn = document.getElementById('btn-theme-toggle');
  const themeIcon = document.getElementById('theme-icon');

  const savedTheme = localStorage.getItem('novavest_theme') || 'dark';
  applyTheme(savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const nextTheme = current === 'light' ? 'dark' : 'light';
      applyTheme(nextTheme);
    });
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.body.setAttribute('data-theme', 'light');
      if (themeIcon) {
        themeIcon.className = 'fa-solid fa-moon';
      }
      localStorage.setItem('novavest_theme', 'light');
    } else {
      document.body.removeAttribute('data-theme');
      if (themeIcon) {
        themeIcon.className = 'fa-solid fa-sun';
      }
      localStorage.setItem('novavest_theme', 'dark');
    }
  }
}

// -------------------------------------------------------------
// CAROUSEL ROTATION LOGIC
// -------------------------------------------------------------
function initCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  if (!slides || slides.length === 0) return;
  let idx = 0;
  setInterval(() => {
    slides[idx].classList.remove('active');
    idx = (idx + 1) % slides.length;
    slides[idx].classList.add('active');
  }, 4000);
}

// -------------------------------------------------------------
// VIEW NAVIGATION ROUTER
// -------------------------------------------------------------
function switchView(viewName) {
  // Hide all views
  const allViews = document.querySelectorAll('.view-section');
  allViews.forEach(v => v.classList.remove('active'));

  // Show active view
  const target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update bottom tab navigation active states
  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(n => {
    if (n.getAttribute('data-view') === viewName) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });

  // Trigger view-specific fresh data loading
  if (viewName === 'home') {
    loadProducts();
    loadProfileData();
  } else if (viewName === 'products') {
    loadMyActiveProducts();
  } else if (viewName === 'team') {
    loadTeamData();
  } else if (viewName === 'invite') {
    loadInviteData();
  } else if (viewName === 'profile') {
    loadProfileData();
  } else if (viewName === 'withdrawal') {
    loadWithdrawalView();
  } else if (viewName === 'recharge') {
    loadRechargeView();
  } else if (viewName === 'gift') {
    loadGiftClaims();
  }
}

// -------------------------------------------------------------
// AUTHENTICATION & SESSION MANAGEMENT
// -------------------------------------------------------------
async function checkAuthSession() {
  try {
    const res = await fetch('/api/auth?action=me');
    const data = await res.json();
    if (data && data.success && data.user) {
      currentUser = data.user;
      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('app-container').style.display = 'block';

      // Check for Admin Impersonation header
      if (data.impersonating) {
        const impBar = document.getElementById('impersonation-bar');
        if (impBar) impBar.style.display = 'flex';
      }

      switchView('home');
    } else {
      showAuthScreen();
    }
  } catch (err) {
    showAuthScreen();
  }
}

function showAuthScreen() {
  currentUser = null;
  document.getElementById('auth-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

async function performLogout() {
  try {
    await fetch('/api/auth?action=logout', { method: 'POST' });
  } catch (e) {}

  // Explicit browser cookie eviction
  document.cookie = "novavest_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  localStorage.removeItem('novavest_session');
  localStorage.removeItem('novavest_user');

  showToast('Logged out successfully');
  setTimeout(() => {
    window.location.reload();
  }, 400);
}

// -------------------------------------------------------------
// DATA LOADERS & DATA FETCHING
// -------------------------------------------------------------
async function loadProfileData() {
  try {
    const res = await fetch('/api/auth?action=me');
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = data.user;
      
      const phoneEl = document.getElementById('profile-phone');
      const uidEl = document.getElementById('profile-uid');
      const depBalEl = document.getElementById('prof-deposit-bal');
      const withBalEl = document.getElementById('prof-withdrawable-bal');
      const totWithEl = document.getElementById('prof-total-withdrawn');

      if (phoneEl) phoneEl.textContent = currentUser.phone || 'Investor';
      if (uidEl) uidEl.textContent = currentUser.id || '---';
      if (depBalEl) depBalEl.textContent = formatNaira(currentUser.deposit_balance);
      if (withBalEl) withBalEl.textContent = formatNaira(currentUser.withdrawable_balance);
      if (totWithEl) totWithEl.textContent = formatNaira(currentUser.total_withdrawn);
    }
  } catch (err) {}
}

async function loadProducts() {
  const container = document.getElementById('home-product-list');
  if (!container) return;
  try {
    const res = await fetch('/api/products?action=list');
    const data = await res.json();
    if (!data.success || !data.products || data.products.length === 0) {
      container.innerHTML = '<div class="empty-state">No equipment currently available.</div>';
      return;
    }
    container.innerHTML = data.products.map(p => `
      <div class="product-card">
        <div class="product-info">
          <h4>${p.name}</h4>
          <div class="product-spec">Daily Income: <strong>${formatNaira(p.daily_yield)}</strong></div>
          <div class="product-spec">Cycle Duration: <strong>${p.duration_days} Days</strong></div>
          <div class="product-price">${formatNaira(p.price)}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="buyProduct('${p.id}')">Buy Now</button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Unable to load equipment list.</div>';
  }
}

async function buyProduct(productId) {
  if (!confirm('Confirm purchasing this VIP equipment?')) return;
  try {
    const res = await fetch('/api/products?action=buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Equipment purchased successfully!');
      loadProfileData();
      loadProducts();
    } else {
      showToast(data.message || 'Purchase failed.');
    }
  } catch (e) {
    showToast('Failed to complete equipment purchase.');
  }
}

async function loadMyActiveProducts() {
  const container = document.getElementById('my-product-list');
  if (!container) return;
  try {
    const res = await fetch('/api/products?action=my_products');
    const data = await res.json();
    if (!data.success || !data.userProducts || data.userProducts.length === 0) {
      container.innerHTML = '<div class="empty-state">You do not have any active equipment working.</div>';
      return;
    }
    container.innerHTML = data.userProducts.map(up => `
      <div class="product-card">
        <div class="product-info">
          <h4>${up.product_name}</h4>
          <div class="product-spec">Daily Yield: <strong>${formatNaira(up.daily_yield)}</strong></div>
          <div class="product-spec">Days Remaining: <strong>${up.days_remaining} / ${up.total_days}</strong></div>
          <div class="drop-timer-box"><i class="fa-regular fa-clock"></i> Next Drop in: ${up.next_drop_countdown || 'Pending'}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Unable to load your equipment.</div>';
  }
}

// -------------------------------------------------------------
// DEDICATED INVITE & DEDICATED TEAM
// -------------------------------------------------------------
async function loadInviteData() {
  try {
    const res = await fetch('/api/team?action=invite_info');
    const data = await res.json();
    if (data.success) {
      const linkInput = document.getElementById('invite-link-val');
      const codeInput = document.getElementById('invite-code-val');
      if (linkInput) linkInput.value = data.inviteLink || window.location.origin + '/?ref=' + (data.referralCode || '');
      if (codeInput) codeInput.value = data.referralCode || '------';
    }
  } catch (e) {}
}

async function loadTeamData() {
  try {
    const res = await fetch('/api/team?action=overview');
    const data = await res.json();
    if (data.success) {
      const t1Count = document.getElementById('team1-members-count');
      const t1Income = document.getElementById('team1-members-income');
      const t2Count = document.getElementById('team2-members-count');
      const t2Income = document.getElementById('team2-members-income');

      if (t1Count) t1Count.textContent = data.tier1_count || 0;
      if (t1Income) t1Income.textContent = formatNaira(data.tier1_income || 0);
      if (t2Count) t2Count.textContent = data.tier2_count || 0;
      if (t2Income) t2Income.textContent = formatNaira(data.tier2_income || 0);

      renderTeamTierTable(activeTeamTier, data);
    }
  } catch (e) {}
}

function selectTeamTier(tier) {
  activeTeamTier = tier;
  const c1 = document.getElementById('card-team-tier-1');
  const c2 = document.getElementById('card-team-tier-2');
  if (tier === 1) {
    if (c1) c1.classList.add('active');
    if (c2) c2.classList.remove('active');
    document.getElementById('team-active-title').textContent = 'First Referral Members History';
  } else {
    if (c2) c2.classList.add('active');
    if (c1) c1.classList.remove('active');
    document.getElementById('team-active-title').textContent = 'Second Referral Members History';
  }
  loadTeamData();
}

function renderTeamTierTable(tier, overviewData) {
  const tbody = document.getElementById('team-table-body');
  if (!tbody) return;
  const members = tier === 1 ? overviewData.tier1_members : overviewData.tier2_members;
  if (!members || members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No members joined in Tier ${tier} yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = members.map(m => `
    <tr>
      <td>${m.phone_masked || ('ID: ' + m.id)}</td>
      <td>${m.product_bought || 'No Equipment'}</td>
      <td class="text-success font-bold">${formatNaira(m.commission_earned)}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// RECHARGE LOGIC
// -------------------------------------------------------------
async function loadRechargeView() {
  document.getElementById('recharge-stage-select').style.display = 'block';
  document.getElementById('recharge-stage-pay').style.display = 'none';

  const channelsWrap = document.getElementById('payment-channels-list');
  if (!channelsWrap) return;
  try {
    const res = await fetch('/api/bank?action=deposit_channels');
    const data = await res.json();
    if (data.success && data.channels && data.channels.length > 0) {
      currentSelectedChannelId = data.channels[0].id;
      channelsWrap.innerHTML = data.channels.map((ch, idx) => `
        <div class="channel-option ${idx === 0 ? 'active' : ''}" data-chan-id="${ch.id}" onclick="selectPaymentChannel('${ch.id}', this)">
          <div class="chan-left">
            <i class="fa-solid fa-credit-card text-success"></i>
            <span>${ch.channel_name || 'Bank Transfer Direct'}</span>
          </div>
          <div class="radio-circle"></div>
        </div>
      `).join('');
    } else {
      channelsWrap.innerHTML = '<div class="empty-state">No payment channels active.</div>';
    }
  } catch (e) {
    channelsWrap.innerHTML = '<div class="empty-state">Failed to load channels.</div>';
  }
}

function selectPaymentChannel(id, el) {
  currentSelectedChannelId = id;
  const options = document.querySelectorAll('.channel-option');
  options.forEach(o => o.classList.remove('active'));
  el.classList.add('active');
}

// -------------------------------------------------------------
// WITHDRAWAL LOGIC
// -------------------------------------------------------------
async function loadWithdrawalView() {
  const balEl = document.getElementById('withdraw-available-bal');
  const summaryEl = document.getElementById('withdraw-bank-summary');
  if (balEl && currentUser) {
    balEl.textContent = formatNaira(currentUser.withdrawable_balance);
  }
  try {
    const res = await fetch('/api/bank?action=get_user_bank');
    const data = await res.json();
    if (data.success && data.bank) {
      summaryEl.innerHTML = `
        <strong>Linked Bank:</strong> ${data.bank.bank_name}<br>
        <strong>Account Number:</strong> ${data.bank.account_number}<br>
        <strong>Account Name:</strong> ${data.bank.account_holder}
      `;
    } else {
      summaryEl.innerHTML = `
        <p style="color:var(--warning);">No withdrawal bank account linked yet.</p>
        <button class="btn btn-sm btn-primary" style="margin-top:8px;" onclick="switchView('bank-card')">Link Bank Card Now</button>
      `;
    }
  } catch (e) {
    summaryEl.innerHTML = '<p>Unable to verify linked bank account.</p>';
  }
}

// -------------------------------------------------------------
// GIFT CODES
// -------------------------------------------------------------
async function loadGiftClaims() {
  const container = document.getElementById('gift-claims-list');
  const totalEl = document.getElementById('gift-total-claimed');
  if (!container) return;
  try {
    const res = await fetch('/api/bank?action=my_gift_claims');
    const data = await res.json();
    if (data.success) {
      if (totalEl) totalEl.textContent = formatNaira(data.total_claimed || 0);
      if (!data.claims || data.claims.length === 0) {
        container.innerHTML = '<div class="empty-state">No gift codes redeemed yet.</div>';
        return;
      }
      container.innerHTML = data.claims.map(c => `
        <div class="history-item">
          <div>
            <div class="item-title">${c.code_title || 'Redeemed Gift'}</div>
            <div class="item-date">${new Date(c.claimed_at).toLocaleString()}</div>
          </div>
          <div class="item-amount in">+${formatNaira(c.reward_amount)}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = '<div class="empty-state">Unable to load gift history.</div>';
  }
}

// -------------------------------------------------------------
// EVENT INITIALIZATION ON DOM READY
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initCarousel();
  checkAuthSession();

  // Bottom Navigation tabs
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view');
      switchView(v);
    });
  });

  // Quick Action buttons on Home
  const actRecharge = document.getElementById('btn-nav-recharge');
  const actWithdraw = document.getElementById('btn-nav-withdraw');
  const actInvite = document.getElementById('btn-nav-invite');
  const actGift = document.getElementById('btn-nav-gift');

  if (actRecharge) actRecharge.addEventListener('click', () => switchView('recharge'));
  if (actWithdraw) actWithdraw.addEventListener('click', () => switchView('withdrawal'));
  if (actInvite) actInvite.addEventListener('click', () => switchView('invite'));
  if (actGift) actGift.addEventListener('click', () => switchView('gift'));

  // Subpage Back buttons
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const backTarget = btn.getAttribute('data-back') || 'home';
      switchView(backTarget);
    });
  });

  // Profile Menu shortcuts
  const mBank = document.getElementById('menu-bank-card');
  const mDep = document.getElementById('menu-dep-history');
  const mWith = document.getElementById('menu-with-history');
  const mTx = document.getElementById('menu-tx-history');

  if (mBank) mBank.addEventListener('click', () => switchView('bank-card'));
  if (mDep) mDep.addEventListener('click', () => { switchView('history'); loadHistory('deposit'); });
  if (mWith) mWith.addEventListener('click', () => { switchView('history'); loadHistory('withdrawal'); });
  if (mTx) mTx.addEventListener('click', () => { switchView('history'); loadHistory('all'); });

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', performLogout);

  // Return to admin button
  const retAdminBtn = document.getElementById('btn-return-admin');
  if (retAdminBtn) {
    retAdminBtn.addEventListener('click', async () => {
      await fetch('/api/auth?action=stop_impersonate', { method: 'POST' });
      window.location.href = '/admin.html';
    });
  }

  // Auth toggle links (Login <-> Register switch)
  const showRegLink = document.getElementById('link-show-register');
  const showLoginLink = document.getElementById('link-show-login');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const authSub = document.getElementById('auth-subtitle');

  if (showRegLink) {
    showRegLink.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.style.display = 'none';
      regForm.style.display = 'block';
      authSub.textContent = 'Create a new investor account';
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      regForm.style.display = 'none';
      loginForm.style.display = 'block';
      authSub.textContent = 'Log in to your account';
    });
  }

  // Login submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('login-phone').value.trim();
      const password = document.getElementById('login-password').value;
      try {
        const res = await fetch('/api/auth?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, password })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Welcome back!');
          checkAuthSession();
        } else {
          showToast(data.message || 'Login failed.');
        }
      } catch (err) {
        showToast('Network error during login.');
      }
    });
  }

  // Register submission
  if (regForm) {
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('reg-phone').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm = document.getElementById('reg-confirm-password').value;
      const refCode = document.getElementById('reg-ref-code').value.trim();

      if (password !== confirm) {
        showToast('Passwords do not match.');
        return;
      }

      try {
        const res = await fetch('/api/auth?action=register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, password, refCode })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Registration successful! Logging in...');
          checkAuthSession();
        } else {
          showToast(data.message || 'Registration failed.');
        }
      } catch (err) {
        showToast('Network error during registration.');
      }
    });
  }

  // Predefined recharge amounts
  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('recharge-amount-input').value = btn.getAttribute('data-amt');
    });
  });

  // Proceed to payment screen
  const proceedPayBtn = document.getElementById('btn-proceed-to-payment');
  if (proceedPayBtn) {
    proceedPayBtn.addEventListener('click', async () => {
      const amount = Number(document.getElementById('recharge-amount-input').value);
      if (!amount || amount < 1000) {
        showToast('Minimum recharge amount is ₦1,000');
        return;
      }
      if (!currentSelectedChannelId) {
        showToast('Please select a payment channel');
        return;
      }

      try {
        const res = await fetch(`/api/bank?action=channel_detail&id=${currentSelectedChannelId}`);
        const data = await res.json();
        if (data.success && data.channel) {
          document.getElementById('det-pay-amount').textContent = formatNaira(amount);
          document.getElementById('det-bank-name').textContent = data.channel.bank_name;
          document.getElementById('det-acc-name').textContent = data.channel.account_name;
          document.getElementById('det-acc-number').textContent = data.channel.account_number;
          document.getElementById('det-instructions').textContent = data.channel.instructions || 'Transfer the exact amount and upload your screenshot below.';

          document.getElementById('recharge-stage-select').style.display = 'none';
          document.getElementById('recharge-stage-pay').style.display = 'block';
        } else {
          showToast('Channel details not found.');
        }
      } catch (e) {
        showToast('Failed to load channel details.');
      }
    });
  }

  const changeChanBtn = document.getElementById('btn-change-channel');
  if (changeChanBtn) {
    changeChanBtn.addEventListener('click', () => {
      document.getElementById('recharge-stage-select').style.display = 'block';
      document.getElementById('recharge-stage-pay').style.display = 'none';
    });
  }

  // Copy account number
  const copyAccBtn = document.getElementById('btn-copy-account');
  if (copyAccBtn) {
    copyAccBtn.addEventListener('click', () => {
      const acc = document.getElementById('det-acc-number').textContent;
      navigator.clipboard.writeText(acc).then(() => showToast('Account number copied!'));
    });
  }

  // Copy invite link and code
  const copyLinkBtn = document.getElementById('btn-copy-invite-link');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
      const lk = document.getElementById('invite-link-val').value;
      navigator.clipboard.writeText(lk).then(() => showToast('Invite link copied!'));
    });
  }
  const copyCodeBtn = document.getElementById('btn-copy-invite-code');
  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      const cd = document.getElementById('invite-code-val').value;
      navigator.clipboard.writeText(cd).then(() => showToast('Referral code copied!'));
    });
  }

  // Bank Account Submission
  const dedicatedBankForm = document.getElementById('form-dedicated-bank');
  if (dedicatedBankForm) {
    dedicatedBankForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bankName = document.getElementById('bank-input-name').value.trim();
      const accountNumber = document.getElementById('bank-input-number').value.trim();
      const accountHolder = document.getElementById('bank-input-holder').value.trim();

      if (accountNumber.length !== 10) {
        showToast('NUBAN Account Number must be 10 digits.');
        return;
      }

      try {
        const res = await fetch('/api/bank?action=save_user_bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bankName, accountNumber, accountHolder })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Bank details saved successfully!');
          switchView('profile');
        } else {
          showToast(data.message || 'Failed to save bank.');
        }
      } catch (err) {
        showToast('Error saving bank details.');
      }
    });
  }

  // Gift Code Claim Submission
  const giftForm = document.getElementById('form-page-gift');
  if (giftForm) {
    giftForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('input-page-gift-code').value.trim();
      try {
        const res = await fetch('/api/bank?action=claim_gift', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Success! You received ${formatNaira(data.reward)}`);
          document.getElementById('input-page-gift-code').value = '';
          loadGiftClaims();
          loadProfileData();
        } else {
          showToast(data.message || 'Invalid or expired gift code.');
        }
      } catch (e) {
        showToast('Failed to claim gift code.');
      }
    });
  }

  // Withdrawal Submission
  const submitWithBtn = document.getElementById('btn-submit-withdraw');
  if (submitWithBtn) {
    submitWithBtn.addEventListener('click', async () => {
      const amount = Number(document.getElementById('input-withdraw-amount').value);
      if (!amount || amount < 1000) {
        showToast('Minimum withdrawal is ₦1,000');
        return;
      }
      try {
        const res = await fetch('/api/withdraw?action=request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Withdrawal submitted for processing!');
          switchView('profile');
        } else {
          showToast(data.message || 'Withdrawal failed.');
        }
      } catch (e) {
        showToast('Error submitting withdrawal request.');
      }
    });
  }
});

// History records loader
async function loadHistory(type) {
  const titleEl = document.getElementById('history-page-title');
  const itemsEl = document.getElementById('history-page-items');
  if (titleEl) titleEl.textContent = type.toUpperCase() + ' HISTORY';
  if (!itemsEl) return;
  itemsEl.innerHTML = '<div class="empty-state">Loading history...</div>';

  try {
    const res = await fetch(`/api/bank?action=history&type=${type}`);
    const data = await res.json();
    if (!data.success || !data.records || data.records.length === 0) {
      itemsEl.innerHTML = '<div class="empty-state">No transaction records found.</div>';
      return;
    }
    itemsEl.innerHTML = data.records.map(r => `
      <div class="history-item">
        <div>
          <div class="item-title">${r.title || r.type} <span class="item-badge badge-${r.status.toLowerCase()}">${r.status}</span></div>
          <div class="item-date">${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div class="item-amount ${r.direction === 'in' ? 'in' : 'out'}">${r.direction === 'in' ? '+' : '-'}${formatNaira(r.amount)}</div>
      </div>
    `).join('');
  } catch (e) {
    itemsEl.innerHTML = '<div class="empty-state">Failed to load transactions.</div>';
  }
}
