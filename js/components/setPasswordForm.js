/**
 * Synx Portal — Forced First-Login Password Change
 * Shown when a profile has must_change_password set (admin-created accounts
 * issued a temp password directly, rather than via self-serve signup).
 * Blocks access to the rest of the app until a new password is set.
 */

import { supabaseService } from '../services/supabaseService.js';
import logoUrl from '../../assets/ecoworks-logo.png';

export class SetPasswordForm {
  constructor(container, user) {
    this.container = container;
    this.user = user;
    this.isSubmitting = false;
  }

  render() {
    this.container.innerHTML = `
      <div class="login-wrapper" style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: var(--bg-primary); background-image: radial-gradient(circle at 50% 20%, rgba(0, 174, 239, 0.12), transparent 70%);">
        <div class="form-card login-card" style="max-width: 440px; width: 100%; padding: 2.25rem; background: var(--glass-bg); backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border); box-shadow: var(--shadow-lg), var(--shadow-glow); border-radius: var(--radius-xl);">

          <div style="text-align: center; margin-bottom: 1.5rem;">
            <img src="${logoUrl}" alt="EcoWorks Logo" style="height: 56px; margin-bottom: 0.75rem;" />
            <h1 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; margin-bottom: 0.25rem;">
              Set Your New Password
            </h1>
            <p style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
              Your account was created with a temporary password. Please set a new one before continuing.
            </p>
          </div>

          <div id="setpw-alert" style="display: none; padding: 0.75rem 1rem; margin-bottom: 1.25rem; border-radius: var(--radius-md); background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); color: var(--accent-rose); font-size: 0.825rem; font-weight: 600; align-items: center; gap: 0.5rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span id="setpw-alert-text">Something went wrong</span>
          </div>

          <form id="form-setpw">
            <div class="form-group" style="margin-bottom: 1.25rem;">
              <label class="form-label" style="font-weight: 700;">New Password *</label>
              <input type="password" id="setpw-new" class="form-input" placeholder="At least 8 characters" required minlength="8" style="width: 100%;" autocomplete="new-password" />
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label class="form-label" style="font-weight: 700;">Confirm New Password *</label>
              <input type="password" id="setpw-confirm" class="form-input" placeholder="Re-enter new password" required minlength="8" style="width: 100%;" autocomplete="new-password" />
            </div>

            <button type="submit" class="btn btn-primary" id="btn-submit-setpw" style="width: 100%; justify-content: center; padding: 0.85rem; font-size: 0.95rem; font-weight: 700; border-radius: var(--radius-md); box-shadow: var(--shadow-glow); margin-bottom: 1rem;">
              Set Password & Continue
            </button>
          </form>

          <p style="text-align: center;">
            <a href="#" id="setpw-signout" style="font-size: 0.8rem; color: var(--text-muted); text-decoration: underline;">Not you? Sign out</a>
          </p>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const form = document.getElementById('form-setpw');
    const signoutLink = document.getElementById('setpw-signout');
    const submitBtn = document.getElementById('btn-submit-setpw');

    if (signoutLink) {
      signoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await supabaseService.withTimeout(supabaseService.client.auth.signOut(), 3000, 'Sign out');
        } catch (err) {
          console.warn('[Synx SetPassword] Sign out failed:', err.message);
        }
        window.location.href = '/login';
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.isSubmitting) return;

        const newPassword = document.getElementById('setpw-new')?.value || '';
        const confirmPassword = document.getElementById('setpw-confirm')?.value || '';

        if (newPassword.length < 8) {
          this.showAlert('Password must be at least 8 characters.');
          return;
        }
        if (newPassword !== confirmPassword) {
          this.showAlert('Passwords do not match.');
          return;
        }

        this.setSubmitting(true, submitBtn);

        try {
          const { error: updateErr } = await supabaseService.withTimeout(
            supabaseService.client.auth.updateUser({ password: newPassword }),
            5000,
            'Set new password'
          );
          if (updateErr) {
            this.showAlert(updateErr.message || 'Could not set new password. Please try again.');
            return;
          }

          const { error: profileErr } = await supabaseService.withTimeout(
            supabaseService.client.from('profiles').update({ must_change_password: false }).eq('id', this.user.id),
            3000,
            'Clear must_change_password flag'
          );
          if (profileErr) {
            this.showAlert('Password was set, but finishing setup failed. Please try signing in again.');
            return;
          }

          const { AuthGuard } = await import('./authGuard.js');
          const targetUrl = AuthGuard.getDefaultLandingPage({ ...this.user, mustChangePassword: false });

          const { Router } = await import('../router.js');
          Router.navigate(targetUrl);
        } catch (err) {
          console.error('[Synx SetPassword Error]', err);
          this.showAlert("Can't reach the server — check your connection and try again.");
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
      submitBtn.textContent = isSubmitting ? 'Setting Password…' : 'Set Password & Continue';
    }
  }

  showAlert(message) {
    const alert = document.getElementById('setpw-alert');
    const alertText = document.getElementById('setpw-alert-text');
    if (alert && alertText) {
      alertText.textContent = message;
      alert.style.display = 'flex';
    }
  }
}
