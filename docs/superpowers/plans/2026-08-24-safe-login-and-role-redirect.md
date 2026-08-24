# Safe Login & Role-Based Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the login form actually enforce Supabase authentication (no more granting access on auth failure), resolve roles from `public.profiles` (the real source of truth) instead of a hardcoded demo list, and make a deactivated account lose access automatically.

**Architecture:** `AuthGuard` becomes the single async gate for "is this browser logged in, and as whom" — it defers to Supabase's own persisted session for validity and to `public.profiles` for role/name/status, replacing the hand-rolled `localStorage.synx_auth_user` flag that never expired. Because that gate becomes async, every caller across the router and the six MPA page-entry scripts needs an `await` — landed first, as a no-op-safe mechanical pass, before the gate's internals actually change behavior.

**Tech Stack:** Vanilla ES modules, Vite, Supabase JS v2 (loaded via CDN `<script>`, available as `window.supabase`), no test framework — verification is manual via headless-Chromium scripts (Playwright, installed locally with `npm install --no-save playwright` this session) driving the real Vite dev server, the same approach used earlier this session for the Ready Queue load-time fix.

**Spec:** `docs/superpowers/specs/2026-08-24-safe-login-and-role-redirect-design.md`

## Global Constraints

- Reuse `supabaseService.withTimeout(promiseLike, ms, label)` (already implemented in `js/services/supabaseService.js`) for every new Supabase call added in this plan — do not write a second timeout mechanism.
- `DEMO_ACCOUNTS` stays exported from `js/services/userService.js` — it's still load-bearing for the unrelated local "Users" directory tab in `js/components/adminWorkspace.js` (out of scope per the spec's non-goals). Only its usage inside `js/components/loginForm.js` is removed.
- No new npm dependencies. `playwright` is already present in `node_modules` (installed with `--no-save`, gitignored) from earlier this session — reuse it for verification scripts rather than reinstalling.
- Never add the Supabase `service_role`/secret key to `.env` or any file under `VITE_`-prefix — Vite inlines those into the client bundle. Verification scripts that need elevated access (toggling `profiles.status` for the deactivation test) take the key via a `SERVICE_KEY` environment variable at invocation time only, same pattern as `create_users.js` used earlier tonight.
- The Vite dev server runs on port 3000. Start it with `npm run dev`, wait for `curl -sf http://localhost:3000` to succeed before driving it, and stop it with `lsof -ti:3000 -sTCP:LISTEN | xargs -r kill` when done — `$!` after `npm run dev &` only tracks the npm wrapper, not the server it spawns.

---

## Task 1: Await-ify every AuthGuard/AppLayout call site (no behavior change)

`await` on a value that isn't a Promise resolves immediately to that same value — so every caller of `AuthGuard`'s methods and `AppLayout.init()` can be switched to `await` *before* those methods actually become async, with zero behavior change. This lands first so Task 2 (which makes `AuthGuard` genuinely async) doesn't silently break every caller at once.

**Files:**
- Modify: `js/router.js`
- Modify: `js/components/appLayout.js:18`
- Modify: `js/pages/adminPage.js`
- Modify: `js/pages/managerPage.js`
- Modify: `js/pages/ocularPage.js`
- Modify: `js/pages/readyPage.js`
- Modify: `js/pages/installationPage.js`
- Modify: `js/pages/historyPage.js`
- Modify: `js/pages/loginPage.js`

**Interfaces:**
- Produces: `Router.handleRoute(pathname)` is now `async` and returns a `Promise`. `Router.navigate(path)` now returns whatever `handleRoute` returns (previously returned `undefined`). `AppLayout.init(activePath, pageTitle)` is now `async` and returns `Promise<HTMLElement|null>` instead of `HTMLElement|null`. Task 2 will build on both of these.

Note: `js/app.js`'s `SynxApp.getSessionUser()` is a bare passthrough (`return AuthGuard.getSessionUser();`) with zero callers anywhere in the codebase (verified via `grep -rn "SynxApp\." js/`) — it needs no change; a passthrough naturally returns whatever the thing it forwards to returns, Promise or not.

- [ ] **Step 1: Rewrite `js/router.js`**

