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
    this.sortKey = 'dateTimeDisplay';
    this.sortDir = 'desc';
    this.pendingImportRows = [];
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
          <button type="button" class="btn btn-outline no-print" id="btn-import-clients" style="padding: 0.6rem 1rem; font-size: 0.825rem;">Import CSV</button>
          <input type="file" id="input-import-clients-file" accept=".csv,text/csv" style="display: none;" />
        </div>

        <div id="client-directory-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading client records...</div>
        </div>
      </div>

      <!-- Client Detail Overlay: pipeline stepper + key details, non-blocking -->
      <div class="modal-overlay no-print" id="client-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="client-detail-content"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="btn-close-client-detail">Close</button>
          </div>
        </div>
      </div>

      <!-- Import Clients Preview Overlay -->
      <div class="modal-overlay no-print" id="import-clients-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 760px; max-height: 85vh; display: flex; flex-direction: column;">
          <div id="import-clients-content" style="overflow-y: auto;"></div>
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

    const closeBtn = this.container.querySelector('#btn-close-client-detail');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeClientDetail());
    }

    const overlay = this.container.querySelector('#client-detail-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeClientDetail();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#client-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeClientDetail();
    });

    const importBtn = this.container.querySelector('#btn-import-clients');
    const importFileInput = this.container.querySelector('#input-import-clients-file');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.handleImportFile(file);
        importFileInput.value = '';
      });
    }

    const importOverlay = this.container.querySelector('#import-clients-overlay');
    if (importOverlay) {
      importOverlay.addEventListener('click', (e) => {
        if (e.target === importOverlay) this.closeImportOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#import-clients-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeImportOverlay();
    });
  }

  closeClientDetail() {
    const overlay = this.container.querySelector('#client-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async openClientDetail(record) {
    const overlay = this.container.querySelector('#client-detail-overlay');
    const content = this.container.querySelector('#client-detail-content');
    if (!overlay || !content) return;

    content.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">Loading installation status...</div>`;
    overlay.style.display = 'flex';

    const installation = await supabaseService.fetchInstallationByRnNo(record.rnNo);
    content.innerHTML = this.renderClientDetail(record, installation);
  }

  // Maps OIMS's real pipeline (ocular_inspections.status +, once it
  // exists, a matching installation_records row) onto a 4-stage tracker.
  // RE_INSPECTION_REQUESTED is a loop back to QA, not a forward stage, so
  // it's shown as a flag on the QA step rather than breaking the sequence.
  renderClientDetail(record, installation) {
    const isReInspection = record.status === 'RE_INSPECTION_REQUESTED';
    const qaCleared = record.status !== 'PENDING_QA' && !isReInspection;
    const approved = record.status === 'READY_FOR_INSTALLATION' || !!installation;
    const installComplete = !!installation;

    const stages = [
      { label: 'Ocular Inspection Submitted', complete: true },
      { label: 'QA Review', complete: qaCleared },
      { label: 'Approved for Installation', complete: approved },
      { label: 'Installation Complete', complete: installComplete }
    ];

    const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;

    const stepperHtml = stages.map((stage, i) => `
      ${i > 0 ? `<div class="pipeline-connector ${stages[i - 1].complete ? 'active' : ''}"></div>` : ''}
      <div class="pipeline-step ${stage.complete ? 'completed' : ''}">
        <div class="pipeline-step-icon">${stage.complete ? checkIcon : i + 1}</div>
        <div class="pipeline-step-label">${escapeHTML(stage.label)}</div>
      </div>
    `).join('');

    const reInspectionFlag = isReInspection
      ? `<div style="margin-top: 0.75rem; padding: 0.6rem 0.85rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-md); color: #b91c1c; font-size: 0.8rem; font-weight: 600;">
           Sent back for re-inspection${record.qaNotes ? `: "${escapeHTML(record.qaNotes)}"` : ''}
         </div>`
      : '';

    const detailRows = [
      ['Client Name', record.clientName || 'N/A'],
      ['RN Number', record.rnNo || 'N/A'],
      ['Location Address', record.locationAddress || 'N/A'],
      ['Voltage System', record.voltageSystem === '220_ll' ? '220 VAC, 1 Ø, L-L' : record.voltageSystem === '220_lg' ? '220 VAC, 1 Ø, L-G' : (record.voltageSpecify || 'N/A')],
      ['Main Breaker', record.mainBreaker === 'OTHER' ? (record.mainBreakerOther || 'N/A') : (record.mainBreaker || 'N/A')],
      ['Inspected By', record.inspectedByName || 'N/A'],
      ['Date Submitted', record.dateTimeDisplay || 'N/A']
    ];

    if (installation) {
      detailRows.push(
        ['Installer', installation.installer_name || 'N/A'],
        ['Date Installed', installation.created_at ? new Date(installation.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A']
      );
    }

    return `
      <h3 class="modal-title">${escapeHTML(record.clientName || 'Unnamed Client')}</h3>
      <p class="modal-subtitle">RN ${escapeHTML(record.rnNo || 'N/A')} &middot; ${escapeHTML(record.locationAddress || 'No address on file')}</p>

      <div class="pipeline-stepper">${stepperHtml}</div>
      ${reInspectionFlag}

      <table class="cert-table" style="margin-top: 1.5rem; width: 100%; border-collapse: collapse; font-size: 0.85rem;">
        ${detailRows.map(([label, value]) => `
          <tr>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); font-weight: 700; color: var(--text-muted); width: 40%;">${escapeHTML(label)}</td>
            <td style="padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); color: var(--text-primary);">${escapeHTML(String(value))}</td>
          </tr>
        `).join('')}
      </table>
    `;
  }

  // Minimal RFC4180-style CSV parser — handles quoted fields, embedded
  // commas, and escaped ("") quotes. Good enough for a simple client
  // import sheet; not meant to handle arbitrary spreadsheet exports.
  parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(r => r.some(cell => cell.trim() !== ''));
  }

  async handleImportFile(file) {
    const text = await file.text();
    const rows = this.parseCSV(text);

    if (rows.length < 2) {
      AppLayout.showToast('CSV file has no data rows.');
      return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const colIndex = (names) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i !== -1) return i;
      }
      return -1;
    };

    const idx = {
      clientName: colIndex(['client name', 'clientname', 'name']),
      rnNo: colIndex(['rn number', 'rn no', 'rnno', 'rn']),
      contactNo: colIndex(['contact no', 'contact number', 'contactno', 'phone']),
      locationAddress: colIndex(['location address', 'address', 'location']),
      voltageSystem: colIndex(['voltage system', 'voltage']),
      mainBreaker: colIndex(['main breaker', 'breaker']),
      status: colIndex(['status'])
    };

    if (idx.clientName === -1 || idx.rnNo === -1) {
      AppLayout.showToast('CSV must include "Client Name" and "RN Number" columns.');
      return;
    }

    const get = (cols, i) => (i !== -1 && cols[i] !== undefined) ? cols[i].trim() : '';
    const validStatuses = ['PENDING_QA', 'READY_FOR_INSTALLATION', 'RE_INSPECTION_REQUESTED'];

    this.pendingImportRows = rows.slice(1).map((cols, i) => {
      const clientName = get(cols, idx.clientName);
      const rnNo = get(cols, idx.rnNo);
      const statusRaw = get(cols, idx.status).toUpperCase();
      const errors = [];
      if (!clientName) errors.push('Missing Client Name');
      if (!rnNo) errors.push('Missing RN Number');

      return {
        rowNum: i + 2, // +1 for the header row, +1 to make it 1-indexed
        clientName,
        rnNo,
        contactNo: get(cols, idx.contactNo),
        locationAddress: get(cols, idx.locationAddress),
        voltageSystem: get(cols, idx.voltageSystem),
        mainBreaker: get(cols, idx.mainBreaker),
        status: validStatuses.includes(statusRaw) ? statusRaw : 'PENDING_QA',
        errors
      };
    });

    this.openImportOverlay();
  }

  openImportOverlay() {
    const overlay = this.container.querySelector('#import-clients-overlay');
    const content = this.container.querySelector('#import-clients-content');
    if (!overlay || !content) return;

    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    const invalidCount = this.pendingImportRows.length - validRows.length;

    content.innerHTML = `
      <h3 class="modal-title">Import Clients from CSV</h3>
      <p class="modal-subtitle">
        ${this.pendingImportRows.length} row${this.pendingImportRows.length === 1 ? '' : 's'} found — ${validRows.length} ready to import${invalidCount ? `, ${invalidCount} skipped due to errors` : ''}.
      </p>

      <div style="overflow: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); max-height: 340px;">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Client Name</th>
              <th>RN Number</th>
              <th>Contact No</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${this.pendingImportRows.map(r => `
              <tr style="${r.errors.length ? 'background: #fef2f2;' : ''}">
                <td style="color: #64748b;">${r.rowNum}</td>
                <td style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || '—')}</td>
                <td style="color: var(--ecoworks-blue); font-weight: 700;">${escapeHTML(r.rnNo || '—')}</td>
                <td style="color: #64748b;">${escapeHTML(r.contactNo || '—')}</td>
                <td style="color: #64748b;">${escapeHTML(r.locationAddress || '—')}</td>
                <td style="color: ${r.errors.length ? '#dc2626' : '#64748b'};">${r.errors.length ? escapeHTML(r.errors.join(', ')) : escapeHTML(r.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-import-clients">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-import-clients" ${validRows.length === 0 ? 'disabled' : ''}>Import ${validRows.length} Client${validRows.length === 1 ? '' : 's'}</button>
      </div>
    `;

    content.querySelector('#btn-cancel-import-clients').addEventListener('click', () => this.closeImportOverlay());
    const confirmBtn = content.querySelector('#btn-confirm-import-clients');
    if (confirmBtn) confirmBtn.addEventListener('click', (e) => this.confirmImport(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeImportOverlay() {
    const overlay = this.container.querySelector('#import-clients-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmImport(btn) {
    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const imported = await supabaseService.bulkImportInspections(validRows);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'CLIENTS_IMPORTED',
        description: `Imported ${imported.length} client record(s) via CSV`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.closeImportOverlay();
      AppLayout.showToast(`Imported ${imported.length} client record(s).`);

      const { records, source } = await supabaseService.fetchAllInspections();
      this.records = records;
      this.dataSource = source;
      this.renderList();
    } catch (err) {
      console.warn('[OIMS ClientDirectory] Import failed:', err.message);
      AppLayout.showToast('Could not import clients — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  getStatusMeta(status) {
    switch (status) {
      case 'READY_FOR_INSTALLATION': return { label: 'Approved', color: '#16a34a' };
      case 'RE_INSPECTION_REQUESTED': return { label: 'Re-Inspection', color: '#dc2626' };
      case 'PENDING_QA': return { label: 'Pending QA', color: '#d97706' };
      default: return { label: status || 'Unknown', color: '#64748b' };
    }
  }

  getFilteredRecords() {
    const filtered = this.records.filter(r => {
      if (this.statusFilter !== 'ALL' && r.status !== this.statusFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${r.clientName || ''} ${r.rnNo || ''} ${r.contactNo || ''}`.toLowerCase();
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

    const columns = [
      { key: 'rnNo', label: 'RN Number' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'locationAddress', label: 'Location' },
      { key: 'status', label: 'Status' },
      { key: 'dateTimeDisplay', label: 'Date Submitted' }
    ];

    const sortArrow = (key) => {
      if (this.sortKey !== key) return '';
      return this.sortDir === 'asc'
        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 0.25rem; vertical-align: -1px;"><path d="M12 5l7 8H5z"/></svg>`
        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="margin-left: 0.25rem; vertical-align: -1px;"><path d="M12 19l-7-8h14z"/></svg>`;
    };

    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
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
            ${filtered.map(r => {
              const statusMeta = this.getStatusMeta(r.status);
              return `
                <tr>
                  <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(r.rnNo || 'N/A')}</span></td>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                  <td data-label="Location" style="color: #64748b;">${escapeHTML(r.locationAddress || 'No address on file')}</td>
                  <td data-label="Status" style="color: ${statusMeta.color}; font-weight: 600;">${escapeHTML(statusMeta.label)}</td>
                  <td data-label="Date Submitted" style="color: #64748b;">${escapeHTML(r.dateTimeDisplay || 'Recent')}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-link btn-view-client" data-rn="${escapeHTML(r.rnNo || '')}">View Details</button>
                    <button type="button" class="btn-link btn-print-client" data-rn="${escapeHTML(r.rnNo || '')}">Print</button>
                    ${this.canDelete && this.dataSource === 'cloud' ? `
                      <button type="button" class="btn-link btn-delete-client" data-rn="${escapeHTML(r.rnNo || '')}" style="color: #F43F5E;">Delete</button>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${filtered.map(r => {
          const statusMeta = this.getStatusMeta(r.status);
          return `
            <div class="record-card">
              <div class="record-top">
                <span class="record-title">${escapeHTML(r.clientName || 'Unnamed Client')}</span>
                <span class="record-badge" style="background: ${statusMeta.color}22; color: ${statusMeta.color};">${escapeHTML(statusMeta.label)}</span>
              </div>
              <div class="record-meta">
                <span class="rn">${escapeHTML(r.rnNo || 'N/A')}</span>
                <span class="dot">&middot;</span>
                <span>${escapeHTML(r.dateTimeDisplay || 'Recent')}</span>
              </div>
              <div class="record-sub">${escapeHTML(r.locationAddress || 'No address on file')}</div>
              <div class="record-actions">
                <button type="button" class="btn-view-client" data-rn="${escapeHTML(r.rnNo || '')}">View Details</button>
                <button type="button" class="btn-print-client" data-rn="${escapeHTML(r.rnNo || '')}">Print</button>
              </div>
            </div>
          `;
        }).join('')}
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

    listEl.querySelectorAll('.btn-print-client').forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const record = this.records.find(r => r.rnNo === rn);
        if (record) printOcularCertificate(record);
      });
    });

    listEl.querySelectorAll('.btn-view-client').forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const record = this.records.find(r => r.rnNo === rn);
        if (record) this.openClientDetail(record);
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
