import { isSafeRedirectUrl } from '../utils/security.js';
import { USER_ROLES } from '../services/userService.js';
import { supabaseService } from '../services/supabaseService.js';

const PROFILE_CACHE_TTL_MS = 60 * 1000;
let profileCache = null; // { userId, profile, fetchedAt }

export class AuthGuard {
  /**
   * Resolves the current authenticated session by combining Supabase's own
   * session (source of truth for "is this browser logged in", auto-expiring
   * and auto-refreshing) with the matching public.profiles row (source of
   * truth for role/name/status). Returns null if there's no session, no
   * matching profile, or the profile isn't ACTIVE — in the latter cases the
   * Supabase session is also cleared, so a deactivated account can't keep
   * using an already-open tab.
   */
  static async getSessionUser() {
    if (!supabaseService.isConfigured()) return null;

    const { data: { session } } = await supabaseService.client.auth.getSession();
    if (!session) {
      profileCache = null;
      return null;
    }

    const profile = await this.getProfile(session.user.id);
    if (!profile || profile.status !== 'ACTIVE') {
      try {
        await supabaseService.client.auth.signOut();
      } catch (err) {
        console.warn('[Synx AuthGuard] signOut failed during forced logout:', err.message);
      }
      profileCache = null;
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      fullName: profile.full_name,
      role: profile.role,
      department: profile.department,
      status: profile.status
    };
  }

  /**
   * Fetches the profiles row for a user id, cached in-memory for
   * PROFILE_CACHE_TTL_MS so route-change checks within a session don't
   * hit Supabase on every click. A deactivation still takes effect within
   * one TTL window on the affected browser.
   */
  static async getProfile(userId) {
    if (profileCache && profileCache.userId === userId && (Date.now() - profileCache.fetchedAt) < PROFILE_CACHE_TTL_MS) {
      return profileCache.profile;
    }

    try {
      const { data, error } = await supabaseService.withTimeout(
        supabaseService.client.from('profiles').select('*').eq('id', userId).single(),
        3000,
        'Fetch user profile'
      );
      if (error || !data) return null;
      profileCache = { userId, profile: data, fetchedAt: Date.now() };
      return data;
    } catch (err) {
      console.warn('[Synx AuthGuard] Could not fetch profile:', err.message);
      return null;
    }
  }

  /**
   * Checks if session user possesses any of the required allowed roles.
   */
  static async hasRole(allowedRoles = []) {
    const user = await this.getSessionUser();
    if (!user) return false;
    if (!allowedRoles || allowedRoles.length === 0) return true;
    if (user.role === USER_ROLES.ADMIN) return true; // Admin bypass
    return allowedRoles.includes(user.role);
  }

  /**
   * Determines default landing page according to user role. Pure/sync —
   * takes an already-resolved user object, does no I/O.
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
  static async protectPage() {
    const user = await this.getSessionUser();
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
  static async protectPageWithRole(allowedRoles = []) {
    if (!(await this.protectPage())) return false;
    if (!(await this.hasRole(allowedRoles))) {
      const user = await this.getSessionUser();
      const target = this.getDefaultLandingPage(user);
      window.location.href = target;
      return false;
    }
    return true;
  }

  /**
   * Redirects logged-in users away from login page to target or role landing page.
   */
  static async redirectIfLoggedIn() {
    const user = await this.getSessionUser();
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
