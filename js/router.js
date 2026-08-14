/**
 * Synx Portal — Unified SPA Router (HTML5 History API)
 * Provides clean, extensionless, slash-based URL routing (/ocular/ready, /manager, /admin, /login)
 * with zero page reloads, role permission enforcement, and browser back/forward popstate support.
 */

import { AuthGuard } from './components/authGuard.js';
import { AppLayout } from './components/appLayout.js';
import { LoginForm } from './components/loginForm.js';
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
    this.handleRoute(path);
  }

  static handleRoute(pathname) {
    const cleanPath = pathname.replace(/\/$/, '') || '/';
    const user = AuthGuard.getSessionUser();

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
        this.handleRoute(defaultPath);
      } else {
        this.renderLogin();
      }
      return;
    }

    // 2. Role-Based Route Protection
    if (cleanPath.startsWith('/admin')) {
      if (!AuthGuard.hasRole([USER_ROLES.ADMIN])) {
        AppLayout.showToast('Unauthorized access to Admin Console. Redirected to Inspector Portal.');
        this.navigate('/ocular');
        return;
      }
      this.renderAdminWorkspace(cleanPath);
      return;
    }

    if (cleanPath.startsWith('/manager')) {
      if (!AuthGuard.hasRole([USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN])) {
        AppLayout.showToast('Unauthorized access to Manager Workspace. Redirected to Inspector Portal.');
        this.navigate('/ocular');
        return;
      }
      this.renderManagerWorkspace(cleanPath);
      return;
    }

    // Default route: Inspector Workspace (/ocular, /ocular/ready, /ocular/installation, /ocular/history)
    this.renderInspectorWorkspace(cleanPath);
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

  static renderInspectorWorkspace(pathname) {
    const tabMatch = pathname.replace('/ocular', '').replace('/', '') || 'ocular';
    const activeTab = ['ready', 'installation', 'history', 'ocular'].includes(tabMatch) ? tabMatch : 'ocular';

    const titleMap = {
      ocular: 'Ocular Inspection Form',
      ready: 'Ready for Installation Queue',
      installation: 'Installation Handover Form',
      history: 'Saved Form Drafts & Repositories'
    };

    const mainStage = AppLayout.init(pathname, titleMap[activeTab] || 'Field Inspector Portal');
    if (mainStage) {
      const workspace = new InspectorWorkspace(mainStage);
      workspace.activeTab = activeTab;
      workspace.render();
    }
  }

  static renderManagerWorkspace(pathname) {
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

    const mainStage = AppLayout.init(pathname, titleMap[tabMatch] || 'Customer Care & Manager Hub');
    if (mainStage) {
      const workspace = new ManagerWorkspace(mainStage);
      if (tabMatch && workspace.activeTab !== tabMatch) {
        workspace.activeTab = tabMatch;
      }
      workspace.render();
    }
  }

  static renderAdminWorkspace(pathname) {
    const tabMatch = pathname.replace('/admin', '').replace('/', '') || 'dashboard';
    const titleMap = {
      dashboard: 'System Dashboard',
      users: 'User Management',
      audit: 'Audit Logs'
    };

    const mainStage = AppLayout.init(pathname, titleMap[tabMatch] || 'System Dashboard');
    if (mainStage) {
      const workspace = new AdminWorkspace(mainStage);
      if (tabMatch && workspace.activeTab !== tabMatch) {
        workspace.activeTab = tabMatch;
      }
      workspace.render();
    }
  }
}