Replace the whole file with:

```js
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
      audit: 'Audit Logs'
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
```

- [ ] **Step 2: Update `js/components/appLayout.js:18`**

Change:
```js
  static init(activePath = '/ocular', pageTitle = 'Synx Portal') {
    const appElem = document.getElementById('app');
    if (!appElem) return null;

    const isCollapsed = localStorage.getItem('synx_sidebar_collapsed') !== 'false';
    const user = AuthGuard.getSessionUser() || {
```
to:
```js
  static async init(activePath = '/ocular', pageTitle = 'Synx Portal') {
    const appElem = document.getElementById('app');
    if (!appElem) return null;

    const isCollapsed = localStorage.getItem('synx_sidebar_collapsed') !== 'false';
    const user = (await AuthGuard.getSessionUser()) || {
```

- [ ] **Step 3: Update `js/pages/adminPage.js`**

Change the `DOMContentLoaded` callback from `() => {` to `async () => {`, and:
```js
  if (!AuthGuard.protectPageWithRole([USER_ROLES.ADMIN])) return;
```
to:
```js
  if (!(await AuthGuard.protectPageWithRole([USER_ROLES.ADMIN]))) return;
```
and:
```js
  const mainStage = AppLayout.init('/admin/' + tab, titleMap[tab] || 'System Dashboard');
```
to:
```js
  const mainStage = await AppLayout.init('/admin/' + tab, titleMap[tab] || 'System Dashboard');
```

- [ ] **Step 4: Update `js/pages/managerPage.js`**

Same pattern — `async () => {`, then:
```js
  if (!(await AuthGuard.protectPageWithRole([USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN]))) return;

  const mainStage = await AppLayout.init('manager', 'Customer Care & Manager Hub');
```

- [ ] **Step 5: Update `js/pages/ocularPage.js`**

Same pattern:
```js
  if (!(await AuthGuard.protectPageWithRole([USER_ROLES.FIELD_INSPECTOR, USER_ROLES.CUSTOMER_CARE_MANAGER, USER_ROLES.LEAD_ENGINEER, USER_ROLES.ADMIN]))) return;

  const container = await AppLayout.init('ocular', 'Field Inspector Portal');
```

- [ ] **Step 6: Update `js/pages/readyPage.js`**

```js
  if (!(await AuthGuard.protectPage())) return;

  const container = await AppLayout.init('ready', 'Ready for Installation Queue');
```

- [ ] **Step 7: Update `js/pages/installationPage.js`**

```js
  if (!(await AuthGuard.protectPage())) return;

  const container = await AppLayout.init('installation', 'EV Charger Installation & Commissioning Form');
```

- [ ] **Step 8: Update `js/pages/historyPage.js`**

```js
  if (!(await AuthGuard.protectPage())) return;

  const container = await AppLayout.init('history', 'Saved Drafts & Form History');
```

- [ ] **Step 9: Update `js/pages/loginPage.js`**

```js
document.addEventListener('DOMContentLoaded', async () => {
  // If already logged in, redirect straight to ocular inspection page
  if (await AuthGuard.redirectIfLoggedIn()) return;

  const appElem = document.getElementById('app');
  if (appElem) {
    const loginForm = new LoginForm(appElem);
    loginForm.render();
  }
});
```

- [ ] **Step 10: Verify no regression — smoke test the still-unchanged login/routing behavior**

Start the dev server and drive it with a Playwright script that exercises the *existing* (still-buggy, not yet fixed) demo login and confirms navigation across all three role areas still works exactly as before — this task only added `await`s, so behavior must be identical to pre-Task-1.

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
```

Save as `scratch/verify_task1.js` (or your scratchpad — this file is not meant to be committed):

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email', { timeout: 15000 });
  await page.click('button[type="submit"]');
  await page.waitForSelector('text=Ocular Inspection Form', { timeout: 20000 });
  console.log('OK: login still redirects to inspector portal');

  await page.click('a[href="/ocular/ready"]');
  await page.waitForSelector('#ready-search-input', { timeout: 15000 });
  console.log('OK: SPA nav to Ready Queue still works');

  await browser.close();
})();
```

