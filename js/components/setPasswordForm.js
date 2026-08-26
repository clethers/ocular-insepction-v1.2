/**
 * OIMS — Forced First-Login Password Change
 * Shown when a profile has must_change_password set (admin-created accounts
 * issued a temp password directly, rather than via self-serve signup).
 * Blocks access to the rest of the app until a new password is set.
 */

import { supabaseService } from '../services/supabaseService.js';
import logoUrl from '../../assets/ecoworks-logo.png';

// Password strength criteria checked on every keystroke. These are purely
// advisory (see scorePassword() below) — the actual submit-time gate is
// still just "length >= 8" further down in bindEvents().
const STRENGTH_CRITERIA = [
  { key: 'len8', test: (pw) => pw.length >= 8 },
  { key: 'len12', test: (pw) => pw.length >= 12 },
  { key: 'lower', test: (pw) => /[a-z]/.test(pw) },
  { key: 'upper', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'digit', test: (pw) => /[0-9]/.test(pw) },
  { key: 'special', test: (pw) => /[^A-Za-z0-9]/.test(pw) }
];

// Checklist shown to the user is a subset of the scoring criteria — just
// the ones worth calling out explicitly.
const CHECKLIST_ITEMS = [
  { key: 'len8', label: '8+ characters' },
  { key: 'upper', label: 'Uppercase letter' },
  { key: 'digit', label: 'Number' },
  { key: 'special', label: 'Special character' }
];

/**
 * Scores a candidate password against STRENGTH_CRITERIA and maps the raw
 * count (0-6) onto a 5-level strength scale. Colors reuse existing design
 * tokens from css/main.css (--accent-rose / --sunburst-gold / --ecoworks-green*)
 * rather than introducing new hex values.
 */
