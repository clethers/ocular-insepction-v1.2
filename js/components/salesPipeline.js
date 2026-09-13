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
        <div style="margin-bottom: 0.5rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.25rem;">Sales Pipeline</h3>
          <p style="font-size: 0.825rem; color: #64748b; margin: 0;">Every lead from first contact through installation, searchable by name, RN number, or contact number.</p>
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
  }

  getFilteredLeads() {
    return this.leads.filter(l => {
      if (this.stageFilter !== 'ALL' && l.stage !== this.stageFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${l.clientName} ${l.rnNo || ''} ${l.contactNo || ''}`.toLowerCase();
      return haystack.includes(this.searchQuery);
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

    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>RN Number</th>
              <th>Client Name</th>
              <th>Stage</th>
              <th>Contact No</th>
              <th>Last Updated</th>
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
          </div>
        `).join('')}
      </div>
    `;
  }
}
