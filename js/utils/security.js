/**
 * Security Utilities Module for OIMS
 * Provides XSS HTML entity escaping and Base64 payload validation.
 * Implements security patterns from api-security-best-practices skill.
 */

/**
 * Escapes unsafe HTML characters to prevent XSS code injection.
 * @param {string} str - Raw input string
 * @returns {string} Sanitized HTML-safe string
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return str || '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates Base64 image Data URLs for digital signature pads and photos.
 * @param {string} dataUrl - Image data URL string
 * @returns {boolean} True if data URL matches valid image schema
 */
export function isValidBase64Image(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl) return false;
  const imageSchemaRegex = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;
  return imageSchemaRegex.test(dataUrl.trim());
}

/**
 * Validates whether a redirect URL is a safe, internal relative path.
 * Protects against Open Redirect vulnerabilities (CWE-601).
 * @param {string} url - Unsanitized redirect candidate URL
 * @returns {boolean} True if URL is a safe internal relative path
 */
export function isSafeRedirectUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  const decoded = decodeURIComponent(url.trim());
  
  // Reject absolute protocols (http:, https:, etc.) and protocol-relative URLs (//)
  if (/^(?:[a-z0-9+.-]+:|\/\/)/i.test(decoded)) return false;
  // Reject javascript, data, or vbscript URIs
  if (/^(?:javascript|data|vbscript):/i.test(decoded)) return false;

  // Allow relative paths starting with ./ or / or relative page names (.html)
  return /^(?:\.\/|\/[^\/]|[a-zA-Z0-9_\-]+\.html)/.test(decoded);
}

/**
 * Client-Side Rate Limiter for Login Attempts
 * Enforces a 5-minute security lockout after 5 consecutive failed attempts.
 */
export class LoginRateLimiter {
  static KEY = 'oims_login_attempts';
  static MAX_ATTEMPTS = 5;
  static LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

  static getRecord() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return { count: 0, lockedUntil: 0 };
      return JSON.parse(raw);
    } catch (e) {
      return { count: 0, lockedUntil: 0 };
    }
  }

  static isLockedOut() {
    const record = this.getRecord();
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
      const remainingSec = Math.ceil((record.lockedUntil - Date.now()) / 1000);
      return { locked: true, remainingSec };
    }
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
      this.reset();
    }
    return { locked: false, remainingSec: 0 };
  }

  static recordFailedAttempt() {
    const record = this.getRecord();
    record.count = (record.count || 0) + 1;
    if (record.count >= this.MAX_ATTEMPTS) {
      record.lockedUntil = Date.now() + this.LOCKOUT_MS;
    }
    localStorage.setItem(this.KEY, JSON.stringify(record));
  }

  static reset() {
    localStorage.removeItem(this.KEY);
  }
}
