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
   * using an already-open tab. A network/timeout failure while verifying
   * the profile denies THIS check without destroying the session, since a
   * transient connectivity blip (this app's primary users are on mobile
   * networks) shouldn't force re-entry of credentials.
   */
  static async getSessionUser() {
    if (!supabaseService.isConfigured()) return null;

    let session;
    try {
      const result = await supabaseService.withTimeout(
        supabaseService.client.auth.getSession(),
        3000,
        'Get session'
      );
      session = result.data.session;
    } catch (err) {
      console.warn('[OIMS AuthGuard] Could not get session:', err.message);
      return null;
    }

    if (!session) {
      profileCache = null;
      return null;
    }

    let profile;
    try {
      profile = await this.getProfile(session.user.id);
    } catch (err) {
      console.warn('[OIMS AuthGuard] Could not verify profile, denying this check:', err.message);
      return null;
    }

    if (!profile || profile.status !== 'ACTIVE') {
      try {
        await supabaseService.withTimeout(supabaseService.client.auth.signOut(), 3000, 'Sign out');
      } catch (err) {
        console.warn('[OIMS AuthGuard] signOut failed during forced logout:', err.message);
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
      status: profile.status,
      mustChangePassword: !!profile.must_change_password
    };
  }

  /**
   * Fetches the profiles row for a user id, cached in-memory for
   * PROFILE_CACHE_TTL_MS so route-change checks within a session don't
   * hit Supabase on every click. A deactivation still takes effect within
   * one TTL window on the affected browser.
   *
   * Returns the profile row, or null if the query succeeded and found no
   * matching row. Throws if the query itself failed (timeout, network
   * error) — callers must NOT treat a thrown error the same as "no
   * profile": one means "this account doesn't exist / isn't valid", the
   * other means "we couldn't ask".
   */
  static async getProfile(userId) {
    if (profileCache && profileCache.userId === userId && (Date.now() - profileCache.fetchedAt) < PROFILE_CACHE_TTL_MS) {
      return profileCache.profile;
    }

    const { data, error } = await supabaseService.withTimeout(
      supabaseService.client.from('profiles').select('*').eq('id', userId).single(),
      3000,
      'Fetch user profile'
    );

    if (error) {
      // PGRST116 = no rows found for .single() — a genuine "no such profile",
      // not a transport failure.
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    profileCache = { userId, profile: data, fetchedAt: Date.now() };
    return data;
  }

  /**
   * Drops the cached profiles row so the next getSessionUser()/getProfile()
   * call re-fetches from Supabase. Callers that mutate the current user's
   * own profile row directly (e.g. clearing must_change_password) must call
   * this before navigating, otherwise the route guard keeps acting on the
   * stale cached copy for up to PROFILE_CACHE_TTL_MS.
   */
  static invalidateProfileCache() {
    profileCache = null;
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
