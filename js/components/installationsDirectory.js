/**
 * OIMS — Installations Directory Component (`installationsDirectory.js`)
 * Real, Supabase-backed list of every commissioned installation — i.e.
 * clients whose install is actually complete, distinct from the broader
 * Client Directory (which spans every inspection stage).
 */

import { supabaseService } from '../services/supabaseService.js';
import { escapeHTML } from '../utils/security.js';
import { printInstallationsList, renderInstallationsListHTML } from '../utils/installationsCertificate.js';

export class InstallationsDirectory {
  constructor(container) {
    this.container = container;
    this.records = [];
    this.searchQuery = '';
    this.sortKey = 'createdAt';
    this.sortDir = 'desc';
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    this.records = await supabaseService.fetchAllInstallations();
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Installations</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Every client whose installation has been completed and commissioned.</p>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <input type="text" id="input-installations-search" class="form-input" placeholder="Search client name, RN, installer..." style="flex: 1; min-width: 220px;" />
          <button type="button" class="btn btn-primary no-print" id="btn-print-installations" style="padding: 0.6rem 1rem; font-size: 0.825rem;">Print Preview</button>
        </div>

        <div id="installations-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading installation records...</div>
        </div>
      </div>

      <!-- Print Preview Overlay -->
      <div class="modal-overlay no-print" id="installations-print-preview-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 860px; max-height: 88vh; display: flex; flex-direction: column;">
          <div style="overflow-y: auto; padding: 1.5rem; background: #e2e8f0; border-radius: var(--radius-md); flex: 1;">
            <div class="print-preview-surface" id="installations-print-preview-surface"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-close-installations-preview">Close</button>
            <button type="button" class="btn btn-primary" id="btn-confirm-installations-print">Print</button>
          </div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-installations-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const printBtn = this.container.querySelector('#btn-print-installations');
    if (printBtn) {
      printBtn.addEventListener('click', () => this.openPrintPreview());
    }

    const closeBtn = this.container.querySelector('#btn-close-installations-preview');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePrintPreview());
    }

    const confirmPrintBtn = this.container.querySelector('#btn-confirm-installations-print');
    if (confirmPrintBtn) {
      confirmPrintBtn.addEventListener('click', () => printInstallationsList(this.getFilteredRecords()));
    }

    const overlay = this.container.querySelector('#installations-print-preview-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closePrintPreview();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#installations-print-preview-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closePrintPreview();
    });
  }

  openPrintPreview() {
    const overlay = this.container.querySelector('#installations-print-preview-overlay');
    const surface = this.container.querySelector('#installations-print-preview-surface');
    if (!overlay || !surface) return;

    surface.innerHTML = renderInstallationsListHTML(this.getFilteredRecords());
    overlay.style.display = 'flex';
  }

  closePrintPreview() {
    const overlay = this.container.querySelector('#installations-print-preview-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  getFilteredRecords() {
    const filtered = this.records.filter(r => {
      if (!this.searchQuery) return true;
      const haystack = `${r.clientName || ''} ${r.rnNo || ''} ${r.installerName || ''}`.toLowerCase();
      return haystack.includes(this.searchQuery);
    });

    const key = this.sortKey;
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = (a[key] || '').toString().toLowerCase();
      const bv = (b[key] || '').toString().toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }

  renderList() {
    const listEl = this.container.querySelector('#installations-list');
    if (!listEl) return;

    if (this.records.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No completed installations yet.</div>`;
      return;
    }

    const filtered = this.getFilteredRecords();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No installations match your search.</div>`;
      return;
    }

    const columns = [
      { key: 'installationNo', label: 'Installation No.' },
      { key: 'rnNo', label: 'RN Number' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'scopeOfWorks', label: 'Scope of Works' },
      { key: 'installerName', label: 'Installer' },
      { key: 'createdAt', label: 'Date Installed' },
      { key: 'status', label: 'Status' }
    ];

    const sortArrow = (key) => {
      if (this.sortKey !== key) return '';
      return this.sortDir === 'asc'
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 0.25rem; vertical-align: -1px;"><path d="M12 5l7 8H5z"/></svg>`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 0.25rem; vertical-align: -1px;"><path d="M12 19l-7-8h14z"/></svg>`;
    };

    const formatDate = (iso) => {
      if (!iso) return 'N/A';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    listEl.innerHTML = `
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-lg);">
        <table class="directory-table">
          <thead>
            <tr>
              ${columns.map(col => `
                <th class="directory-table-sortable" data-sort-key="${col.key}">${escapeHTML(col.label)}${sortArrow(col.key)}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r => `
              <tr>
                <td style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(r.installationNo || 'N/A')}</td>
                <td style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                <td style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                <td style="color: #64748b;">${escapeHTML(r.scopeOfWorks || 'Installation')}</td>
                <td style="color: #64748b;">${escapeHTML(r.installerName || 'N/A')}</td>
                <td style="color: #64748b;">${escapeHTML(formatDate(r.createdAt))}</td>
                <td style="color: #16a34a; font-weight: 600;">${escapeHTML(r.status || 'COMMISSIONED')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll('.directory-table-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort-key');
        if (this.sortKey === key) {
          this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortKey = key;
          this.sortDir = 'asc';
        }
        this.renderList();
      });
    });
  }
}
