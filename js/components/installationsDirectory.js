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

      <!-- Installation Detail Overlay -->
      <div class="modal-overlay no-print" id="installation-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="installation-detail-content"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-close-installation-detail">Close</button>
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

    const detailCloseBtn = this.container.querySelector('#btn-close-installation-detail');
    if (detailCloseBtn) {
      detailCloseBtn.addEventListener('click', () => this.closeInstallationDetail());
    }

    const detailOverlay = this.container.querySelector('#installation-detail-overlay');
    if (detailOverlay) {
      detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) this.closeInstallationDetail();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#installation-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeInstallationDetail();
    });
  }

  // Local key -> display label for ACTUAL_MATERIALS_FIELD_MAP entries,
  // mirroring the copy used on the Installation form's "Actual Installation
  // Materials Used" step (js/forms/installationForm.js) so the two stay
  // recognizable as the same fields.
  static MATERIAL_LABELS = {
    actualConduitPvc: 'PVC (Rigid) Conduit',
    actualConduitEmt: 'EMT Conduit',
    actualConduitImc: 'IMC Conduit',
    actualConduitRsc: 'RSC Conduit',
    actualConduitPvcMoulding: 'PVC Moulding',
    actualConduitBlackFlexible: 'Black Coated Flexible Conduit',
    actualConduitPvcFlexibleOrange: 'PVC Flexible Orange Conduit',
    actualConduitOtherType: 'Other Conduit Type',
    actualConduitOtherQty: 'Other Conduit Qty',
    actualLiquidTightConnectorQty: 'Liquid Tight Connector (Straight Type)',
    actualLiquidTightFlexLength: 'Liquid Tight Flexible Conduit Length',
    actualElbowEmt90: 'EMT Elbow 90°',
    actualElbowImc90: 'IMC Elbow 90°',
    actualElbowRsc90: 'RSC Elbow 90°',
    actualBodyLb: 'Conduit Body LB',
    actualBodyLr: 'Conduit Body LR',
    actualBodyLl: 'Conduit Body LL',
    actualBodyC: 'Conduit Body C',
    actualBodyT: 'Conduit Body T',
    actualConnectorEmtSetScrew: 'EMT Connector, Set Screw Type',
    actualConnectorEmtCompression: 'EMT Connector, Compression Type',
    actualCouplingEmtSetScrew: 'EMT Coupling, Set Screw Type',
    actualCouplingEmtCompression: 'EMT Coupling, Compression Type',
    actualClampCTwoHole: 'C-Clamp 2-Hole',
    actualClampCOneHole: 'C-Clamp 1-Hole',
    actualClampStrapMalleable: 'Strap-Malleable Iron 1-Hole Clamp',
    actualBoxUtility: 'Utility Box',
    actualBoxSquare: 'Square Box',
    actualBoxOctagon: 'Octagon Box',
    actualBoxJunction: 'Junction Box',
    actualBoxOthers: 'Other Boxes / Enclosures'
  };

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

  openInstallationDetail(record) {
    const overlay = this.container.querySelector('#installation-detail-overlay');
    const content = this.container.querySelector('#installation-detail-content');
    if (!overlay || !content) return;

    content.innerHTML = this.renderInstallationDetail(record);
    overlay.style.display = 'flex';
  }

  closeInstallationDetail() {
    const overlay = this.container.querySelector('#installation-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  renderInstallationDetail(record) {
    const formatDate = (iso) => {
      if (!iso) return 'N/A';
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const detailRows = [
      ['Client Name', record.clientName || 'N/A'],
      ['RN Number', record.rnNo || 'N/A'],
      ['Installation Number', record.installationNo || 'N/A'],
      ['Scope of Works', record.scopeOfWorks || 'Installation'],
      ['Installer', record.installerName || 'N/A'],
      ['Date Installed', formatDate(record.createdAt)],
      ['Status', record.status || 'COMMISSIONED'],
      ['Client Representative', record.clientRepName || 'N/A']
    ];

    const materialRows = InstallationsDirectory.MATERIAL_LABELS
      ? Object.keys(InstallationsDirectory.MATERIAL_LABELS)
          .map(key => [InstallationsDirectory.MATERIAL_LABELS[key], record[key]])
          .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 0 && value !== '0')
      : [];

    const materialsSection = materialRows.length > 0 ? `
      <h4 style="font-weight: 700; font-size: 0.9rem; color: #0f172a; margin: 1.5rem 0 0.5rem;">Actual Materials Used</h4>
      <table class="cert-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        ${materialRows.map(([label, value]) => `
          <tr>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); font-weight: 700; color: var(--text-muted); width: 40%;">${escapeHTML(label)}</td>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); color: var(--text-primary);">${escapeHTML(String(value))}</td>
          </tr>
        `).join('')}
      </table>
    ` : '';

    const signaturesSection = (record.installerSigImg || record.clientRepSigImg) ? `
      <h4 style="font-weight: 700; font-size: 0.9rem; color: #0f172a; margin: 1.5rem 0 0.5rem;">Signatures on File</h4>
      <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
        ${record.installerSigImg ? `
          <div>
            <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">Installer</div>
            <img src="${escapeHTML(record.installerSigImg)}" alt="Installer signature" style="max-height: 60px; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); background: #fff;" />
          </div>
        ` : ''}
        ${record.clientRepSigImg ? `
          <div>
            <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 0.25rem;">Client Representative</div>
            <img src="${escapeHTML(record.clientRepSigImg)}" alt="Client representative signature" style="max-height: 60px; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); background: #fff;" />
          </div>
        ` : ''}
      </div>
    ` : '';

    return `
      <h3 class="modal-title">${escapeHTML(record.clientName || 'Unnamed Client')}</h3>
      <p class="modal-subtitle">RN ${escapeHTML(record.rnNo || 'N/A')} &middot; ${escapeHTML(record.installationNo || 'N/A')}</p>

      <table class="cert-table" style="margin-top: 1rem; width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        ${detailRows.map(([label, value]) => `
          <tr>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); font-weight: 700; color: var(--text-muted); width: 40%;">${escapeHTML(label)}</td>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); color: var(--text-primary);">${escapeHTML(String(value))}</td>
          </tr>
        `).join('')}
      </table>
      ${materialsSection}
      ${signaturesSection}
    `;
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
      <div class="directory-table-wrapper">
        <table class="directory-table">
          <thead>
            <tr>
              ${columns.map(col => `
                <th class="directory-table-sortable" data-sort-key="${col.key}">${escapeHTML(col.label)}${sortArrow(col.key)}</th>
              `).join('')}
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r => `
              <tr>
                <td data-label="Installation No." style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(r.installationNo || 'N/A')}</td>
                <td data-label="RN Number" style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                <td data-label="Scope of Works" style="color: #64748b;">${escapeHTML(r.scopeOfWorks || 'Installation')}</td>
                <td data-label="Installer" style="color: #64748b;">${escapeHTML(r.installerName || 'N/A')}</td>
                <td data-label="Date Installed" style="color: #64748b;">${escapeHTML(formatDate(r.createdAt))}</td>
                <td data-label="Status" style="color: #16a34a; font-weight: 600;">${escapeHTML(r.status || 'COMMISSIONED')}</td>
                <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                  <button type="button" class="btn-link btn-view-installation" data-id="${escapeHTML(String(r.id ?? ''))}">View Details</button>
                </td>
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

    listEl.querySelectorAll('.btn-view-installation').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const record = this.records.find(r => String(r.id) === id);
        if (record) this.openInstallationDetail(record);
      });
    });
  }
}
