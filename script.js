/* =============================================================
   NovaVest Main Client Controller (Complete Full Build)
============================================================= */
let currentUser = null;
let currentSettings = null;
let activeTeamTier = 1;
let currentSelectedChannelId = null;
let timerInterval = null;
let currentTeamData = null;
let userHasLinkedBank = false;

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

// Helper: Format Date & Time
function formatDateTime(isoString) {
  if (!isoString) return '---';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '---';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) + ', ' + d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
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
// PERSISTENT AUTH & SESSION MANAGEMENT
// -------------------------------------------------------------
async function checkAuthSession() {
  const savedUserId = localStorage.getItem('novavest_session') || '';
  
  try {
    const res = await fetch(`/api/bootstrap?user_id=${encodeURIComponent(savedUserId)}`, { 
      credentials: 'include' 
    });
    const data = await res.json();

    if (data && data.success && data.user) {
      currentUser = data.user;
      currentSettings = data.settings || null;
      localStorage.setItem('novavest_session', data.user.id);
      localStorage.setItem('novavest_user', JSON.stringify(data.user));

      const authContainer = document.getElementById('auth-container');
      const appContainer = document.getElementById('app-container');
      if (authContainer) authContainer.style.display = 'none';
      if (appContainer) appContainer.style.display = 'block';

      if (data.impersonating) {
        const impBar = document.getElementById('impersonation-bar');
        if (impBar) impBar.style.display = 'flex';
      }

      switchView('home');
      return true;
    } else {
      const cached = localStorage.getItem('novavest_user');
      if (cached) {
        try {
          currentUser = JSON.parse(cached);
          const authContainer = document.getElementById('auth-container');
          const appContainer = document.getElementById('app-container');
          if (authContainer) authContainer.style.display = 'none';
          if (appContainer) appContainer.style.display = 'block';
          switchView('home');
          return true;
        } catch (e) {}
      }
      showAuthScreen();
      return false;
    }
  } catch (err) {
    const cached = localStorage.getItem('novavest_user');
    if (cached) {
      try {
        currentUser = JSON.parse(cached);
        const authContainer = document.getElementById('auth-container');
        const appContainer = document.getElementById('app-container');
        if (authContainer) authContainer.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        switchView('home');
        return true;
      } catch (e) {}
    }
    showAuthScreen();
    return false;
  }
}

function showAuthScreen() {
  currentUser = null;
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('app-container');
  
  if (authContainer && appContainer) {
    authContainer.style.display = 'flex';
    appContainer.style.display = 'none';
  } else {
    switchView('home');
  }
}

