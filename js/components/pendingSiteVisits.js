/**
 * OIMS — Pending Site Visits Panel (`pendingSiteVisits.js`)
 * Manager-side visibility over every Ocular Inspection lead Customer Care
 * has assigned to a Field Inspector — spans both lifecycle stages, from
 * dispatch (ASSIGNED_PENDING_INSPECTION) through the inspector's QA
 * submission (PENDING_QA), so Customer Care can see the whole handoff
 * without waiting for it to reach the Audit QA Queue.
 */

import { supabaseService } from '../services/supabaseService.js';
import { escapeHTML } from '../utils/security.js';

export class PendingSiteVisits {
  constructor(container) {
    this.container = container;
    this.records = [];
    this.fieldTeams = [];
  }

  async render() {
    this.container.innerHTML = this.renderShell();

    try {
      const [records, teams] = await Promise.all([
        supabaseService.fetchAllAssignedInspections(),
        supabaseService.fetchFieldTeams()
      ]);
      this.records = records;
      this.fieldTeams = teams;
    } catch (e) {
      console.warn('[OIMS] Could not fetch pending site visits:', e);
      this.records = [];
    }
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Pending Site Visits</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Every lead assigned to the Ocular Inspection Team, from dispatch through QA submission.</p>

        <div id="pending-site-visits-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading assigned inspections...</div>
        </div>
      </div>
    `;
  }

  teamNameFor(assignedTeam) {
    const team = this.fieldTeams.find(t => t.id === assignedTeam);
    return team ? team.full_name : 'Unassigned';
  }

  statusMeta(status) {
    switch (status) {
      case 'ASSIGNED_PENDING_INSPECTION': return { label: 'Awaiting Site Visit', bg: 'rgba(0, 174, 239, 0.15)', color: 'var(--ecoworks-blue)' };
      case 'PENDING_QA': return { label: 'Submitted, Awaiting QA', bg: '#fef3c7', color: '#d97706' };
      default: return { label: status || 'Unknown', bg: '#f1f5f9', color: '#64748b' };
    }
  }

  renderList() {
    const listEl = this.container.querySelector('#pending-site-visits-list');
    if (!listEl) return;

    if (this.records.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No leads currently assigned to the Ocular Inspection Team.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>RN Number</th>
              <th>Assigned To</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${this.records.map(r => {
              const meta = this.statusMeta(r.status);
              return `
                <tr>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                  <td data-label="RN Number" style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                  <td data-label="Assigned To" style="color: #64748b;">${escapeHTML(this.teamNameFor(r.assignedTeam))}</td>
                  <td data-label="Status"><span class="badge" style="background: ${meta.bg}; color: ${meta.color}; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem;">${escapeHTML(meta.label)}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${this.records.map(r => {
          const meta = this.statusMeta(r.status);
          return `
            <div class="record-card">
              <div class="record-top">
                <span class="record-title">${escapeHTML(r.clientName || 'Unnamed Client')}</span>
                <span class="record-badge" style="background: ${meta.bg}; color: ${meta.color};">${escapeHTML(meta.label)}</span>
              </div>
              <div class="record-meta">
                <span class="rn">${escapeHTML(r.rnNo || 'N/A')}</span>
              </div>
              <div class="record-sub">Assigned to ${escapeHTML(this.teamNameFor(r.assignedTeam))}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}
