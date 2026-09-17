/**
 * OIMS — Field Inspector Workspace Component (`inspectorWorkspace.js`)
 * Single-page workspace for Inspectors anchoring Ocular Form, Ready Queue, Installation Form, and Drafts in-place.
 */

import { OcularForm } from '../forms/ocularForm.js';
import { ReadyList } from './readyList.js';
import { AssignedInspectionsList } from './assignedInspectionsList.js';
import { InstallationForm } from '../forms/installationForm.js';
import { FormStorage } from './formStorage.js';
import { AuthGuard } from './authGuard.js';
import { supabaseService } from '../services/supabaseService.js';
import { SupportTicketsPanel } from './supportTicketsPanel.js';
import { AppLayout } from './appLayout.js';
import { flushPendingQueue } from '../services/syncQueue.js';

export class InspectorWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = this.resolveInitialTab();
  }

  resolveInitialTab() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/assigned')) return 'assigned';
    if (path.includes('/ready')) return 'ready';
    if (path.includes('/installation')) return 'installation';
    if (path.includes('/history')) return 'history';
    if (path.includes('/tickets')) return 'tickets';
    return 'ocular';
  }

  render() {
    this.container.innerHTML = `
      <div class="inspector-workspace-wrapper" style="padding: 0.5rem 0;">
        <!-- Stage Container -->
        <div id="inspector-tab-stage"></div>
      </div>
    `;

    this.updateHeaderTitleAndSidebar();
    this.renderTabStage();
    this.renderPendingSyncBadge();

    // In case connectivity returned while this tab/app instance was
    // already open and the 'online' event was missed (e.g. it fired
    // before this instance mounted) — catch up here too.
    flushPendingQueue().then(() => {
      this.renderPendingSyncBadge();
      if (this.activeTab === 'history') this.renderTabStage();
    });
  }

  renderPendingSyncBadge() {
    const titleGroup = document.querySelector('.top-view-title-group');
    if (!titleGroup) return;

    const count = FormStorage.countPending();
    let badge = document.getElementById('pending-sync-badge');

    if (count === 0) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'pending-sync-badge';
      badge.className = 'badge';
      badge.title = 'Click to sync now';
      badge.style.cssText = 'margin-left: 0.6rem; cursor: pointer; background: rgba(245, 158, 11, 0.15); color: #d97706; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.5rem; vertical-align: middle;';
      badge.addEventListener('click', () => this.syncPendingNow());
      titleGroup.appendChild(badge);
    }
    badge.textContent = `${count} PENDING SYNC`;
  }

  async syncPendingNow() {
    const badge = document.getElementById('pending-sync-badge');
    if (badge) badge.textContent = 'SYNCING…';

    const result = await flushPendingQueue();

    this.renderPendingSyncBadge();
    if (this.activeTab === 'history') this.renderTabStage();

    if (result.synced || result.failed) {
      const parts = [];
      if (result.synced) parts.push(`Synced ${result.synced}`);
      if (result.failed) parts.push(`${result.failed} still pending (will retry automatically)`);
      AppLayout.showToast(parts.join(' — ') + '.');
    } else if (!navigator.onLine) {
      AppLayout.showToast('Still offline — will sync automatically once connection returns.');
    }
  }

  updateHeaderTitleAndSidebar() {
    const titleMap = {
      ocular: 'Ocular Inspection Form',
      assigned: 'Assigned Inspections Queue',
      ready: 'Ready for Installation Queue',
      installation: 'Installation Handover Certificate',
      history: 'Saved Form Drafts & Repositories',
      tickets: 'Support Tickets'
    };

    const headerTitle = document.getElementById('view-page-title');
    if (headerTitle && titleMap[this.activeTab]) {
      headerTitle.textContent = titleMap[this.activeTab];
    }

    // Update active sidebar nav button highlighting
    const navBtns = document.querySelectorAll('.sidebar-nav-btn');
    navBtns.forEach(btn => {
      const href = btn.getAttribute('href') || '';
      const targetTab = this.activeTab === 'ocular' ? '/ocular' : `/ocular/${this.activeTab}`;
      if (href === targetTab) {
        btn.classList.add('active');
      } else if (href.startsWith('/ocular')) {
        btn.classList.remove('active');
      }
    });
  }

  renderTabStage() {
    const stage = this.container.querySelector('#inspector-tab-stage');
    if (!stage) return;

    stage.innerHTML = '';

    switch (this.activeTab) {
      case 'assigned': {
        const assignedView = new AssignedInspectionsList(stage, (selectedInspection) => {
          this.activeTab = 'ocular';
          this.selectedAssignedInspection = selectedInspection;
          if (selectedInspection) {
            try {
              sessionStorage.setItem('oims_selected_assigned_inspection', JSON.stringify(selectedInspection));
            } catch (e) {
              console.warn('[OIMS] Could not store selected assigned inspection:', e);
            }
          }
          // Router.navigate() below fully re-renders the page (a fresh
          // InspectorWorkspace instance via AppLayout.init), so it alone
          // is the render that reaches the screen. Deliberately NOT also
          // calling updateHeaderTitleAndSidebar()/renderTabStage() here
          // synchronously on this (soon-discarded) instance — that used
          // to run first, consume+clear the sessionStorage payload for a
          // render nobody ever saw, leaving the real one empty. See the
          // 'ocular' case below for the single point the payload is read.
          import('../router.js').then(({ Router }) => Router.navigate('/ocular'));
        });
        assignedView.render();
        break;
      }
      case 'ready': {
        const readyView = new ReadyList(stage, (selectedItem) => {
          this.activeTab = 'installation';
          this.selectedOcularData = selectedItem;
          if (selectedItem) {
            try {
              sessionStorage.setItem('oims_selected_installation', JSON.stringify(selectedItem));
            } catch (e) {
              console.warn('[OIMS] Could not store selected installation item:', e);
            }
          }
          import('../router.js').then(({ Router }) => Router.navigate('/ocular/installation'));
          this.updateHeaderTitleAndSidebar();
          this.renderTabStage();
        });
        readyView.render();
        break;
      }
      case 'installation': {
        let ocularData = this.selectedOcularData;
        if (!ocularData) {
          try {
            const stored = sessionStorage.getItem('oims_selected_installation');
            if (stored) ocularData = JSON.parse(stored);
          } catch (e) {
            console.warn('[OIMS] Could not retrieve stored installation item:', e);
          }
        }
        const installView = new InstallationForm(stage, ocularData);
        installView.render();
        break;
      }
      case 'history': {
        this.renderHistoryStage(stage);
        break;
      }
      case 'tickets': {
        const ticketsView = new SupportTicketsPanel(stage, { canResolve: false });
        ticketsView.render();
        break;
      }
      case 'ocular':
      default: {
        const ocularView = new OcularForm(stage);
        ocularView.render();

        let assignedData = this.selectedAssignedInspection;
        if (!assignedData) {
          try {
            const stored = sessionStorage.getItem('oims_selected_assigned_inspection');
            if (stored) assignedData = JSON.parse(stored);
          } catch (e) {
            console.warn('[OIMS] Could not retrieve stored assigned inspection:', e);
          }
        }
        if (assignedData) {
          this.selectedAssignedInspection = null;
          // Clear it here — this is now the only render path that ever
          // consumes it (the 'assigned' case above no longer also
          // renders synchronously), so it's safe to remove once applied.
          // Without this, every later visit to the Ocular tab (a plain
          // sidebar click, browser back, a reload) would keep silently
          // re-populating this same stale record into a fresh, unrelated
          // inspection, since populateFormData's {silent:true} gives no
          // visible warning that it happened.
          try {
            sessionStorage.removeItem('oims_selected_assigned_inspection');
          } catch (e) {
            console.warn('[OIMS] Could not clear stored assigned inspection:', e);
          }
          ocularView.populateFormData(assignedData, { silent: true });
        }
        break;
      }
    }
  }

  async renderHistoryStage(stage) {
    const drafts = FormStorage.listDrafts() || [];
    const pending = FormStorage.listPending() || [];

    let submissions = [];
    try {
      const user = await AuthGuard.getSessionUser();
      if (user) {
        submissions = await supabaseService.fetchMySubmittedInspections(user.id);
      }
    } catch (e) {
      console.warn('[OIMS] Could not fetch submitted inspections:', e);
    }

    // Bail if the tab changed while the fetch above was in flight.
    if (this.activeTab !== 'history') return;

    stage.innerHTML = `
      ${pending.length > 0 ? `
        <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); margin-bottom: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a;">Pending Sync (Offline)</h3>
            <button type="button" class="btn btn-secondary btn-sync-all-pending">Sync Now</button>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${pending.map(entry => `
              <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <strong style="color: #0f172a;">${entry.payload?.clientName || 'Client'}</strong>
                    <span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #d97706; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.5rem;">
                      ${entry.formType === 'installation_record' ? 'INSTALLATION' : 'OCULAR'}
                    </span>
                  </div>
                  <span style="font-size: 0.775rem; color: #64748b; display: block; margin-top: 0.15rem;">RN: ${entry.payload?.rnNo || 'N/A'} &middot; Queued ${new Date(entry.queuedAt).toLocaleString()}</span>
                  ${entry.attempts > 0 ? `<span style="font-size: 0.775rem; color: #e11d48; display: block; margin-top: 0.25rem;">Last attempt failed: ${entry.lastError || 'unknown error'}</span>` : ''}
                </div>
                <button type="button" class="btn btn-secondary btn-sync-all-pending">Retry Now</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${submissions.length > 0 ? `
        <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); margin-bottom: 1.25rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 1rem;">My Submitted Inspections</h3>
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${submissions.map(item => `
              <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <strong style="color: #0f172a;">${item.clientName || 'Client'}</strong>
                    <span class="badge" style="background: ${item.status === 'RE_INSPECTION_REQUESTED' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${item.status === 'RE_INSPECTION_REQUESTED' ? '#e11d48' : '#d97706'}; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.5rem;">
                      ${item.status === 'RE_INSPECTION_REQUESTED' ? 'RE-INSPECTION REQUESTED' : 'PENDING QA REVIEW'}
                    </span>
                  </div>
                  <span style="font-size: 0.775rem; color: #64748b; display: block; margin-top: 0.15rem;">RN: ${item.rnNo || 'N/A'}</span>
                  ${item.status === 'RE_INSPECTION_REQUESTED' && item.qaNotes ? `<span style="font-size: 0.775rem; color: #e11d48; display: block; margin-top: 0.25rem;">Customer Care: "${item.qaNotes}"</span>` : ''}
                </div>
                ${item.status === 'RE_INSPECTION_REQUESTED' ? `<button type="button" class="btn btn-secondary btn-resume-submission" data-rn="${item.rnNo}">Resume & Resubmit</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 1rem;">Saved Form Drafts & Local Repositories</h3>
        ${drafts.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${drafts.map(d => `
              <div style="padding: 1rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(15, 23, 42, 0.03);">
                <div>
                  <strong style="color: #0f172a;">${d.id}</strong>
                  <span style="font-size: 0.775rem; color: #64748b; display: block;">Last autosaved: ${new Date(d.updatedAt).toLocaleString()}</span>
                </div>
                <button type="button" class="btn btn-secondary btn-load-draft" data-formid="${d.id}">Load Draft</button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No saved local drafts found. Autosaved form drafts will appear here.
          </div>
        `}
      </div>
    `;

    const resumeBtns = stage.querySelectorAll('.btn-resume-submission');
    resumeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const item = submissions.find(i => i.rnNo === rn);
        if (!item) return;
        try {
          sessionStorage.setItem('oims_resume_ocular', JSON.stringify(item));
        } catch (e) {
          console.warn('[OIMS] Could not stash resume payload:', e);
        }
        import('../router.js').then(({ Router }) => Router.navigate('/ocular'));
      });
    });

    const loadBtns = stage.querySelectorAll('.btn-load-draft');
    loadBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const formId = btn.getAttribute('data-formid');
        const draftData = FormStorage.loadDraft(formId);
        try {
          if (draftData) sessionStorage.setItem('oims_resume_ocular', JSON.stringify(draftData.data));
        } catch (e) {
          console.warn('[OIMS] Could not stash draft resume payload:', e);
        }
        import('../router.js').then(({ Router }) => Router.navigate('/ocular'));
      });
    });

    const syncBtns = stage.querySelectorAll('.btn-sync-all-pending');
    syncBtns.forEach(btn => {
      btn.addEventListener('click', () => this.syncPendingNow());
    });
  }
}