function scorePassword(password) {
  const criteria = {};
  STRENGTH_CRITERIA.forEach(({ key, test }) => {
    criteria[key] = test(password);
  });
  const score = Object.values(criteria).filter(Boolean).length; // 0-6

  const LEVELS = [
    { max: 1, label: 'Very Weak', color: 'var(--accent-rose)' },
    { max: 2, label: 'Weak', color: 'var(--accent-rose)' },
    { max: 3, label: 'Fair', color: 'var(--sunburst-gold)' },
    { max: 5, label: 'Strong', color: 'var(--ecoworks-green-light)' },
    { max: 6, label: 'Very Strong', color: 'var(--ecoworks-green)' }
  ];
  const levelIndex = LEVELS.findIndex((l) => score <= l.max);
  const level = LEVELS[levelIndex === -1 ? LEVELS.length - 1 : levelIndex];

  return {
    criteria,
    score,
    levelIndex: levelIndex === -1 ? LEVELS.length - 1 : levelIndex,
    label: level.label,
    color: level.color,
    totalLevels: LEVELS.length
  };
}

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

              <div id="setpw-strength-wrap" style="display: none; margin-top: 0.65rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.35rem;">
                  <span style="font-size: 0.68rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Password Strength</span>
                  <span id="setpw-strength-label" aria-live="polite" style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); transition: color 0.18s ease;">&nbsp;</span>
                </div>
                <div id="setpw-strength-bar" style="display: flex; gap: 4px;">
                  <div class="setpw-strength-seg" style="flex: 1; height: 5px; border-radius: var(--radius-full); background: var(--border-subtle); transition: background-color 0.18s ease;"></div>
                  <div class="setpw-strength-seg" style="flex: 1; height: 5px; border-radius: var(--radius-full); background: var(--border-subtle); transition: background-color 0.18s ease;"></div>
                  <div class="setpw-strength-seg" style="flex: 1; height: 5px; border-radius: var(--radius-full); background: var(--border-subtle); transition: background-color 0.18s ease;"></div>
                  <div class="setpw-strength-seg" style="flex: 1; height: 5px; border-radius: var(--radius-full); background: var(--border-subtle); transition: background-color 0.18s ease;"></div>
                  <div class="setpw-strength-seg" style="flex: 1; height: 5px; border-radius: var(--radius-full); background: var(--border-subtle); transition: background-color 0.18s ease;"></div>
                </div>

                <ul id="setpw-checklist" style="list-style: none; margin: 0.65rem 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 0.75rem;">
                  ${CHECKLIST_ITEMS.map(({ key, label }) => `
                    <li id="setpw-crit-${key}" style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; font-weight: 600; color: var(--text-muted); transition: color 0.18s ease;">
                      <svg id="setpw-crit-icon-${key}" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; opacity: 0.4; transform: scale(0.85); transition: opacity 0.18s ease, transform 0.18s ease, stroke 0.18s ease;"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>${label}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label class="form-label" style="font-weight: 700;">Confirm New Password *</label>
              <input type="password" id="setpw-confirm" class="form-input" placeholder="Re-enter new password" required minlength="8" style="width: 100%;" autocomplete="new-password" />

              <div id="setpw-match-indicator" aria-live="polite" style="display: none; align-items: center; gap: 0.35rem; margin-top: 0.5rem; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); transition: color 0.18s ease;">
                <svg id="setpw-match-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"></svg>
                <span id="setpw-match-text"></span>
              </div>
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
    const newPasswordInput = document.getElementById('setpw-new');
    const confirmPasswordInput = document.getElementById('setpw-confirm');

    if (newPasswordInput) {
      newPasswordInput.addEventListener('input', () => {
        this.updateStrengthUI(newPasswordInput.value);
        // Re-check the match indicator too, in case the user edited the
        // new password after already typing something into confirm.
        if (confirmPasswordInput) {
          this.updateMatchIndicator(newPasswordInput.value, confirmPasswordInput.value);
        }
      });
    }

    if (confirmPasswordInput) {
      confirmPasswordInput.addEventListener('input', () => {
        this.updateMatchIndicator(newPasswordInput?.value || '', confirmPasswordInput.value);
      });
    }

    if (signoutLink) {
      signoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await supabaseService.withTimeout(supabaseService.client.auth.signOut(), 3000, 'Sign out');
        } catch (err) {
          console.warn('[OIMS SetPassword] Sign out failed:', err.message);
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
          AuthGuard.invalidateProfileCache();
          const targetUrl = AuthGuard.getDefaultLandingPage({ ...this.user, mustChangePassword: false });

          const { Router } = await import('../router.js');
          Router.navigate(targetUrl);
        } catch (err) {
          console.error('[OIMS SetPassword Error]', err);
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

  /**
   * Advisory-only strength meter + criteria checklist, updated on every
   * keystroke in #setpw-new. Purely visual — does not gate submission.
   */
  updateStrengthUI(password) {
    const wrap = document.getElementById('setpw-strength-wrap');
    if (!wrap) return;

    if (!password) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';

    const { criteria, levelIndex, label, color, totalLevels } = scorePassword(password);

    const label_ = document.getElementById('setpw-strength-label');
    if (label_) {
      label_.textContent = label;
      label_.style.color = color;
    }

    const segments = document.querySelectorAll('#setpw-strength-bar .setpw-strength-seg');
    const filledCount = Math.round(((levelIndex + 1) / totalLevels) * segments.length);
    segments.forEach((seg, i) => {
      seg.style.background = i < filledCount ? color : 'var(--border-subtle)';
    });

    CHECKLIST_ITEMS.forEach(({ key }) => {
      const item = document.getElementById(`setpw-crit-${key}`);
      const icon = document.getElementById(`setpw-crit-icon-${key}`);
      const met = !!criteria[key];
      if (item) item.style.color = met ? 'var(--ecoworks-green-light)' : 'var(--text-muted)';
      if (icon) {
        icon.style.opacity = met ? '1' : '0.4';
        icon.style.transform = met ? 'scale(1)' : 'scale(0.85)';
        icon.style.stroke = met ? 'var(--ecoworks-green-light)' : 'currentColor';
      }
    });
  }

  /**
   * Inline "do the passwords match" indicator for #setpw-confirm. Only
   * shown once the confirm field has content — an empty confirm field
   * should never flash a "doesn't match" error.
   */
  updateMatchIndicator(newPassword, confirmPassword) {
    const indicator = document.getElementById('setpw-match-indicator');
    const icon = document.getElementById('setpw-match-icon');
    const text = document.getElementById('setpw-match-text');
    if (!indicator || !icon || !text) return;

    if (!confirmPassword) {
      indicator.style.display = 'none';
      return;
    }

    indicator.style.display = 'flex';
    const matches = newPassword === confirmPassword;
    const color = matches ? 'var(--ecoworks-green-light)' : 'var(--accent-rose)';

    indicator.style.color = color;
    text.textContent = matches ? 'Passwords match' : "Passwords don't match";
    icon.innerHTML = matches
      ? '<polyline points="20 6 9 17 4 12"/>'
      : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
  }
}
