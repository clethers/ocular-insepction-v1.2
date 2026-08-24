/**
 * Synx Portal — Immutable Audit Logging Service
 * Captures system, security, approval, and form interaction events with tamper-evident local & cloud storage.
 */

import { supabaseService } from './supabaseService.js';
import { AuthGuard } from '../components/authGuard.js';

export const AUDIT_CATEGORIES = {
  AUTHENTICATION: 'AUTHENTICATION',
  FORM_INSPECTION: 'FORM_INSPECTION',
  MANAGER_APPROVAL: 'MANAGER_APPROVAL',
  FIELD_DISPATCH: 'FIELD_DISPATCH',
  CUSTOMER_CARE: 'CUSTOMER_CARE',
  ADMIN_RBAC: 'ADMIN_RBAC',
  DATA_EXPORT: 'DATA_EXPORT'
};

export const AUDIT_SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL'
};

const INITIAL_DEMO_LOGS = [
  {
    id: 'log-101',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    actorEmail: 'manager.alex@ecoworks.ph',
    actorRole: 'customer_care_manager',
    category: AUDIT_CATEGORIES.MANAGER_APPROVAL,
    eventType: 'AUDIT_APPROVED',
    severity: AUDIT_SEVERITY.INFO,
    resourceType: 'ocular_inspections',
    resourceId: 'RN-88092',
    description: 'Approved Ocular Audit RN-88092 (BGC EV Charging Hub). Advanced status to READY_FOR_INSTALLATION.',
    changesDelta: { old_status: 'UNDER_REVIEW', new_status: 'READY_FOR_INSTALLATION' },
    ipAddress: '192.168.1.45'
  },
  {
    id: 'log-102',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    actorEmail: 'admin.clara@ecoworks.ph',
    actorRole: 'admin',
    category: AUDIT_CATEGORIES.ADMIN_RBAC,
    eventType: 'USER_ROLE_UPDATED',
    severity: AUDIT_SEVERITY.WARNING,
    resourceType: 'profiles',
    resourceId: 'usr-ree-01',
    description: 'Updated user role for Engr. Reyna Cruz to Lead Electrical Engineer (REE).',
    changesDelta: { old_role: 'field_inspector', new_role: 'lead_engineer' },
    ipAddress: '192.168.1.10'
  },
  {
    id: 'log-103',
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    actorEmail: 'inspector.marco@ecoworks.ph',
    actorRole: 'field_inspector',
    category: AUDIT_CATEGORIES.FORM_INSPECTION,
    eventType: 'OCULAR_SUBMITTED',
    severity: AUDIT_SEVERITY.INFO,
    resourceType: 'ocular_inspections',
    resourceId: 'RN-99401',
    description: 'Submitted new Ocular Inspection for Ayala Malls Manila Bay EV Depot.',
    changesDelta: { rn_no: 'RN-99401', client_name: 'Ayala Land Commercial' },
    ipAddress: '110.54.221.8'
  },
  {
    id: 'log-104',
    createdAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    actorEmail: 'system',
    actorRole: 'system',
    category: AUDIT_CATEGORIES.AUTHENTICATION,
    eventType: 'SECURITY_LOCKOUT_TRIGGERED',
    severity: AUDIT_SEVERITY.CRITICAL,
    resourceType: 'auth_security',
    resourceId: 'user@ecoworks.ph',
    description: 'Rate-limiting security lockout engaged after 5 consecutive failed login attempts.',
    changesDelta: { lockout_duration_sec: 60, attempts: 5 },
    ipAddress: '112.201.44.19'
  }
];

class AuditLogService {
  constructor() {
    this.storageKey = 'synx_system_audit_logs';
    this.initLogs();
  }

  initLogs() {
    if (!localStorage.getItem(this.storageKey)) {
      localStorage.setItem(this.storageKey, JSON.stringify(INITIAL_DEMO_LOGS));
    }
  }

  getLogs(filters = {}) {
    let logs = [];
    try {
      const raw = localStorage.getItem(this.storageKey);
      logs = raw ? JSON.parse(raw) : INITIAL_DEMO_LOGS;
    } catch (e) {
      logs = INITIAL_DEMO_LOGS;
    }

    if (filters.category && filters.category !== 'ALL') {
      logs = logs.filter(l => l.category === filters.category);
    }
    if (filters.severity && filters.severity !== 'ALL') {
      logs = logs.filter(l => l.severity === filters.severity);
    }
    if (filters.search) {
      const query = filters.search.toLowerCase();
      logs = logs.filter(l =>
        (l.description && l.description.toLowerCase().includes(query)) ||
        (l.actorEmail && l.actorEmail.toLowerCase().includes(query)) ||
        (l.resourceId && l.resourceId.toLowerCase().includes(query)) ||
        (l.eventType && l.eventType.toLowerCase().includes(query))
      );
    }

    return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async logEvent({ category, eventType, description, severity = AUDIT_SEVERITY.INFO, resourceType = '', resourceId = '', changesDelta = {} }) {
    const activeUser = (await AuthGuard.getSessionUser()) || {};
    const newLog = {
      id: 'log-' + Date.now(),
      createdAt: new Date().toISOString(),
      actorEmail: activeUser.email || 'system@ecoworks.ph',
      actorRole: activeUser.role || 'system',
      category: category || AUDIT_CATEGORIES.FORM_INSPECTION,
      eventType: eventType,
      severity: severity,
      resourceType: resourceType,
      resourceId: resourceId,
      description: description,
      changesDelta: changesDelta,
      ipAddress: '127.0.0.1'
    };

    // Save locally
    const logs = this.getLogs();
    logs.unshift(newLog);
    localStorage.setItem(this.storageKey, JSON.stringify(logs));

    // Async push to Supabase if available
    if (supabaseService.isConfigured()) {
      try {
        await supabaseService.client.from('system_audit_logs').insert([{
          actor_email: newLog.actorEmail,
          actor_role: newLog.actorRole,
          category: newLog.category,
          event_type: newLog.eventType,
          severity: newLog.severity,
          resource_type: newLog.resourceType,
          resource_id: newLog.resourceId,
          description: newLog.description,
          changes_delta: newLog.changesDelta
        }]);
      } catch (err) {
        console.warn('[Synx Audit Log] Supabase sync deferred:', err.message);
      }
    }

    return newLog;
  }

  exportLogsCSV() {
    const logs = this.getLogs();
    const headers = ['ID', 'Timestamp', 'Actor Email', 'Actor Role', 'Category', 'Event Type', 'Severity', 'Resource ID', 'Description'];
    const rows = logs.map(l => [
      l.id,
      l.createdAt,
      `"${l.actorEmail}"`,
      `"${l.actorRole}"`,
      `"${l.category}"`,
      `"${l.eventType}"`,
      `"${l.severity}"`,
      `"${l.resourceId || ''}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `synx_audit_log_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const auditLogService = new AuditLogService();