async function performLogout() {
  try {
    await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' });
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
    const savedUserId = localStorage.getItem('novavest_session') || '';
    const res = await fetch(`/api/bootstrap?user_id=${encodeURIComponent(savedUserId)}`, { 
      credentials: 'include' 
    });
    const data = await res.json();
    if (data && data.success && data.user) {
      currentUser = data.user;
      
      const phoneEl = document.getElementById('profile-phone');
      const uidEl = document.getElementById('profile-uid');
      const depBalEl = document.getElementById('prof-deposit-bal');
      const withBalEl = document.getElementById('prof-withdrawable-bal');
      const totWithEl = document.getElementById('prof-total-withdrawn');

      if (phoneEl) phoneEl.textContent = currentUser.phone || currentUser.phone_number || 'Investor';
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
    const res = await fetch('/api/bootstrap', { credentials: 'include' });
    const data = await res.json();
    const products = data.products || (data.data && data.data.products) || [];

    if (!products || products.length === 0) {
      container.innerHTML = '<div class="empty-state">No equipment currently available.</div>';
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="product-card">
        <div class="product-info">
          <h4>${p.name || p.title}</h4>
          <div class="product-spec">Daily Income: <strong>${formatNaira(p.daily_yield || p.daily_income)}</strong></div>
          <div class="product-spec">Cycle Duration: <strong>${p.duration_days || p.days} Days</strong></div>
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
  if (!currentUser) {
    showToast('Please sign in to purchase equipment.');
    showAuthScreen();
    return;
  }

  if (!confirm('Confirm purchasing this VIP equipment?')) return;
  try {
    const res = await fetch('/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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

// -------------------------------------------------------------
// ACTIVE PRODUCTS: 24-HOUR ROLLING COUNTDOWN
// -------------------------------------------------------------
async function loadMyActiveProducts() {
  const container = document.getElementById('my-product-list') || 
                    document.getElementById('user-products-list') ||
                    document.querySelector('#view-products .product-list');

  if (!container) return;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  try {
    const savedUserId = localStorage.getItem('novavest_session') || '';
    const res = await fetch(`/api/bootstrap?user_id=${encodeURIComponent(savedUserId)}`, { 
      credentials: 'include' 
    });
    const data = await res.json();
    const myProducts = data.myProducts || data.purchases || (data.data && (data.data.myProducts || data.data.purchases)) || [];

    if (!myProducts || myProducts.length === 0) {
      container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 40px 20px; color:#888;">You do not have any active equipment working.</div>';
      return;
    }

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    container.innerHTML = myProducts.map((up, i) => {
      const createdDate = formatDateTime(up.created_at);
      const dailyYield = Number(up.daily_yield || up.daily_income || 0);
      const totalDays = Number(up.duration_days || up.period_days || 30);
      const totalRev = Number(up.total_revenue || (dailyYield * totalDays));

      const droppedIncome = Number(up.dropped_income !== undefined ? up.dropped_income : 0);
      const remainingIncome = Number(up.remaining_income !== undefined ? up.remaining_income : Math.max(0, totalRev - droppedIncome));

      const createdMs = up.created_at ? new Date(up.created_at).getTime() : now;
      const elapsed = Math.max(0, now - createdMs);
      const completedCycles = Math.floor(elapsed / DAY_MS);
      const nextDropMs = createdMs + ((completedCycles + 1) * DAY_MS);

      return `
        <div class="product-card" style="padding: 16px; margin-bottom: 16px; border-radius: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);">
          <div class="product-info">
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <h4 style="font-size: 16px; margin: 0; color: #fff;">${up.product_name || up.name}</h4>
              <span class="item-badge badge-active" style="background: rgba(0, 200, 83, 0.2); color: #00e676; padding: 3px 8px; border-radius: 4px; font-size: 12px;">${up.status || 'Active'}</span>
            </div>
            
            <div class="product-spec" style="font-size: 13px; color: #888; margin-top: 6px;">
              <i class="fa-regular fa-calendar-check"></i> Bought: <strong style="color:#ddd;">${createdDate}</strong>
            </div>

            <div class="product-spec" style="font-size: 14px; margin-top: 8px;">
              Daily Income: <strong class="text-success" style="color: #00e676;">${formatNaira(dailyYield)}</strong>
            </div>

            <!-- Income Dropped vs Remaining Ratio Box -->
            <div style="background: rgba(0, 0, 0, 0.25); padding: 12px; border-radius: 8px; margin: 12px 0; border: 1px solid rgba(255, 255, 255, 0.05);">
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px;">
                <span style="color: #aaa;">Money Paid Out:</span>
                <strong style="color: #00e676;">${formatNaira(droppedIncome)}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 13px;">
                <span style="color: #aaa;">Remaining to Drop:</span>
                <strong style="color: #ff9100;">${formatNaira(remainingIncome)}</strong>
              </div>
              <div style="font-size: 11px; text-align: right; color: #777; margin-top: 6px;">
                Total Contract: ${formatNaira(totalRev)}
              </div>
            </div>

            <!-- Live Countdown Timer -->
            <div class="drop-timer-box" style="padding: 10px 12px; background: rgba(0, 122, 255, 0.12); border-radius: 6px; font-weight: bold; color: #29b6f6; display: flex; align-items: center; justify-content: space-between;">
              <span><i class="fa-regular fa-clock"></i> Next Income Drop:</span> 
              <span class="live-countdown" data-purchase-id="${up.id}" data-target="${nextDropMs}" id="timer-${i}">23:59:59</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const claimingMap = {};

    function updateCountdowns() {
      const timers = document.querySelectorAll('.live-countdown');
      const currentTime = Date.now();

      timers.forEach(t => {
        let target = Number(t.getAttribute('data-target'));
        const purchaseId = t.getAttribute('data-purchase-id');
        let diff = target - currentTime;

        if (diff <= 0) {
          t.textContent = "00:00:00";

          if (!claimingMap[purchaseId]) {
            claimingMap[purchaseId] = true;

            fetch('/api/purchase?action=claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ 
                purchaseId: purchaseId, 
                user_id: localStorage.getItem('novavest_session') 
              })
            }).then(r => r.json()).then(res => {
              if (res.success) {
                showToast(`+${formatNaira(res.reward)} daily income dropped!`);
                loadProfileData();
                loadMyActiveProducts();
              } else {
                t.setAttribute('data-target', String(currentTime + DAY_MS));
                delete claimingMap[purchaseId];
              }
            }).catch(() => {
              delete claimingMap[purchaseId];
            });
          }
        } else {
          const hrs = Math.floor(diff / (1000 * 60 * 60));
          const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          t.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
      });
    }

    updateCountdowns();
    timerInterval = setInterval(updateCountdowns, 1000);

  } catch (err) {
    console.error("Error loading active equipment:", err);
    container.innerHTML = '<div class="empty-state">Unable to load your equipment.</div>';
  }
}

// -------------------------------------------------------------
// DEDICATED INVITE & DEDICATED TEAM
// -------------------------------------------------------------
async function loadInviteData() {
  try {
    const savedUserId = localStorage.getItem('novavest_session') || '';
    const res = await fetch(`/api/team?action=invite&user_id=${encodeURIComponent(savedUserId)}`, { 
      credentials: 'include' 
    });
    const data = await res.json();
    if (data && data.success) {
      const linkInput = document.getElementById('invite-link-val');
      const codeInput = document.getElementById('invite-code-val');

      if (linkInput) linkInput.value = data.referral_link || '';
      if (codeInput) codeInput.value = data.referral_code || '------';
    }
  } catch (e) {
    console.error('Failed to load invite info:', e);
  }
}

async function loadTeamData() {
  const tbody = document.getElementById('team-table-body');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Loading team details...</td></tr>';
  }

  try {
    const savedUserId = localStorage.getItem('novavest_session') || '';
    const res = await fetch(`/api/team?user_id=${encodeURIComponent(savedUserId)}`, { 
      credentials: 'include' 
    });
    const data = await res.json();

    if (!data || !data.success) {
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Please log in to view team details.</td></tr>';
      }
      return;
    }

    currentTeamData = data;

    const t1 = data.team1 || { total_members: 0, total_income: 0, records: [] };
    const t2 = data.team2 || { total_members: 0, total_income: 0, records: [] };

    const t1Count = document.getElementById('team1-members-count');
    const t1Income = document.getElementById('team1-members-income');
    const t2Count = document.getElementById('team2-members-count');
    const t2Income = document.getElementById('team2-members-income');

    if (t1Count) t1Count.textContent = t1.total_members || 0;
    if (t1Income) t1Income.textContent = formatNaira(t1.total_income || 0);
    if (t2Count) t2Count.textContent = t2.total_members || 0;
    if (t2Income) t2Income.textContent = formatNaira(t2.total_income || 0);

    renderTeamTierTable(activeTeamTier, data);
  } catch (e) {
    console.error('Team load error:', e);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No members in your team yet.</td></tr>';
    }
  }
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

  if (currentTeamData) {
    renderTeamTierTable(activeTeamTier, currentTeamData);
  } else {
    loadTeamData();
  }
}

function renderTeamTierTable(tier, overviewData) {
  const tbody = document.getElementById('team-table-body');
  if (!tbody) return;

  const tierObj = tier === 1 ? overviewData.team1 : overviewData.team2;
  const records = (tierObj && tierObj.records) ? tierObj.records : [];

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">No commission records for Tier ${tier} yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => `
    <tr>
      <td>${r.phone || ('User #' + r.user_id)}</td>
      <td>${r.product_name || 'VIP Equipment'}</td>
      <td class="text-success font-bold">+${formatNaira(r.commission || 0)}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// RECHARGE LOGIC
// -------------------------------------------------------------
async function loadRechargeView() {
  const sSelect = document.getElementById('recharge-stage-select');
  const sPay = document.getElementById('recharge-stage-pay');
  if (sSelect) sSelect.style.display = 'block';
  if (sPay) sPay.style.display = 'none';

  const channelsWrap = document.getElementById('payment-channels-list');
  if (!channelsWrap) return;

  try {
    const res = await fetch('/api/bank?action=deposit_channels', { credentials: 'include' });
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
      channelsWrap.innerHTML = '<div class="empty-state">No payment channel active.</div>';
    }
  } catch (e) {
    channelsWrap.innerHTML = '<div class="empty-state">Failed to load channels.</div>';
  }
}

function selectPaymentChannel(id, el) {
  currentSelectedChannelId = id;
  const options = document.querySelectorAll('.channel-option');
  options.forEach(o => o.classList.remove('active'));
  if (el) el.classList.add('active');
}

// -------------------------------------------------------------
// WITHDRAWAL LOGIC (UPDATED WITH BANK VERIFICATION & GUIDANCE)
// -------------------------------------------------------------
async function loadWithdrawalView() {
  const balEl = document.getElementById('withdraw-available-bal');
  const summaryEl = document.getElementById('withdraw-bank-summary');
  if (balEl && currentUser) {
    balEl.textContent = formatNaira(currentUser.withdrawable_balance);
  }
  if (!summaryEl) return;

  try {
    const res = await fetch('/api/bank?action=get_user_bank', { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.bank) {
      userHasLinkedBank = true;
      summaryEl.innerHTML = `
        <strong>Linked Bank:</strong> ${data.bank.bank_name}<br>
        <strong>Account Number:</strong> ${data.bank.account_number}<br>
        <strong>Account Name:</strong> ${data.bank.account_holder}
      `;
    } else {
      userHasLinkedBank = false;
      summaryEl.innerHTML = `
        <p style="color:var(--warning, #ff9800); font-size:13px; margin-bottom:8px;">
          <i class="fa-solid fa-triangle-exclamation"></i> No withdrawal bank account linked yet.
        </p>
        <button class="btn btn-sm btn-primary" onclick="switchView('bank-card')">Link Bank Card Now</button>
      `;
    }
  } catch (e) {
    userHasLinkedBank = false;
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
    const res = await fetch('/api/gift-code?action=my_claims', { credentials: 'include' });
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
  
  loadProducts();
  checkAuthSession();

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view');
      switchView(v);
    });
  });

  const actRecharge = document.getElementById('btn-nav-recharge');
  const actWithdraw = document.getElementById('btn-nav-withdraw');
  const actInvite = document.getElementById('btn-nav-invite');
  const actGift = document.getElementById('btn-nav-gift');

  if (actRecharge) actRecharge.addEventListener('click', () => switchView('recharge'));
  if (actWithdraw) actWithdraw.addEventListener('click', () => switchView('withdrawal'));
  if (actInvite) actInvite.addEventListener('click', () => switchView('invite'));
  if (actGift) actGift.addEventListener('click', () => switchView('gift'));

  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const backTarget = btn.getAttribute('data-back') || 'home';
      switchView(backTarget);
    });
  });

  const mBank = document.getElementById('menu-bank-card');
  const mDep = document.getElementById('menu-dep-history');
  const mWith = document.getElementById('menu-with-history');
  const mTx = document.getElementById('menu-tx-history');

  if (mBank) mBank.addEventListener('click', () => switchView('bank-card'));
  if (mDep) mDep.addEventListener('click', () => { switchView('history'); loadHistory('deposit'); });
  if (mWith) mWith.addEventListener('click', () => { switchView('history'); loadHistory('withdrawal'); });
  if (mTx) mTx.addEventListener('click', () => { switchView('history'); loadHistory('all'); });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', performLogout);

  const retAdminBtn = document.getElementById('btn-return-admin');
  if (retAdminBtn) {
    retAdminBtn.addEventListener('click', async () => {
      await fetch('/api/auth?action=stop_impersonate', { method: 'POST', credentials: 'include' });
      window.location.href = '/admin.html';
    });
  }

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

  // Login Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('login-phone').value.trim();
      const password = document.getElementById('login-password').value;
      
      try {
        const res = await fetch('/api/auth?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ phone, password })
        });
        const data = await res.json();
        
        if (data.success) {
          showToast('Welcome back!');
          const uid = (data.user && data.user.id) || data.userId || data.id || phone;
          localStorage.setItem('novavest_session', uid);
          
          if (data.user) {
            currentUser = data.user;
            localStorage.setItem('novavest_user', JSON.stringify(data.user));
          }

          const authContainer = document.getElementById('auth-container');
          const appContainer = document.getElementById('app-container');
          if (authContainer) authContainer.style.display = 'none';
          if (appContainer) appContainer.style.display = 'block';

          await checkAuthSession();
          switchView('home');
        } else {
          showToast(data.message || data.error || 'Login failed.');
        }
      } catch (err) {
        showToast('Network error during login.');
      }
    });
  }

  // Register Submission
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
          credentials: 'include',
          body: JSON.stringify({ phone, password, refCode })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Registration successful! Logging in...');
          const uid = (data.user && data.user.id) || data.userId || data.id;
          if (uid) {
            localStorage.setItem('novavest_session', uid);
          }
          await checkAuthSession();
        } else {
          showToast(data.message || 'Registration failed.');
        }
      } catch (err) {
        showToast('Network error during registration.');
      }
    });
  }

  // Quick Amount Buttons
  document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const input = document.getElementById('recharge-amount-input');
      if (input) input.value = btn.getAttribute('data-amt');
    });
  });

  // Proceed to Payment Screen
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
        const res = await fetch(`/api/bank?action=channel_detail&id=${currentSelectedChannelId}`, { credentials: 'include' });
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

  // Copy Helpers
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

  // Save Bank Details Form
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
          credentials: 'include',
          body: JSON.stringify({ bankName, accountNumber, accountHolder })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Bank details saved successfully!');
          userHasLinkedBank = true;
          switchView('withdrawal');
        } else {
          showToast(data.message || 'Failed to save bank.');
        }
      } catch (err) {
        showToast('Error saving bank details.');
      }
    });
  }

  // Gift Code Claim Form
  const giftForm = document.getElementById('form-page-gift');
  if (giftForm) {
    giftForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('input-page-gift-code').value.trim();
      try {
        const res = await fetch('/api/gift-code?action=claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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

  // Withdrawal Submit Button with Active Bank Pre-check
  const submitWithBtn = document.getElementById('btn-submit-withdraw');
  if (submitWithBtn) {
    submitWithBtn.addEventListener('click', async () => {
      const input = document.getElementById('input-withdraw-amount');
      const amount = Number(input ? input.value : 0);

      if (!amount || amount < 1000) {
        showToast('Minimum withdrawal amount is ₦1,000');
        return;
      }

      // Check if user has linked a bank card before submitting
      if (!userHasLinkedBank) {
        showToast('No bank account linked. Redirecting to link bank card...');
        setTimeout(() => switchView('bank-card'), 1200);
        return;
      }

      try {
        const res = await fetch('/api/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ amount })
        });
        const data = await res.json();

        if (data.success) {
          showToast(data.message || 'Withdrawal submitted successfully!');
          input.value = '';
          loadProfileData();
          loadWithdrawalView();
        } else {
          if (data.code === 'NO_BANK') {
            showToast(data.message);
            setTimeout(() => switchView('bank-card'), 1200);
          } else {
            showToast(data.message || 'Withdrawal failed. Please check your balance.');
          }
        }
      } catch (e) {
        showToast('Network error submitting withdrawal request.');
      }
    });
  }
});

// Transaction History Records Loader
async function loadHistory(type) {
  const titleEl = document.getElementById('history-page-title');
  const itemsEl = document.getElementById('history-page-items');
  if (titleEl) titleEl.textContent = type.toUpperCase() + ' HISTORY';
  if (!itemsEl) return;
  itemsEl.innerHTML = '<div class="empty-state">Loading history...</div>';

  try {
    const res = await fetch(`/api/transactions?type=${type}`, { credentials: 'include' });
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
