/**
 * Synx Portal - Universal Authentication Component with Multi-Role Demo Switcher
 */

import { supabaseService } from '../services/supabaseService.js';
import { escapeHTML, isSafeRedirectUrl, LoginRateLimiter } from '../utils/security.js';
import { DEMO_ACCOUNTS, USER_ROLES } from '../services/userService.js';
import { AuthGuard } from './authGuard.js';
import logoUrl from '../../assets/ecoworks-logo.png';

export class LoginForm {
  constructor(container) {
    this.container = container;
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

          <!-- Quick Demo Role Switcher -->
          <div style="margin-bottom: 1.5rem; padding: 0.85rem; background: rgba(15, 23, 42, 0.6); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
            <div style="font-size: 0.725rem; font-weight: 700; color: var(--ecoworks-blue); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
              Quick Test Role Switcher
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;" id="demo-role-buttons">
              ${DEMO_ACCOUNTS.map(acc => `
                <button type="button" class="btn btn-secondary btn-demo-role" data-email="${acc.email}" data-role="${acc.role}" style="padding: 0.4rem 0.5rem; font-size: 0.725rem; justify-content: flex-start; gap: 0.35rem; text-align: left;">
                  <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${acc.role === USER_ROLES.ADMIN ? '#F43F5E' : acc.role === USER_ROLES.CUSTOMER_CARE_MANAGER ? '#00AEEF' : acc.role === USER_ROLES.LEAD_ENGINEER ? '#10B981' : '#F59E0B'};"></span>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${acc.fullName.split(' ')[0]} (${acc.role === USER_ROLES.ADMIN ? 'Admin' : acc.role === USER_ROLES.CUSTOMER_CARE_MANAGER ? 'Manager' : acc.role === USER_ROLES.LEAD_ENGINEER ? 'REE' : 'Inspector'})</span>
                </button>
              `).join('')}
            </div>
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
              <input type="email" id="signin-email" class="form-input" placeholder="user@ecoworks.ph" value="${DEMO_ACCOUNTS[3].email}" required style="width: 100%;" autocomplete="email" />
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                <label class="form-label" style="font-weight: 700; margin-bottom: 0;">Password *</label>
              </div>
              <div style="position: relative;">
                <input type="password" id="signin-password" class="form-input" placeholder="••••••••" value="demo123456" required style="width: 100%; padding-right: 2.75rem;" autocomplete="current-password" />
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

    // Bind Quick Demo Switcher buttons
    const demoBtns = document.querySelectorAll('.btn-demo-role');
    demoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetEmail = btn.getAttribute('data-email');
        if (emailInput) emailInput.value = targetEmail;
        demoBtns.forEach(b => b.style.borderColor = '');
        btn.style.borderColor = 'var(--ecoworks-blue)';
      });
    });

    if (togglePass && passInput) {
      togglePass.addEventListener('click', () => {
        const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passInput.setAttribute('type', type);
      });
    }

    if (formSignin) {
      formSignin.addEventListener('submit', async (e) => {
        e.preventDefault();

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
          const password = rawPassword.trim();

          if (!email || !password) {
            this.showAlert('Please enter both email address and password.');
            return;
          }

          // Match against demo accounts or cloud user
          const matchedDemo = DEMO_ACCOUNTS.find(a => a.email.toLowerCase() === email.toLowerCase());
          let role = matchedDemo ? matchedDemo.role : USER_ROLES.FIELD_INSPECTOR;
          let fullName = matchedDemo ? matchedDemo.fullName : 'Authorized User';

          if (!matchedDemo && email.includes('@')) {
            const parts = email.split('@')[0].split('.');
            fullName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          }

          if (supabaseService.isConfigured()) {
            try {
              const { data, error } = await supabaseService.client.auth.signInWithPassword({
                email: rawEmail,
                password: rawPassword
              });
              if (error) {
                console.warn('[Synx Auth Notice]', error.message);
              } else if (data?.user) {
                fullName = data.user.user_metadata?.full_name || fullName;
                role = data.user.user_metadata?.role || role;
              }
            } catch (err) {
              console.warn('[Synx Auth] Supabase auth notice:', err.message);
            }
          }

          LoginRateLimiter.reset();
          const userSession = {
            id: matchedDemo ? matchedDemo.id : 'user-' + Date.now(),
            email: email,
            fullName: fullName,
            role: role,
            loggedInAt: new Date().toISOString()
          };

          localStorage.setItem('synx_auth_user', JSON.stringify(userSession));

          // Determine target landing URL
          const redirectParam = new URLSearchParams(window.location.search).get('redirect');
          let targetUrl = redirectParam && isSafeRedirectUrl(redirectParam)
            ? decodeURIComponent(redirectParam)
            : AuthGuard.getDefaultLandingPage(userSession);

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
        }
      });
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
