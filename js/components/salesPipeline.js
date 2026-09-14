/**
 * OIMS — Sales Pipeline Component (`salesPipeline.js`)
 * Customer Care's lead-tracking pipeline: searchable/filterable list of
 * every sales_leads row, with a per-lead detail view for stage history,
 * updating a lead's stage, and archiving.
 * See docs/superpowers/specs/2026-09-13-sales-pipeline-design.md.
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { escapeHTML } from '../utils/security.js';

export const STAGES = [
  { key: 'INITIAL_CONTACT', label: 'Initial Contact', color: '#64748b' },
  { key: 'SITE_VISIT_SCHEDULED', label: 'Site Visit Scheduled', color: '#0B7BC0' },
  { key: 'SITE_VISIT_COMPLETED', label: 'Site Visit Completed', color: '#00AEEF' },
  { key: 'QUOTE_SENT', label: 'Quote Sent', color: '#F5A83D' },
  { key: 'QUOTE_ACCEPTED', label: 'Quote Accepted', color: '#c17a1f' },
  { key: 'INSTALLATION_SCHEDULED', label: 'Installation Scheduled', color: '#7CB342' },
  { key: 'INSTALLATION_COMPLETE', label: 'Installation Complete', color: '#3C7A1E' },
  { key: 'JOB_CHECKOUT_COMPLETE', label: 'Job Checkout Complete', color: '#2E5E16' },
  { key: 'CANCELED', label: 'Canceled', color: '#F43F5E' }
];

export function stageMeta(key) {
  return STAGES.find(s => s.key === key) || STAGES[0];
}

export class SalesPipeline {
  constructor(container) {
    this.container = container;
    this.leads = [];
    this.searchQuery = '';
    this.stageFilter = 'ALL';
    this.pendingImportRows = [];
    this.sortKey = 'updatedAt';
    this.sortDir = 'desc';
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    try {
      this.leads = await supabaseService.fetchAllSalesLeads();
    } catch (e) {
      console.warn('[OIMS] Could not fetch sales leads:', e);
      this.leads = [];
    }
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.25rem;">Sales Pipeline</h3>
            <p style="font-size: 0.825rem; color: #64748b; margin: 0;">Every lead from first contact through installation, searchable by name, RN number, or contact number.</p>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-outline" id="btn-import-leads" style="padding: 0.6rem 1rem; font-size: 0.825rem;">Import CSV</button>
            <input type="file" id="input-import-leads-file" accept=".csv,text/csv" style="display: none;" />
            <button type="button" class="btn btn-primary" id="btn-add-lead" style="padding: 0.6rem 1rem; font-size: 0.825rem;">+ Add Lead</button>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; margin: 1.25rem 0; flex-wrap: wrap;">
          <input type="text" id="input-pipeline-search" class="form-input" placeholder="Search name, RN-123099045, contact number..." style="flex: 1; min-width: 220px;" />
          <select id="select-pipeline-stage" class="form-select" style="max-width: 220px;">
            <option value="ALL">All Stages</option>
            ${STAGES.map(s => `<option value="${s.key}">${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </div>

        <div id="pipeline-stage-pills" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1.25rem;"></div>

        <div id="pipeline-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading sales leads...</div>
        </div>
      </div>

      <!-- Add Lead Overlay -->
      <div class="modal-overlay no-print" id="add-lead-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 520px;">
          <div id="add-lead-content"></div>
        </div>
      </div>

      <!-- Lead Detail Overlay -->
      <div class="modal-overlay no-print" id="lead-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="lead-detail-content"></div>
        </div>
      </div>

      <!-- Import Leads Preview Overlay -->
      <div class="modal-overlay no-print" id="import-leads-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 760px; max-height: 85vh; display: flex; flex-direction: column;">
          <div id="import-leads-content" style="overflow-y: auto;"></div>
        </div>
      </div>

      <!-- Assign for Inspection Overlay -->
      <div class="modal-overlay no-print" id="assign-inspection-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 480px;">
          <div id="assign-inspection-content"></div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-pipeline-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const stageSelect = this.container.querySelector('#select-pipeline-stage');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        this.stageFilter = e.target.value;
        this.renderList();
      });
    }

    const addLeadBtn = this.container.querySelector('#btn-add-lead');
    if (addLeadBtn) {
      addLeadBtn.addEventListener('click', () => this.openAddLeadOverlay());
    }

    const addLeadOverlay = this.container.querySelector('#add-lead-overlay');
    if (addLeadOverlay) {
      addLeadOverlay.addEventListener('click', (e) => {
        if (e.target === addLeadOverlay) this.closeAddLeadOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#add-lead-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeAddLeadOverlay();
    });

    const detailOverlay = this.container.querySelector('#lead-detail-overlay');
    if (detailOverlay) {
      detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) this.closeDetail();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#lead-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeDetail();
    });

    const importBtn = this.container.querySelector('#btn-import-leads');
    const importFileInput = this.container.querySelector('#input-import-leads-file');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.handleImportFile(file);
        importFileInput.value = '';
      });
    }

    const importOverlay = this.container.querySelector('#import-leads-overlay');
    if (importOverlay) {
      importOverlay.addEventListener('click', (e) => {
        if (e.target === importOverlay) this.closeImportOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#import-leads-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeImportOverlay();
    });

    const assignOverlay = this.container.querySelector('#assign-inspection-overlay');
    if (assignOverlay) {
      assignOverlay.addEventListener('click', (e) => {
        if (e.target === assignOverlay) this.closeAssignInspectionOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#assign-inspection-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeAssignInspectionOverlay();
    });
  }

  getFilteredLeads() {
    const filtered = this.leads.filter(l => {
      if (this.stageFilter !== 'ALL' && l.stage !== this.stageFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${l.clientName} ${l.rnNo || ''} ${l.contactNo || ''}`.toLowerCase();
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

  renderPills() {
    const wrap = this.container.querySelector('#pipeline-stage-pills');
    if (!wrap) return;

    const counts = {};
    this.leads.forEach(l => { counts[l.stage] = (counts[l.stage] || 0) + 1; });

    const pillHtml = (key, label, color, count) => {
      const active = this.stageFilter === key;
      const bg = active ? color : '#ffffff';
      const fg = active ? '#ffffff' : '#334155';
      const border = active ? color : '#cbd5e1';
      return `<button type="button" class="btn-pipeline-pill" data-stage="${key}" style="border: 1px solid ${border}; background: ${bg}; color: ${fg}; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700; padding: 0.35rem 0.7rem;">${escapeHTML(label)} <span style="opacity: 0.85;">${count}</span></button>`;
    };

    const pills = [pillHtml('ALL', 'All', '#0f172a', this.leads.length)];
    STAGES.forEach(s => {
      if (counts[s.key]) pills.push(pillHtml(s.key, s.label, s.color, counts[s.key]));
    });

    wrap.innerHTML = pills.join('');
    wrap.querySelectorAll('.btn-pipeline-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stageFilter = btn.getAttribute('data-stage');
        const select = this.container.querySelector('#select-pipeline-stage');
        if (select) select.value = this.stageFilter;
        this.renderList();
      });
    });
  }

  renderList() {
    this.renderPills();

    const listEl = this.container.querySelector('#pipeline-list');
    if (!listEl) return;

    if (this.leads.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No sales leads yet.</div>`;
      return;
    }

    const filtered = this.getFilteredLeads();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No leads match your search or filter.</div>`;
      return;
    }

    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const badge = (key) => {
      const m = stageMeta(key);
      return `<span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; font-weight: 700; padding: 0.3rem 0.6rem; border-radius: var(--radius-full); background: ${m.color}22; color: ${m.color};"><span style="width: 7px; height: 7px; border-radius: 50%; background: ${m.color};"></span>${escapeHTML(m.label)}</span>`;
    };

    const columns = [
      { key: 'rnNo', label: 'RN Number' },
      { key: 'clientName', label: 'Client Name' },
      { key: 'stage', label: 'Stage' },
      { key: 'contactNo', label: 'Contact No' },
      { key: 'updatedAt', label: 'Last Updated' }
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
            ${filtered.map(l => `
              <tr>
                <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(l.rnNo || 'No RN yet')}</span></td>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(l.clientName)}</td>
                <td data-label="Stage">${badge(l.stage)}</td>
                <td data-label="Contact No" style="color: #64748b;">${escapeHTML(l.contactNo || 'N/A')}</td>
                <td data-label="Last Updated" style="color: #64748b;">${fmtDate(l.updatedAt)}</td>
                <td data-label="Actions" style="text-align: right;">
                  <button type="button" class="btn-link btn-view-lead" data-id="${l.id}">View Details</button>
                  <button type="button" class="btn-link btn-assign-inspection" data-id="${l.id}" style="margin-left: 0.6rem;">Assign for Inspection</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${filtered.map(l => `
          <div class="record-card">
            <div class="record-top">
              <span class="record-title">${escapeHTML(l.clientName)}</span>
              ${badge(l.stage)}
            </div>
            <div class="record-meta">
              <span class="rn">${escapeHTML(l.rnNo || 'No RN yet')}</span>
              <span class="dot">&middot;</span>
              <span>${fmtDate(l.updatedAt)}</span>
            </div>
            <div class="record-sub">${escapeHTML(l.installationAddress || 'No address on file')}</div>
            <div class="record-actions">
              <button type="button" class="btn-view-lead" data-id="${l.id}">View Details</button>
              <button type="button" class="btn-assign-inspection" data-id="${l.id}">Assign for Inspection</button>
            </div>
          </div>
        `).join('')}
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

    listEl.querySelectorAll('.btn-view-lead').forEach(btn => {
      btn.addEventListener('click', () => this.openDetail(btn.getAttribute('data-id')));
    });

    listEl.querySelectorAll('.btn-assign-inspection').forEach(btn => {
      btn.addEventListener('click', () => this.openAssignInspectionOverlay(btn.getAttribute('data-id')));
    });
  }

  openAddLeadOverlay() {
    const overlay = this.container.querySelector('#add-lead-overlay');
    const content = this.container.querySelector('#add-lead-content');
    if (!overlay || !content) return;

    content.innerHTML = `
      <h3 class="modal-title">Add Lead</h3>
      <p class="modal-subtitle">New leads start at Initial Customer Contact.</p>

      <div class="form-group">
        <label class="form-label">First Name</label>
        <input type="text" class="form-input" id="lead-first-name" placeholder="Juan" />
      </div>

      <div class="form-group">
        <label class="form-label">Last Name</label>
        <input type="text" class="form-input" id="lead-last-name" placeholder="Dela Cruz" />
      </div>

      <div class="form-group">
        <label class="form-label">Contact Number <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="lead-contact-no" placeholder="639171234567" />
      </div>

      <div class="form-group">
        <label class="form-label">Email <span class="form-label-note">(optional)</span></label>
        <input type="email" class="form-input" id="lead-email" placeholder="juan@email.com" />
      </div>

      <div class="form-group">
        <label class="form-label">Installation Address <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="lead-address" placeholder="Unit 4B, Green Meadows, Quezon City" />
      </div>

      <div class="form-group">
        <label class="form-label">Mode of Communication <span class="form-label-note">(optional)</span></label>
        <select class="form-select" id="lead-mode">
          <option value="">Not specified</option>
          <option value="Phone Call">Phone Call</option>
          <option value="Viber">Viber</option>
          <option value="Email">Email</option>
          <option value="Walk-in">Walk-in</option>
        </select>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-add-lead">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-add-lead">Save Lead</button>
      </div>
    `;

    content.querySelector('#btn-cancel-add-lead').addEventListener('click', () => this.closeAddLeadOverlay());
    content.querySelector('#btn-confirm-add-lead').addEventListener('click', (e) => this.confirmAddLead(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeAddLeadOverlay() {
    const overlay = this.container.querySelector('#add-lead-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmAddLead(btn) {
    const content = this.container.querySelector('#add-lead-content');
    const firstName = content.querySelector('#lead-first-name').value.trim();
    const lastName = content.querySelector('#lead-last-name').value.trim();

    if (!firstName || !lastName) {
      AppLayout.showToast('First and last name are required.');
      return;
    }

    const contactNo = content.querySelector('#lead-contact-no').value.trim();
    const email = content.querySelector('#lead-email').value.trim();
    const installationAddress = content.querySelector('#lead-address').value.trim();
    const modeOfCommunication = content.querySelector('#lead-mode').value;

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const user = await AuthGuard.getSessionUser();
      const lead = await supabaseService.createSalesLead({
        firstName,
        lastName,
        contactNo: contactNo || null,
        email: email || null,
        installationAddress: installationAddress || null,
        modeOfCommunication: modeOfCommunication || null,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_CREATED',
        description: `Added sales lead "${lead.clientName}"`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.leads.unshift(lead);
      this.closeAddLeadOverlay();
      AppLayout.showToast(`Lead added: ${escapeHTML(lead.clientName)}`);
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not create sales lead:', e);
      AppLayout.showToast('Could not add lead — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Save Lead';
    }
  }

  async openDetail(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;

    const overlay = this.container.querySelector('#lead-detail-overlay');
    const content = this.container.querySelector('#lead-detail-content');
    if (!overlay || !content) return;

    content.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">Loading...</div>`;
    overlay.style.display = 'flex';

    const linkedInspection = lead.rnNo ? await supabaseService.fetchOcularInspectionByRnNo(lead.rnNo) : null;
    content.innerHTML = this.renderDetailContent(lead, linkedInspection);

    content.querySelector('#btn-close-lead-detail').addEventListener('click', () => this.closeDetail());

    const stageSelect = content.querySelector('#detail-stage-select');
    const updateBtn = content.querySelector('#btn-update-stage');
    if (updateBtn && stageSelect) {
      updateBtn.addEventListener('click', () => this.confirmStageUpdate(lead.id, stageSelect.value, updateBtn));
    }

    const archiveBtn = content.querySelector('#btn-archive-lead');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', () => this.handleArchive(lead, archiveBtn));
    }
  }

  closeDetail() {
    const overlay = this.container.querySelector('#lead-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  renderDetailContent(lead, linkedInspection) {
    const stampField = {
      INITIAL_CONTACT: 'stageInitialContactAt',
      SITE_VISIT_SCHEDULED: 'stageSiteVisitScheduledAt',
      SITE_VISIT_COMPLETED: 'stageSiteVisitCompletedAt',
      QUOTE_SENT: 'stageQuoteSentAt',
      QUOTE_ACCEPTED: 'stageQuoteAcceptedAt',
      INSTALLATION_SCHEDULED: 'stageInstallationScheduledAt',
      INSTALLATION_COMPLETE: 'stageInstallationCompleteAt',
      JOB_CHECKOUT_COMPLETE: 'stageJobCheckoutCompleteAt'
    };
    const progressStages = STAGES.filter(s => s.key !== 'CANCELED');
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    // A step is "reached" if it's at or before the lead's current stage
    // (by pipeline position), OR its own timestamp is set — covers leads
    // imported/created without stage_*_at timestamps (historical import,
    // CSV import) whose `stage` alone should still light up the stepper,
    // while still honoring a timestamp on a stage past the current one.
    // lead.stage === 'CANCELED' isn't itself a progress stage (it's
    // filtered out of progressStages above), so for a canceled lead fall
    // back to the furthest stage that actually has a timestamp — this is
    // what preserves "how far did this get before it fell through" for
    // canceled leads instead of collapsing the whole stepper to unreached.
    const stageIdx = progressStages.findIndex(s => s.key === lead.stage);
    const stampedIdx = progressStages.reduce((max, s, i) => (lead[stampField[s.key]] ? i : max), -1);
    const currentIdx = stageIdx !== -1 ? stageIdx : stampedIdx;
    const stepperHtml = progressStages.map((s, i) => {
      const reached = i <= currentIdx || !!lead[stampField[s.key]];
      const prevReached = i > 0 && (i - 1 <= currentIdx || !!lead[stampField[progressStages[i - 1].key]]);
      return `
        ${i > 0 ? `<div class="pipeline-connector ${prevReached ? 'active' : ''}"></div>` : ''}
        <div class="pipeline-step ${reached ? 'completed' : ''}">
          <div class="pipeline-step-icon">${reached ? '&#10003;' : i + 1}</div>
          <div class="pipeline-step-label">${escapeHTML(s.label)}</div>
          ${reached ? `<div style="font-size: 0.65rem; color: #94a3b8;">${fmtDate(lead[stampField[s.key]])}</div>` : ''}
        </div>
      `;
    }).join('');

    const canceledFlag = lead.stage === 'CANCELED'
      ? `<div style="margin-top: 0.75rem; padding: 0.6rem 0.85rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-md); color: #b91c1c; font-size: 0.8rem; font-weight: 600;">Canceled as of ${fmtDate(lead.updatedAt)}</div>`
      : '';

    const linkCard = linkedInspection
      ? `<div style="margin-top: 1rem; padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid #bae6fd; background: #f0f9ff;">
           <div style="font-size: 0.82rem; font-weight: 700; color: #0f172a;">Linked Ocular Inspection Found</div>
           <div style="font-size: 0.78rem; color: #64748b; margin-top: 0.15rem;">Status: <strong style="color: #0f172a;">${escapeHTML((linkedInspection.status || '').replace(/_/g, ' '))}</strong> &middot; submitted ${fmtDate(linkedInspection.created_at)}</div>
         </div>`
      : `<div style="margin-top: 1rem; padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid #e2e8f0; color: #64748b; font-size: 0.82rem;">No matching Ocular Inspection record yet for this RN number.</div>`;

    return `
      <h3 class="modal-title">${escapeHTML(lead.clientName)}</h3>
      <p class="modal-subtitle">${lead.rnNo ? escapeHTML(lead.rnNo) + ' &middot; ' : ''}${escapeHTML(lead.installationAddress || 'No address on file')}</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-top: 1.25rem;">
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Contact Number</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.contactNo || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Email</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.email || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Mode of Communication</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.modeOfCommunication || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Current Stage</div><div style="font-size: 0.85rem; font-weight: 700; margin-top: 0.2rem; color: ${stageMeta(lead.stage).color};">${escapeHTML(stageMeta(lead.stage).label)}</div></div>
      </div>

      <div style="overflow-x: auto;">
        <div class="pipeline-stepper">${stepperHtml}</div>
      </div>
      ${canceledFlag}

      ${lead.remarks ? `<div style="margin-top: 1.25rem; padding: 0.85rem 1rem; background: #f8fafc; border-radius: var(--radius-md); font-size: 0.82rem; color: #334155; border: 1px solid #e2e8f0;">${escapeHTML(lead.remarks)}</div>` : ''}

      ${linkCard}

      <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid #e2e8f0; display: flex; gap: 0.6rem; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 180px;">
          <label class="form-label" for="detail-stage-select">Update Stage</label>
          <select class="form-select" id="detail-stage-select">
            ${STAGES.map(s => `<option value="${s.key}" ${s.key === lead.stage ? 'selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-primary" id="btn-update-stage">Update</button>
      </div>

      <div class="modal-footer" style="justify-content: space-between;">
        <button type="button" class="btn-link" id="btn-archive-lead" style="color: #F43F5E;">Archive Lead</button>
        <button type="button" class="btn btn-outline" id="btn-close-lead-detail">Close</button>
      </div>
    `;
  }

  async confirmStageUpdate(id, newStage, btn) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || newStage === lead.stage) return;

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await supabaseService.updateSalesLeadStage(id, newStage);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_STAGE_UPDATED',
        description: `Updated "${lead.clientName}" to stage ${newStage}`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: id
      });
      lead.stage = newStage;
      lead.updatedAt = new Date().toISOString();
      AppLayout.showToast(`Stage updated to "${stageMeta(newStage).label}"`);
      this.closeDetail();
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not update sales lead stage:', e);
      AppLayout.showToast('Could not update stage — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Update';
    }
  }

  async handleArchive(lead, btn) {
    const confirmed = confirm(`Archive lead "${lead.clientName}"? This removes them from the Sales Pipeline list.`);
    if (!confirmed) return;

    btn.disabled = true;

    try {
      await supabaseService.archiveSalesLead(lead.id);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_ARCHIVED',
        description: `Archived sales lead "${lead.clientName}"`,
        severity: AUDIT_SEVERITY.WARNING,
        resourceId: lead.id
      });
      this.leads = this.leads.filter(l => l.id !== lead.id);
      this.closeDetail();
      AppLayout.showToast(`Archived "${escapeHTML(lead.clientName)}".`);
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not archive sales lead:', e);
      AppLayout.showToast('Could not archive — check your connection and try again.');
      btn.disabled = false;
    }
  }

  // Minimal RFC4180-style CSV parser — handles quoted fields, embedded
  // commas, and escaped ("") quotes. Same implementation as
  // ClientDirectory.parseCSV; not meant to handle arbitrary spreadsheet
  // exports, just a simple lead-import sheet.
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
      firstName: colIndex(['first name', 'firstname']),
      lastName: colIndex(['last name', 'lastname']),
      rnNo: colIndex(['rn number', 'rn no', 'rnno', 'rn']),
      contactNo: colIndex(['contact no', 'contact number', 'contactno', 'phone']),
      email: colIndex(['email']),
      installationAddress: colIndex(['installation address', 'address', 'location']),
      modeOfCommunication: colIndex(['mode of communication', 'mode']),
      stage: colIndex(['stage']),
      remarks: colIndex(['remarks'])
    };

    if (idx.firstName === -1 || idx.lastName === -1) {
      AppLayout.showToast('CSV must include "First Name" and "Last Name" columns.');
      return;
    }

    const get = (cols, i) => (i !== -1 && cols[i] !== undefined) ? cols[i].trim() : '';
    const stageKeys = new Set(STAGES.map(s => s.key));
    // Tracks rn_no values already claimed by an earlier valid row in this
    // same file — a second row reusing one would hit the same
    // rn_no-is-not-the-upsert-conflict-target collision as the historical
    // importer's legacy_row_id/rn_no issue, so flag it as an error row
    // here instead of letting the whole batch upsert fail.
    const seenRnNos = new Set();

    this.pendingImportRows = rows.slice(1).map((cols, i) => {
      const firstName = get(cols, idx.firstName);
      const lastName = get(cols, idx.lastName);
      const stageRaw = get(cols, idx.stage).toUpperCase().replace(/\s+/g, '_');
      const rnNo = get(cols, idx.rnNo);
      const errors = [];
      if (!firstName) errors.push('Missing First Name');
      if (!lastName) errors.push('Missing Last Name');
      if (stageRaw && !stageKeys.has(stageRaw)) errors.push(`Unrecognized stage "${get(cols, idx.stage)}"`);
      if (rnNo && seenRnNos.has(rnNo)) errors.push(`Duplicate RN Number "${rnNo}" (already used earlier in this file)`);

      if (rnNo && errors.length === 0) seenRnNos.add(rnNo);

      return {
        rowNum: i + 2,
        firstName,
        lastName,
        rnNo,
        contactNo: get(cols, idx.contactNo),
        email: get(cols, idx.email),
        installationAddress: get(cols, idx.installationAddress),
        modeOfCommunication: get(cols, idx.modeOfCommunication),
        // '' (not a literal 'INITIAL_CONTACT' fallback) when the CSV has no
        // Stage column, or a blank cell — bulkImportSalesLeads only sends a
        // stage key when this is truthy, so a re-import with no Stage data
        // for a row doesn't reset that lead's real progress back to
        // Initial Contact (see supabaseService.js). The import preview
        // table below still displays "Initial Contact" for an empty stage
        // via stageMeta()'s own fallback, so this doesn't change what's
        // shown to the importer.
        stage: stageKeys.has(stageRaw) ? stageRaw : '',
        remarks: get(cols, idx.remarks),
        errors
      };
    });

    this.openImportOverlay();
  }

  openImportOverlay() {
    const overlay = this.container.querySelector('#import-leads-overlay');
    const content = this.container.querySelector('#import-leads-content');
    if (!overlay || !content) return;

    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    const invalidCount = this.pendingImportRows.length - validRows.length;

    content.innerHTML = `
      <h3 class="modal-title">Import Leads from CSV</h3>
      <p class="modal-subtitle">
        ${this.pendingImportRows.length} row${this.pendingImportRows.length === 1 ? '' : 's'} found — ${validRows.length} ready to import${invalidCount ? `, ${invalidCount} skipped due to errors` : ''}.
      </p>

      <div style="overflow: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); max-height: 340px;">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Name</th>
              <th>RN Number</th>
              <th>Contact No</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            ${this.pendingImportRows.map(r => `
              <tr style="${r.errors.length ? 'background: #fef2f2;' : ''}">
                <td style="color: #64748b;">${r.rowNum}</td>
                <td style="font-weight: 600; color: #0f172a;">${escapeHTML(`${r.firstName} ${r.lastName}`.trim() || '—')}</td>
                <td style="color: var(--ecoworks-blue); font-weight: 700;">${escapeHTML(r.rnNo || '—')}</td>
                <td style="color: #64748b;">${escapeHTML(r.contactNo || '—')}</td>
                <td style="color: ${r.errors.length ? '#dc2626' : '#64748b'};">${r.errors.length ? escapeHTML(r.errors.join(', ')) : escapeHTML(stageMeta(r.stage).label)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-import-leads">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-import-leads" ${validRows.length === 0 ? 'disabled' : ''}>Import ${validRows.length} Lead${validRows.length === 1 ? '' : 's'}</button>
      </div>
    `;

    content.querySelector('#btn-cancel-import-leads').addEventListener('click', () => this.closeImportOverlay());
    const confirmBtn = content.querySelector('#btn-confirm-import-leads');
    if (confirmBtn) confirmBtn.addEventListener('click', (e) => this.confirmImport(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeImportOverlay() {
    const overlay = this.container.querySelector('#import-leads-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmImport(btn) {
    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const imported = await supabaseService.bulkImportSalesLeads(validRows);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEADS_IMPORTED',
        description: `Imported ${imported.length} sales lead(s) via CSV`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.closeImportOverlay();
      AppLayout.showToast(`Imported ${imported.length} lead(s).`);

      this.leads = await supabaseService.fetchAllSalesLeads();
      this.renderList();
    } catch (err) {
      console.warn('[OIMS SalesPipeline] Import failed:', err.message);
      AppLayout.showToast('Could not import leads — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  async openAssignInspectionOverlay(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;

    const overlay = this.container.querySelector('#assign-inspection-overlay');
    const content = this.container.querySelector('#assign-inspection-content');
    if (!overlay || !content) return;

    content.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">Loading...</div>`;
    overlay.style.display = 'flex';

    let teams = [];
    try {
      teams = await supabaseService.fetchAllFieldInspectors();
    } catch (e) {
      console.warn('[OIMS] Could not fetch field inspectors:', e);
    }

    content.innerHTML = this.renderAssignInspectionContent(lead, teams);

    content.querySelector('#btn-cancel-assign-inspection').addEventListener('click', () => this.closeAssignInspectionOverlay());
    const confirmBtn = content.querySelector('#btn-confirm-assign-inspection');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => this.confirmAssignInspection(lead, e.currentTarget));
    }
  }

  closeAssignInspectionOverlay() {
    const overlay = this.container.querySelector('#assign-inspection-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  renderAssignInspectionContent(lead, teams) {
    return `
      <h3 class="modal-title">Assign for Inspection</h3>
      <p class="modal-subtitle">Creates an Ocular Inspection record and routes it to a Field Inspector.</p>

      <div style="margin: 1rem 0; padding: 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-md);">
        <div style="font-weight: 700; color: #0f172a;">${escapeHTML(lead.clientName)}</div>
        <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">${lead.rnNo ? escapeHTML(lead.rnNo) + ' &middot; ' : ''}${escapeHTML(lead.installationAddress || 'No address on file')}</div>
      </div>

      <div class="form-group">
        <label class="form-label" for="assign-team-select">Assign To</label>
        <select class="form-select" id="assign-team-select" ${teams.length === 0 ? 'disabled' : ''}>
          ${teams.length > 0
            ? teams.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.full_name)}</option>`).join('')
            : `<option value="">No field teams configured</option>`}
        </select>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-assign-inspection">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-assign-inspection" ${teams.length === 0 ? 'disabled' : ''}>Confirm</button>
      </div>
    `;
  }

  async confirmAssignInspection(lead, btn) {
    const content = this.container.querySelector('#assign-inspection-content');
    const select = content.querySelector('#assign-team-select');
    const assignedTeam = select ? select.value : '';
    if (!assignedTeam) {
      AppLayout.showToast('Select a team to assign this lead to.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Assigning...';

    try {
      const user = await AuthGuard.getSessionUser();
      await supabaseService.createStubInspection({
        clientName: lead.clientName,
        rnNo: lead.rnNo,
        contactNo: lead.contactNo,
        locationAddress: lead.installationAddress,
        assignedTeam,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_ASSIGNED_FOR_INSPECTION',
        description: `Assigned sales lead "${lead.clientName}" for Ocular Inspection`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: lead.id
      });
      this.closeAssignInspectionOverlay();
      AppLayout.showToast(`Assigned "${escapeHTML(lead.clientName)}" for inspection.`);
    } catch (e) {
      console.warn('[OIMS] Could not assign lead for inspection:', e);
      AppLayout.showToast('Could not assign for inspection — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  }
}
