/* =============================================================
   NovaVest Main Client Controller (Fixed & Unified)
============================================================= */
let currentUser = null;
let currentSettings = null;
let activeTeamTier = 1;
let currentSelectedChannelId = null;

// Default fallback equipment in case database records are empty
const DEFAULT_PRODUCTS = [
  {
    id: 1,
    name: "VIP 1 Starter Equipment",
    price: 3000,
    daily_yield: 300,
    duration_days: 30,
    image: "1790634852391.jpg"
  },
  {
    id: 2,
    name: "VIP 2 Pro Equipment",
    price: 8000,
    daily_yield: 880,
    duration_days: 30,
    image: "1790634885911.jpg"
  },
  {
    id: 3,
    name: "VIP 3 Enterprise Unit",
    price: 20000,
    daily_yield: 2400,
    duration_days: 30,
    image: "1790634908264.jpg"
  }
];

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
// THEME SWITCHER LOGIC
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
  const allViews = document.querySelectorAll('.view-section');
  allViews.forEach(v => v.classList.remove('active'));

  const target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const navItems = document.querySelectorAll('.bottom-nav .nav-item');
  navItems.forEach(n => {
    if (n.getAttribute('data-view') === viewName) {
      n.classList.add('active');
    } else {
      n.classList.remove('active');
    }
  });

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
      const authCont = document.getElementById('auth-container');
      const appCont = document.getElementById('app-container');
      if (authCont) authCont.style.display = 'none';
      if (appCont) appCont.style.display = 'block';

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
  const authCont = document.getElementById('auth-container');
  const appCont = document.getElementById('app-container');
  if (authCont) authCont.style.display = 'flex';
  if (appCont) appCont.style.display = 'none';
}

