/**
 * Synx Portal — Field Inspector Workspace Component (`inspectorWorkspace.js`)
 * Single-page workspace for Inspectors anchoring Ocular Form, Ready Queue, Installation Form, and Drafts in-place.
 */

import { OcularForm } from '../forms/ocularForm.js';
import { ReadyList } from './readyList.js';
import { InstallationForm } from '../forms/installationForm.js';
import { FormStorage } from './formStorage.js';

export class InspectorWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = this.resolveInitialTab();
  }

  resolveInitialTab() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/ready')) return 'ready';
    if (path.includes('/installation')) return 'installation';
    if (path.includes('/history')) return 'history';
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
  }

  updateHeaderTitleAndSidebar() {
    const titleMap = {
      ocular: 'Ocular Inspection Form',
      ready: 'Ready for Installation Queue',
      installation: 'Installation Handover Certificate',
      history: 'Saved Form Drafts & Repositories'
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
      case 'ready': {
        const readyView = new ReadyList(stage);
        readyView.render();
        break;
      }
      case 'installation': {
        const installView = new InstallationForm(stage);
        installView.render();
        break;
      }
      case 'history': {
        this.renderHistoryStage(stage);
        break;
      }
      case 'ocular':
      default: {
        const ocularView = new OcularForm(stage);
        ocularView.render();
        break;
      }
    }
  }

  renderHistoryStage(stage) {
    const drafts = FormStorage.listDrafts() || [];
    stage.innerHTML = `
      <div class="form-card" style="padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-xl);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 1rem;">Saved Form Drafts & Local Repositories</h3>
        ${drafts.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 0.75rem;">
            ${drafts.map(d => `
              <div style="padding: 1rem; background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-color); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong style="color: var(--text-primary);">${d.id}</strong>
                  <span style="font-size: 0.775rem; color: var(--text-muted); display: block;">Last autosaved: ${new Date(d.updatedAt).toLocaleString()}</span>
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

    const loadBtns = stage.querySelectorAll('.btn-load-draft');
    loadBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const formId = btn.getAttribute('data-formid');
        import('../router.js').then(({ Router }) => Router.navigate('/ocular'));
        const draftData = FormStorage.loadDraft(formId);
        if (draftData && window.ocularFormInstance) {
          window.ocularFormInstance.populateFormData(draftData.data);
        }
      });
    });
  }
}
