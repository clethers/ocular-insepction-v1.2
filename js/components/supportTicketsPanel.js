/**
 * OIMS — Support Tickets Panel (`supportTicketsPanel.js`)
 * Shared, Supabase-backed support ticket list + filing form, mounted by
 * both the Manager Workspace (Customer Care — can resolve tickets) and
 * the Inspector Workspace (field inspectors / Operations Team accounts —
 * can file tickets, but resolving is Customer Care's call).
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { escapeHTML } from '../utils/security.js';

export class SupportTicketsPanel {
  constructor(container, { canResolve = false } = {}) {
    this.container = container;
    this.canResolve = canResolve;
    this.tickets = [];
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    try {
      this.tickets = await supabaseService.fetchSupportTickets();
    } catch (e) {
      console.warn('[OIMS] Could not fetch support tickets:', e);
      this.tickets = [];
    }
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0;">Support Tickets & Escalations</h3>
          <button type="button" class="btn btn-primary" id="btn-new-ticket" style="padding: 0.5rem 0.85rem; font-size: 0.8rem;">+ New Ticket</button>
        </div>

        <div id="tickets-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading support tickets...</div>
        </div>
      </div>

      <!-- New Support Ticket Overlay -->
      <div class="modal-overlay no-print" id="new-ticket-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 460px;">
          <div id="new-ticket-content"></div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const newTicketBtn = this.container.querySelector('#btn-new-ticket');
    if (newTicketBtn) {
      newTicketBtn.addEventListener('click', () => this.openNewTicketOverlay());
    }

    const overlay = this.container.querySelector('#new-ticket-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeNewTicketOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#new-ticket-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeNewTicketOverlay();
    });
  }

  renderList() {
    const listEl = this.container.querySelector('#tickets-list');
    if (!listEl) return;

    if (this.tickets.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No support tickets logged yet.</div>`;
      return;
    }

    const priorityColors = {
      HIGH: { bg: 'rgba(245, 158, 11, 0.2)', color: '#D97706' },
      NORMAL: { bg: 'rgba(0, 174, 239, 0.15)', color: 'var(--ecoworks-blue)' },
      LOW: { bg: '#f1f5f9', color: '#64748b' }
    };

    const renderTicketCard = (ticket) => {
      const p = priorityColors[ticket.priority] || priorityColors.NORMAL;
      return `
        <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <strong style="color: #0f172a;">${escapeHTML(ticket.subject)}</strong>
              <span class="badge" style="background: ${p.bg}; color: ${p.color}; font-size: 0.7rem; font-weight: 800;">${ticket.priority === 'HIGH' ? 'HIGH PRIORITY' : ticket.priority}</span>
              ${ticket.status === 'RESOLVED' ? '<span class="badge" style="background: #dcfce7; color: #15803d; font-size: 0.7rem; font-weight: 800;">RESOLVED</span>' : ''}
            </div>
            <span style="font-size: 0.775rem; color: #64748b; display: block; margin-top: 0.25rem;">
              ${ticket.clientName ? `Client: ${escapeHTML(ticket.clientName)}` : ''}${ticket.clientName && ticket.rnNo ? ' | ' : ''}${ticket.rnNo ? `RN: ${escapeHTML(ticket.rnNo)}` : ''}
              ${ticket.description ? `${(ticket.clientName || ticket.rnNo) ? ' — ' : ''}${escapeHTML(ticket.description)}` : ''}
            </span>
          </div>
          ${this.canResolve && ticket.status !== 'RESOLVED' ? `<button type="button" class="btn btn-secondary btn-resolve-ticket" data-id="${ticket.id}" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">Resolve Ticket</button>` : ''}
        </div>
      `;
    };

    const openTickets = this.tickets.filter(t => t.status !== 'RESOLVED');
    const resolvedTickets = this.tickets.filter(t => t.status === 'RESOLVED');

    listEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${openTickets.map(renderTicketCard).join('')}
        ${resolvedTickets.map(renderTicketCard).join('')}
      </div>
    `;

    if (this.canResolve) {
      listEl.querySelectorAll('.btn-resolve-ticket').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.resolveSupportTicket(id, btn);
        });
      });
    }
  }

  openNewTicketOverlay() {
    const overlay = this.container.querySelector('#new-ticket-overlay');
    const content = this.container.querySelector('#new-ticket-content');
    if (!overlay || !content) return;

    content.innerHTML = `
      <h3 class="modal-title">New Support Ticket</h3>
      <p class="modal-subtitle">Log a client support ticket or escalation.</p>

      <div class="form-group">
        <label class="form-label">Subject</label>
        <input type="text" class="form-input" id="ticket-subject" placeholder="e.g. Charger Specification Upgrade Request" />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="ticket-description" rows="3" placeholder="Details of the ticket or escalation"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Priority</label>
        <select class="form-select" id="ticket-priority">
          <option value="HIGH">High</option>
          <option value="NORMAL" selected>Normal</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Client Name <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="ticket-client-name" placeholder="e.g. Forbes Park Residence" />
      </div>

      <div class="form-group">
        <label class="form-label">RN Number <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="ticket-rn-no" placeholder="e.g. RN-88107" />
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-new-ticket">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-new-ticket">Create Ticket</button>
      </div>
    `;

    content.querySelector('#btn-cancel-new-ticket').addEventListener('click', () => this.closeNewTicketOverlay());
    content.querySelector('#btn-confirm-new-ticket').addEventListener('click', (e) => this.confirmCreateTicket(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeNewTicketOverlay() {
    const overlay = this.container.querySelector('#new-ticket-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmCreateTicket(btn) {
    const content = this.container.querySelector('#new-ticket-content');
    const subject = content.querySelector('#ticket-subject').value.trim();
    if (!subject) {
      AppLayout.showToast('Subject is required.');
      return;
    }

    const description = content.querySelector('#ticket-description').value.trim();
    const priority = content.querySelector('#ticket-priority').value;
    const clientName = content.querySelector('#ticket-client-name').value.trim();
    const rnNo = content.querySelector('#ticket-rn-no').value.trim();

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      const user = await AuthGuard.getSessionUser();
      const ticket = await supabaseService.createSupportTicket({
        subject,
        description: description || null,
        priority,
        clientName: clientName || null,
        rnNo: rnNo || null,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CUSTOMER_CARE,
        eventType: 'TICKET_CREATED',
        description: `Logged client support ticket: ${subject}`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.tickets.unshift(ticket);
      this.closeNewTicketOverlay();
      AppLayout.showToast('Support ticket logged successfully.');
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not create support ticket:', e);
      AppLayout.showToast('Could not create ticket — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Create Ticket';
    }
  }

  async resolveSupportTicket(id, btn) {
    if (!this.canResolve) return;
    btn.disabled = true;
    btn.textContent = 'Resolving...';

    try {
      const user = await AuthGuard.getSessionUser();
      await supabaseService.resolveSupportTicket(id, user?.id || null);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CUSTOMER_CARE,
        eventType: 'TICKET_RESOLVED',
        description: `Resolved support ticket ${id}`,
        severity: AUDIT_SEVERITY.INFO
      });
      const ticket = this.tickets.find(t => t.id === id);
      if (ticket) {
        ticket.status = 'RESOLVED';
        ticket.resolvedAt = new Date().toISOString();
        ticket.resolvedBy = user?.id || null;
      }
      AppLayout.showToast('Ticket resolved.');
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not resolve support ticket:', e);
      AppLayout.showToast('Could not resolve ticket — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Resolve Ticket';
    }
  }
}
