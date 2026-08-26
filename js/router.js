/**
 * Synx Portal — Unified SPA Router (HTML5 History API)
 * Provides clean, extensionless, slash-based URL routing (/ocular/ready, /manager, /admin, /login)
 * with zero page reloads, role permission enforcement, and browser back/forward popstate support.
 */

import { AuthGuard } from './components/authGuard.js';
import { AppLayout } from './components/appLayout.js';
import { LoginForm } from './components/loginForm.js';
import { SetPasswordForm } from './components/setPasswordForm.js';
import { InspectorWorkspace } from './components/inspectorWorkspace.js';
import { ManagerWorkspace } from './components/managerWorkspace.js';
import { AdminWorkspace } from './components/adminWorkspace.js';
import { USER_ROLES } from './services/userService.js';

export class Router {
  static init() {
    // Intercept all internal anchor clicks for SPA routing
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a');
      if (anchor && anchor.getAttribute('href') && anchor.getAttribute('href').startsWith('/')) {
        e.preventDefault();
        const targetPath = anchor.getAttribute('href');
        this.navigate(targetPath);
      }
    });

    // Listen to browser Back / Forward popstate navigation
    window.addEventListener('popstate', () => {
      this.handleRoute(window.location.pathname);
    });

    // Handle initial route on page load
    this.handleRoute(window.location.pathname);
  }

  static navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    return this.handleRoute(path);
  }

  static async handleRoute(pathname) {
    try {
      const cleanPath = pathname.replace(/\/$/, '') || '/';
      const user = await AuthGuard.getSessionUser();

      // 1. Unauthenticated Route Guard
      if (!user && cleanPath !== '/login') {
        window.history.replaceState({}, '', '/login');
        this.renderLogin();
        return;
      }

      if (cleanPath === '/login') {
        if (user) {
          const defaultPath = this.getDefaultPathForRole(user.role);
          window.history.replaceState({}, '', defaultPath);
          await this.handleRoute(defaultPath);
        } else {
          this.renderLogin();
        }
        return;
      }

      // 1b. Forced Password Change Gate — must resolve before any protected
      // route, regardless of what was requested. Temp-password accounts
      // (admin-created, must_change_password=true) can't reach anything else.
      if (user.mustChangePassword) {
        if (cleanPath !== '/set-password') {
          window.history.replaceState({}, '', '/set-password');
        }
        this.renderSetPassword(user);
        return;
      }
      if (cleanPath === '/set-password') {
        // Flag already cleared (e.g. back button after completing it) — move on.
        const defaultPath = this.getDefaultPathForRole(user.role);
        window.history.replaceState({}, '', defaultPath);
        return this.handleRoute(defaultPath);
      }

      // 2. Role-Based Route Protection
      if (cleanPath.startsWith('/admin')) {
        if (!(await AuthGuard.hasRole([USER_ROLES.ADMIN]))) {
          AppLayout.showToast('Unauthorized access to Admin Console. Redirected to Inspector Portal.');
          this.navigate('/ocular');
          return;
        }
        await this.renderAdminWorkspace(cleanPath);
        return;
      }

      if (cleanPath.startsWith('/manager')) {
        if (!(await AuthGuard.hasRole([USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN]))) {
          AppLayout.showToast('Unauthorized access to Manager Workspace. Redirected to Inspector Portal.');
          this.navigate('/ocular');
          return;
        }
        await this.renderManagerWorkspace(cleanPath);
        return;
      }

      // Default route: Inspector Workspace (/ocular, /ocular/ready, /ocular/installation, /ocular/history)
      await this.renderInspectorWorkspace(cleanPath);
    } catch (routeErr) {
      console.error('[Synx Router Error]', routeErr);
      this.renderError(routeErr);
    }
  }

  static renderError(error) {
    const appElem = document.getElementById('app');
    if (appElem) {
      appElem.innerHTML = `
        <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; background: var(--bg-primary, #0B1120); color: #fff; text-align: center;">
          <div style="max-width: 480px; width: 100%; padding: 2.25rem; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="width: 56px; height: 56px; margin: 0 auto 1rem; background: rgba(244, 63, 94, 0.15); color: #F43F5E; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800;">!</div>
            <h2 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.5rem; color: #fff;">Application Navigation Notice</h2>
            <p style="font-size: 0.875rem; color: #94A3B8; margin-bottom: 1.5rem;">${error?.message || 'A routing component notice occurred.'}</p>
            <div style="display: flex; gap: 0.75rem; justify-content: center;">
              <button onclick="window.location.href='/login'" style="padding: 0.6rem 1.2rem; background: #00AEEF; color: #fff; border: none; border-radius: 0.5rem; font-weight: 700; cursor: pointer;">Return to Login</button>
              <button onclick="window.location.href='/'" style="padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 0.5rem; font-weight: 700; cursor: pointer;">Reload Home</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  static getDefaultPathForRole(role) {
    switch (role) {
      case USER_ROLES.ADMIN:
        return '/admin/dashboard';
      case USER_ROLES.CUSTOMER_CARE_MANAGER:
      case USER_ROLES.LEAD_ENGINEER:
        return '/manager/dispatch';
      case USER_ROLES.FIELD_INSPECTOR:
      default:
        return '/ocular';
    }
  }

  static renderLogin() {
    const appElem = document.getElementById('app');
    if (appElem) {
      appElem.innerHTML = '';
      const loginForm = new LoginForm(appElem);
      loginForm.render();
    }
  }

  static renderSetPassword(user) {
    const appElem = document.getElementById('app');
    if (appElem) {
      appElem.innerHTML = '';
      const setPasswordForm = new SetPasswordForm(appElem, user);
      setPasswordForm.render();
    }
  }

  static async renderInspectorWorkspace(pathname) {
    const tabMatch = pathname.replace('/ocular', '').replace('/', '') || 'ocular';
    const activeTab = ['ready', 'installation', 'history', 'ocular'].includes(tabMatch) ? tabMatch : 'ocular';

    const titleMap = {
      ocular: 'Ocular Inspection Form',
      ready: 'Ready for Installation Queue',
      installation: 'Installation Handover Form',
      history: 'Saved Form Drafts & Repositories'
    };

    const mainStage = await AppLayout.init(pathname, titleMap[activeTab] || 'Field Inspector Portal');
    if (mainStage) {
      const workspace = new InspectorWorkspace(mainStage);
      workspace.activeTab = activeTab;
      workspace.render();
    }
  }

  static async renderManagerWorkspace(pathname) {
    const tabMatch = pathname.replace('/manager', '').replace('/', '') || 'dispatch';
    const titleMap = {
      dispatch: 'Workload & Field Dispatch Command Center',
      qa: 'Audit QA Review Queue',
      clientsearch: '360° Client & Account Lookup',
      calendar: 'Field Operations Calendar',
      tickets: 'Support Tickets Hub',
      materials: 'Material Demand & Allocation',
      kpis: 'Operations KPIs & Performance Analytics'
    };

    const mainStage = await AppLayout.init(pathname, titleMap[tabMatch] || 'Customer Care & Manager Hub');
    if (mainStage) {
      const workspace = new ManagerWorkspace(mainStage);
      if (tabMatch && workspace.activeTab !== tabMatch) {
        workspace.activeTab = tabMatch;
      }
      workspace.render();
    }
  }

  static async renderAdminWorkspace(pathname) {
    const tabMatch = pathname.replace('/admin', '').replace('/', '') || 'dashboard';
    const titleMap = {
      dashboard: 'System Dashboard',
      users: 'User Management',
      audit: 'Audit Logs',
      clients: 'Client Directory'
    };

    const mainStage = await AppLayout.init(pathname, titleMap[tabMatch] || 'System Dashboard');
    if (mainStage) {
      const workspace = new AdminWorkspace(mainStage);
      if (tabMatch && workspace.activeTab !== tabMatch) {
        workspace.activeTab = tabMatch;
      }
      workspace.render();
    }
  }
}
