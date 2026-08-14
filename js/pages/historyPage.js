/**
 * Synx Portal - Saved Drafts & History Repository Page Entry Point (MPA)
 */

import { AppLayout } from '../components/appLayout.js';
import { AuthGuard } from '../components/authGuard.js';
import { FormStorage } from '../components/formStorage.js';

document.addEventListener('DOMContentLoaded', () => {
  if (!AuthGuard.protectPage()) return;

  const container = AppLayout.init('history', 'Saved Drafts & Form History');
  if (container) {
    renderHistoryView(container);
  }
});

function renderHistoryView(container) {
  const drafts = FormStorage.listDrafts();
  container.innerHTML = `
    <div class="form-card">
      <div class="form-section-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Local Drafts & Form History
        <span class="form-section-subtitle">${drafts.length} Saved Records</span>
      </div>

      ${drafts.length === 0 ? `
        <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">No local drafts found.</p>
          <p style="font-size: 0.85rem;">Drafts are saved automatically as you fill out inspection forms.</p>
        </div>
      ` : `
        <div class="grid-2">
          ${drafts.map(draft => `
            <div class="custom-option" style="flex-direction: column; align-items: flex-start; gap: 0.4rem;">
              <div style="display: flex; justify-content: space-between; width: 100%; font-weight: 700; color: var(--ecoworks-blue);">
                <span>${String(draft.id || 'DRAFT').toUpperCase()}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(draft.updatedAt).toLocaleString()}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-primary);">
                Client: <strong>${draft.data?.clientName || 'Unnamed Client'}</strong>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary);">
                RN: ${draft.data?.rnNo || 'N/A'} | Installation No: ${draft.data?.installationNo || 'N/A'}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}
