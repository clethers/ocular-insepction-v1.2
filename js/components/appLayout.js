/**
 * Synx Field App - Shared Layout Component for Multi-Page Application (MPA / SPA Router)
 * Manages dynamic role-aware sidebar navigation, top header, profile menu, and toast notifications.
 */

import logoUrl from '../../assets/ecoworks-logo.png';
import { AuthGuard } from './authGuard.js';
import { USER_ROLES } from '../services/userService.js';
import { FormStorage } from './formStorage.js';

export class AppLayout {
  /**
   * Renders layout HTML into root container and binds global UI handlers.
   * @param {string} activePath - Identifier or current URL path of page view ('/admin/users', '/manager/dispatch', etc.)
   * @param {string} pageTitle - Title displayed in the top header
   * @returns {HTMLElement} The main content container element (#main-content-view)
   */
  static async init(activePath = '/ocular', pageTitle = 'Synx Portal') {
    const appElem = document.getElementById('app');
    if (!appElem) return null;

    const isCollapsed = localStorage.getItem('synx_sidebar_collapsed') !== 'false';
    const user = (await AuthGuard.getSessionUser()) || {
      fullName: 'Engr. Marco Santos, REE',
      email: 'inspector.marco@ecoworks.ph',
      role: USER_ROLES.FIELD_INSPECTOR
    };

    const isAdmin = user.role === USER_ROLES.ADMIN;
    const isManager = user.role === USER_ROLES.CUSTOMER_CARE_MANAGER || user.role === USER_ROLES.LEAD_ENGINEER || isAdmin;

    const normPath = activePath.replace(/\/$/, '') || '/';
    const isActive = (href) => {
      if (href === normPath) return true;
      if (href === '/admin/dashboard' && (normPath === '/admin' || normPath === '/admin/dashboard')) return true;
      if (href === '/manager/dispatch' && (normPath === '/manager' || normPath === '/manager/dispatch')) return true;
      if (href === '/ocular' && (normPath === '/ocular/ocular' || normPath === '/ocular')) return true;
      return false;
    };

    let readyCount = 0;
    let draftCount = 0;
    try {
      readyCount = (FormStorage.listReadyInstallations() || []).length;
      draftCount = (FormStorage.listDrafts() || []).length;
    } catch (e) {}

    appElem.innerHTML = `
      <div class="app-layout">
        <!-- Sidebar Navigation -->
        <aside class="app-sidebar no-print ${isCollapsed ? 'collapsed' : ''}" id="app-sidebar">
          <!-- Sidebar Brand Header -->
          <div class="sidebar-brand">
            <img src="${logoUrl}" alt="EcoWorks Logo" class="sidebar-logo-img" />
            <div class="sidebar-brand-info">
              <h1 class="sidebar-brand-title">Synx</h1>
            </div>
          </div>

          <!-- Navigation Links -->
          <nav class="sidebar-nav" aria-label="Main Portal Navigation">
            
            ${isAdmin ? `
              <div class="nav-section-label">ADMINISTRATION</div>

              <a href="/admin/dashboard" class="sidebar-nav-btn ${isActive('/admin/dashboard') ? 'active' : ''}" title="System Health & Telemetry Dashboard">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>System Dashboard</span>
              </a>

              <a href="/admin/users" class="sidebar-nav-btn ${isActive('/admin/users') ? 'active' : ''}" title="User Management & Account Directory">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span>User Management</span>
              </a>

              <a href="/admin/audit" class="sidebar-nav-btn ${isActive('/admin/audit') ? 'active' : ''}" title="Immutable System & Security Audit Logs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span>Audit Logs</span>
              </a>
            ` : ''}

            ${isManager ? `
              <div class="nav-section-label" style="${isAdmin ? 'margin-top: 1.25rem;' : ''}">OPERATIONS & MGR CARE</div>

              <a href="/manager/dispatch" class="sidebar-nav-btn ${isActive('/manager/dispatch') ? 'active' : ''}" title="Workload & Dispatch">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                <span>Workload & Dispatch</span>
              </a>

              <a href="/manager/qa" class="sidebar-nav-btn ${isActive('/manager/qa') ? 'active' : ''}" title="Audit QA Queue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/></svg>
                <span>Audit QA Queue</span>
                ${readyCount > 0 ? `<span class="sidebar-counter-badge">${readyCount}</span>` : ''}
              </a>

              <a href="/manager/clientsearch" class="sidebar-nav-btn ${isActive('/manager/clientsearch') ? 'active' : ''}" title="360 Client Lookup">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>360° Client Lookup</span>
              </a>

              <a href="/manager/calendar" class="sidebar-nav-btn ${isActive('/manager/calendar') ? 'active' : ''}" title="Field Operations Calendar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Field Calendar</span>
              </a>

              <a href="/manager/tickets" class="sidebar-nav-btn ${isActive('/manager/tickets') ? 'active' : ''}" title="Support Tickets">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 1 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/><line x1="13" y1="5" x2="13" y2="19" stroke-dasharray="2 2"/></svg>
                <span>Support Tickets</span>
              </a>

              <a href="/manager/materials" class="sidebar-nav-btn ${isActive('/manager/materials') ? 'active' : ''}" title="Material Demand & Allocation">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>Material Demand</span>
              </a>

              <a href="/manager/kpis" class="sidebar-nav-btn ${isActive('/manager/kpis') ? 'active' : ''}" title="Operations KPIs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <span>Operations KPIs</span>
              </a>
            ` : ''}

            <div class="nav-section-label" style="margin-top: 1.25rem;">FIELD INSPECTION</div>
            
            <a href="/ocular" class="sidebar-nav-btn ${isActive('/ocular') ? 'active' : ''}" title="Ocular Inspection Form">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>Ocular Inspection</span>
            </a>

            <a href="/ocular/ready" class="sidebar-nav-btn ${isActive('/ocular/ready') ? 'active' : ''}" title="Ready for Installation Queue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Ready for Install</span>
              ${readyCount > 0 ? `<span class="sidebar-counter-badge">${readyCount}</span>` : ''}
            </a>

            <a href="/ocular/installation" class="sidebar-nav-btn ${isActive('/ocular/installation') ? 'active' : ''}" title="Installation Handover Form">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              <span>Installation Form</span>
            </a>

            <div class="nav-section-label" style="margin-top: 1.25rem;">REPOSITORIES</div>

            <a href="/ocular/history" class="sidebar-nav-btn ${isActive('/ocular/history') ? 'active' : ''}" title="Saved Form Drafts">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Saved Drafts</span>
              ${draftCount > 0 ? `<span class="sidebar-counter-badge">${draftCount}</span>` : ''}
            </a>
          </nav>

          <!-- Sidebar Footer -->
          <div class="sidebar-footer">
            <div class="sidebar-copyright">
              &copy; 2026 EcoWorks Building Systems
            </div>
          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="app-main-content">
          <header class="top-view-header no-print">
            <div class="top-header-left">
              <!-- Hamburger Fold Sidebar Button -->
              <button type="button" class="sidebar-toggle-btn" id="btn-sidebar-toggle" title="Fold / Toggle Sidebar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>

              <div class="top-view-title-group">
                <h2 id="view-page-title">${pageTitle}</h2>
              </div>
            </div>

            <!-- Profile Menu Dropdown (Top Right) -->
            <div class="user-menu-wrapper">
              <div class="sidebar-user-card" id="btn-user-menu-trigger" title="User Profile Menu">
                <div class="user-avatar" id="header-user-avatar">MS</div>
                <div class="user-details">
                  <div class="user-name" id="header-user-name">Engr. Marco Santos</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 0.15rem; color: var(--text-muted);"><path d="M6 9l6 6 6-6"/></svg>
              </div>

              <div class="user-dropdown-menu" id="user-dropdown-menu" style="display: none;">
                <div class="user-dropdown-header">
                  <strong id="dropdown-user-name">Engr. Marco Santos</strong>
                  <span id="dropdown-user-email" style="font-size: 0.725rem; color: var(--text-muted); font-weight: 400; display: block;">inspector.marco@ecoworks.ph</span>
                </div>
                <div class="user-dropdown-divider"></div>
                <button type="button" class="user-dropdown-item" id="menu-btn-profile">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Manage User Profile
                </button>
                <button type="button" class="user-dropdown-item" id="menu-btn-rbac">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Role & Permissions
                </button>
                <div class="user-dropdown-divider"></div>
                <button type="button" class="user-dropdown-item text-danger" id="menu-btn-logout">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Logout Session
                </button>
              </div>
            </div>
          </header>

          <div id="main-content-view" class="view-stage">
            <!-- Page specific content will be injected here -->
          </div>
        </main>

        <div class="toast-container"></div>
      </div>

      <!-- User Profile Modal -->
      <div id="login-modal" style="display: none; position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); align-items: center; justify-content: center;">
        <div class="form-card" style="max-width: 400px; width: 90%; background: var(--bg-card); border-color: var(--ecoworks-blue);">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            User Profile
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
            Active User Account Details & Role Scope.
          </p>
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input type="text" class="form-input" id="modal-user-name" value="" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input type="text" class="form-input" id="modal-user-email" value="" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">Assigned Role</label>
            <input type="text" class="form-input" id="modal-user-role" value="" readonly />
          </div>
          <div style="display: flex; gap: 0.5rem; margin-top: 1.25rem;">
            <button type="button" class="btn btn-primary" style="flex: 1;" id="btn-close-login">Close Profile</button>
          </div>
        </div>
      </div>
    `;

    this.bindLayoutEvents();
    this.updateUserHeader();
    return document.getElementById('main-content-view');
  }

