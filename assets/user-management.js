// User Management System - JavaScript Functions
// This file contains all functions for managing users, companies, and their relationships

console.log('✅ user-management.js loaded successfully');
console.log('📝 Checking if authState is available:', typeof authState);

// ==================== Global State ====================
let allUsers = [];
let allCompanies = [];
let filteredUsers = [];

function normalizeRoleValue(role) {
    const raw = String(role || '').trim().toLowerCase();
    if (raw === 'superuser' || raw === 'super-user' || raw === 'super user') return 'super_user';
    return raw;
}

function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

console.log('🔍 loadUsers function type:', typeof loadUsers);
console.log('🔍 window.loadUsers type:', typeof window.loadUsers);

// ==================== Tab Management ====================
function switchUserTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
        tab.style.display = 'none';
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        selectedTab.style.display = 'block';
    }
    
    // Add active class to selected button
    const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Load data for the selected tab
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'companies') {
        loadCompanies();
    } else if (tabName === 'activity') {
        loadActivityLog();
    }
}

// ==================== User Management Functions ====================
async function loadUsers() {
    console.log('loadUsers() called from user-management.js');
    console.log('authState:', typeof authState !== 'undefined' ? authState : 'undefined');
    
    // Check if we have authState defined
    if (typeof authState === 'undefined' || !authState.sessionToken) {
        console.error('Auth state not available');
        const tableBody = document.getElementById('usersTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #ef4444;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                    <p>Authentication state not available. Please refresh the page.</p>
                </div>
            `;
        }
        return;
    }
    
    console.log('Fetching users from API...');
    
    try {
        const response = await fetch('/.netlify/functions/list-users', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.sessionToken}`
            }
        });
        
        console.log('Response received:', response.status);
        const data = await response.json();
        console.log('Data received:', data);
        
        if (data.success) {
            allUsers = data.users;
            filteredUsers = [...allUsers];
            
            console.log('Number of users:', allUsers.length);
            
            // Update statistics
            const totalEl = document.getElementById('totalUsersCount');
            const adminEl = document.getElementById('adminUsersCount');
            const agentEl = document.getElementById('agentUsersCount');
            const customerEl = document.getElementById('customerUsersCount');
            
            console.log('Found stat elements:', {totalEl, adminEl, agentEl, customerEl});
            
            if (totalEl) totalEl.textContent = data.total || 0;
            if (adminEl) adminEl.textContent = data.roles?.admin || 0;
            if (agentEl) agentEl.textContent = data.roles?.agent || 0;
            if (customerEl) customerEl.textContent = data.roles?.customer || 0;
            
            console.log('About to render users table...');
            // Render users table
            renderUsersTable();
            
            console.log('About to load companies for filter...');
            // Load companies for filter dropdown
            await loadCompaniesForFilter();
            
            console.log('loadUsers() completed successfully');
        } else {
            throw new Error(data.error || 'Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        const tableBody = document.getElementById('usersTableBody');
        if (tableBody) {
            tableBody.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #ef4444;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                    <p>Error loading users: ${error.message}</p>
                </div>
            `;
        }
    }
}

function renderUsersTable() {
    console.log('renderUsersTable() called, filteredUsers count:', filteredUsers.length);
    const tableBody = document.getElementById('usersTableBody');
    console.log('usersTableBody element:', tableBody);
    
    if (!tableBody) {
        console.error('usersTableBody element not found!');
        return;
    }
    
    if (filteredUsers.length === 0) {
        tableBody.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <p>No users found</p>
            </div>
        `;
        return;
    }
    
    let html = '<table class="um-users-table">';
    html += `
        <thead>
            <tr>
                <th>User</th>
                <th>Role</th>
                <th>Company</th>
                <th>Department</th>
                <th>Status</th>
                <th>Open Tickets</th>
                <th class="um-cell-center">Actions</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    filteredUsers.forEach(user => {
        const safeUserIdAttr = escapeHtmlAttribute(user.id);
        const safeUserEmailAttr = escapeHtmlAttribute(user.email || '');

        const roleClassMap = {
            admin: 'badge-admin',
            super_user: 'badge-super-user',
            agent: 'badge-agent',
            customer: 'badge-customer'
        };
        const roleBadgeClass = roleClassMap[user.role] || 'badge-customer';
        const statusBadgeClass = user.isActive ? 'badge-active' : 'badge-inactive';
        const statusLabel = user.isActive ? 'Active' : 'Inactive';
        
        html += `
            <tr>
                <td>
                    <div class="um-user-cell">
                        <strong class="um-user-name">${user.fullName || user.email}</strong>
                        <small class="um-user-email">${user.email}</small>
                        ${user.jobTitle ? `<small class="um-user-title">${user.jobTitle}</small>` : ''}
                    </div>
                </td>
                <td>
                    <span class="badge ${roleBadgeClass}">${user.role}</span>
                </td>
                <td>
                    ${user.companyName ? `
                        <div class="um-company-cell">
                            <strong class="um-company-name">${user.companyName}</strong>
                            ${user.companyDomain ? `<small class="um-company-domain">${user.companyDomain}</small>` : ''}
                        </div>
                    ` : '<span class="um-muted">No Company</span>'}
                </td>
                <td>
                    <span class="um-secondary">${user.department || '-'}</span>
                </td>
                <td>
                    <span class="badge ${statusBadgeClass}">${statusLabel}</span>
                </td>
                <td class="um-cell-center">
                    <span class="um-count-badge">${user.openTicketCount || 0}</span>
                </td>
                <td class="um-cell-center">
                    <button type="button" class="btn btn-sm" style="margin-right: 0.5rem;" data-action="edit-user" data-user-id="${safeUserIdAttr}" onclick="editUser(this.dataset.userId)">✏️ Edit</button>
                    <button type="button" class="btn btn-sm btn-danger" data-action="delete-user" data-user-id="${safeUserIdAttr}" data-user-email="${safeUserEmailAttr}" onclick="deleteUser(this.dataset.userId, this.dataset.userEmail)">🗑️ Delete</button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    tableBody.innerHTML = html;
}

function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const roleFilter = document.getElementById('roleFilter').value;
    const companyFilter = document.getElementById('companyFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    
    filteredUsers = allUsers.filter(user => {
        const matchesSearch = !searchTerm || 
            user.fullName?.toLowerCase().includes(searchTerm) ||
            user.email?.toLowerCase().includes(searchTerm) ||
            user.department?.toLowerCase().includes(searchTerm) ||
            user.jobTitle?.toLowerCase().includes(searchTerm);
        
        const matchesRole = !roleFilter || user.role === roleFilter;
        const matchesCompany = !companyFilter || user.companyId == companyFilter;
        const matchesStatus = !statusFilter || 
            (statusFilter === 'active' && user.isActive) ||
            (statusFilter === 'inactive' && !user.isActive);
        
        return matchesSearch && matchesRole && matchesCompany && matchesStatus;
    });
    
    renderUsersTable();
}

async function refreshUsersList() {
    await loadUsers();
    showToast('Users list refreshed', 'success');
}

function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const title = document.getElementById('userModalTitle');
    const form = document.getElementById('userForm');

    if (!modal || !title || !form) {
        console.error('User modal elements missing:', { modal, title, form });
        showToast('User modal could not be opened (missing DOM)', 'error');
        return;
    }

    // Ensure modal isn't hidden by a parent page/tab container.
    // Keeping it attached to <body> avoids display:none on ancestor nodes.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.style.zIndex = '9999';
    
    form.reset();
    document.getElementById('userId').value = '';
    
    if (userId) {
        title.textContent = 'Edit User';
        document.getElementById('passwordOptional').textContent = '(leave blank to keep current)';
        
        // Load user data
        const userIdString = String(userId);
        const user = allUsers.find(u => String(u.id) === userIdString);
        if (user) {
            document.getElementById('userId').value = user.id;
            document.getElementById('userFullName').value = user.fullName || '';
            document.getElementById('userEmail').value = user.email || '';
            document.getElementById('userRole').value = normalizeRoleValue(user.role || 'customer') || 'customer';
            document.getElementById('userCompany').value = user.companyId || '';
            document.getElementById('userDepartment').value = user.department || '';
            document.getElementById('userJobTitle').value = user.jobTitle || '';
            document.getElementById('userPhone').value = user.phone || '';
            document.getElementById('userIsActive').checked = user.isActive;
            document.getElementById('userPassword').removeAttribute('required');
        } else {
            // If the in-memory list isn't ready, keep the modal open but block saving until userId is present.
            console.warn('User not found in memory yet (allUsers not loaded?):', userIdString);
        }
    } else {
        title.textContent = 'Add New User';
        document.getElementById('passwordOptional').textContent = '*';
        document.getElementById('userPassword').setAttribute('required', 'required');
    }
    
    modal.style.display = 'flex';
    modal.classList.add('active');
    if (typeof window.updateScrollLock === 'function') window.updateScrollLock();
}