Run with:
```bash
NODE_PATH="$(pwd)/node_modules" node scratch/verify_task1.js
```

Expected output: both `OK:` lines print, no `[pageerror]` lines. If anything errors, stop and fix before proceeding — Task 2 assumes this baseline still works.

Stop the server:
```bash
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
```

- [ ] **Step 11: Commit**

```bash
git add js/router.js js/components/appLayout.js js/pages/adminPage.js js/pages/managerPage.js js/pages/ocularPage.js js/pages/readyPage.js js/pages/installationPage.js js/pages/historyPage.js js/pages/loginPage.js
git commit -m "Await-ify AuthGuard/AppLayout call sites ahead of async auth rewrite

No behavior change — await on a non-Promise resolves immediately, so this
is safe prep for making AuthGuard's session check genuinely async."
```

---

## Task 2: Rewrite `AuthGuard` around Supabase's real session + `profiles`

**Files:**
- Modify: `js/components/authGuard.js`

**Interfaces:**
- Consumes: `supabaseService.client` (Supabase JS client instance), `supabaseService.isConfigured()`, `supabaseService.withTimeout(promiseLike, ms, label)` — all from `js/services/supabaseService.js`, already implemented.
- Produces: `AuthGuard.getSessionUser()` → `Promise<{id, email, fullName, role, department, status} | null>`. `AuthGuard.hasRole(allowedRoles)` → `Promise<boolean>`. `AuthGuard.protectPage()` → `Promise<boolean>`. `AuthGuard.protectPageWithRole(allowedRoles)` → `Promise<boolean>`. `AuthGuard.redirectIfLoggedIn()` → `Promise<boolean>`. `AuthGuard.getDefaultLandingPage(user)` stays synchronous (pure function, no I/O) — unchanged signature and mapping.

This task is testable in isolation because Task 1 already made every caller `await`-safe, and today's (not-yet-rewritten) `loginForm.js` already calls the real `supabase.auth.signInWithPassword()` — it just doesn't gate on the result. So a **correct** password for a **real** `ecoworksph.com` account already establishes a genuine Supabase session today; this task changes whether `AuthGuard` notices it.

- [ ] **Step 1: Rewrite `js/components/authGuard.js`**

```js
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
      await supabaseService.client.auth.signOut();
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
```

- [ ] **Step 2: Verify against a real account**

Start the dev server (same start/wait sequence as Task 1, Step 10). Save as `scratch/verify_task2.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => msg.type() === 'error' && console.log('[console:error]', msg.text()));

  // Old (not-yet-rewritten) loginForm.js still does the real signInWithPassword
  // call under the hood — a correct password for a real account establishes
  // a genuine Supabase session even though the old code doesn't gate on it.
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#signin-email', 'albertcledera@ecoworksph.com');
  await page.fill('#signin-password', 'REPLACE_WITH_REAL_TEMP_PASSWORD');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // Reload — this forces AppLayout.init() -> AuthGuard.getSessionUser() to
  // run fresh, which is the code this task actually changed.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const url = page.url();
  console.log('URL after reload:', url);
  console.log(url.includes('/admin') ? 'OK: admin role correctly resolved from profiles table' : 'FAIL: expected an /admin path');

  await browser.close();
})();
```

Replace `REPLACE_WITH_REAL_TEMP_PASSWORD` with the actual temp password generated for `albertcledera@ecoworksph.com` earlier this session. Run with:
```bash
NODE_PATH="$(pwd)/node_modules" node scratch/verify_task2.js
```

Expected: `OK: admin role correctly resolved from profiles table`. This confirms `AuthGuard` is reading the real role from `public.profiles`, not defaulting to `field_inspector` — the bug that motivated this whole plan.

Stop the server (`lsof -ti:3000 -sTCP:LISTEN | xargs -r kill`).

- [ ] **Step 3: Commit**

```bash
git add js/components/authGuard.js
git commit -m "Make AuthGuard resolve sessions from Supabase + public.profiles

Replaces the localStorage flag that never expired with Supabase's real
session (auto-expiring, auto-refreshing) combined with a cached profiles
lookup for role/name/status. A deactivated account now loses access on
its next route check instead of indefinitely."
```

