<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <title>NovaVest - Admin Control Panel</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --primary: #0284c7;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --sidebar: #0f172a;
      --border: #e2e8f0;
      --pill-bg: #f1f5f9;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background-color: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; }
    
    .top-bar { background: #fff; border-bottom: 1px solid var(--border); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 1000; }
    .top-bar .title-group { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; }
    .btn-menu { background: none; border: none; font-size: 22px; cursor: pointer; color: var(--text); }
    .btn-key { background: #e0f2fe; color: var(--primary); border: 1px solid #bae6fd; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; }

    .sidebar { position: fixed; top: 0; left: -280px; width: 280px; height: 100vh; background: var(--sidebar); color: #fff; z-index: 1100; transition: left 0.3s; padding: 20px; overflow-y: auto; }
    .sidebar.open { left: 0; }
    .sidebar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
    .sidebar-section-title { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; margin: 18px 0 8px; }
    .nav-btn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: none; border: none; color: #cbd5e1; font-size: 14px; border-radius: 8px; cursor: pointer; text-align: left; }
    .nav-btn.active, .nav-btn:hover { background: #1e293b; color: #fff; }
    .nav-btn i { width: 18px; font-size: 16px; }
    .overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1050; }
    .overlay.open { display: block; }

    .admin-main { padding: 16px; max-width: 650px; margin: 0 auto; width: 100%; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .stat-card { border-radius: 14px; padding: 18px; color: #fff; margin-bottom: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.06); }
    .stat-card.dark { background: #064e3b; }
    .stat-card.green { background: #059669; }
    .stat-card.pink { background: #e11d48; }
    .stat-card.orange { background: #d97706; }
    .stat-card.amber { background: #b45309; }
    .stat-card.purple { background: #4f46e5; }
    .stat-label { font-size: 13px; opacity: 0.9; }
    .stat-val { font-size: 26px; font-weight: 800; margin: 6px 0; }
    .stat-meta { font-size: 12px; opacity: 0.85; }

    .search-bar { width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-radius: 12px; background: #fff; margin-bottom: 16px; outline: none; font-size: 14px; }
    .user-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 18px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.02); }
    .user-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .phone-text { font-size: 18px; font-weight: 800; color: #0f172a; }
    .badge-ban { background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; cursor: pointer; }
    .badge-ban.banned { background: #ef4444; color: #fff; }
    .user-subinfo { font-size: 12px; color: var(--muted); margin-bottom: 12px; line-height: 1.5; }

    .action-button-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .pill-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; border: none; cursor: pointer; }
    .pill-blue { background: #e0f2fe; color: #0369a1; }
    .pill-gray { background: #f1f5f9; color: #475569; }
    .pill-dark { background: #0f172a; color: #fff; }
    .pill-red { background: #fee2e2; color: #b91c1c; }

    .balance-adjust-panel { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 14px; }
    .adjust-inputs { display: flex; gap: 8px; margin-bottom: 10px; }
    .adjust-inputs input { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; outline: none; }
    .adjust-inputs select { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; outline: none; background: #fff; }
    .adjust-btns { display: flex; gap: 8px; }
    .btn-add { flex: 1; background: #0284c7; color: #fff; padding: 10px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; }
    .btn-subtract { flex: 1; background: #f1f5f9; color: #334155; padding: 10px; border-radius: 8px; border: 1px solid var(--border); font-weight: 700; cursor: pointer; }

    .user-balance-summary { background: #f8fafc; border-radius: 14px; padding: 16px; border: 1px solid var(--border); margin-bottom: 14px; }
    .bal-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .bal-item .lbl { font-size: 11px; color: var(--muted); text-transform: uppercase; }
    .bal-item .val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px; }

    .req-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
    .req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .badge-ref { background: #e0f2fe; color: var(--primary); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
    .badge-status { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; }
    .badge-pending { background: #fef3c7; color: var(--warning); }
    .badge-approved { background: #d1fae5; color: var(--success); }
    .badge-declined { background: #fee2e2; color: var(--danger); }
    .req-title { font-size: 15px; font-weight: 700; }
    .req-amount { font-size: 20px; font-weight: 800; margin: 6px 0; }
    .req-amount.in { color: var(--success); }
    .req-amount.out { color: var(--danger); }
    .req-meta { font-size: 12px; color: var(--muted); margin-bottom: 12px; }
    .btn-row { display: flex; gap: 8px; margin-top: 10px; }
    .btn-action { flex: 1; padding: 10px; border-radius: 8px; border: none; font-weight: 700; font-size: 13px; cursor: pointer; }
    .btn-approve { background: #dcfce7; color: #166534; }
    .btn-decline { background: #fee2e2; color: #991b1b; }

    .setting-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; outline: none; }
    .btn-save { background: #0284c7; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }

    .product-mgmt-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
    .prod-grid-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .btn-sync { background: #0284c7; color: #fff; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; }

    .switch-wrap { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f8fafc; border-radius: 10px; border: 1px solid var(--border); margin-bottom: 14px; }
    .switch-status-text { font-size: 12px; font-weight: 800; }
    .switch-status-text.open { color: var(--success); }
    .switch-status-text.closed { color: var(--danger); }
    .btn-toggle-switch { padding: 6px 14px; border-radius: 6px; border: none; font-weight: 700; font-size: 12px; cursor: pointer; }
    .btn-toggle-switch.is-open { background: #fee2e2; color: #b91c1c; }
    .btn-toggle-switch.is-closed { background: #dcfce7; color: #166534; }

    .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9999; align-items: center; justify-content: center; padding: 20px; }
    .modal-backdrop.open { display: flex; }
    .modal-box { background: #fff; border-radius: 12px; max-width: 480px; width: 100%; padding: 16px; position: relative; }
    .modal-box img { width: 100%; border-radius: 8px; max-height: 75vh; object-fit: contain; }
  </style>
</head>
<body>

  <header class="top-bar">
    <div class="title-group">
      <i class="fa-solid fa-bolt" style="color: #0284c7;"></i>
      <span id="page-heading">Dashboard</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn-key" id="btn-set-key"><i class="fa-solid fa-key"></i> Key</button>
      <button class="btn-menu" id="btn-toggle-menu"><i class="fa-solid fa-bars"></i></button>
    </div>
  </header>

  <div class="overlay" id="overlay"></div>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <span style="font-weight: 800; font-size: 16px;">ADMIN PANEL</span>
      <button id="btn-close-sidebar" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">&times;</button>
    </div>
    
    <div class="sidebar-section-title">Overview</div>
    <button class="nav-btn active" data-tab="tab-dashboard"><i class="fa-solid fa-house"></i> Dashboard</button>
    <button class="nav-btn" data-tab="tab-users"><i class="fa-solid fa-users"></i> User Management</button>

    <div class="sidebar-section-title">Money</div>
    <button class="nav-btn" data-tab="tab-deposits"><i class="fa-solid fa-wallet"></i> Deposit Requests</button>
    <button class="nav-btn" data-tab="tab-withdrawals"><i class="fa-solid fa-money-bill-transfer"></i> Withdrawal Requests</button>
    <button class="nav-btn" data-tab="tab-admin-investments"><i class="fa-solid fa-file-invoice-dollar"></i> User Investments</button>

    <div class="sidebar-section-title">Configuration</div>
    <button class="nav-btn" data-tab="tab-products"><i class="fa-solid fa-box"></i> Investment Products</button>
    <button class="nav-btn" data-tab="tab-settings"><i class="fa-solid fa-gear"></i> Settings & Rates</button>
  </aside>

  <main class="admin-main">
    <!-- 1. DASHBOARD -->
    <section id="tab-dashboard" class="tab-content active">
      <div class="stat-card dark">
        <div class="stat-label">Total Users</div>
        <div class="stat-val" id="dash-users">0</div>
        <div class="stat-meta">Active registered accounts</div>
      </div>

      <div class="stat-card purple">
        <div class="stat-label">Total Balance</div>
        <div class="stat-val" id="dash-user-bal">₦0.00</div>
        <div class="stat-meta">Total current money in all users' wallets</div>
      </div>

      <div class="stat-card green">
        <div class="stat-label">Total Deposits</div>
        <div class="stat-val" id="dash-deposits">₦0.00</div>
        <div class="stat-meta">Approved recharge transactions (<span id="dash-deposits-count">0</span>)</div>
      </div>

      <div class="stat-card dark">
        <div class="stat-label">Total Investment</div>
        <div class="stat-val" id="dash-investment">₦0.00</div>
        <div class="stat-meta">Active package purchases (<span id="dash-investment-count">0</span>)</div>
      </div>

      <div class="stat-card pink">
        <div class="stat-label">Total Payouts / Withdrawals</div>
        <div class="stat-val" id="dash-payouts">₦0.00</div>
        <div class="stat-meta">Approved payout requests (<span id="dash-payouts-count">0</span>)</div>
      </div>

      <div class="stat-card green" style="background: #047857;">
        <div class="stat-label">Platform Profit</div>
        <div class="stat-val" id="dash-profit">₦0.00</div>
        <div class="stat-meta">Total Investment &minus; Total Withdrawn</div>
      </div>

      <div class="stat-card orange">
        <div class="stat-label">Pending Withdrawal</div>
        <div class="stat-val" id="dash-pending-with">₦0.00</div>
        <div class="stat-meta">Awaiting approval (<span id="dash-pending-with-count">0</span>)</div>
      </div>

      <div class="stat-card amber">
        <div class="stat-label">Pending Deposit</div>
        <div class="stat-val" id="dash-pending-dep">₦0.00</div>
        <div class="stat-meta">Awaiting approval (<span id="dash-pending-dep-count">0</span>)</div>
      </div>

      <div class="setting-card">
        <h3>Generate Gift Code</h3>
        <p>Direct balance coupon for users.</p>
        <div class="form-group">
          <label>Amount (₦)</label>
          <input type="number" id="gift-amt" value="500" />
        </div>
        <div class="form-group">
          <label>Max Claims</label>
          <input type="number" id="gift-claims" value="100" />
        </div>
        <div class="form-group">
          <label>Expires In (Minutes)</label>
          <input type="number" id="gift-mins" value="60" />
        </div>
        <button class="btn-save" id="btn-make-gift"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Code</button>
      </div>
    </section>

    <!-- 2. USER MANAGEMENT -->
    <section id="tab-users" class="tab-content">
      <input type="text" id="user-search-input" class="search-bar" placeholder="Search by Phone Number, UID, or Referral Code..." />
      <div id="users-container">Loading users...</div>
    </section>

    <!-- 3. DEPOSIT REQUESTS -->
    <section id="tab-deposits" class="tab-content">
      <div id="deposits-list-container">Loading deposits...</div>
    </section>

    <!-- 4. WITHDRAWAL REQUESTS -->
    <section id="tab-withdrawals" class="tab-content">
      <div id="withdrawals-list-container">Loading withdrawals...</div>
    </section>

    <!-- 5. USER INVESTMENTS LISTING & DELETION -->
    <section id="tab-admin-investments" class="tab-content">
      <div class="section-title">Active Platform Investments</div>
      <div id="admin-investments-list">Loading investments...</div>
    </section>

    <!-- 6. PRODUCTS CONFIG -->
    <section id="tab-products" class="tab-content">
      <div id="products-list-container">Loading products...</div>
    </section>

    <!-- 7. SETTINGS & RATES -->
    <section id="tab-settings" class="tab-content">
      <div class="setting-card">
        <h3>Global Withdrawal Control</h3>
        <p>Turn withdrawals ON or OFF platform-wide.</p>
        <div class="switch-wrap">
          <div>
            <div class="switch-label">Platform Withdrawal Status</div>
            <div id="global-withdrawal-text" class="switch-status-text open">OPEN</div>
          </div>
          <button id="btn-toggle-global-withdrawal" class="btn-toggle-switch is-open" onclick="toggleGlobalWithdrawal()">CLOSE Withdrawals</button>
        </div>
      </div>

      <div class="setting-card">
        <h3>Withdrawal Charges & Limits</h3>
        <div class="form-group">
          <label>Fee Rate (%)</label>
          <input type="number" id="set-fee" value="10" />
        </div>
        <div class="form-group">
          <label>Minimum Amount (₦)</label>
          <input type="number" id="set-min" value="1000" />
        </div>
        <button class="btn-save" onclick="saveWithdrawalControls()">Save Withdrawal Settings</button>
      </div>

      <div class="setting-card">
        <h3>Welcome Bonus</h3>
        <div class="form-group">
          <label>Bonus Amount (₦)</label>
          <input type="number" id="set-bonus" value="0" />
        </div>
        <button class="btn-save" onclick="saveSetting('welcome_bonus', document.getElementById('set-bonus').value)">Save Bonus</button>
      </div>

      <div class="setting-card">
        <h3>Referral Commission Rates</h3>
        <div class="form-group">
          <label>Level 1 Rate (%)</label>
          <input type="number" id="set-l1" value="20" />
        </div>
        <div class="form-group">
          <label>Level 2 Rate (%)</label>
          <input type="number" id="set-l2" value="2" />
        </div>
        <button class="btn-save" onclick="saveRates()">Update Rates</button>
      </div>

      <div class="setting-card">
        <h3>Admin Receiving Bank</h3>
        <div class="form-group">
          <label>Bank Name</label>
          <input type="text" id="set-bank-name" value="Palmpay" />
        </div>
        <div class="form-group">
          <label>Account Name</label>
          <input type="text" id="set-bank-holder" value="NovaVest Ltd" />
        </div>
        <div class="form-group">
          <label>Account Number</label>
          <input type="text" id="set-bank-num" value="1234567890" />
        </div>
        <button class="btn-save" onclick="saveAdminBank()">Update Bank</button>
      </div>
    </section>
  </main>

  <div class="modal-backdrop" id="receipt-modal">
    <div class="modal-box">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong style="font-size:15px;">Payment Receipt Proof</strong>
        <button onclick="closeReceiptModal()" style="background:none; border:none; font-size:22px; cursor:pointer;">&times;</button>
      </div>
      <img id="modal-receipt-img" src="" alt="Payment Receipt" />
    </div>
  </div>

  <script>
    let adminKey = localStorage.getItem('nv_admin_key') || 'novavest_admin_2026';
    let loadedUsers = [];
    let expandedUserId = null;
    let globalWithdrawalsEnabled = true;

    function setKey() {
      const input = prompt('Enter Admin Key:', adminKey);
      if (input) {
        adminKey = input.trim();
        localStorage.setItem('nv_admin_key', adminKey);
        loadCurrentTab();
      }
    }
    document.getElementById('btn-set-key').onclick = setKey;

    async function adminFetch(action, options = {}) {
      options.headers = options.headers || {};
      options.headers['x-admin-key'] = adminKey;
      if (options.body && typeof options.body === 'object') {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      const res = await fetch(`/api/admin?action=${action}`, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed request.');
      return data;
    }

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    document.getElementById('btn-toggle-menu').onclick = () => { sidebar.classList.add('open'); overlay.classList.add('open'); };
    document.getElementById('btn-close-sidebar').onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };
    overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        document.getElementById('page-heading').innerText = btn.innerText.trim();
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        loadCurrentTab();
      };
    });

    function fmt(n) {
      return '₦' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function loadCurrentTab() {
      const activeTab = document.querySelector('.tab-content.active').id;
      if (activeTab === 'tab-dashboard') loadDashboard();
      if (activeTab === 'tab-users') loadUsers();
      if (activeTab === 'tab-deposits') loadDeposits();
      if (activeTab === 'tab-withdrawals') loadWithdrawals();
      if (activeTab === 'tab-admin-investments') loadAdminInvestments();
      if (activeTab === 'tab-products') loadProducts();
      if (activeTab === 'tab-settings') loadSettings();
    }

    async function loadDashboard() {
      try {
        const { stats } = await adminFetch('dashboard');
        document.getElementById('dash-users').innerText = stats.total_users;
        document.getElementById('dash-user-bal').innerText = fmt(stats.total_balance);
        document.getElementById('dash-deposits').innerText = fmt(stats.total_deposits);
        document.getElementById('dash-deposits-count').innerText = stats.deposits_count;
        document.getElementById('dash-investment').innerText = fmt(stats.total_investment);
        document.getElementById('dash-investment-count').innerText = stats.investment_count;
        document.getElementById('dash-payouts').innerText = fmt(stats.total_payouts);
        document.getElementById('dash-payouts-count').innerText = stats.payouts_count;
        document.getElementById('dash-profit').innerText = fmt(stats.platform_profit);
        document.getElementById('dash-pending-with').innerText = fmt(stats.pending_withdrawals);
        document.getElementById('dash-pending-with-count').innerText = stats.pending_withdrawals_count;
        document.getElementById('dash-pending-dep').innerText = fmt(stats.pending_deposits);
        document.getElementById('dash-pending-dep-count').innerText = stats.pending_deposits_count;
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
    }

    document.getElementById('btn-make-gift').onclick = async () => {
      const amount = document.getElementById('gift-amt').value;
      const max_claims = document.getElementById('gift-claims').value;
      const expires_in_minutes = document.getElementById('gift-mins').value;
      const res = await adminFetch('generate-gift-code', { method: 'POST', body: { amount, max_claims, expires_in_minutes } });
      alert('Gift Code Generated: ' + res.code);
    };

    // User Management
    async function loadUsers() {
      const container = document.getElementById('users-container');
      try {
        const { users } = await adminFetch('users');
        loadedUsers = users;
        renderUsersList(users);
      } catch (err) {
        container.innerHTML = `<div style="color:red;padding:20px;text-align:center;">${err.message}</div>`;
      }
    }

    function renderUsersList(users) {
      const container = document.getElementById('users-container');
      if (!users.length) {
        container.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">No users found.</p>';
        return;
      }

      container.innerHTML = users.map(u => `
        <div class="user-card" id="user-card-${u.id}">
          <div class="user-card-header">
            <span class="phone-text">${u.phone_number}</span>
            <button class="badge-ban ${u.is_banned ? 'banned' : ''}" onclick="toggleBan(${u.id})">
              ${u.is_banned ? 'BANNED' : 'Ban'}
            </button>
          </div>
          <div class="user-subinfo">
            Code: <strong>${u.referral_code || '---'}</strong> &bull; 
            Deposit: <strong>${fmt(u.deposit_balance)}</strong> &bull; 
            Withdrawal: <strong>${fmt(u.withdrawable_balance)}</strong>
          </div>
          <div id="user-details-target-${u.id}">
            <button class="pill-btn pill-gray" onclick="toggleUserDetails(${u.id})">
              <i class="fa-solid fa-chevron-down"></i> View Full Details & Controls
            </button>
          </div>
        </div>
      `).join('');
    }

    async function toggleUserDetails(userId) {
      const target = document.getElementById(`user-details-target-${userId}`);
      if (expandedUserId === userId) {
        target.innerHTML = `<button class="pill-btn pill-gray" onclick="toggleUserDetails(${userId})"><i class="fa-solid fa-chevron-down"></i> View Full Details & Controls</button>`;
        expandedUserId = null;
        return;
      }

      target.innerHTML = '<p style="font-size:12px;color:#64748b;padding:10px 0;">Loading profile...</p>';
      try {
        const { user, deposits, withdrawals, purchases } = await adminFetch(`user-detail&user_id=${userId}`);
        expandedUserId = userId;

        target.innerHTML = `
          <div class="action-button-grid" style="margin-top:10px;">
            <button class="pill-btn pill-blue" onclick="impersonateUser(${user.id})">Login as User</button>
            <button class="pill-btn pill-dark" onclick="resetPassword(${user.id})">PWD RESET (1234)</button>
            <button class="pill-btn pill-red" onclick="deleteUser(${user.id})">Delete User</button>
          </div>

          <div class="balance-adjust-panel">
            <div class="adjust-inputs">
              <input type="number" id="adj-amount-${user.id}" placeholder="Amount (₦)" min="1" step="any" />
              <select id="adj-wallet-${user.id}">
                <option value="withdrawal">Withdrawal wallet</option>
                <option value="deposit">Deposit wallet</option>
              </select>
            </div>
            <div class="adjust-btns">
              <button class="btn-add" onclick="handleAdjust(${user.id}, 'add')">Add</button>
              <button class="btn-subtract" onclick="handleAdjust(${user.id}, 'subtract')">Subtract</button>
            </div>
          </div>

          <div class="user-balance-summary">
            <div class="bal-grid">
              <div class="bal-item"><div class="lbl">Withdrawal balance</div><div class="val">${fmt(user.withdrawable_balance)}</div></div>
              <div class="bal-item"><div class="lbl">Deposit balance</div><div class="val">${fmt(user.deposit_balance)}</div></div>
            </div>
            <div class="bal-grid">
              <div class="bal-item"><div class="lbl">Total deposited</div><div class="val">${fmt(user.total_deposited)}</div></div>
              <div class="bal-item"><div class="lbl">Total withdrawn</div><div class="val">${fmt(user.total_withdrawn)}</div></div>
            </div>
          </div>
        `;
      } catch (err) {
        target.innerHTML = `<p style="color:red;font-size:12px;">${err.message}</p>`;
      }
    }

    async function handleAdjust(userId, direction) {
      const amount = document.getElementById(`adj-amount-${userId}`).value;
      const wallet_type = document.getElementById(`adj-wallet-${userId}`).value;
      if (!amount || parseFloat(amount) <= 0) return alert('Enter a valid amount.');

      try {
        const res = await adminFetch('adjust-balance', {
          method: 'POST',
          body: { user_id: userId, wallet_type, direction, amount }
        });
        alert(res.message);
        toggleUserDetails(userId);
      } catch (err) {
        alert(err.message);
      }
    }

    async function resetPassword(userId) {
      if (!confirm('Reset password to 1234?')) return;
      const res = await adminFetch('reset-password', { method: 'POST', body: { user_id: userId } });
      alert(res.message);
    }

    async function toggleBan(userId) {
      await adminFetch('toggle-ban', { method: 'POST', body: { user_id: userId } });
      loadUsers();
    }

    async function deleteUser(userId) {
      if (!confirm('Delete user completely? All records will be removed.')) return;
      await adminFetch('delete-user', { method: 'POST', body: { user_id: userId } });
      loadUsers();
    }

    async function impersonateUser(userId) {
      const res = await adminFetch('impersonate', { method: 'POST', body: { user_id: userId } });
      if (res.token) localStorage.setItem('nv_token', res.token);
      localStorage.setItem('nv_impersonating', 'true');
      window.location.href = '/index.html';
    }

    // 5. USER INVESTMENTS LISTING & DELETION
    async function loadAdminInvestments() {
      const container = document.getElementById('admin-investments-list');
      try {
        const { investments } = await adminFetch('investments');
        if (!investments.length) return container.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">No investments found.</p>';

        container.innerHTML = investments.map(inv => `
          <div class="req-card">
            <div class="req-header">
              <span class="badge-ref">INV #${inv.id}</span>
              <span class="badge-status badge-${inv.status === 'Active' ? 'approved' : 'declined'}">${inv.status}</span>
            </div>
            <div class="req-title">${inv.product_name}</div>
            <div class="req-amount in">+${fmt(inv.price)}</div>
            <div class="req-meta">
              User: <strong>${inv.phone_number}</strong> &bull; Paid: <strong>${fmt(inv.amount_paid)}</strong> / ${fmt(inv.total_revenue)}<br/>
              Next Payout: ${new Date(inv.next_drop_time).toLocaleString()}<br/>
              Purchased: ${new Date(inv.created_at).toLocaleString()}
            </div>
            <div class="btn-row">
              <button class="btn-action btn-decline" onclick="deleteInvestment(${inv.id})">Delete Investment</button>
            </div>
          </div>
        `).join('');
      } catch (err) {
        container.innerHTML = `<p style="color:red;text-align:center;">${err.message}</p>`;
      }
    }

    async function deleteInvestment(investmentId) {
      if (!confirm('Are you sure you want to permanently delete this user investment record?')) return;
      try {
        const res = await adminFetch('delete-investment', { method: 'POST', body: { investment_id: investmentId } });
        alert(res.message);
        loadAdminInvestments();
      } catch (err) {
        alert(err.message);
      }
    }

    // Deposits Review
    async function loadDeposits() {
      const container = document.getElementById('deposits-list-container');
      try {
        const { deposits } = await adminFetch('deposits');
        if (!deposits.length) return container.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">No deposit requests.</p>';

        container.innerHTML = deposits.map(d => `
          <div class="req-card">
            <div class="req-header">
              <span class="badge-ref">${d.reference}</span>
              <span class="badge-status badge-${d.status.toLowerCase()}">${d.status}</span>
            </div>
            <div class="req-title">${d.channel_name || 'Manual Bank Transfer'}</div>
            <div class="req-amount in">+${fmt(d.amount)}</div>
            <div class="req-meta">
              Sender: <strong>${d.sender_name || 'N/A'}</strong> &bull; User: ${d.phone_number}<br/>
              Date: ${new Date(d.created_at).toLocaleString()}
            </div>
            ${d.proof_url ? `
              <button class="btn-action" style="background:#f1f5f9;color:#0284c7;border:1px solid #cbd5e1;margin-bottom:8px;" onclick="previewSlip('${d.id}')">
                Preview Payment Slip
              </button>
            ` : '<div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">No slip uploaded</div>'}
            ${d.status === 'Pending' ? `
              <div class="btn-row">
                <button class="btn-action btn-approve" onclick="reviewDeposit(${d.id}, 'approve')">✔ APPROVE</button>
                <button class="btn-action btn-decline" onclick="reviewDeposit(${d.id}, 'decline')">✖ DECLINE</button>
              </div>
            ` : ''}
          </div>
        `).join('');

        window.adminDepositsCache = deposits;
      } catch (err) {
        container.innerHTML = `<p style="color:red;text-align:center;">${err.message}</p>`;
      }
    }

    function previewSlip(depositId) {
      const dep = (window.adminDepositsCache || []).find(d => String(d.id) === String(depositId));
      if (!dep || !dep.proof_url) return alert('No image proof available.');
      document.getElementById('modal-receipt-img').src = dep.proof_url;
      document.getElementById('receipt-modal').classList.add('open');
    }

    function closeReceiptModal() {
      document.getElementById('receipt-modal').classList.remove('open');
    }

    async function reviewDeposit(id, decision) {
      const note = prompt('Optional Note:', '');
      await adminFetch('review-deposit', { method: 'POST', body: { deposit_id: id, decision, admin_note: note } });
      loadDeposits();
    }

    // Withdrawals Review
    async function loadWithdrawals() {
      const container = document.getElementById('withdrawals-list-container');
      try {
        const { withdrawals } = await adminFetch('withdrawals');
        if (!withdrawals.length) return container.innerHTML = '<p style="text-align:center;color:#64748b;padding:30px;">No withdrawal requests.</p>';

        container.innerHTML = withdrawals.map(w => `
          <div class="req-card">
            <div class="req-header">
              <span class="badge-ref">W-${w.id}</span>
              <span class="badge-status badge-${w.status.toLowerCase()}">${w.status}</span>
            </div>
            <div class="req-title">Withdrawal to ${w.bank_name}</div>
            <div class="req-amount out">-${fmt(w.net_amount || w.amount)}</div>
            <div class="req-meta">${w.account_name} (${w.account_number}) - User: ${w.phone_number}</div>
            ${w.status === 'Pending' ? `
              <div class="btn-row">
                <button class="btn-action btn-approve" onclick="reviewWithdrawal(${w.id}, 'approve')">APPROVE</button>
                <button class="btn-action btn-decline" onclick="reviewWithdrawal(${w.id}, 'decline')">DECLINE</button>
              </div>
            ` : ''}
          </div>
        `).join('');
      } catch (err) {
        container.innerHTML = `<p style="color:red;text-align:center;">${err.message}</p>`;
      }
    }

    async function reviewWithdrawal(id, decision) {
      const note = prompt('Optional Note / Reason:', '');
      await adminFetch('review-withdrawal', { method: 'POST', body: { withdrawal_id: id, decision, admin_note: note } });
      loadWithdrawals();
    }

    // Products Management
    async function loadProducts() {
      const container = document.getElementById('products-list-container');
      try {
        const { products } = await adminFetch('products');
        container.innerHTML = products.map(p => `
          <div class="product-mgmt-card">
            <div style="font-weight:800;margin-bottom:8px;">${p.name}</div>
            <div class="prod-grid-fields">
              <div class="form-group"><label>Price (₦)</label><input type="number" id="prod-price-${p.id}" value="${p.price}" /></div>
              <div class="form-group"><label>Daily (₦)</label><input type="number" id="prod-daily-${p.id}" value="${p.daily_income}" /></div>
              <div class="form-group"><label>Days</label><input type="number" id="prod-days-${p.id}" value="${p.period_days}" /></div>
              <div class="form-group"><label>Total Rev (₦)</label><input type="number" id="prod-rev-${p.id}" value="${p.total_revenue || (p.daily_income * p.period_days)}" /></div>
            </div>
            <button class="btn-sync" onclick="syncProduct('${p.id}')">SYNC</button>
          </div>
        `).join('');
      } catch {}
    }

    async function syncProduct(id) {
      const price = document.getElementById(`prod-price-${id}`).value;
      const daily_income = document.getElementById(`prod-daily-${id}`).value;
      const period_days = document.getElementById(`prod-days-${id}`).value;
      const total_revenue = document.getElementById(`prod-rev-${id}`).value;
      await adminFetch('update-product', { method: 'POST', body: { id, price, daily_income, period_days, total_revenue, status: 'Active' } });
      alert('Product synced!');
    }

    // Settings
    async function loadSettings() {
      try {
        const { settings } = await adminFetch('settings');
        globalWithdrawalsEnabled = settings.withdrawals_enabled === 'true';
        document.getElementById('global-withdrawal-text').innerText = globalWithdrawalsEnabled ? 'OPEN' : 'CLOSED';
        document.getElementById('btn-toggle-global-withdrawal').innerText = globalWithdrawalsEnabled ? 'CLOSE Withdrawals' : 'OPEN Withdrawals';
      } catch {}
    }

    async function toggleGlobalWithdrawal() {
      const targetState = !globalWithdrawalsEnabled;
      await adminFetch('settings', { method: 'POST', body: { withdrawals_enabled: targetState ? 'true' : 'false' } });
      globalWithdrawalsEnabled = targetState;
      loadSettings();
      alert(`Withdrawals are now ${targetState ? 'OPEN' : 'CLOSED'}.`);
    }

    loadDashboard();
  </script>
</body>
</html>
