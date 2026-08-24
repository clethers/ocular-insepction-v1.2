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
            await supabaseService.withTimeout(supabaseService.client.auth.signOut(), 3000, 'Sign out');
            this.showAlert("Can't reach the server — check your connection and try again.");
            return;
          }

          if (!profile || profile.status !== 'ACTIVE') {
            await supabaseService.withTimeout(supabaseService.client.auth.signOut(), 3000, 'Sign out');
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