---

## Task 3: Rewrite `loginForm.js` — enforce auth, classify errors, debounce

**Files:**
- Modify: `js/components/loginForm.js`

**Interfaces:**
- Consumes: `supabaseService.withTimeout`, `supabaseService.isConfigured`, `supabaseService.client.auth.signInWithPassword`, `supabaseService.client.from('profiles')`, `supabaseService.client.auth.signOut` (all existing). `AuthGuard.getDefaultLandingPage(user)` (existing, unchanged signature). `LoginRateLimiter.isLockedOut()` / `.recordFailedAttempt()` / `.reset()` from `js/utils/security.js` (existing — note `.recordFailedAttempt()` is currently never called anywhere in the codebase; this task is what wires it up for the first time).
- Produces: nothing new consumed by other tasks — this is the last file in the chain.

**Important finding from live testing earlier this session:** `signInWithPassword()` does not reliably *reject* on a network failure — during tonight's Supabase outage it *resolved* with `error.message === 'Failed to fetch'`. So the network-vs-bad-credentials classification can't rely on try/catch alone; it must also inspect the resolved `error` object. The code below checks for an HTTP status first (a real status means the server responded, so it's a credentials rejection, not a network failure) and falls back to matching common network-error message text otherwise.

- [ ] **Step 1: Rewrite `js/components/loginForm.js`**

```js
/**
 * Synx Portal - Universal Authentication Component
 */

import { supabaseService } from '../services/supabaseService.js';
import { escapeHTML, isSafeRedirectUrl, LoginRateLimiter } from '../utils/security.js';
import { AuthGuard } from './authGuard.js';
import logoUrl from '../../assets/ecoworks-logo.png';

function isLikelyNetworkError(error) {
  if (!error) return false;
  if (typeof error.status === 'number' && error.status > 0) return false; // a real HTTP response came back
  return /fetch|network|timeout/i.test(error.message || '');
}

export class LoginForm {
  constructor(container) {
    this.container = container;
    this.isSubmitting = false;
  }

  render() {
    this.container.innerHTML = `
      <div class="login-wrapper" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: var(--bg-primary); background-image: radial-gradient(circle at 50% 20%, rgba(0, 174, 239, 0.12), transparent 70%);">
        <div class="form-card login-card" style="max-width: 440px; width: 100%; padding: 2.25rem; background: var(--glass-bg); backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border); box-shadow: var(--shadow-lg), var(--shadow-glow); border-radius: var(--radius-xl);">

          <!-- Brand Header -->
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <img src="${logoUrl}" alt="EcoWorks Logo" style="height: 56px; margin-bottom: 0.75rem;" />
            <h1 style="font-size: 1.6rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 0.25rem;">
              Synx Portal
            </h1>
            <p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
              Electrical Infrastructure & EV Operations Platform
            </p>
          </div>

          <!-- Error Alert Banner -->
          <div id="auth-alert" style="display: none; padding: 0.75rem 1rem; margin-bottom: 1.25rem; border-radius: var(--radius-md); background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); color: var(--accent-rose); font-size: 0.825rem; font-weight: 600; align-items: center; gap: 0.5rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="auth-alert-text">Authentication failed</span>
          </div>

          <!-- Sign In Form -->
          <form id="form-signin">
            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label class="form-label" style="font-weight: 700;">Email Address *</label>
              <input type="email" id="signin-email" class="form-input" placeholder="user@ecoworksph.com" required style="width: 100%;" autocomplete="email" />
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <label class="form-label" style="font-weight: 700; margin-bottom: 0;">Password *</label>
              </div>
              <div style="position: relative;">
                <input type="password" id="signin-password" class="form-input" placeholder="••••••••" required style="width: 100%; padding-right: 2.75rem;" autocomplete="current-password" />
                <button type="button" id="toggle-signin-password" style="position: absolute; right: 0.75rem; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem;" aria-label="Toggle password visibility">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" id="btn-submit-signin" style="width: 100%; justify-content: center; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; border-radius: var(--radius-md); box-shadow: var(--shadow-glow); margin-bottom: 1rem;">
              Sign In to Session
            </button>
          </form>

          <!-- Footer Legal -->
          <p style="margin-top: 1.5rem; text-align: center; font-size: 0.725rem; color: var(--text-muted);">
            &copy; 2026 EcoWorks Building Systems Corporation. Authorized Access Only.
          </p>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const formSignin = document.getElementById('form-signin');
    const togglePass = document.getElementById('toggle-signin-password');
    const passInput = document.getElementById('signin-password');
    const emailInput = document.getElementById('signin-email');
    const submitBtn = document.getElementById('btn-submit-signin');

    if (togglePass && passInput) {
      togglePass.addEventListener('click', () => {
        const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passInput.setAttribute('type', type);
      });
    }

    if (formSignin) {
      formSignin.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Debounce: ignore additional submits while one is already in flight
        if (this.isSubmitting) return;

        try {
          // 1. Rate Limiting Check
          const lockStatus = LoginRateLimiter.isLockedOut();
          if (lockStatus.locked) {
            this.showAlert(`Security Lockout Active: Too many failed login attempts. Please try again in ${lockStatus.remainingSec}s.`);
            return;
          }

          // 2. Input Extraction
          const rawEmail = emailInput?.value || '';
          const rawPassword = passInput?.value || '';
          const email = escapeHTML(rawEmail.trim());

          if (!email || !rawPassword.trim()) {
            this.showAlert('Please enter both email address and password.');
            return;
          }

          if (!supabaseService.isConfigured()) {
            this.showAlert('Authentication service is not configured. Contact your administrator.');
            return;
          }

          this.setSubmitting(true, submitBtn);

          // 3. Sign in — network/timeout failures throw here
          let signInResult;
          try {
            signInResult = await supabaseService.withTimeout(
              supabaseService.client.auth.signInWithPassword({ email: rawEmail, password: rawPassword }),
              3000,
              'Sign in'
            );
          } catch (timeoutErr) {
            this.showAlert("Can't reach the server — check your connection and try again.");
            return;
          }

          const { data, error } = signInResult;

          // Auth completed a round trip but rejected — could still be a
          // network-flavored error resolved instead of thrown (observed with
          // this project's Supabase outage), so classify before counting it.
          if (error) {
            if (isLikelyNetworkError(error)) {
              this.showAlert("Can't reach the server — check your connection and try again.");
            } else {
              LoginRateLimiter.recordFailedAttempt();
              this.showAlert('Invalid email or password.');
            }
            return;
          }

          // 4. Fetch the real profile (role/name/status) — public.profiles is
          // the source of truth, not Supabase Auth's user_metadata.
          let profile;
          try {
            const profileResult = await supabaseService.withTimeout(
              supabaseService.client.from('profiles').select('*').eq('id', data.user.id).single(),
              3000,
              'Fetch profile'
            );
            profile = profileResult.data;
          } catch (timeoutErr) {
            await supabaseService.client.auth.signOut();
            this.showAlert("Can't reach the server — check your connection and try again.");
            return;
          }

          if (!profile || profile.status !== 'ACTIVE') {
            await supabaseService.client.auth.signOut();
            this.showAlert('This account is not active. Contact your administrator.');
            return;
          }

          LoginRateLimiter.reset();

          const sessionUser = {
            id: data.user.id,
            email: profile.email,
            fullName: profile.full_name,
            role: profile.role,
            department: profile.department
          };

          // Determine target landing URL
          const redirectParam = new URLSearchParams(window.location.search).get('redirect');
          const targetUrl = redirectParam && isSafeRedirectUrl(redirectParam)
            ? decodeURIComponent(redirectParam)
            : AuthGuard.getDefaultLandingPage(sessionUser);

          // SPA navigation fallback to avoid hard page reload 404s
          if (window.history && typeof window.history.pushState === 'function') {
            try {
              const { Router } = await import('../router.js');
              if (Router && typeof Router.navigate === 'function') {
                Router.navigate(targetUrl);
                return;
              }
            } catch (routerErr) {
              console.warn('[Synx Router Fallback]', routerErr);
            }
          }

          window.location.href = targetUrl;
        } catch (loginErr) {
          console.error('[Synx Auth Error]', loginErr);
          this.showAlert(`Authentication system notice: ${loginErr?.message || 'Unable to process login. Please try again.'}`);
        } finally {
          this.setSubmitting(false, submitBtn);
        }
      });
    }
  }

  setSubmitting(isSubmitting, submitBtn) {
    this.isSubmitting = isSubmitting;
    if (submitBtn) {
      submitBtn.disabled = isSubmitting;
      submitBtn.textContent = isSubmitting ? 'Signing In…' : 'Sign In to Session';
    }
  }

  showAlert(message) {
    const alert = document.getElementById('auth-alert');
    const alertText = document.getElementById('auth-alert-text');
    if (alert && alertText) {
      alertText.textContent = message;
      alert.style.display = 'flex';
    }
  }
}
```

- [ ] **Step 2: Verify wrong-password rejection and correct-password success**

Start the dev server. Save as `scratch/verify_task3.js`:

```js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email', { timeout: 15000 });

  console.log('--- Wrong password ---');
  await page.fill('#signin-email', 'inspectorteam@ecoworksph.com');
  await page.fill('#signin-password', 'definitely-not-the-real-password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#auth-alert-text', { state: 'visible', timeout: 10000 });
  console.log('Alert shown:', await page.locator('#auth-alert-text').textContent());
  console.log('Still on login page:', page.url().includes('/login'));

  console.log('--- Correct password ---');
  await page.fill('#signin-password', 'REPLACE_WITH_REAL_TEMP_PASSWORD');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('URL after correct login:', page.url());

  console.log('--- Debounce: rapid double-click ---');
  const requests = [];
  page.on('request', (req) => { if (req.url().includes('/auth/v1/token')) requests.push(req.url()); });
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('#signin-email', 'inspectorteam@ecoworksph.com');
  await page.fill('#signin-password', 'REPLACE_WITH_REAL_TEMP_PASSWORD');
  await Promise.all([page.click('button[type="submit"]'), page.click('button[type="submit"]')]);
  await page.waitForTimeout(2000);
  console.log('Auth requests fired from double-click:', requests.length, '(expect 1)');

  await browser.close();
})();
```

Replace `REPLACE_WITH_REAL_TEMP_PASSWORD` with the real temp password for `inspectorteam@ecoworksph.com`. Run with:
```bash
NODE_PATH="$(pwd)/node_modules" node scratch/verify_task3.js
```

Expected:
- Wrong password → `Alert shown: Invalid email or password.` and `Still on login page: true`
- Correct password → URL is `/ocular` (inspectorteam is `field_inspector`)
- Debounce → exactly `1` auth request despite two rapid clicks

If the wrong-password alert text doesn't match, log the actual `error` object (`console.log(JSON.stringify(error))` temporarily in the browser console via `page.on('console', ...)`) to confirm `isLikelyNetworkError`'s heuristic is classifying it correctly — this is the one piece of this task whose exact shape wasn't verified against live Supabase Auth error responses before writing this plan.

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add js/components/loginForm.js
git commit -m "Enforce Supabase auth on login, remove demo accounts, add debounce

Login no longer grants access when signInWithPassword fails or the
account has no active profiles row. Distinguishes network/timeout
failures from real credential rejections in both the message shown and
whether it counts against LoginRateLimiter — wires up
recordFailedAttempt(), which was previously never called anywhere."
```