function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
    if (typeof window.updateScrollLock === 'function') window.updateScrollLock();
}

async function saveUser(event) {
    event.preventDefault();
    
    const userId = document.getElementById('userId').value;
    const userData = {
        fullName: document.getElementById('userFullName').value,
        email: document.getElementById('userEmail').value,
        role: normalizeRoleValue(document.getElementById('userRole').value),
        companyId: document.getElementById('userCompany').value || null,
        department: document.getElementById('userDepartment').value || null,
        jobTitle: document.getElementById('userJobTitle').value || null,
        phone: document.getElementById('userPhone').value || null,
        password: document.getElementById('userPassword').value,
        isActive: document.getElementById('userIsActive').checked
    };
    
    try {
        let response;
        if (userId) {
            // Update existing user
            userData.userId = userId;
            response = await fetch('/.netlify/functions/update-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authState.sessionToken}`
                },
                body: JSON.stringify(userData)
            });
        } else {
            // If we reached here from an Edit flow and userId was never set, don't accidentally create duplicates.
            const title = document.getElementById('userModalTitle')?.textContent || '';
            if (title.toLowerCase().includes('edit')) {
                throw new Error('Cannot save changes: missing userId. Click Refresh, then Edit again.');
            }
            // Create new user
            userData.createdBy = authState.user.id;
            response = await fetch('/.netlify/functions/create-user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authState.sessionToken}`
                },
                body: JSON.stringify(userData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showToast(userId ? 'User updated successfully' : 'User created successfully', 'success');
            closeUserModal();
            await loadUsers();
        } else {
            throw new Error(data.error || 'Failed to save user');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

function editUser(userId) {
    console.log('editUser() clicked:', userId);
    openUserModal(userId);
}

async function deleteUser(userId, userEmail) {
    if (!confirm(`Are you sure you want to delete user "${userEmail}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch('/.netlify/functions/delete-user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.sessionToken}`
            },
            body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('User deleted successfully', 'success');
            await loadUsers();
        } else {
            throw new Error(data.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

async function exportUsers() {
    try {
        const csv = convertUsersToCSV(filteredUsers);
        downloadCSV(csv, 'users-export.csv');
        showToast('Users exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting users:', error);
        showToast('Error exporting users', 'error');
    }
}

// ==================== Company Management Functions ====================
async function loadCompanies() {
    try {
        const response = await fetch('/.netlify/functions/companies-list', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.sessionToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            allCompanies = data.companies;
            
            // Update statistics
            document.getElementById('totalCompaniesCount').textContent = data.count || 0;
            document.getElementById('activeCompaniesCount').textContent = 
                data.companies.filter(c => c.isActive).length;
            document.getElementById('companiesUsersCount').textContent = 
                data.companies.reduce((sum, c) => sum + c.userCount, 0);
            document.getElementById('companiesTicketsCount').textContent = 
                data.companies.reduce((sum, c) => sum + c.ticketCount, 0);
            
            // Render companies grid
            renderCompaniesGrid();
        } else {
            throw new Error(data.error || 'Failed to load companies');
        }
    } catch (error) {
        console.error('Error loading companies:', error);
        document.getElementById('companiesList').innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #ef4444; grid-column: 1 / -1;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                <p>Error loading companies: ${error.message}</p>
            </div>
        `;
    }
}

function renderCompaniesGrid() {
    const grid = document.getElementById('companiesList');
    
    if (allCompanies.length === 0) {
        grid.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #64748b; grid-column: 1 / -1;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🏢</div>
                <p>No companies found. Create your first company to get started!</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    allCompanies.forEach(company => {
        const safeCompanyIdAttr = escapeHtmlAttribute(company.id);
        const statusBadge = company.isActive 
            ? '<span style="background: #10b981; color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem;">Active</span>'
            : '<span style="background: #6b7280; color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem;">Inactive</span>';
        
        html += `
            <div class="company-card" style="background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 0.5rem 0; color: #1f2937; font-size: 1.25rem;">🏢 ${company.name}</h3>
                        ${company.domain ? `<p style="margin: 0; color: #64748b; font-size: 0.875rem;">${company.domain}</p>` : ''}
                    </div>
                    ${statusBadge}
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div>
                        <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Users</div>
                        <div style="color: #1f2937; font-weight: 600; font-size: 1.25rem;">👥 ${company.userCount}</div>
                    </div>
                    <div>
                        <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.25rem;">Tickets</div>
                        <div style="color: #1f2937; font-weight: 600; font-size: 1.25rem;">🎫 ${company.ticketCount}</div>
                    </div>
                </div>
                
                ${company.industry ? `
                    <div style="margin-bottom: 0.5rem;">
                        <span style="background: #f3f4f6; color: #374151; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.75rem;">
                            ${company.industry}
                        </span>
                    </div>
                ` : ''}
                
                ${company.phone ? `<p style="margin: 0.5rem 0; color: #64748b; font-size: 0.875rem;">📞 ${company.phone}</p>` : ''}
                ${company.address ? `<p style="margin: 0.5rem 0; color: #64748b; font-size: 0.875rem;">📍 ${company.address}</p>` : ''}
                
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
                    <button type="button" class="btn btn-sm" style="flex: 1;" data-action="edit-company" data-company-id="${safeCompanyIdAttr}" onclick="editCompany(this.dataset.companyId)">✏️ Edit</button>
                    <button type="button" class="btn btn-sm btn-secondary" style="flex: 1;" data-action="view-company" data-company-id="${safeCompanyIdAttr}" onclick="viewCompanyDetails(this.dataset.companyId)">👁️ View</button>
                </div>
            </div>
        `;
    });
    
    grid.innerHTML = html;
}

async function refreshCompaniesList() {
    await loadCompanies();
    showToast('Companies list refreshed', 'success');
}

function openCompanyModal(companyId = null) {
    const modal = document.getElementById('companyModal');
    const title = document.getElementById('companyModalTitle');
    const form = document.getElementById('companyForm');
    
    form.reset();
    document.getElementById('companyId').value = '';
    
    if (companyId) {
        title.textContent = 'Edit Company';
        
        // Load company data
        const companyIdString = String(companyId);
        const company = allCompanies.find(c => String(c.id) === companyIdString);
        if (company) {
            document.getElementById('companyId').value = company.id;
            document.getElementById('companyName').value = company.name || '';
            document.getElementById('companyDomain').value = company.domain || '';
            document.getElementById('companyPhone').value = company.phone || '';
            document.getElementById('companyAddress').value = company.address || '';
            document.getElementById('companyIndustry').value = company.industry || '';
            document.getElementById('companySize').value = company.size || '';
            document.getElementById('companyNotes').value = company.notes || '';
            document.getElementById('companyIsActive').checked = company.isActive;
        }
    } else {
        title.textContent = 'Add New Company';
    }
    
    modal.style.display = 'flex';
    modal.classList.add('active');
}

function closeCompanyModal() {
    const modal = document.getElementById('companyModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

async function saveCompany(event) {
    event.preventDefault();
    
    const companyId = document.getElementById('companyId').value;
    const companyData = {
        name: document.getElementById('companyName').value,
        domain: document.getElementById('companyDomain').value || null,
        phone: document.getElementById('companyPhone').value || null,
        address: document.getElementById('companyAddress').value || null,
        industry: document.getElementById('companyIndustry').value || null,
        size: document.getElementById('companySize').value || null,
        notes: document.getElementById('companyNotes').value || null,
        isActive: document.getElementById('companyIsActive').checked
    };
    
    try {
        let response;
        const endpoint = companyId ? 'companies-update' : 'companies-create';
        
        if (companyId) {
            companyData.id = parseInt(companyId);
        }
        
        response = await fetch(`/.netlify/functions/${endpoint}`, {
            method: companyId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.sessionToken}`
            },
            body: JSON.stringify(companyData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(companyId ? 'Company updated successfully' : 'Company created successfully', 'success');
            closeCompanyModal();
            await loadCompanies();
            await loadCompaniesForFilter(); // Refresh the filter dropdown
        } else {
            throw new Error(data.error || 'Failed to save company');
        }
    } catch (error) {
        console.error('Error saving company:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

function editCompany(companyId) {
    openCompanyModal(companyId);
}

function viewCompanyDetails(companyId) {
    const companyIdString = String(companyId);
    const company = allCompanies.find(c => String(c.id) === companyIdString);
    if (!company) return;
    
    alert(`Company Details:\n\nName: ${company.name}\nDomain: ${company.domain || 'N/A'}\nUsers: ${company.userCount}\nTickets: ${company.ticketCount}\nIndustry: ${company.industry || 'N/A'}\nSize: ${company.size || 'N/A'}`);
}

async function exportCompanies() {
    try {
        const csv = convertCompaniesToCSV(allCompanies);
        downloadCSV(csv, 'companies-export.csv');
        showToast('Companies exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting companies:', error);
        showToast('Error exporting companies', 'error');
    }
}

// ==================== Helper Functions ====================
async function loadCompaniesForFilter() {
    const companyFilter = document.getElementById('companyFilter');
    const userCompanySelect = document.getElementById('userCompany');
    
    if (allCompanies.length === 0) {
        try {
            const response = await fetch('/.netlify/functions/companies-list', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authState.sessionToken}`
                }
            });
            const data = await response.json();
            if (data.success) {
                allCompanies = data.companies;
            }
        } catch (error) {
            console.error('Error loading companies for filter:', error);
        }
    }
    
    // Update filter dropdown
    if (companyFilter) {
        let options = '<option value="">All Companies</option>';
        allCompanies.forEach(company => {
            options += `<option value="${company.id}">${company.name}</option>`;
        });
        companyFilter.innerHTML = options;
    }
    
    // Update user modal company dropdown
    if (userCompanySelect) {
        let options = '<option value="">No Company</option>';
        allCompanies.filter(c => c.isActive).forEach(company => {
            options += `<option value="${company.id}">${company.name}</option>`;
        });
        userCompanySelect.innerHTML = options;
    }
}

function convertUsersToCSV(users) {
    const headers = ['ID', 'Full Name', 'Email', 'Role', 'Company', 'Department', 'Job Title', 'Phone', 'Status', 'Open Tickets', 'Created At'];
    const rows = users.map(user => [
        user.id,
        user.fullName || '',
        user.email,
        user.role,
        user.companyName || '',
        user.department || '',
        user.jobTitle || '',
        user.phone || '',
        user.isActive ? 'Active' : 'Inactive',
        user.openTicketCount || 0,
        new Date(user.createdAt).toLocaleDateString()
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function convertCompaniesToCSV(companies) {
    const headers = ['ID', 'Name', 'Domain', 'Phone', 'Industry', 'Size', 'Users', 'Tickets', 'Status', 'Created At'];
    const rows = companies.map(company => [
        company.id,
        company.name,
        company.domain || '',
        company.phone || '',
        company.industry || '',
        company.size || '',
        company.userCount || 0,
        company.ticketCount || 0,
        company.isActive ? 'Active' : 'Inactive',
        new Date(company.createdAt).toLocaleDateString()
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    a.click();
    window.URL.revokeObjectURL(url);
}

// Activity Log
async function loadActivityLog() {
    const activityList = document.getElementById('activityLogList');
    activityList.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: #64748b;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📊</div>
            <p>Activity log feature coming soon...</p>
        </div>
    `;
}

function filterActivityLog() {
    // Implement activity log filtering
    console.log('Filtering activity log...');
}

async function refreshActivityLog() {
    await loadActivityLog();
    showToast('Activity log refreshed', 'success');
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initialize on page load
if (typeof window !== 'undefined') {
    window.switchUserTab = switchUserTab;
    window.openUserModal = openUserModal;
    window.closeUserModal = closeUserModal;
    window.saveUser = saveUser;
    window.editUser = editUser;
    window.deleteUser = deleteUser;
    window.filterUsers = filterUsers;
    window.loadUsers = loadUsers;
    window.loadUsersList = loadUsers; // Alias for compatibility with existing code
    window.exportUsers = exportUsers;
    window.exportCompanies = exportCompanies;
    window.refreshUsersList = refreshUsersList;
    window.exportUsers = exportUsers;
    window.openCompanyModal = openCompanyModal;
    window.closeCompanyModal = closeCompanyModal;
    window.saveCompany = saveCompany;
    window.editCompany = editCompany;
    window.viewCompanyDetails = viewCompanyDetails;
    window.refreshCompaniesList = refreshCompaniesList;
    window.exportCompanies = exportCompanies;
    window.loadActivityLog = loadActivityLog;
    window.filterActivityLog = filterActivityLog;
    window.refreshActivityLog = refreshActivityLog;
}

// Initialize form handlers when DOM is ready
function initUserManagementBindings() {
    if (typeof window !== 'undefined') {
        if (window.__ticketmailUserMgmtBindingsInit) return;
        window.__ticketmailUserMgmtBindingsInit = true;
    }

    console.log('✅ User Management bindings initialized');

    // Delegate clicks for dynamically-rendered action buttons
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.getAttribute('data-action');
        try {
            if (action === 'edit-user') {
                event.preventDefault();
                editUser(actionEl.dataset.userId);
            } else if (action === 'delete-user') {
                event.preventDefault();
                deleteUser(actionEl.dataset.userId, actionEl.dataset.userEmail);
            } else if (action === 'edit-company') {
                event.preventDefault();
                editCompany(actionEl.dataset.companyId);
            } else if (action === 'view-company') {
                event.preventDefault();
                viewCompanyDetails(actionEl.dataset.companyId);
            }
        } catch (e) {
            console.error('Action handler failed:', action, e);
            showToast('Error: ' + (e?.message || String(e)), 'error');
        }
    });

    // User form submission handler (in addition to inline onsubmit)
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', saveUser);
    }

    // Company form submission handler
    const companyForm = document.getElementById('companyForm');
    if (companyForm) {
        companyForm.addEventListener('submit', saveCompany);
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUserManagementBindings);
    } else {
        initUserManagementBindings();
    }
}
