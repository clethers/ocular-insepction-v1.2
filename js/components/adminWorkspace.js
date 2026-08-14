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
  }  // TAB 3: System Health & Inspector Output Analytics Dashboard
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