---

## Task 4: End-to-end verification against the full spec testing plan

**Files:** none (verification only)

This task exercises the five scenarios from the spec's Testing Plan together, using the real Supabase project and the accounts created earlier this session. Unlike Tasks 1-3's per-task checks, this task specifically covers **deactivation of an already-logged-in session** (needs Task 2) and **an unreachable backend** (needs Task 3's message classification) — the two scenarios that need the full stack together.

- [ ] **Step 1: Write the combined verification script**

Save as `scratch/verify_full_login.js`. Fill in real temp passwords for the three accounts before running (`albertcledera` = admin, `customercare` = manager, `inspectorteam` = inspector — all created earlier this session).

```js
const { chromium } = require('playwright');

const ACCOUNTS = {
  admin: { email: 'albertcledera@ecoworksph.com', password: 'REPLACE_ME', expectPath: '/admin' },
  manager: { email: 'customercare@ecoworksph.com', password: 'REPLACE_ME', expectPath: '/manager' },
  inspector: { email: 'inspectorteam@ecoworksph.com', password: 'REPLACE_ME', expectPath: '/ocular' },
};

const SUPABASE_URL = 'https://dnjxthmlujmzobegxloy.supabase.co';
const SERVICE_KEY = process.env.SERVICE_KEY; // pass at invocation, never hardcode

async function setProfileStatus(email, status) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to set status: ${res.status}`);
}

