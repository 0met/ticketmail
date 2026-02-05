/* TicketMail - User Management (V2)
   Standalone page that does NOT depend on the SPA authState.
*/

(() => {
  'use strict';

  const STORAGE_KEY = 'ticketmail.sessionToken';

  const el = {
    banner: document.getElementById('banner'),
    statusChip: document.getElementById('statusChip'),
    logoutBtn: document.getElementById('logoutBtn'),

    loginSection: document.getElementById('loginSection'),
    loginForm: document.getElementById('loginForm'),
    loginEmail: document.getElementById('loginEmail'),
    loginPassword: document.getElementById('loginPassword'),
    loginResult: document.getElementById('loginResult'),
    clearSessionBtn: document.getElementById('clearSessionBtn'),

    appSection: document.getElementById('appSection'),
    whoami: document.getElementById('whoami'),
    refreshBtn: document.getElementById('refreshBtn'),
    createBtn: document.getElementById('createBtn'),

    statTotal: document.getElementById('statTotal'),
    statAdmins: document.getElementById('statAdmins'),
    statAgents: document.getElementById('statAgents'),
    statCustomers: document.getElementById('statCustomers'),

    searchInput: document.getElementById('searchInput'),
    roleFilter: document.getElementById('roleFilter'),
    statusFilter: document.getElementById('statusFilter'),
    companyFilter: document.getElementById('companyFilter'),

    usersTbody: document.getElementById('usersTbody'),

    modalBackdrop: document.getElementById('modalBackdrop'),
    modalClose: document.getElementById('modalClose'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),

    userForm: document.getElementById('userForm'),
    userId: document.getElementById('userId'),
    fullName: document.getElementById('fullName'),
    email: document.getElementById('email'),
    role: document.getElementById('role'),
    isActive: document.getElementById('isActive'),
    companyId: document.getElementById('companyId'),
    department: document.getElementById('department'),
    jobTitle: document.getElementById('jobTitle'),
    phone: document.getElementById('phone'),
    password: document.getElementById('password'),

    formResult: document.getElementById('formResult'),
    deleteBtn: document.getElementById('deleteBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
  };

  const state = {
    sessionToken: null,
    currentUser: null,
    companies: [],
    users: [],
    filteredUsers: [],
  };

  function setBanner(kind, message) {
    if (!message) {
      el.banner.style.display = 'none';
      el.banner.className = 'banner';
      el.banner.textContent = '';
      return;
    }

    el.banner.style.display = 'block';
    el.banner.className = `banner ${kind || ''}`.trim();
    el.banner.textContent = message;
  }

  function setStatusChip(kind, label) {
    const classByKind = {
      neutral: 'chip chip-neutral',
      ok: 'chip chip-ok',
      warn: 'chip chip-warn',
      bad: 'chip chip-bad',
    };
    el.statusChip.className = classByKind[kind] || classByKind.neutral;
    el.statusChip.textContent = label;
  }

  function setBusy(text) {
    setBanner('warn', text || 'Working…');
  }

  function clearBusy() {
    setBanner(null, null);
  }

  function getStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (!token) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, token);
    } catch {
      // ignore
    }
  }

  async function apiFetch(path, { method = 'GET', body = undefined, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.sessionToken) headers['Authorization'] = `Bearer ${state.sessionToken}`;

    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => '');

    if (!res.ok) {
      const msg = (payload && payload.error) ? payload.error : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  }

  function showLogin() {
    el.loginSection.style.display = 'block';
    el.appSection.style.display = 'none';
    el.logoutBtn.style.display = 'none';
    setStatusChip('neutral', 'Not authenticated');
  }

  function showApp() {
    el.loginSection.style.display = 'none';
    el.appSection.style.display = 'block';
    el.logoutBtn.style.display = 'inline-flex';
  }

  async function validateExistingSession() {
    const token = getStoredToken();
    if (!token) return false;

    state.sessionToken = token;

    try {
      const result = await apiFetch('/.netlify/functions/auth-validate', {
        method: 'POST',
        body: { sessionToken: token },
        auth: false,
      });

      if (!result || !result.valid || !result.user) {
        throw new Error(result?.error || 'Invalid session');
      }

      state.currentUser = result.user;

      if ((state.currentUser.role || '').toLowerCase() !== 'admin') {
        setStatusChip('warn', `Signed in as ${state.currentUser.email} (not admin)`);
        setBanner('error', 'This panel is admin-only. Please log in with an admin account.');
        // Keep session stored, but don’t show admin UI.
        showLogin();
        return false;
      }

      setStatusChip('ok', `Signed in: ${state.currentUser.email}`);
      el.whoami.textContent = `You are logged in as ${state.currentUser.fullName || state.currentUser.email} (${state.currentUser.role}).`;
      showApp();
      return true;
    } catch (e) {
      setStoredToken(null);
      state.sessionToken = null;
      state.currentUser = null;
      showLogin();
      return false;
    }
  }

  async function login(email, password) {
    el.loginResult.textContent = 'Signing in…';
    setBanner(null, null);

    const result = await apiFetch('/.netlify/functions/auth-login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    if (!result?.success || !result?.sessionToken || !result?.user) {
      throw new Error(result?.error || 'Login failed');
    }

    state.sessionToken = result.sessionToken;
    state.currentUser = result.user;
    setStoredToken(result.sessionToken);

    // Make sure the server-side session is valid and fetch permissions.
    await validateExistingSession();
  }

  async function logout() {
    const token = state.sessionToken;

    try {
      if (token) {
        await apiFetch('/.netlify/functions/auth-logout', {
          method: 'POST',
          body: { sessionToken: token },
          auth: false,
        });
      }
    } catch {
      // best effort
    }

    setStoredToken(null);
    state.sessionToken = null;
    state.currentUser = null;
    state.users = [];
    state.filteredUsers = [];
    state.companies = [];

    clearBusy();
    setBanner('ok', 'Logged out.');
    showLogin();
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function roleBadge(role) {
    const r = (role || 'customer').toLowerCase();
    const cls = ['admin', 'agent', 'customer'].includes(r) ? r : 'customer';
    return `<span class="badge ${cls}">${escapeHtml(r)}</span>`;
  }

  function statusBadge(isActive) {
    return isActive
      ? '<span class="badge active">Active</span>'
      : '<span class="badge inactive">Inactive</span>';
  }

  function applyFilters() {
    const q = (el.searchInput.value || '').trim().toLowerCase();
    const role = el.roleFilter.value;
    const status = el.statusFilter.value;
    const companyId = el.companyFilter.value;

    state.filteredUsers = (state.users || []).filter(u => {
      const matchesQ = !q ||
        (u.fullName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.jobTitle || '').toLowerCase().includes(q) ||
        (u.companyName || '').toLowerCase().includes(q);

      const matchesRole = !role || (u.role === role);
      const matchesStatus = !status || (status === 'active' ? u.isActive : !u.isActive);
      const matchesCompany = !companyId || String(u.companyId || '') === String(companyId);

      return matchesQ && matchesRole && matchesStatus && matchesCompany;
    });

    renderUsersTable();
  }

  function renderCompanyFilters() {
    const options = ['<option value="">All</option>']
      .concat((state.companies || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.domain ? ` (${escapeHtml(c.domain)})` : ''}</option>`));

    el.companyFilter.innerHTML = options.join('');

    const modalOptions = ['<option value="">None</option>']
      .concat((state.companies || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.domain ? ` (${escapeHtml(c.domain)})` : ''}</option>`));

    el.companyId.innerHTML = modalOptions.join('');
  }

  async function loadCompanies() {
    try {
      const data = await apiFetch('/.netlify/functions/companies-list', { method: 'GET' });
      if (!data?.success) throw new Error(data?.error || 'Failed to load companies');
      state.companies = data.companies || [];
      renderCompanyFilters();
    } catch (e) {
      // Companies are optional for the users table.
      console.warn('Companies load failed:', e);
      state.companies = [];
      renderCompanyFilters();
    }
  }

  function renderStats(meta) {
    el.statTotal.textContent = String(meta?.total ?? state.users.length ?? 0);
    el.statAdmins.textContent = String(meta?.roles?.admin ?? (state.users || []).filter(u => u.role === 'admin').length);
    el.statAgents.textContent = String(meta?.roles?.agent ?? (state.users || []).filter(u => u.role === 'agent').length);
    el.statCustomers.textContent = String(meta?.roles?.customer ?? (state.users || []).filter(u => u.role === 'customer').length);
  }

  function renderUsersTable() {
    const rows = state.filteredUsers || [];

    if (!rows.length) {
      el.usersTbody.innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
      return;
    }

    el.usersTbody.innerHTML = rows.map(u => {
      const nameLine = escapeHtml(u.fullName || u.email);
      const emailLine = escapeHtml(u.email || '');
      const companyLine = u.companyName ? `${escapeHtml(u.companyName)}${u.companyDomain ? ` <span class="muted small">(${escapeHtml(u.companyDomain)})</span>` : ''}` : '<span class="muted">—</span>';
      const dept = escapeHtml(u.department || '—');
      const openTickets = Number(u.openTicketCount || 0);

      return `
        <tr>
          <td>
            <div style="font-weight:900">${nameLine}</div>
            <div class="small muted">${emailLine}</div>
            ${u.jobTitle ? `<div class="small muted">${escapeHtml(u.jobTitle)}</div>` : ''}
          </td>
          <td>${roleBadge(u.role)}</td>
          <td>${companyLine}</td>
          <td>${dept}</td>
          <td>${statusBadge(!!u.isActive)}</td>
          <td style="text-align:right; font-weight:900">${openTickets}</td>
          <td style="text-align:right">
            <div class="actions">
              <button class="btn btn-secondary" type="button" data-action="edit" data-user-id="${escapeHtml(u.id)}">Edit</button>
              <button class="btn btn-danger" type="button" data-action="delete" data-user-id="${escapeHtml(u.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function loadUsers() {
    setBusy('Loading users…');

    const data = await apiFetch('/.netlify/functions/list-users', { method: 'GET' });
    if (!data?.success) throw new Error(data?.error || 'Failed to load users');

    state.users = (data.users || []).map(u => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: !!u.isActive,
      companyId: u.companyId ?? null,
      companyName: u.companyName ?? null,
      companyDomain: u.companyDomain ?? null,
      department: u.department ?? null,
      jobTitle: u.jobTitle ?? null,
      phone: u.phone ?? null,
      openTicketCount: u.openTicketCount ?? 0,
    }));

    renderStats({ total: data.total, roles: data.roles });

    // Prime filtered list
    state.filteredUsers = [...state.users];
    applyFilters();

    clearBusy();
  }

  function openModal({ mode, user }) {
    el.formResult.textContent = '';
    el.password.value = '';

    if (mode === 'create') {
      el.modalTitle.textContent = 'Create user';
      el.modalSubtitle.textContent = 'Creates a new user account.';
      el.userId.value = '';
      el.fullName.value = '';
      el.email.value = '';
      el.role.value = 'customer';
      el.isActive.value = 'true';
      el.companyId.value = '';
      el.department.value = '';
      el.jobTitle.value = '';
      el.phone.value = '';
      el.password.placeholder = 'Required for new user';
      el.password.required = true;
      el.deleteBtn.style.display = 'none';
    } else {
      el.modalTitle.textContent = 'Edit user';
      el.modalSubtitle.textContent = `ID: ${user.id}`;
      el.userId.value = String(user.id);
      el.fullName.value = user.fullName || '';
      el.email.value = user.email || '';
      el.role.value = user.role || 'customer';
      el.isActive.value = String(!!user.isActive);
      el.companyId.value = user.companyId == null ? '' : String(user.companyId);
      el.department.value = user.department || '';
      el.jobTitle.value = user.jobTitle || '';
      el.phone.value = user.phone || '';
      el.password.placeholder = 'Leave blank to keep unchanged';
      el.password.required = false;
      el.deleteBtn.style.display = 'inline-flex';
      el.deleteBtn.dataset.userId = String(user.id);
    }

    el.modalBackdrop.style.display = 'grid';
  }

  function closeModal() {
    el.modalBackdrop.style.display = 'none';
  }

  function findUserById(id) {
    return (state.users || []).find(u => String(u.id) === String(id)) || null;
  }

  async function createUserFromForm() {
    const payload = {
      email: el.email.value.trim(),
      fullName: el.fullName.value.trim(),
      role: el.role.value,
      password: el.password.value,
      companyId: el.companyId.value || null,
      department: el.department.value || null,
      jobTitle: el.jobTitle.value || null,
      phone: el.phone.value || null,
      createdBy: state.currentUser?.id,
    };

    const res = await apiFetch('/.netlify/functions/create-user', {
      method: 'POST',
      body: payload,
      auth: true,
    });

    if (!res?.success) throw new Error(res?.error || 'Create user failed');
  }

  async function updateUserFromForm() {
    const userId = el.userId.value;

    const payload = {
      userId,
      fullName: el.fullName.value.trim(),
      email: el.email.value.trim(),
      role: el.role.value,
      isActive: el.isActive.value === 'true',
      companyId: el.companyId.value === '' ? null : el.companyId.value,
      department: el.department.value || null,
      jobTitle: el.jobTitle.value || null,
      phone: el.phone.value || null,
    };

    const password = el.password.value;
    if (password) payload.password = password;

    const res = await apiFetch('/.netlify/functions/update-user', {
      method: 'POST',
      body: payload,
    });

    if (!res?.success) throw new Error(res?.error || 'Update user failed');
  }

  async function deleteUser(userId) {
    const res = await apiFetch('/.netlify/functions/delete-user', {
      method: 'POST',
      body: { userId },
    });

    if (!res?.success) throw new Error(res?.error || 'Delete user failed');
  }

  function wireEvents() {
    el.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = el.loginEmail.value.trim();
      const password = el.loginPassword.value;

      try {
        setBusy('Signing in…');
        await login(email, password);
        clearBusy();

        if ((state.currentUser?.role || '').toLowerCase() !== 'admin') {
          return;
        }

        await loadCompanies();
        await loadUsers();
      } catch (err) {
        clearBusy();
        el.loginResult.textContent = '';
        setBanner('error', err.message || 'Login failed');
        setStatusChip('bad', 'Login failed');
      }
    });

    el.clearSessionBtn.addEventListener('click', () => {
      setStoredToken(null);
      state.sessionToken = null;
      state.currentUser = null;
      setBanner('ok', 'Saved session cleared.');
      showLogin();
    });

    el.logoutBtn.addEventListener('click', () => logout());

    el.refreshBtn.addEventListener('click', async () => {
      try {
        await loadCompanies();
        await loadUsers();
        setBanner('ok', 'Refreshed.');
      } catch (err) {
        setBanner('error', err.message || 'Refresh failed');
      }
    });

    el.createBtn.addEventListener('click', () => {
      openModal({ mode: 'create', user: null });
    });

    [el.searchInput, el.roleFilter, el.statusFilter, el.companyFilter].forEach(input => {
      input.addEventListener('input', applyFilters);
      input.addEventListener('change', applyFilters);
    });

    el.modalClose.addEventListener('click', closeModal);
    el.cancelBtn.addEventListener('click', closeModal);

    el.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === el.modalBackdrop) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.modalBackdrop.style.display !== 'none') closeModal();
    });

    el.usersTbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const userId = btn.dataset.userId;
      const user = findUserById(userId);

      if (action === 'edit') {
        if (!user) return;
        openModal({ mode: 'edit', user });
        return;
      }

      if (action === 'delete') {
        if (!user) return;
        const ok = confirm(`Delete user ${user.email}? This cannot be undone.`);
        if (!ok) return;

        try {
          setBusy('Deleting user…');
          await deleteUser(user.id);
          await loadUsers();
          clearBusy();
          setBanner('ok', 'User deleted.');
        } catch (err) {
          clearBusy();
          setBanner('error', err.message || 'Delete failed');
        }
      }
    });

    el.userForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      try {
        el.formResult.textContent = 'Saving…';
        setBusy('Saving user…');

        if (!el.userId.value) {
          await createUserFromForm();
        } else {
          await updateUserFromForm();
        }

        await loadUsers();
        clearBusy();
        closeModal();
        setBanner('ok', 'Saved.');
      } catch (err) {
        clearBusy();
        el.formResult.textContent = '';
        setBanner('error', err.message || 'Save failed');
      }
    });

    el.deleteBtn.addEventListener('click', async () => {
      const userId = el.deleteBtn.dataset.userId;
      if (!userId) return;

      const user = findUserById(userId);
      const ok = confirm(`Delete user ${user?.email || userId}? This cannot be undone.`);
      if (!ok) return;

      try {
        setBusy('Deleting user…');
        await deleteUser(userId);
        await loadUsers();
        clearBusy();
        closeModal();
        setBanner('ok', 'User deleted.');
      } catch (err) {
        clearBusy();
        setBanner('error', err.message || 'Delete failed');
      }
    });
  }

  async function bootstrap() {
    wireEvents();

    // Default: show login until session validates.
    showLogin();

    setBusy('Checking existing session…');
    const ok = await validateExistingSession();
    clearBusy();

    if (!ok) {
      setStatusChip('neutral', 'Not authenticated');
      return;
    }

    // If valid admin session, load data
    try {
      await loadCompanies();
      await loadUsers();
    } catch (err) {
      setBanner('error', err.message || 'Failed to load data');
    }
  }

  bootstrap();
})();
