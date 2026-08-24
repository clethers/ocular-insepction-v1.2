# Safe Login & Role-Based Redirect — Design

## Context

Synx's login flow currently authenticates against Supabase but does not
enforce the result. `loginForm.js` calls
`supabase.auth.signInWithPassword()`, and on any error — wrong password,
unreachable backend, anything — it logs a console warning and proceeds to
create a session anyway. Role is resolved by matching the entered email
against a hardcoded `DEMO_ACCOUNTS` list (no password check at all for
those), or defaulting to `field_inspector` for anyone else. The resulting
session is a plain `localStorage.synx_auth_user` flag that `AuthGuard`
trusts forever — no expiry, no re-validation, no way to revoke it short of
clearing the browser's storage.

This became a real problem once real accounts were created in Supabase for
`ecoworksph.com` staff (`public.profiles`, with roles including three new
`admin` accounts): the current code would grant *any* email/password combo
at least Field Inspector access, and even a correct login wouldn't pick up
the real role, since role lives in `public.profiles.role`, not in Supabase
Auth's `user_metadata` (the only place the old code looked).

## Goals

- Login only succeeds when Supabase actually verifies the password.
- The role used for redirect and route protection comes from
  `public.profiles`, the real source of truth.
- A deactivated account (`profiles.status != 'ACTIVE'`) loses access
  automatically, without needing to manually revoke a token.
- Network/outage failures are distinguishable from bad credentials, both
  in the message shown and in what counts against the login rate limiter.
- Demo accounts are removed entirely — no password-less shortcut remains.
- Rapid/duplicate form submission can't fire multiple concurrent auth
  attempts.

## Non-goals

- Wiring the rest of the app's Supabase calls (`supabaseService.js`) to use
  the logged-in user's access token for RLS-enforced requests. Today those
  calls use the shared anon key regardless of who's logged in. Fixing that
  is a separate, larger piece of work and out of scope here — this design
  only fixes *authentication* (can you log in, what role do you get), not
  *per-request authorization* against Supabase.
- Building an in-app UI for managing user accounts/roles (still done via
  the Supabase dashboard/table editor for now).
- Password reset / "forgot password" flow.

## Design

### Login submission

1. On submit, immediately disable the submit button and set an
   `isSubmitting` guard so additional submit events (double-click, Enter
   held down) are ignored until the attempt resolves. Re-enable the button
   in every exit path (success redirect makes this moot, but failure paths
   must re-enable it).
2. Call `supabase.auth.signInWithPassword({ email, password })`, wrapped
   with the same `withTimeout()` pattern already added to
   `supabaseService.js` (3s), so an unreachable backend fails fast instead
   of retrying for 7+ seconds like the Ready Queue bug did.
