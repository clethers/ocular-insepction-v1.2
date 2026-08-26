/**
 * OIMS — Client Directory Component (`clientDirectory.js`)
 * Real, Supabase-backed list of every client served, searchable and
 * filterable, with a per-client Print button for the full audit
 * certificate. When canDelete is true (Admin only), also offers a
 * per-client Delete button that archives the record.
 */

import { supabaseService } from '../services/supabaseService.js';
import { printOcularCertificate } from '../utils/ocularCertificate.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { escapeHTML } from '../utils/security.js';

export class ClientDirectory {
  constructor(container, { canDelete = false } = {}) {
    this.container = container;
    this.canDelete = canDelete;
    this.records = [];
    this.dataSource = 'cloud';
    this.searchQuery = '';
    this.statusFilter = 'ALL';
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    const { records, source } = await supabaseService.fetchAllInspections();
    this.records = records;
    this.dataSource = source;
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Client Directory</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Every client served, searchable by name, RN number, or contact number.</p>

        <div id="client-directory-banner"></div>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <input type="text" id="input-client-directory-search" class="form-input" placeholder="Search client name, RN-88092, contact number..." style="flex: 1; min-width: 220px;" />
          <select id="select-client-directory-status" class="form-select" style="max-width: 220px;">
            <option value="ALL">All Statuses</option>
          </select>
        </div>

        <div id="client-directory-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading client records...</div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-client-directory-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const statusSelect = this.container.querySelector('#select-client-directory-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.renderList();
      });
    }
  }

  getFilteredRecords() {
    return this.records.filter(r => {
      if (this.statusFilter !== 'ALL' && r.status !== this.statusFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${r.clientName || ''} ${r.rnNo || ''} ${r.contactNo || ''}`.toLowerCase();
      return haystack.includes(this.searchQuery);
    });
  }

  renderList() {
    const banner = this.container.querySelector('#client-directory-banner');
    if (banner) {
      banner.innerHTML = this.dataSource === 'local'
        ? `<div style="padding: 0.75rem 1rem; background: #fff7ed; border: 1px solid #fdba74; border-radius: var(--radius-md); color: #9a3412; font-size: 0.8rem; margin-bottom: 1rem;">Showing locally cached records only — reconnect to see the full client list.</div>`
        : '';
    }

    const statusSelect = this.container.querySelector('#select-client-directory-status');
    if (statusSelect && statusSelect.dataset.populated !== 'true') {
      const statuses = [...new Set(this.records.map(r => r.status).filter(Boolean))];
      statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        statusSelect.appendChild(opt);
      });
      statusSelect.dataset.populated = 'true';
    }

    const listEl = this.container.querySelector('#client-directory-list');
    if (!listEl) return;

    if (this.records.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No client records found yet.</div>`;
      return;
    }

    const filtered = this.getFilteredRecords();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No clients match your search or filter.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${filtered.map(r => `
          <div style="padding: 1.25rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="color: #0f172a; font-size: 1rem;">${escapeHTML(r.clientName || 'Unnamed Client')}</strong>
                <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.725rem; font-weight: 700; padding: 0.2rem 0.5rem;">${escapeHTML(r.rnNo || 'N/A')}</span>
                <span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #475569; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem;">${escapeHTML(r.status || 'UNKNOWN')}</span>
              </div>
              <div style="font-size: 0.8rem; color: #64748b;">
                ${escapeHTML(r.locationAddress || 'No address on file')} | ${escapeHTML(r.dateTimeDisplay || 'Recent')}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn btn-primary btn-print-client" data-rn="${escapeHTML(r.rnNo || '')}" style="padding: 0.5rem 0.9rem; font-size: 0.8rem;">
                Print
              </button>
              ${this.canDelete && this.dataSource === 'cloud' ? `
                <button type="button" class="btn btn-secondary btn-delete-client" data-rn="${escapeHTML(r.rnNo || '')}" style="padding: 0.5rem 0.9rem; font-size: 0.8rem; color: #F43F5E; border-color: #F43F5E;">
                  Delete
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    listEl.querySelectorAll('.btn-print-client').forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const record = this.records.find(r => r.rnNo === rn);
        if (record) printOcularCertificate(record);
      });
    });

    if (this.canDelete && this.dataSource === 'cloud') {
      listEl.querySelectorAll('.btn-delete-client').forEach(btn => {
        btn.addEventListener('click', () => {
          const rn = btn.getAttribute('data-rn');
          const record = this.records.find(r => r.rnNo === rn);
          if (record) this.handleDelete(record);
        });
      });
    }
  }

  async handleDelete(record) {
    const confirmed = confirm(`Archive client "${record.clientName || 'Unnamed Client'}" (RN ${record.rnNo || 'N/A'})? This removes them from all client lists.`);
    if (!confirmed) return;

    try {
      await supabaseService.archiveInspection(record.id);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'CLIENT_ARCHIVED',
        description: `Archived client "${record.clientName}" (RN ${record.rnNo})`,
        severity: AUDIT_SEVERITY.WARNING,
        resourceId: record.id
      });
      this.records = this.records.filter(r => r.id !== record.id);
      this.renderList();
      AppLayout.showToast(`Archived client "${record.clientName || record.rnNo}".`);
    } catch (err) {
      console.warn('[OIMS ClientDirectory] Archive failed:', err.message);
      AppLayout.showToast("Couldn't archive client — check your connection and try again.");
    }
  }
}
