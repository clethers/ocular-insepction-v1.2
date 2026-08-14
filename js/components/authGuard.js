import { isSafeRedirectUrl } from '../utils/security.js';
import { USER_ROLES } from '../services/userService.js';

export class AuthGuard {
  /**
   * Retrieves active authenticated user session object.
   */
  static getSessionUser() {
    const raw = localStorage.getItem('synx_auth_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * Checks if session user possesses any of the required allowed roles.
   */
  static hasRole(allowedRoles = []) {
    const user = this.getSessionUser();
    if (!user) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (user.role === USER_ROLES.ADMIN) return true; // Admin bypass
    return allowedRoles.includes(user.role);
  }

  /**
   * Determines default landing page according to user role.
   */
  static getDefaultLandingPage(user) {
    if (!user) return './login.html';
    const isHtmlPath = window.location.pathname.endsWith('.html');
    switch (user.role) {
      case USER_ROLES.ADMIN:
        return isHtmlPath ? './admin.html?tab=dashboard' : '/admin/dashboard';
      case USER_ROLES.CUSTOMER_CARE_MANAGER:
      case USER_ROLES.LEAD_ENGINEER:
        return isHtmlPath ? './manager.html' : '/manager/dispatch';
      case USER_ROLES.FIELD_INSPECTOR:
      default:
        return isHtmlPath ? './ocular.html' : '/ocular';
    }
  }

  /**
   * Protects a page requiring authentication. Redirects to login if unauthenticated.
   */
  static protectPage() {
    const user = this.getSessionUser();
    if (!user) {
      const targetPath = window.location.pathname.split('/').pop() + window.location.search;
      const safePath = isSafeRedirectUrl(targetPath) ? encodeURIComponent(targetPath) : '';
      window.location.href = `./login.html${safePath ? '?redirect=' + safePath : ''}`;
      return false;
    }
    return true;
  }

  /**
   * Protects a page requiring specific role permissions.
   */
  static protectPageWithRole(allowedRoles = []) {
    if (!this.protectPage()) return false;
    if (!this.hasRole(allowedRoles)) {
      const user = this.getSessionUser();
      const target = this.getDefaultLandingPage(user);
      window.location.href = target;
      return false;
    }
    return true;
  }

  /**
   * Redirects logged-in users away from login page to target or role landing page.
   */
  static redirectIfLoggedIn() {
    const user = this.getSessionUser();
    if (user) {
      const redirectParam = new URLSearchParams(window.location.search).get('redirect');
      const target = redirectParam && isSafeRedirectUrl(redirectParam)
        ? decodeURIComponent(redirectParam)
        : this.getDefaultLandingPage(user);
      window.location.href = target;
      return true;
    }
    return false;
  }
}
