/**
 * Synx Portal — System Administrator Workspace Component (`adminWorkspace.js`)
 * Features User RBAC, Immutable Audit Logs, Master Data Catalog, System Dashboard, and Security Controls.
 */

import { userService, USER_ROLES, ROLE_LABELS } from '../services/userService.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { masterDataService } from '../services/masterDataService.js';
import { AppLayout } from './appLayout.js';

export class AdminWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dashboard'; // 'dashboard', 'users', 'audit', 'masterdata', 'integrations'
  }

  render() {
    this.container.innerHTML = `
      <div class="admin-workspace-wrapper" style="padding: 0;">
        
        <!-- Tab Content Target -->
        <div id="admin-tab-stage">
          ${this.renderTabStage()}
        </div>

      </div>
    `;

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'audit':
        return this.renderAuditLogsTab();
      case 'users':
        return this.renderUsersTab();
      case 'masterdata':
        return this.renderMasterDataTab();
      case 'integrations':
        return this.renderIntegrationsTab();
      case 'dashboard':
      default:
        return this.renderDashboardTab();
    }
  }

  // TAB 1: User & RBAC Management
  renderUsersTab() {
    const users = userService.getUsers();

    return `
      <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-xl);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div>
            <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin: 0;">User Management & Employee Account Directory</h3>
            <p style="font-size: 0.825rem; color: var(--text-muted); margin-top: 0.25rem;">Manage employee access, assign organizational roles, and enforce security status.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-add-user">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Provision New User
          </button>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); text-transform: uppercase; font-size: 0.725rem; letter-spacing: 0.05em;">
                <th style="padding: 0.75rem 1rem;">User Profile</th>
                <th style="padding: 0.75rem 1rem;">Email Address</th>
                <th style="padding: 0.75rem 1rem;">Role Scope</th>
                <th style="padding: 0.75rem 1rem;">Department</th>
                <th style="padding: 0.75rem 1rem;">Status</th>
                <th style="padding: 0.75rem 1rem; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => `
                <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s;" class="table-row-hover">
                  <td style="padding: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                      <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--ecoworks-blue); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">${u.initials || 'US'}</div>
                      <div>
                        <strong style="color: var(--text-primary); display: block;">${u.fullName}</strong>
                        <span style="font-size: 0.725rem; color: var(--text-muted);">ID: ${u.id}</span>
                      </div>
                    </div>
                  </td>
                  <td style="padding: 1rem; font-family: monospace; color: var(--text-secondary);">${u.email}</td>
                  <td style="padding: 1rem;">
                    <select class="form-select role-select-dropdown" data-userid="${u.id}" style="padding: 0.35rem 0.6rem; font-size: 0.775rem; font-weight: 600; border-radius: var(--radius-md);">
                      <option value="${USER_ROLES.FIELD_INSPECTOR}" ${u.role === USER_ROLES.FIELD_INSPECTOR ? 'selected' : ''}>Field Inspector</option>
                      <option value="${USER_ROLES.CUSTOMER_CARE_MANAGER}" ${u.role === USER_ROLES.CUSTOMER_CARE_MANAGER ? 'selected' : ''}>Customer Care & Ops Manager</option>
                      <option value="${USER_ROLES.LEAD_ENGINEER}" ${u.role === USER_ROLES.LEAD_ENGINEER ? 'selected' : ''}>Lead REE Engineer</option>
                      <option value="${USER_ROLES.ADMIN}" ${u.role === USER_ROLES.ADMIN ? 'selected' : ''}>System Admin</option>
                    </select>
                  </td>
                  <td style="padding: 1rem; color: var(--text-secondary);">${u.department || 'Operations'}</td>
                  <td style="padding: 1rem;">
                    <span style="display: inline-block; padding: 0.2rem 0.6rem; border-radius: var(--radius-full); font-size: 0.725rem; font-weight: 700; background: ${u.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)'}; color: ${u.status === 'ACTIVE' ? '#10B981' : '#F43F5E'}; border: 1px solid ${u.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'};">
                      ${u.status || 'ACTIVE'}
                    </span>
                  </td>
                  <td style="padding: 1rem; text-align: right;">
                    <button type="button" class="btn btn-secondary btn-toggle-user-status" data-userid="${u.id}" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">
                      ${u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // TAB 2: Immutable System Audit Logs
  renderAuditLogsTab() {
    const logs = auditLogService.getLogs();

    return `
      <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-xl);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <div>
            <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin: 0;">Audit Logs & Security Event Trail</h3>
            <p style="font-size: 0.825rem; color: var(--text-muted); margin-top: 0.25rem;">Append-only event log capturing authentication, approvals, dispatches, and form mutations.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-export-audit-csv">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Compliance CSV
          </button>
        </div>

        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.825rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em;">
                <th style="padding: 0.75rem 0.75rem;">Timestamp</th>
                <th style="padding: 0.75rem 0.75rem;">Actor Email</th>
                <th style="padding: 0.75rem 0.75rem;">Category</th>
                <th style="padding: 0.75rem 0.75rem;">Event Type</th>
                <th style="padding: 0.75rem 0.75rem;">Severity</th>
                <th style="padding: 0.75rem 0.75rem;">Resource</th>
                <th style="padding: 0.75rem 0.75rem;">Description</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.75rem; white-space: nowrap; color: var(--text-muted); font-size: 0.75rem;">${new Date(l.createdAt).toLocaleTimeString()} (${new Date(l.createdAt).toLocaleDateString()})</td>
                  <td style="padding: 0.75rem; font-family: monospace; color: var(--ecoworks-blue);">${l.actorEmail}</td>
                  <td style="padding: 0.75rem;"><span style="font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">${l.category}</span></td>
                  <td style="padding: 0.75rem; font-weight: 700; color: var(--text-primary);">${l.eventType}</td>
                  <td style="padding: 0.75rem;">
                    <span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 800; background: ${l.severity === 'CRITICAL' ? 'rgba(244, 63, 94, 0.2)' : l.severity === 'WARNING' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0, 174, 239, 0.15)'}; color: ${l.severity === 'CRITICAL' ? '#F43F5E' : l.severity === 'WARNING' ? '#F59E0B' : '#00AEEF'};">
                      ${l.severity}
                    </span>
                  </td>
                  <td style="padding: 0.75rem; font-family: monospace; color: var(--text-muted);">${l.resourceId || 'N/A'}</td>
                  <td style="padding: 0.75rem; color: var(--text-secondary); max-width: 320px;">${l.description}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // TAB: System Health & Inspector Output Analytics Dashboard
  renderDashboardTab() {
    return `
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">
        
        <!-- Inspector Output Pipeline KPI Cards (Installed, Pending, Cancelled, Pass Rate) -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem;">
          
          <!-- Card 1: INSTALLED -->
          <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 0.75rem; font-weight: 800; color: #10B981; text-transform: uppercase; letter-spacing: 0.05em;">Installed & Commissioned</span>
              <span style="font-size: 0.7rem; font-weight: 700; color: #10B981; background: rgba(16, 185, 129, 0.12); padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">+14.2%</span>
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: #10B981; margin-top: 0.35rem; letter-spacing: -0.02em;">580</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
              40.5% of Total Sites • Handover Certified
            </div>
          </div>

          <!-- Card 2: PENDING INSTALLATION (Successful Ocular Conducted) -->
          <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border: 1px solid rgba(0, 174, 239, 0.3); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 0.75rem; font-weight: 800; color: var(--ecoworks-blue); text-transform: uppercase; letter-spacing: 0.05em;">Pending Installation</span>
              <span style="font-size: 0.7rem; font-weight: 700; color: var(--ecoworks-blue); background: rgba(0, 174, 239, 0.12); padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">Active Queue</span>
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: var(--ecoworks-blue); margin-top: 0.35rem; letter-spacing: -0.02em;">840</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
              56.5% • <strong>Successful Oculars Conducted</strong>
            </div>
          </div>

          <!-- Card 3: CANCELLED -->
          <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border: 1px solid rgba(244, 63, 94, 0.3); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 0.75rem; font-weight: 800; color: #F43F5E; text-transform: uppercase; letter-spacing: 0.05em;">Cancelled Sites</span>
              <span style="font-size: 0.7rem; font-weight: 700; color: #F43F5E; background: rgba(244, 63, 94, 0.12); padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">3.0% Rate</span>
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: #F43F5E; margin-top: 0.35rem; letter-spacing: -0.02em;">42</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem;">
              Permit / Capacity / Client Cancellation
            </div>
          </div>

          <!-- Card 4: OCULAR CONVERSION RATE -->
          <div class="form-card" style="padding: 1.25rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <span style="font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Ocular Conversion Rate</span>
              <span style="font-size: 0.7rem; font-weight: 700; color: #10B981; background: rgba(16, 185, 129, 0.12); padding: 0.2rem 0.5rem; border-radius: var(--radius-full);">Optimal</span>
            </div>
            <div style="font-size: 2.2rem; font-weight: 800; color: var(--text-primary); margin-top: 0.35rem; letter-spacing: -0.02em;">97.0%</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.35rem; display: flex; justify-content: space-between;">
              <span>(Installed + Pending) / Total</span>
              <span style="color: #10B981; font-weight: 700;">Target &gt; 92%</span>
            </div>
          </div>

        </div>

        <!-- "What's Next" Analytics & Lead Conversion Velocity Chart -->
        <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.725rem; font-weight: 800; padding: 0.25rem 0.6rem; border-radius: var(--radius-full); text-transform: uppercase;">
                  What's Next Analytics
                </span>
                <h3 style="font-weight: 800; font-size: 1.15rem; color: var(--text-primary); margin: 0;">Leads Conversion & Pipeline Velocity</h3>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.25rem 0 0 0;">
                Track incoming client leads, field audit throughput, and upcoming installation completion trajectory.
              </p>
            </div>

            <!-- Timeframe Filter Toggles: Day, Month, Year -->
            <div style="display: flex; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 0.25rem; gap: 0.25rem;" id="whatsnext-timeframe-group">
              <button type="button" class="btn btn-analytics-tf ${this.analyticsTimeframe === 'day' ? 'active' : ''}" data-tf="day" style="padding: 0.35rem 0.85rem; font-size: 0.775rem; font-weight: 700; border-radius: var(--radius-md); ${this.analyticsTimeframe === 'day' ? 'background: var(--ecoworks-blue); color: #fff;' : 'background: transparent; color: var(--text-muted);'} border: none; cursor: pointer; transition: all 0.2s;">
                Day (24h)
              </button>
              <button type="button" class="btn btn-analytics-tf ${this.analyticsTimeframe === 'month' ? 'active' : ''}" data-tf="month" style="padding: 0.35rem 0.85rem; font-size: 0.775rem; font-weight: 700; border-radius: var(--radius-md); ${this.analyticsTimeframe === 'month' ? 'background: var(--ecoworks-blue); color: #fff;' : 'background: transparent; color: var(--text-muted);'} border: none; cursor: pointer; transition: all 0.2s;">
                Month (30d)
              </button>
              <button type="button" class="btn btn-analytics-tf ${this.analyticsTimeframe === 'year' ? 'active' : ''}" data-tf="year" style="padding: 0.35rem 0.85rem; font-size: 0.775rem; font-weight: 700; border-radius: var(--radius-md); ${this.analyticsTimeframe === 'year' ? 'background: var(--ecoworks-blue); color: #fff;' : 'background: transparent; color: var(--text-muted);'} border: none; cursor: pointer; transition: all 0.2s;">
                Year (12m)
              </button>
            </div>
          </div>

          <!-- Chart & Forecast Grid -->
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem; align-items: stretch;" class="whats-next-grid">
            
            <!-- SVG Analytics Visual Chart -->
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
              ${this.renderWhatsNextSvgChart()}
            </div>

            <!-- Pipeline Breakdown Metrics Panel -->
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              ${this.renderWhatsNextForecastMetrics()}
            </div>

          </div>
        </div>

      </div>
    `;
  }

  // Generates interactive SVG trend chart for Day, Month, or Year analytics
  renderWhatsNextSvgChart() {
    const tf = (this.analyticsTimeframe || 'month').toString().toLowerCase();
    
    let labels = [];
    let bars = [];
    let title = '';
    let subtitle = '';

    if (tf === 'day') {
      title = '24-Hour Lead Intake & Inspection Velocity';
      subtitle = 'Peak intake hours: 09:00 - 14:00 • 28 New Leads Ingested Today';
      labels = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '23:59'];
      bars = [
        { label: '00:00', val: 2, height: 15, color: 'var(--ecoworks-blue)' },
        { label: '04:00', val: 1, height: 10, color: 'var(--ecoworks-blue)' },
        { label: '08:00', val: 6, height: 50, color: '#10B981' },
        { label: '12:00', val: 10, height: 85, color: '#10B981' },
        { label: '16:00', val: 7, height: 60, color: 'var(--ecoworks-blue)' },
        { label: '20:00', val: 2, height: 20, color: 'var(--ecoworks-blue)' },
        { label: '23:59', val: 0, height: 5, color: 'var(--text-muted)' }
      ];
    } else if (tf === 'year') {
      title = '12-Month Annual Lead Trajectory & Forecast';
      subtitle = 'Annual Cumulative Leads: 1,462 • +24.8% YoY Growth Rate';
      labels = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];
      bars = [
        { label: 'Q1', val: 310, height: 45, color: 'var(--ecoworks-blue)' },
        { label: 'Q2', val: 380, height: 65, color: 'var(--ecoworks-blue)' },
        { label: 'Q3', val: 420, height: 78, color: '#10B981' },
        { label: 'Q4 (Proj)', val: 352, height: 60, color: '#F59E0B' }
      ];
    } else {
      // Default: Month (30d)
      title = '30-Day Lead Conversion & Pipeline Velocity';
      subtitle = 'Current Month Total: 340 Leads • 210 Ocular Audits Completed';
      labels = ['W1 (1-7)', 'W2 (8-14)', 'W3 (15-21)', 'W4 (22-30)'];
      bars = [
        { label: 'Week 1', val: 75, height: 50, color: 'var(--ecoworks-blue)' },
        { label: 'Week 2', val: 92, height: 75, color: 'var(--ecoworks-blue)' },
        { label: 'Week 3', val: 110, height: 90, color: '#10B981' },
        { label: 'Week 4', val: 63, height: 45, color: '#F59E0B' }
      ];
    }

    return `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div>
            <strong style="color: var(--text-primary); font-size: 0.9rem; font-weight: 700;">${title}</strong>
            <span style="display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">${subtitle}</span>
          </div>
          <div style="display: flex; gap: 0.75rem; font-size: 0.725rem; font-weight: 700;">
            <span style="color: #10B981; display: flex; align-items: center; gap: 0.35rem;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; display: inline-block;"></span>
              Converted
            </span>
            <span style="color: var(--ecoworks-blue); display: flex; align-items: center; gap: 0.35rem;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--ecoworks-blue); display: inline-block;"></span>
              In Progress
            </span>
          </div>
        </div>

        <!-- SVG Visual Chart Bars -->
        <div style="height: 160px; width: 100%; display: flex; align-items: flex-end; justify-content: space-around; padding-top: 1rem; border-bottom: 1px dashed var(--border-color); gap: 0.75rem;">
          ${bars.map(b => `
            <div style="display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; flex: 1;">
              <span style="font-size: 0.7rem; font-weight: 800; color: ${b.color}; margin-bottom: 0.35rem;">${b.val}</span>
              <div style="width: 100%; max-width: 44px; height: ${b.height}%; background: ${b.color}; border-radius: 6px 6px 0 0; opacity: 0.9; transition: height 0.4s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></div>
            </div>
          `).join('')}
        </div>

        <!-- Axis Labels -->
        <div style="display: flex; justify-content: space-around; font-size: 0.725rem; color: var(--text-muted); margin-top: 0.6rem; font-weight: 600;">
          ${labels.map(l => `<span>${l}</span>`).join('')}
        </div>
      </div>
    `;
  }

  // Generates right panel forecast metrics based on timeframe selection
  renderWhatsNextForecastMetrics() {
    const tf = (this.analyticsTimeframe || 'month').toString().toLowerCase();

    let incoming = '28';
    let audits = '18';
    let handovers = '12';
    let targetMsg = 'Target: >15 Dispatches / day';

    if (tf === 'month') {
      incoming = '340';
      audits = '210';
      handovers = '145';
      targetMsg = 'Target: >120 Handovers / mo';
    } else if (tf === 'year') {
      incoming = '1,462';
      audits = '890';
      handovers = '580';
      targetMsg = 'Target: >500 Installs / yr';
    }

    return `
      <!-- Card A: Incoming Leads -->
      <div style="padding: 0.85rem 1rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Incoming New Leads</span>
          <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.7rem; font-weight: 700;">${tf.toUpperCase()}</span>
        </div>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--ecoworks-blue); margin-top: 0.15rem;">${incoming}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">Residential & Commercial Leads Ingested</div>
      </div>

      <!-- Card B: Scheduled Audits -->
      <div style="padding: 0.85rem 1rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Scheduled Ocular Audits</span>
          <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; font-size: 0.7rem; font-weight: 700;">PIPELINE</span>
        </div>
        <div style="font-size: 1.5rem; font-weight: 800; color: #F59E0B; margin-top: 0.15rem;">${audits}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">Dispatched & Conducted Audits</div>
      </div>

      <!-- Card C: Commissioning Handovers -->
      <div style="padding: 0.85rem 1rem; background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: var(--radius-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Commissioned Handovers</span>
          <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.7rem; font-weight: 700;">PASSED</span>
        </div>
        <div style="font-size: 1.5rem; font-weight: 800; color: #10B981; margin-top: 0.15rem;">${handovers}</div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.15rem;">${targetMsg}</div>
      </div>
    `;
  }

  // TAB 4: Master Data Catalog
  renderMasterDataTab() {
    const catalog = masterDataService.getCatalog();

    return `
      <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 1rem;">Equipment & EV Infrastructure Master Catalog</h3>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
          <div>
            <strong style="color: var(--ecoworks-blue); font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">EV Charger Preset Models</strong>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.825rem;">
              ${catalog.chargers.map(c => `
                <li style="padding: 0.6rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                  <span><strong>${c.name}</strong></span>
                  <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.7rem; font-weight: 700;">${c.capacity}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div>
            <strong style="color: var(--ecoworks-blue); font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Standard Circuit Breakers Catalog</strong>
            <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.825rem;">
              ${catalog.breakers.map(b => `
                <li style="padding: 0.6rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
                  <span>${b.brand} (${b.mounting})</span>
                  <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.7rem; font-weight: 700;">${b.rating}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  // TAB 5: Webhooks & Cloud API
  renderIntegrationsTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 1rem;">External Systems & SMS Gateway Integrations</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">Configured cloud webhooks for external enterprise ERPs and SMS providers.</p>
        
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="padding: 1rem; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: var(--text-primary);">Semaphore Philippine SMS Gateway API</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Dispatches automated inspector ETA text alerts to residential clients.</span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--radius-full);">CONNECTED</span>
          </div>

          <div style="padding: 1rem; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong style="color: var(--text-primary);">SAP Enterprise ERP Webhook Sync</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Syncs approved commissioning certificates and material pick-lists.</span>
            </div>
            <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--radius-full);">ACTIVE WEBHOOK</span>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Analytics Timeframe Buttons (Day, Month, Year)
    const analyticsTfBtns = this.container.querySelectorAll('.btn-analytics-tf');
    analyticsTfBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.getAttribute('data-tf');
        if (tf && this.analyticsTimeframe !== tf) {
          this.analyticsTimeframe = tf;
          this.render();
          AppLayout.showToast(`Updated analytics view to ${tf.toUpperCase()}`);
        }
      });
    });

    // Tab Switching Buttons
    const tabBtns = this.container.querySelectorAll('.admin-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.getAttribute('data-tab');
        this.render();
      });
    });

    // Toggle user status
    const statusBtns = this.container.querySelectorAll('.btn-toggle-user-status');
    statusBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const userId = btn.getAttribute('data-userid');
        userService.toggleUserStatus(userId);
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.ADMIN_RBAC,
          eventType: 'USER_STATUS_TOGGLED',
          description: `Admin toggled status for user ID ${userId}`,
          severity: AUDIT_SEVERITY.WARNING
        });
        AppLayout.showToast('User status updated successfully.');
        this.render();
      });
    });

    // Update user role dropdown
    const roleSelects = this.container.querySelectorAll('.role-select-dropdown');
    roleSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const userId = select.getAttribute('data-userid');
        const newRole = e.target.value;
        userService.updateUserRole(userId, newRole);
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.ADMIN_RBAC,
          eventType: 'USER_ROLE_UPDATED',
          description: `Updated role for user ID ${userId} to ${newRole}`,
          severity: AUDIT_SEVERITY.WARNING
        });
        AppLayout.showToast(`Updated user role to ${newRole}`);
      });
    });

    // Add user button
    const addUserBtn = this.container.querySelector('#btn-add-user');
    if (addUserBtn) {
      addUserBtn.addEventListener('click', () => {
        const name = prompt('Enter New Employee Full Name (e.g. Engr. Daniel Cruz):');
        if (!name) return;
        const email = prompt('Enter Employee Email Address:');
        if (!email) return;
        const newUser = userService.createUser({ fullName: name, email: email, role: USER_ROLES.FIELD_INSPECTOR });
        auditLogService.logEvent({
          category: AUDIT_CATEGORIES.ADMIN_RBAC,
          eventType: 'USER_ACCOUNT_CREATED',
          description: `Provisioned new user account for ${name} (${email})`,
          severity: AUDIT_SEVERITY.INFO
        });
        AppLayout.showToast(`Provisioned account for ${name}`);
        this.render();
      });
    }

    // Export CSV Audit Trail
    const exportCsvBtn = this.container.querySelector('#btn-export-audit-csv');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        auditLogService.exportLogsCSV();
        AppLayout.showToast('Exported audit trail CSV report.');
      });
    }

    // Refresh Data button
    const refreshBtn = this.container.querySelector('#btn-refresh-admin');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.render();
        AppLayout.showToast('Refreshed admin dataset.');
      });
    }
  }
}