async function login(page, email, password) {
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#signin-email', { timeout: 15000 });
  await page.fill('#signin-email', email);
  await page.fill('#signin-password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
}

(async () => {
  if (!SERVICE_KEY) {
    console.error('Set SERVICE_KEY env var before running.');
    process.exit(1);
  }

  const browser = await chromium.launch();

  // 1 & 2: correct password per role tier
  for (const [role, acct] of Object.entries(ACCOUNTS)) {
    const page = await browser.newPage();
    await login(page, acct.email, acct.password);
    const ok = page.url().includes(acct.expectPath);
    console.log(`[${role}] login -> ${page.url()} :: ${ok ? 'OK' : 'FAIL'}`);
    await page.close();
  }

  // 1: wrong password
  {
    const page = await browser.newPage();
    await login(page, ACCOUNTS.inspector.email, 'wrong-password-xyz');
    const alertText = await page.locator('#auth-alert-text').textContent().catch(() => null);
    console.log(`[wrong password] alert="${alertText}" stillOnLogin=${page.url().includes('/login')}`);
    await page.close();
  }

  // 3: deactivate mid-session
  {
    const page = await browser.newPage();
    await login(page, ACCOUNTS.inspector.email, ACCOUNTS.inspector.password);
    console.log('[deactivation] logged in at', page.url());
    await setProfileStatus(ACCOUNTS.inspector.email, 'DEACTIVATED');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    console.log('[deactivation] after reload:', page.url(), page.url().includes('/login') ? 'OK: bounced to login' : 'FAIL: still has access');
    // restore for future test runs
    await setProfileStatus(ACCOUNTS.inspector.email, 'ACTIVE');
    await page.close();
  }

  // 4: unreachable backend — block requests to the Supabase host
  {
    const page = await browser.newPage();
    await page.route('**/dnjxthmlujmzobegxloy.supabase.co/**', (route) => route.abort('failed'));
    await login(page, ACCOUNTS.inspector.email, ACCOUNTS.inspector.password);
    const alertText = await page.locator('#auth-alert-text').textContent().catch(() => null);
    console.log(`[unreachable backend] alert="${alertText}"`);
    await page.close();
  }

  await browser.close();
})();
```

- [ ] **Step 2: Run it**

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
SERVICE_KEY="<your service_role key>" NODE_PATH="$(pwd)/node_modules" node scratch/verify_full_login.js
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
```

Expected output, all five lines showing success:
- `[admin] login -> .../admin/... :: OK`
- `[manager] login -> .../manager/... :: OK`
- `[inspector] login -> .../ocular :: OK`
- `[wrong password] alert="Invalid email or password." stillOnLogin=true`
- `[deactivation] after reload: .../login :: OK: bounced to login`
- `[unreachable backend] alert="Can't reach the server — check your connection and try again."`

If any line fails, go back to the relevant task (1/2/3) rather than patching around it here — this task is a gate, not a place to fix bugs.

- [ ] **Step 3: Delete the scratch verification scripts**

They're throwaway — the real regression protection is the spec + this plan, not these ad-hoc scripts.

```bash
rm -f scratch/verify_task1.js scratch/verify_task2.js scratch/verify_task3.js scratch/verify_full_login.js
git add -A scratch/
git commit -m "Remove throwaway login-flow verification scripts" --allow-empty
```

(`--allow-empty` in case `scratch/` was already untracked/gitignored and there's nothing to commit — check `git status` first; if `scratch/` was never tracked, skip this commit entirely.)
