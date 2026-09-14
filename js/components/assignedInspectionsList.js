/**
 * AssignedInspectionsList Component - OIMS Field App
 * Displays site-visit assignments Customer Care has routed to this Field
 * Inspector team, pending the on-site Ocular Inspection.
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { escapeHTML } from '../utils/security.js';

export class AssignedInspectionsList {
  constructor(containerElement, onSelectInspection) {
    this.container = containerElement;
    this.onSelectInspection = onSelectInspection;
  }

  async render() {
    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Loading Assigned Inspections Queue...
        </div>
      </div>
    `;

    let items = [];
    try {
      const user = await AuthGuard.getSessionUser();
      items = (await supabaseService.fetchAssignedInspections(user?.id)) || [];
    } catch (e) {
      console.warn('[OIMS] Could not fetch assigned inspections:', e);
    }

    this.items = items;

    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <div class="ready-search-form-card no-print">
          <div class="search-form-header">
            <div class="search-form-brand">
              <div class="search-form-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div>
                <h2 class="search-form-title">ASSIGNED INSPECTIONS QUEUE</h2>
                <span class="search-form-subtitle">Site Visits Routed to Your Team by Customer Care</span>
              </div>
            </div>

            <div class="search-form-meta" style="display: flex; align-items: center; gap: 0.5rem;">
              <button class="btn btn-outline" id="btn-refresh-assigned" style="background: #ffffff; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.4rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                Refresh List
              </button>
            </div>
          </div>

          <div class="search-form-controls">
            <div class="search-input-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="assigned-search-input" placeholder="Search by Client Name, RN Number, or Address..." />
            </div>
          </div>
        </div>

        <div id="assigned-list-container">
          ${this.renderList(items)}
        </div>
      </div>
    `;

    this.initEvents(items);
  }

  renderList(items) {
    if (items.length === 0) {
      return `
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; color: var(--ecoworks-blue);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No Assigned Inspections</h3>
          <p style="font-size: 0.85rem; margin-top: 0.3rem;">Leads Customer Care routes to your team for a site visit will appear here.</p>
        </div>
      `;
    }

    return `
      <div class="form-card" style="padding: 0; overflow: hidden;">
        <div class="directory-table-wrapper" style="border: none; border-radius: 0;">
          <table class="directory-table">
            <thead>
              <tr>
                <th>RN Number</th>
                <th>Client Name</th>
                <th>Address</th>
                <th>Waiting Since</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(item.rnNo || 'N/A')}</span></td>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(item.clientName || 'Unnamed Client')}</td>
                  <td data-label="Address" style="color: #64748b;">${escapeHTML(item.locationAddress || 'No address on file')}</td>
                  <td data-label="Waiting Since" style="color: #64748b;">${escapeHTML(this.formatWaiting(item.createdAt))}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-link btn-start-inspection" data-rn="${item.rnNo || item.id}">Start Inspection</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Relative "time waiting" since the lead was assigned — falls back to a
  // plain date, or "Recently" if created_at wasn't set (e.g. an older row).
  formatWaiting(createdAt) {
    if (!createdAt) return 'Recently';
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return 'Recently';

    const diffMs = Date.now() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  initEvents(items) {
    const refreshBtn = document.getElementById('btn-refresh-assigned');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.render());
    }

    const filterItems = () => {
      const query = (document.getElementById('assigned-search-input')?.value || '').toLowerCase().trim();

      const filtered = items.filter(item => !query ||
        (item.clientName && item.clientName.toLowerCase().includes(query)) ||
        (item.rnNo && item.rnNo.toLowerCase().includes(query)) ||
        (item.locationAddress && item.locationAddress.toLowerCase().includes(query))
      );

      const container = document.getElementById('assigned-list-container');
      if (container) {
        container.innerHTML = this.renderList(filtered);
        this.bindRowButtons(filtered);
      }
    };

    const searchInput = document.getElementById('assigned-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', filterItems);
    }

    this.bindRowButtons(items);
  }

  bindRowButtons(items) {
    const btns = this.container.querySelectorAll('.btn-start-inspection');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rn = btn.getAttribute('data-rn');
        const targetItem = items.find(i =>
          String(i.rnNo) === String(rn) ||
          String(i.id) === String(rn)
        );
        const selectedData = targetItem || { id: rn, rnNo: rn };
        if (this.onSelectInspection) {
          this.onSelectInspection(selectedData);
        }
      });
    });
  }
}
