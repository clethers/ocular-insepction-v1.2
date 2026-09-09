/**
 * OIMS — Customer Care & Operations Manager Workspace Component (`managerWorkspace.js`)
 * Features Workload Dispatch, Audit QA Approvals, 360 Client Search, Field Calendar, Tickets, Materials, SMS Logs, and Operations KPIs.
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { ClientDirectory } from './clientDirectory.js';
import { InstallationsDirectory } from './installationsDirectory.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'qa'; // 'dispatch', 'qa', 'clientsearch', 'installations', 'calendar', 'tickets', 'materials', 'sms', 'kpis' — qa is the only tab wired to real data, so it's the default landing tab
    this.pendingQAItems = [];
    this.qaLoading = false;
    this.qaLoaded = false;
    this.qaViewMode = 'card'; // 'card' or 'list'
  }

  async render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">

        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${(this.activeTab === 'clientsearch' || this.activeTab === 'installations') ? '' : this.renderTabStage()}
        </div>

      </div>
    `;

    if (this.activeTab === 'clientsearch') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new ClientDirectory(stage).render();
    }

    if (this.activeTab === 'installations') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new InstallationsDirectory(stage).render();
    }

    this.bindEvents();

    // qaLoaded (not pendingQAItems.length) gates this so a genuinely empty
    // queue doesn't re-trigger a fetch on every render — loadQAQueue()
    // itself calls render() again once it resolves, and an empty result
    // would otherwise re-satisfy a length-based check forever, looping
    // requests against Supabase indefinitely.
    if (this.activeTab === 'qa' && !this.qaLoading && !this.qaLoaded) {
      await this.loadQAQueue();
    }
  }

  async loadQAQueue() {
    this.qaLoading = true;
    try {
      this.pendingQAItems = await supabaseService.fetchPendingQAInspections();
    } catch (e) {
      console.warn('[OIMS] Could not fetch pending QA inspections:', e);
      this.pendingQAItems = [];
    }
    this.qaLoading = false;
    this.qaLoaded = true;
    if (this.activeTab === 'qa') this.render();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'qa':
        return this.renderQATab();
      case 'calendar':
        return this.renderCalendarTab();
      case 'tickets':
        return this.renderTicketsTab();
      case 'materials':
        return this.renderMaterialsTab();
      case 'kpis':
        return this.renderKPIsTab();
      case 'dispatch':
      default:
        return this.renderDispatchTab();
    }
  }

  // TAB 1: Inspector Workload & Dispatch Board
  renderDispatchTab() {
    const inspectors = [
      { name: 'Engr. Marco Santos, REE', assigned: 3, capacity: 4, status: 'MODERATE LOAD', region: 'NCR Manila North', initial: 'MS' },
      { name: 'Tech. Daniel Cruz', assigned: 1, capacity: 4, status: 'AVAILABLE', region: 'Manila South Hub', initial: 'DC' },
      { name: 'Tech. Elena Reyes', assigned: 4, capacity: 4, status: 'AT CAPACITY', region: 'Quezon City Zone', initial: 'ER' },
      { name: 'Engr. Gabriel Torres', assigned: 0, capacity: 4, status: 'STANDBY', region: 'BGC / Taguig Hub', initial: 'GT' }
    ];

    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0 0 1rem 0;">Field Inspector Workload & Capacity Grid</h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem;">
          ${inspectors.map(i => `
            <div style="padding: 1.25rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                  <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--ecoworks-blue); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700;">${i.initial}</div>
                  <div>
                    <strong style="color: #0f172a; font-size: 0.9rem; display: block;">${i.name}</strong>
                    <span style="font-size: 0.75rem; color: #64748b; font-weight: 500;">${i.region}</span>
                  </div>
                </div>
                <span class="badge" style="background: ${i.assigned >= i.capacity ? '#ffe4e6' : '#dcfce7'}; color: ${i.assigned >= i.capacity ? '#e11d48' : '#15803d'}; font-size: 0.7rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: var(--radius-full); border: 1px solid ${i.assigned >= i.capacity ? '#fecdd3' : '#bbf7d0'};">
                  ${i.status}
                </span>
              </div>

              <div style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #475569; margin-bottom: 0.35rem;">
                  <span style="font-weight: 600;">Daily Job Allocation</span>
                  <span style="font-weight: 800; color: #0f172a;">${i.assigned} / ${i.capacity} Jobs</span>
                </div>
                <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
                  <div style="width: ${(i.assigned / i.capacity) * 100}%; height: 100%; background: ${i.assigned >= i.capacity ? '#f43f5e' : 'var(--ecoworks-blue)'}; border-radius: 4px;"></div>
                </div>
              </div>

              <button type="button" class="btn btn-secondary btn-dispatch-job" data-inspector="${i.name}" style="width: 100%; justify-content: center; margin-top: 1rem; padding: 0.6rem; font-size: 0.8rem; background: #f8fafc; border: 1px solid #cbd5e1; color: #0f172a; font-weight: 700; border-radius: var(--radius-md);">
                Dispatch Job to Inspector
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // TAB 2: Audit QA Queue
  renderQATab() {
    if (this.qaLoading) {
      return `
        <div class="form-card" style="text-align: center; padding: 3rem; color: #64748b;">
          Loading Pending QA Submissions...
        </div>
      `;
    }

    const header = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0;">Pending Ocular Audits Quality Assurance Queue</h3>
        <div style="display: flex; gap: 0.4rem;">
          <button type="button" class="btn ${this.qaViewMode === 'card' ? 'btn-primary' : 'btn-outline'} btn-qa-view" data-view="card" style="padding: 0.4rem 0.75rem; font-size: 0.75rem;">Card View</button>
          <button type="button" class="btn ${this.qaViewMode === 'list' ? 'btn-primary' : 'btn-outline'} btn-qa-view" data-view="list" style="padding: 0.4rem 0.75rem; font-size: 0.75rem;">List View</button>
        </div>
      </div>
    `;

    if (this.pendingQAItems.length === 0) {
      return `
        <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
          ${header}
          <div style="text-align: center; padding: 2rem; color: #64748b;">
            All ocular audits approved! No pending QA items in queue.
          </div>
        </div>
      `;
    }

    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        ${header}
        ${this.qaViewMode === 'list' ? this.renderQAListView() : this.renderQACardView()}
      </div>
    `;
  }

  renderTeamSelect(item) {
    const team = item.assignedTeam || '';
    return `
      <select class="form-select qa-team-select" data-rn="${item.rnNo}" style="font-size: 0.775rem; padding: 0.4rem 0.6rem;">
        <option value="" ${team === '' ? 'selected' : ''}>Assign Team...</option>
        <option value="TEAM_1" ${team === 'TEAM_1' ? 'selected' : ''}>Inspection Team 1</option>
        <option value="TEAM_2" ${team === 'TEAM_2' ? 'selected' : ''}>Inspection Team 2</option>
      </select>
    `;
  }

  renderQACardView() {
    return `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        ${this.pendingQAItems.map(item => `
          <div style="padding: 1.25rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="color: #0f172a; font-size: 1rem;">${item.clientName || 'Commercial Client'}</strong>
                <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.725rem; font-weight: 700; padding: 0.2rem 0.5rem;">${item.rnNo || 'RN-101'}</span>
              </div>
              <div style="font-size: 0.8rem; color: #64748b;">
                ${item.locationAddress || 'Manila City'} | Breaker: ${item.mainBreaker || '100A'} | Voltage: ${item.voltageSystem || '230V'}
              </div>
              <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">
                Inspected by ${item.inspectedByName || 'Field Inspector'}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              ${this.renderTeamSelect(item)}
              <button type="button" class="btn btn-secondary btn-qa-reject" data-rn="${item.rnNo}" style="padding: 0.45rem 0.75rem; font-size: 0.775rem;">Request Re-inspection</button>
              <button type="button" class="btn btn-primary btn-qa-approve" data-rn="${item.rnNo}" style="padding: 0.45rem 0.85rem; font-size: 0.775rem;">Approve Audit QA</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderQAListView() {
    return `
      <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-lg);">
        <table class="directory-table">
          <thead>
            <tr>
              <th>RN Number</th>
              <th>Client Name</th>
              <th>Location</th>
              <th>Breaker / Voltage</th>
              <th>Inspector</th>
              <th>Team</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.pendingQAItems.map(item => `
              <tr>
                <td><span style="font-weight: 700; color: var(--ecoworks-blue);">${item.rnNo || 'N/A'}</span></td>
                <td style="font-weight: 600; color: #0f172a;">${item.clientName || 'Commercial Client'}</td>
                <td style="color: #64748b;">${item.locationAddress || 'Manila City'}</td>
                <td style="color: #64748b;">${item.mainBreaker || '100A'} / ${item.voltageSystem || '230V'}</td>
                <td style="color: #64748b;">${item.inspectedByName || 'Field Inspector'}</td>
                <td>${this.renderTeamSelect(item)}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button type="button" class="btn-link btn-qa-reject" data-rn="${item.rnNo}" style="color: #dc2626;">Request Re-inspection</button>
                  <button type="button" class="btn-link btn-qa-approve" data-rn="${item.rnNo}">Approve</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // TAB 4: Field Calendar
  renderCalendarTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0;">Inspector Field Visit Calendar & Dispatcher</h3>
          <span style="font-size: 0.85rem; color: var(--ecoworks-blue); font-weight: 700;">August 2026</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; text-align: center; font-size: 0.8rem; margin-bottom: 0.5rem;">
          <strong style="color: #64748b;">Mon</strong><strong style="color: #64748b;">Tue</strong><strong style="color: #64748b;">Wed</strong><strong style="color: #64748b;">Thu</strong><strong style="color: #64748b;">Fri</strong><strong style="color: #64748b;">Sat</strong><strong style="color: #64748b;">Sun</strong>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem;">
          ${Array.from({ length: 14 }).map((_, idx) => `
            <div style="padding: 0.75rem 0.5rem; min-height: 70px; background: #ffffff; border: 1px solid ${idx === 10 ? 'var(--ecoworks-blue)' : '#e2e8f0'}; border-radius: var(--radius-md); font-size: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <span style="font-weight: 700; color: ${idx === 10 ? 'var(--ecoworks-blue)' : '#64748b'};">Aug ${idx + 1}</span>
              ${idx === 10 ? '<div style="margin-top: 0.35rem; padding: 0.2rem; background: rgba(0,174,239,0.15); border-radius: 4px; color: var(--ecoworks-blue); font-weight: 700; font-size: 0.675rem;">3 Visits Scheduled</div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // TAB 5: Support Tickets
  renderTicketsTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 1rem;">Customer Care Support Tickets & Escalations</h3>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong style="color: #0f172a;">Subdivision Gate Permit Access Note</strong>
                <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #D97706; font-size: 0.7rem; font-weight: 800;">HIGH PRIORITY</span>
              </div>
              <span style="font-size: 0.775rem; color: #64748b; display: block; margin-top: 0.25rem;">Client: Forbes Park Residence | Gate Code #9940 required for entry.</span>
            </div>
            <button type="button" class="btn btn-secondary btn-resolve-ticket" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">Resolve Ticket</button>
          </div>

          <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong style="color: #0f172a;">Charger Specification Upgrade Request (7kW ➔ 22kW)</strong>
                <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.7rem; font-weight: 800;">NORMAL</span>
              </div>
              <span style="font-size: 0.775rem; color: #64748b; display: block; margin-top: 0.25rem;">Client requested 3-phase 22kW fast charger upgrade prior to installation.</span>
            </div>
            <button type="button" class="btn btn-secondary btn-resolve-ticket" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">Resolve Ticket</button>
          </div>
        </div>
      </div>
    `;
  }

  // TAB 6: Material Demand
  renderMaterialsTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 1rem;">Aggregated Material Pick-List Requests</h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
          <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);">
            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">uPVC Conduits (20mm)</span>
            <div style="font-size: 1.6rem; font-weight: 800; color: var(--ecoworks-blue); margin-top: 0.25rem;">145 Pipes</div>
            <span style="font-size: 0.725rem; color: #64748b;">Required for upcoming week</span>
          </div>

          <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);">
            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">63A 2-Pole Breakers</span>
            <div style="font-size: 1.6rem; font-weight: 800; color: #10B981; margin-top: 0.25rem;">18 Units</div>
            <span style="font-size: 0.725rem; color: #64748b;">Schneider Electric brand</span>
          </div>

          <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); box-shadow: 0 2px 6px rgba(15, 23, 42, 0.03);">
            <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">EMT Conduits (3/4")</span>
            <div style="font-size: 1.6rem; font-weight: 800; color: #D97706; margin-top: 0.25rem;">82 Pipes</div>
            <span style="font-size: 0.725rem; color: #64748b;">Galvanized steel</span>
          </div>
        </div>
      </div>
    `;
  }

  // TAB 8: Operations KPIs
  renderKPIsTab() {
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border-color: var(--border-color);">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Pipeline Velocity</span>
          <div style="font-size: 1.8rem; font-weight: 800; color: var(--ecoworks-blue); margin-top: 0.25rem;">1.8 Days</div>
          <span style="font-size: 0.725rem; color: var(--text-muted);">Avg Audit-to-Install turnaround</span>
        </div>

        <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border-color: var(--border-color);">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Weekly Audit Volume</span>
          <div style="font-size: 1.8rem; font-weight: 800; color: #10B981; margin-top: 0.25rem;">42 Audits</div>
          <span style="font-size: 0.725rem; color: var(--text-muted);">▲ 15% increase vs last week</span>
        </div>

        <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border-color: var(--border-color);">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">First-Pass QA Approval</span>
          <div style="font-size: 1.8rem; font-weight: 800; color: #10B981; margin-top: 0.25rem;">95.2%</div>
          <span style="font-size: 0.725rem; color: var(--text-muted);">4.8% re-inspection rate</span>
        </div>
      </div>
    `;
  }

  // Persists a QA decision to the cloud row. Throws if item.id is missing
  // or the update fails — callers must not treat that as success.
  async resolveQAItem(item, newStatus, qaNotes = null) {
    if (!item.id) throw new Error('Cannot resolve a QA item with no cloud record id');

    const user = await AuthGuard.getSessionUser();
    const qaReviewedAt = new Date().toISOString();

    await supabaseService.updateInspectionStatus(item.id, newStatus, {
      qaNotes,
      qaReviewedBy: user?.id || null,
      qaReviewedAt
    });
  }

  bindEvents() {
    // Tab switching
    const tabBtns = this.container.querySelectorAll('.mgr-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-tab');
        this.render();
      });
    });

    // Dispatch job button
    const dispatchBtns = this.container.querySelectorAll('.btn-dispatch-job');
    dispatchBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const inspector = btn.getAttribute('data-inspector');
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.FIELD_DISPATCH,
          eventType: 'JOB_DISPATCHED',
          description: `Dispatched new ocular inspection job to ${inspector}`,
          severity: AUDIT_SEVERITY.INFO
        });
        AppLayout.showToast(`Job dispatched to ${inspector}`);
      });
    });

    // QA queue view toggle (card / list)
    const qaViewBtns = this.container.querySelectorAll('.btn-qa-view');
    qaViewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.qaViewMode = btn.getAttribute('data-view');
        this.render();
      });
    });

    // QA team assignment dropdown
    const teamSelects = this.container.querySelectorAll('.qa-team-select');
    teamSelects.forEach(select => {
      select.addEventListener('change', async () => {
        const rn = select.getAttribute('data-rn');
        const item = this.pendingQAItems.find(i => i.rnNo === rn);
        if (!item) return;
        const team = select.value;
        select.disabled = true;

        try {
          await supabaseService.assignInspectionTeam(item.id, team || null);
          item.assignedTeam = team;
          const teamLabel = team === 'TEAM_1' ? 'Inspection Team 1' : team === 'TEAM_2' ? 'Inspection Team 2' : 'unassigned';
          AppLayout.showToast(`${rn} assigned to ${teamLabel}`);
        } catch (e) {
          console.warn('[OIMS] Could not assign inspection team:', e);
          AppLayout.showToast('Could not save team assignment — check your connection and try again.');
          select.value = item.assignedTeam || '';
        } finally {
          select.disabled = false;
        }
      });
    });

    // Approve QA button
    const approveBtns = this.container.querySelectorAll('.btn-qa-approve');
    approveBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const rn = btn.getAttribute('data-rn');
        const item = this.pendingQAItems.find(i => i.rnNo === rn);
        if (!item) return;
        btn.disabled = true;

        try {
          await this.resolveQAItem(item, 'READY_FOR_INSTALLATION');
          auditLogService.logEvent({
            category: AUDIT_CATEGORIES.MANAGER_APPROVAL,
            eventType: 'AUDIT_APPROVED',
            description: `Approved Ocular Audit ${rn}. Advanced status to READY_FOR_INSTALLATION.`,
            severity: AUDIT_SEVERITY.INFO
          });
          AppLayout.showToast(`Approved Audit QA for ${rn}`);
          this.pendingQAItems = this.pendingQAItems.filter(i => i.rnNo !== rn);
          this.render();
        } catch (e) {
          console.warn('[OIMS] Could not approve QA item:', e);
          AppLayout.showToast('Could not approve — check your connection and try again.');
          btn.disabled = false;
        }
      });
    });

    // Reject QA button
    const rejectBtns = this.container.querySelectorAll('.btn-qa-reject');
    rejectBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const rn = btn.getAttribute('data-rn');
        const item = this.pendingQAItems.find(i => i.rnNo === rn);
        if (!item) return;
        const reason = prompt('Enter technical re-inspection review reason:');
        if (!reason) return;
        btn.disabled = true;

        try {
          await this.resolveQAItem(item, 'RE_INSPECTION_REQUESTED', reason);
          auditLogService.logEvent({
            category: AUDIT_CATEGORIES.MANAGER_APPROVAL,
            eventType: 'REINSPECTION_REQUESTED',
            description: `Requested re-inspection for ${rn}. Reason: ${reason}`,
            severity: AUDIT_SEVERITY.WARNING
          });
          AppLayout.showToast(`Re-inspection requested for ${rn}`);
          this.pendingQAItems = this.pendingQAItems.filter(i => i.rnNo !== rn);
          this.render();
        } catch (e) {
          console.warn('[OIMS] Could not reject QA item:', e);
          AppLayout.showToast('Could not request re-inspection — check your connection and try again.');
          btn.disabled = false;
        }
      });
    });

    // Create Ticket Button
    const ticketBtn = this.container.querySelector('#btn-create-support-ticket');
    if (ticketBtn) {
      ticketBtn.addEventListener('click', () => {
        const note = prompt('Enter Client Support Ticket Note:');
        if (!note) return;
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.CUSTOMER_CARE,
          eventType: 'TICKET_CREATED',
          description: `Logged client support ticket: ${note}`,
          severity: AUDIT_SEVERITY.INFO
        });
        AppLayout.showToast('Support ticket logged successfully.');
      });
    }
  }
}