3. Classify the outcome:
   - **Timeout / network error** (the wrapper's timeout fires, or the
     underlying fetch rejects with a network-level error): show "Can't
     reach the server — check your connection and try again." Do **not**
     count this against `LoginRateLimiter`.
   - **Auth rejection** (Supabase returns an error for a completed
     request — wrong password, unknown user): show "Invalid email or
     password." This **does** count against `LoginRateLimiter`, same as
     today.
   - **Success but no matching `profiles` row, or `status != 'ACTIVE'`**:
     immediately call `supabase.auth.signOut()` to discard the session,
     and show "This account is not active. Contact your administrator."
     Does not count against the rate limiter (it's not a guessing attempt).
4. On full success, redirect using the existing
   `AuthGuard.getDefaultLandingPage(user)` mapping (unchanged), fed the
   real `role` from the fetched profile.

### Session source of truth

Stop hand-rolling a session flag. Supabase's client (`createClient(...)`)
already persists its own session (access token, refresh token, expiry) in
`localStorage` under its own key and auto-refreshes it. That becomes the
only source of truth for "is this browser currently authenticated."

`AuthGuard` is rewritten around this:

- `AuthGuard.getSessionUser()` becomes `async`:
  1. `const { data: { session } } = await supabaseService.client.auth.getSession()`.
  2. If no session, return `null`.
  3. Look up the cached profile for `session.user.id` (see caching below).
     If missing or stale, fetch `public.profiles` by id.
  4. If the profile is missing or `status != 'ACTIVE'`, call
     `supabase.auth.signOut()`, clear the cache, and return `null` — this
     is what makes a deactivation take effect on a *live* session without
     any manual token revocation.
  5. Otherwise return `{ id, email, fullName, role, department, status }`
     — same shape callers already expect today.
- `hasRole()`, `getDefaultLandingPage()` (no change to its internal
  mapping, just now receives real data), `protectPage()`,
  `protectPageWithRole()`, and `redirectIfLoggedIn()` all become `async`
  since they call `getSessionUser()`.

**Profile caching:** an in-memory (module-level) cache in `authGuard.js`,
keyed by user id, with a 60-second TTL. Avoids re-querying `profiles` on
every route change within a session, while still noticing a deactivation
within about a minute. Cleared on logout or when the cached id no longer
matches the current session's user id.

### Call-site ripple

Every caller of the now-async `AuthGuard` methods needs `await` added.
All are already ES modules, so top-level `await` works without
restructuring:

- `js/router.js` — `handleRoute()` becomes `async`; its three call sites
  (click interception, `popstate` listener, initial load) get `await`/
  `.then()` as appropriate.
- `js/components/appLayout.js`
- `js/app.js`
- `js/pages/adminPage.js`, `managerPage.js`, `ocularPage.js`,
  `readyPage.js`, `installationPage.js`, `historyPage.js`,
  `loginPage.js`

No behavioral change to *what* each guard checks — only that the check is
now awaited.

### Removed

- `DEMO_ACCOUNTS` array and every reference to it: the quick-login demo
  buttons in `loginForm.js`, the `matchedDemo` email-only lookup, and the
  password-less role assignment that came with it.
- The custom `localStorage.setItem('synx_auth_user', ...)` write in
  `loginForm.js` — superseded by Supabase's own session persistence.

### Rate limiting

`LoginRateLimiter` (existing lockout-after-N-failures logic) is unchanged
in mechanism, but is now only invoked on the "auth rejection" branch above
— not on timeouts, not on inactive-account rejections. A flaky connection
or a deactivated account can no longer lock someone out of retrying once
the real problem is fixed.

## Data model notes

`public.profiles` already exists (from `schema.sql`) with `id` (FK to
`auth.users.id`), `email`, `full_name`, `role`, `department`, `status`,
auto-populated on signup via the `handle_new_user()` trigger. Its RLS
policy allows `SELECT` for any request (`USING (true)`) and `UPDATE` of
one's own row, which is sufficient for the login flow to read the caller's
own profile — no policy changes needed for this design.

## Testing plan

Manual verification in a real browser (Playwright, same approach used for
the Ready Queue fix), covering:

1. Wrong password for a real `ecoworksph.com` account → generic
   invalid-credentials message, no session created, rate limiter
   increments.
2. Correct password for one account per role tier (admin,
   customer_care_manager, lead_engineer, field_inspector) → lands on the
   correct default page for that role.
3. Deactivate an account's `profiles.status` mid-session (via the
   Supabase table editor) → next navigation for that already-logged-in
   session gets bounced to login; a fresh login attempt with the correct
   password is also rejected.
4. Point `VITE_SUPABASE_URL` at an unreachable host → distinct "can't
   reach the server" message, no session, rate limiter untouched.
5. Rapid double-click / double-submit on the login button → network log
   shows exactly one `signInWithPassword` request.

## Rollout notes

This changes the login form's behavior for real users immediately once
deployed — the 9 accounts created tonight (and their temp passwords) are
the ones who'll be affected. No data migration needed; `profiles` and
`auth.users` are already populated correctly.
