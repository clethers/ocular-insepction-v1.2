/**
 * Synx Portal — Customer Care & Operations Manager Workspace Component (`managerWorkspace.js`)
 * Features Workload Dispatch, Audit QA Approvals, 360 Client Search, Field Calendar, Tickets, Materials, SMS Logs, and Operations KPIs.
 */

import { supabaseService } from '../services/supabaseService.js';
import { FormStorage } from './formStorage.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dispatch'; // 'dispatch', 'qa', 'clientsearch', 'calendar', 'tickets', 'materials', 'sms', 'kpis'
    this.searchQuery = '';
    this.readyItems = [];
    this.loadData();
  }

  loadData() {
    try {
      this.readyItems = FormStorage.listReadyInstallations() || [];
    } catch (e) {
      this.readyItems = [];
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">
        
        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${this.renderTabStage()}
        </div>

      </div>
    `;

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'qa':
        return this.renderQATab();
      case 'clientsearch':
        return this.renderClientSearchTab();
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
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 1rem;">Pending Ocular Audits Quality Assurance Queue</h3>
        
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${this.readyItems.length > 0 ? this.readyItems.map(item => `
            <div style="padding: 1.25rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
              <div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                  <strong style="color: #0f172a; font-size: 1rem;">${item.clientName || 'Commercial Client'}</strong>
                  <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.725rem; font-weight: 700; padding: 0.2rem 0.5rem;">${item.rnNo || 'RN-101'}</span>
                </div>
                <div style="font-size: 0.8rem; color: #64748b;">
                  ${item.locationAddress || 'Manila City'} | Breaker: ${item.mainBreaker || '100A'} | Voltage: ${item.voltageSystem || '230V'}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn btn-secondary btn-qa-reject" data-rn="${item.rnNo}" style="padding: 0.45rem 0.75rem; font-size: 0.775rem;">Request Re-inspection</button>
                <button type="button" class="btn btn-primary btn-qa-approve" data-rn="${item.rnNo}" style="padding: 0.45rem 0.85rem; font-size: 0.775rem;">Approve Audit QA</button>
              </div>
            </div>
          `).join('') : `
            <div style="text-align: center; padding: 2rem; color: #64748b;">
              All ocular audits approved! No pending QA items in queue.
            </div>
          `}
        </div>
      </div>
    `;
  }

  // TAB 3: 360 Client Search & Timeline
  renderClientSearchTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">360° Client & Installation Account Search</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Search by Client Name, RN Number, Installation No., or Contact Phone Number.</p>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem;">
          <input type="text" id="input-client-search" class="form-input" placeholder="Search client name, RN-88092, #AUD-101..." value="${this.searchQuery}" style="flex: 1;" />
          <button type="button" class="btn btn-primary" id="btn-trigger-client-search">Search Account</button>
        </div>

        <div style="padding: 1.5rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <div>
              <h4 style="margin: 0; color: #0f172a; font-size: 1.1rem;">Ayala Land Commercial EV Charging Depot</h4>
              <span style="font-size: 0.775rem; color: #64748b;">Reference: RN-88092 | Contact: +63 917 555 0192</span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: var(--radius-full);">STATUS: READY FOR INSTALLATION</span>
          </div>

          <!-- Step-by-Step Status Timeline -->
          <div style="display: flex; justify-content: space-between; position: relative; margin-top: 1.5rem;">
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #10B981; color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">✓</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #0f172a; display: block;">Audit Requested</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 08</span>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #10B981; color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">✓</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #0f172a; display: block;">Ocular Conducted</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 10</span>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--ecoworks-blue); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">3</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--ecoworks-blue); display: block;">Manager Approved</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 11 (Today)</span>
            </div>
            <div style="text-align: center; flex: 1; opacity: 0.5;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">4</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #64748b; display: block;">Install Scheduled</span>
              <span style="font-size: 0.7rem; color: #64748b;">Pending</span>
            </div>
          </div>
        </div>
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

    // Approve QA button
    const approveBtns = this.container.querySelectorAll('.btn-qa-approve');
    approveBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.MANAGER_APPROVAL,
          eventType: 'AUDIT_APPROVED',
          description: `Approved Ocular Audit ${rn}. Advanced status to READY_FOR_INSTALLATION.`,
          severity: AUDIT_SEVERITY.INFO
        });
        AppLayout.showToast(`Approved Audit QA for ${rn}`);
      });
    });

    // Reject QA button
    const rejectBtns = this.container.querySelectorAll('.btn-qa-reject');
    rejectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const reason = prompt('Enter technical re-inspection review reason:');
        if (!reason) return;
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.MANAGER_APPROVAL,
          eventType: 'REINSPECTION_REQUESTED',
          description: `Requested re-inspection for ${rn}. Reason: ${reason}`,
          severity: AUDIT_SEVERITY.WARNING
        });
        AppLayout.showToast(`Re-inspection requested for ${rn}`);
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

    // Client search button
    const searchBtn = this.container.querySelector('#btn-trigger-client-search');
    const searchInput = this.container.querySelector('#input-client-search');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        this.searchQuery = searchInput.value;
        AppLayout.showToast(`Searching client account: "${this.searchQuery}"`);
      });
    }
  }
}