async function performLogout() {
  try {
    await fetch('/api/auth?action=logout', { method: 'POST' });
  } catch (e) {}

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
    if (data && data.success && data.user) {
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

// FIXED: Loads from /api/bootstrap or fallback defaults
async function loadProducts() {
  const container = document.getElementById('home-product-list');
  if (!container) return;

  try {
    let items = [];
    const res = await fetch('/api/bootstrap');
    if (res.ok) {
      const data = await res.json();
      if (data && data.products && data.products.length > 0) {
        items = data.products;
      }
    }

    if (items.length === 0) {
      items = DEFAULT_PRODUCTS;
    }

    container.innerHTML = items.map(p => {
      const daily = p.daily_income || p.daily_yield || 0;
      const duration = p.duration_days || p.cycle_days || 30;
      return `
        <div class="product-card">
          <div class="product-info">
            <h4>${p.name}</h4>
            <div class="product-spec">Daily Income: <strong>${formatNaira(daily)}</strong></div>
            <div class="product-spec">Cycle Duration: <strong>${duration} Days</strong></div>
            <div class="product-price">${formatNaira(p.price)}</div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="buyProduct('${p.id}')">Buy Now</button>
        </div>
      `;
    }).join('');
  } catch (err) {
    // If network fails, still render default equipment
    container.innerHTML = DEFAULT_PRODUCTS.map(p => `
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
  }
}

// FIXED: Routes to /api/purchase
async function buyProduct(productId) {
  if (!confirm('Confirm purchasing this VIP equipment?')) return;
  try {
    const res = await fetch('/api/purchase', {
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

// FIXED: Gracefully handles user's active products
async function loadMyActiveProducts() {
  const container = document.getElementById('my-product-list');
  if (!container) return;

  try {
    const res = await fetch('/api/purchase?action=my_products');
    const data = await res.json();
    const activeProducts = (data && (data.userProducts || data.purchases || data.products)) || [];
    
    if (activeProducts.length === 0) {
      container.innerHTML = '<div class="empty-state">You do not have any active equipment working.</div>';
      return;
    }

    container.innerHTML = activeProducts.map(up => `
      <div class="product-card">
        <div class="product-info">
          <h4>${up.product_name || up.name || 'Equipment'}</h4>
          <div class="product-spec">Daily Yield: <strong>${formatNaira(up.daily_income || up.daily_yield || 0)}</strong></div>
          <div class="product-spec">Days Remaining: <strong>${up.days_remaining || 0} / ${up.total_days || 30}</strong></div>
          <div class="drop-timer-box"><i class="fa-regular fa-clock"></i> Next Drop in: ${up.next_drop_countdown || 'Active'}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">You do not have any active equipment working.</div>';
  }
}

// -------------------------------------------------------------
// DEDICATED INVITE & DEDICATED TEAM
// -------------------------------------------------------------
async function loadInviteData() {
  try {
    const res = await fetch('/api/team?action=invite_info');
    const data = await res.json();
    if (data && data.success) {
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
    if (data && data.success) {
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
    const title = document.getElementById('team-active-title');
    if (title) title.textContent = 'First Referral Members History';
  } else {
    if (c2) c2.classList.add('active');
    if (c1) c1.classList.remove('active');
    const title = document.getElementById('team-active-title');
    if (title) title.textContent = 'Second Referral Members History';
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
  const stageSelect = document.getElementById('recharge-stage-select');
  const stagePay = document.getElementById('recharge-stage-pay');
  if (stageSelect) stageSelect.style.display = 'block';
  if (stagePay) stagePay.style.display = 'none';

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
  if (!summaryEl) return;
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
    const res = await fetch('/api/gift-code?action=my_claims');
    const data = await res.json();
    if (data && data.success) {
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

  // Auth switch link toggles
  const showRegLink = document.getElementById('link-show-register');
  const showLoginLink = document.getElementById('link-show-login');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const authSub = document.getElementById('auth-subtitle');

  if (showRegLink) {
    showRegLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (loginForm) loginForm.style.display = 'none';
      if (regForm) regForm.style.display = 'block';
      if (authSub) authSub.textContent = 'Create a new investor account';
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (regForm) regForm.style.display = 'none';
      if (loginForm) loginForm.style.display = 'block';
      if (authSub) authSub.textContent = 'Log in to your account';
    });
  }

  // Login form handler
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

  // Register form handler
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

  // Predefined recharge buttons
  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const input = document.getElementById('recharge-amount-input');
      if (input) input.value = btn.getAttribute('data-amt');
    });
  });

  // Proceed to payment
  const proceedPayBtn = document.getElementById('btn-proceed-to-payment');
  if (proceedPayBtn) {
    proceedPayBtn.addEventListener('click', async () => {
      const amountInput = document.getElementById('recharge-amount-input');
      const amount = Number(amountInput ? amountInput.value : 0);
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

  // Clipboard copy helpers
  const copyAccBtn = document.getElementById('btn-copy-account');
  if (copyAccBtn) {
    copyAccBtn.addEventListener('click', () => {
      const acc = document.getElementById('det-acc-number').textContent;
      navigator.clipboard.writeText(acc).then(() => showToast('Account number copied!'));
    });
  }

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

  // Save bank card form
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

  // Gift code redemption form
  const giftForm = document.getElementById('form-page-gift');
  if (giftForm) {
    giftForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('input-page-gift-code').value.trim();
      try {
        const res = await fetch('/api/gift-code?action=claim', {
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

  // Withdrawal form
  const submitWithBtn = document.getElementById('btn-submit-withdraw');
  if (submitWithBtn) {
    submitWithBtn.addEventListener('click', async () => {
      const input = document.getElementById('input-withdraw-amount');
      const amount = Number(input ? input.value : 0);
      if (!amount || amount < 1000) {
        showToast('Minimum withdrawal is ₦1,000');
        return;
      }
      try {
        const res = await fetch('/api/withdraw', {
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

// Transaction History loader
async function loadHistory(type) {
  const titleEl = document.getElementById('history-page-title');
  const itemsEl = document.getElementById('history-page-items');
  if (titleEl) titleEl.textContent = type.toUpperCase() + ' HISTORY';
  if (!itemsEl) return;
  itemsEl.innerHTML = '<div class="empty-state">Loading history...</div>';

  try {
    const res = await fetch(`/api/transactions?type=${type}`);
    const data = await res.json();
    if (!data.success || !data.records || data.records.length === 0) {
      itemsEl.innerHTML = '<div class="empty-state">No transaction records found.</div>';
      return;
    }
    itemsEl.innerHTML = data.records.map(r => `
      <div class="history-item">
        <div>
          <div class="item-title">${r.title || r.type} <span class="item-badge badge-${(r.status || 'pending').toLowerCase()}">${r.status}</span></div>
          <div class="item-date">${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div class="item-amount ${r.direction === 'in' ? 'in' : 'out'}">${r.direction === 'in' ? '+' : '-'}${formatNaira(r.amount)}</div>
      </div>
    `).join('');
  } catch (e) {
    itemsEl.innerHTML = '<div class="empty-state">Failed to load transactions.</div>';
  }
}