  static bindLayoutEvents() {
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    const sidebar = document.getElementById('app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const collapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('synx_sidebar_collapsed', collapsed ? 'true' : 'false');
      });
    }

    const trigger = document.getElementById('btn-user-menu-trigger');
    const menu = document.getElementById('user-dropdown-menu');
    const profileBtn = document.getElementById('menu-btn-profile');
    const rbacBtn = document.getElementById('menu-btn-rbac');
    const logoutBtn = document.getElementById('menu-btn-logout');
    const loginModal = document.getElementById('login-modal');

    if (trigger && menu) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
      });

      document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !menu.contains(e.target)) {
          menu.style.display = 'none';
        }
      });
    }

    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        menu.style.display = 'none';
        if (loginModal) loginModal.style.display = 'flex';
      });
    }

    if (rbacBtn) {
      rbacBtn.addEventListener('click', () => {
        menu.style.display = 'none';
        if (loginModal) loginModal.style.display = 'flex';
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        menu.style.display = 'none';
        localStorage.removeItem('synx_auth_user');
        this.showToast('Logged out of session. Redirecting to login...');
        setTimeout(() => {
          import('../router.js').then(({ Router }) => Router.navigate('/login'));
        }, 1200);
      });
    }

    const closeBtn = document.getElementById('btn-close-login');
    if (closeBtn && loginModal) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        loginModal.style.display = 'none';
      });

      loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) {
          loginModal.style.display = 'none';
        }
      });
    }
  }

  static updateUserHeader() {
    const rawUser = localStorage.getItem('synx_auth_user');
    let user = {
      fullName: 'Engr. Marco Santos, REE',
      email: 'inspector.marco@ecoworks.ph',
      role: USER_ROLES.FIELD_INSPECTOR,
      initials: 'MS'
    };

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        if (parsed.fullName) user.fullName = parsed.fullName;
        if (parsed.email) user.email = parsed.email;
        if (parsed.role) user.role = parsed.role;
        if (user.fullName) {
          const cleanName = String(user.fullName).replace(/^(Engr\.|Dr\.|Mr\.|Ms\.|PE)\s*/i, '').trim();
          const parts = cleanName.split(/\s+/).filter(Boolean);
          if (parts.length > 1) {
            const f = (parts[0][0] || 'U');
            const l = (parts[parts.length - 1][0] || 'S');
            user.initials = (f + l).toUpperCase();
          } else if (parts.length === 1) {
            user.initials = parts[0].substring(0, 2).toUpperCase();
          } else {
            user.initials = 'US';
          }
        }
      } catch (e) {}
    }

    const avatarElem = document.getElementById('header-user-avatar');
    const nameElem = document.getElementById('header-user-name');
    const dropdownName = document.getElementById('dropdown-user-name');
    const dropdownEmail = document.getElementById('dropdown-user-email');
    const modalName = document.getElementById('modal-user-name');
    const modalEmail = document.getElementById('modal-user-email');
    const modalRole = document.getElementById('modal-user-role');

    if (avatarElem) avatarElem.textContent = user.initials;
    if (nameElem) nameElem.textContent = user.fullName.replace(/, REE$/i, '');
    if (dropdownName) dropdownName.textContent = user.fullName;
    if (dropdownEmail) dropdownEmail.textContent = user.email;
    if (modalName) modalName.value = user.fullName;
    if (modalEmail) modalEmail.value = user.email;
    if (modalRole) modalRole.value = user.role;
  }

  static showToast(message) {
    const container = document.querySelector('.toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00AEEF" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
}
