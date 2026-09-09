/**
 * ReadyList Component - OIMS Field App
 * Displays completed & approved Ocular Inspections ready for EV Charger Installation execution.
 */

import { READY_INSTALLATIONS_PRESETS } from '../sampleData.js';
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { escapeHTML } from '../utils/security.js';

export class ReadyList {
  constructor(containerElement, onSelectInstallation) {
    this.container = containerElement;
    this.onSelectInstallation = onSelectInstallation;
    this.viewMode = 'card'; // 'card' or 'list'
  }

  async render() {
    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Loading Verified Ocular Audits Queue...
        </div>
      </div>
    `;

    let cloudReadyItems = [];

    try {
      const user = await AuthGuard.getSessionUser();
      cloudReadyItems = (await supabaseService.fetchReadyInspections(user?.id)) || [];
    } catch (e) {
      console.warn('[OIMS] Could not fetch cloud inspections:', e);
    }

    const readyItems = [...cloudReadyItems, ...READY_INSTALLATIONS_PRESETS];

    // Deduplicate by rnNo if any match
    const uniqueItems = [];
    const seenRn = new Set();
    for (const item of readyItems) {
      const rn = item.rnNo || item.id;
      if (rn && !seenRn.has(rn)) {
        seenRn.add(rn);
        uniqueItems.push(item);
      }
    }

    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <!-- Verified Audits Search & Filter Control Form -->
        <div class="ready-search-form-card no-print">
          <div class="search-form-header">
            <div class="search-form-brand">
              <div class="search-form-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div>
                <h2 class="search-form-title">VERIFIED OCULAR AUDITS QUEUE</h2>
                <span class="search-form-subtitle">Search & Filter Approved Inspection Records</span>
              </div>
            </div>

            <div class="search-form-meta" style="display: flex; align-items: center; gap: 0.5rem;">
              <div class="hide-on-mobile" style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn ${this.viewMode === 'card' ? 'btn-primary' : 'btn-outline'} btn-ready-view" data-view="card" style="padding: 0.5rem 0.85rem; font-size: 0.775rem;">Card View</button>
                <button type="button" class="btn ${this.viewMode === 'list' ? 'btn-primary' : 'btn-outline'} btn-ready-view" data-view="list" style="padding: 0.5rem 0.85rem; font-size: 0.775rem;">List View</button>
              </div>
              <button class="btn btn-outline" id="btn-refresh-ready" style="background: #ffffff; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.4rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                Refresh List
              </button>
            </div>
          </div>

          <div class="search-form-controls">
            <div class="search-input-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="ready-search-input" placeholder="Search by Client Name, RN Number, Installation No., or Location..." />
            </div>

            <div class="filter-select-field">
              <select id="ready-scope-filter">
                <option value="ALL">Scope of Work</option>
                <option value="Site Inspection">Site Inspection</option>
                <option value="Installation">Installation</option>
                <option value="Revisit">Revisit</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Ready Items: Card Grid or List Table depending on viewMode -->
        <div class="${this.effectiveViewMode() === 'list' ? '' : 'ready-cards-grid'}" id="ready-cards-container">
          ${this.renderItems(uniqueItems)}
        </div>
      </div>
    `;

    this.initEvents(uniqueItems);
  }

  // List view doesn't fit a phone screen — below 700px, always fall back
  // to the (already-compact) Card view regardless of the stored preference.
  effectiveViewMode() {
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
    return isMobile ? 'card' : this.viewMode;
  }

  renderItems(items) {
    return this.effectiveViewMode() === 'list' ? this.renderListView(items) : this.renderCards(items);
  }

  renderListView(items) {
    if (items.length === 0) {
      return `
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; color: var(--ecoworks-blue);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No Pending Inspections Ready for Installation</h3>
          <p style="font-size: 0.85rem; margin-top: 0.3rem;">Complete an Ocular Inspection form and mark it as 'Ready for Installation' to populate this queue.</p>
        </div>
      `;
    }

    return `
      <div class="form-card" style="padding: 0; overflow: hidden;">
        <div class="directory-table-wrapper" style="border: none; border-radius: 0;">
          <table class="directory-table">
            <thead>
              <tr>
                <th>RN Number</th>
                <th>Client Name</th>
                <th>Location</th>
                <th>Feeder / Breaker</th>
                <th>Lead Auditor</th>
                <th>Audit Date</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(item.rnNo || 'N/A')}</span></td>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(item.clientName || 'Unnamed Client')}</td>
                  <td data-label="Location" style="color: #64748b;">${escapeHTML(item.locationAddress || 'No address on file')}</td>
                  <td data-label="Feeder / Breaker" style="color: #64748b;">${escapeHTML(item.voltageSystem === '220_ll' ? '220V 1Ø L-L' : (item.voltageSystem === '220_lg' ? '220V 1Ø L-G' : '220V Standard'))} / ${escapeHTML(item.mainBreaker || '60A')}</td>
                  <td data-label="Lead Auditor" style="color: #64748b;">${escapeHTML(item.inspectedByName || 'Field Inspector')}</td>
                  <td data-label="Audit Date" style="color: #64748b;">${escapeHTML(item.dateTimeDisplay || (item.dateTime ? new Date(item.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'))}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-link btn-start-install" data-rn="${item.rnNo || item.id}">Start Installation Form</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  renderCards(items) {
    if (items.length === 0) {
      return `
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; color: var(--ecoworks-blue);"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No Pending Inspections Ready for Installation</h3>
          <p style="font-size: 0.85rem; margin-top: 0.3rem;">Complete an Ocular Inspection form and mark it as 'Ready for Installation' to populate this queue.</p>
        </div>
      `;
    }

    return items.map(item => `
      <div class="ready-card" data-rn="${item.rnNo || item.id}">
        <!-- Card Header Bar -->
        <div class="ready-card-header">
          <div class="ready-card-date">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Audit Date: <strong>${item.dateTimeDisplay || (item.dateTime ? new Date(item.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent')}</strong></span>
          </div>
          <div class="ready-record-badge">
            <strong>#${(item.id || 'AUD-101').toString().toUpperCase()}</strong>
          </div>
        </div>

        <!-- Client & Location Body -->
        <div class="ready-card-body">
          <div class="ready-client-header">
            <h3 class="ready-client-name">${escapeHTML(item.clientName || 'Unnamed Client')}</h3>
            <div class="ready-ref-pills-row">
              <span class="ready-ref-pill">RN: <strong>${escapeHTML(item.rnNo || 'N/A')}</strong></span>
              <span class="ready-ref-pill">INSTALL NO: <strong>${escapeHTML(item.installationNo || 'N/A')}</strong></span>
            </div>
          </div>

          <div class="ready-location">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${escapeHTML(item.locationAddress || 'No location address recorded')}</span>
          </div>

          <!-- Technical Specs Executive Docket Grid -->
          <div class="ready-docket-card">
            <div class="docket-title">TECHNICAL AUDIT SUMMARY</div>
            <div class="docket-grid">
              <div class="docket-item">
                <span class="docket-label">FEEDER</span>
                <span class="docket-value">${item.voltageSystem === '220_ll' ? '220V 1Ø L-L' : (item.voltageSystem === '220_lg' ? '220V 1Ø L-G' : '220V Standard')}</span>
              </div>
              <div class="docket-item">
                <span class="docket-label">MAIN BREAKER</span>
                <span class="docket-value">${item.mainBreaker || '60A Bolt-On'}</span>
              </div>
              <div class="docket-item">
                <span class="docket-label">GROUNDING</span>
                <span class="docket-status ${item.groundingSystem === 'NO' ? 'status-warning' : 'status-success'}">
                  ${item.groundingSystem === 'NO' ? 'Ground Rod Required' : 'Existing System OK'}
                </span>
              </div>
              <div class="docket-item">
                <span class="docket-label">FEEDER RUN</span>
                <span class="docket-value">${item.estimateDistance || '12-15m PVC'}</span>
              </div>
              <div class="docket-item docket-full">
                <span class="docket-label">LEAD AUDITOR</span>
                <span class="docket-value">${item.inspectedByName || 'Engr. Marco Santos, REE'}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Card Footer Action -->
        <div class="ready-card-footer">
          <button type="button" class="btn btn-primary btn-start-install" data-rn="${item.rnNo || item.id}">
            Start Installation Form →
          </button>
        </div>
      </div>
    `).join('');
  }

  initEvents(items) {
    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh-ready');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.render());
    }

    const filterItems = () => {
      const query = (document.getElementById('ready-search-input')?.value || '').toLowerCase().trim();
      const scopeVal = document.getElementById('ready-scope-filter')?.value || 'ALL';

      const filtered = items.filter(item => {
        const matchesQuery = !query || 
          (item.clientName && item.clientName.toLowerCase().includes(query)) ||
          (item.rnNo && item.rnNo.toLowerCase().includes(query)) ||
          (item.installationNo && item.installationNo.toLowerCase().includes(query)) ||
          (item.locationAddress && item.locationAddress.toLowerCase().includes(query));

        const matchesScope = (scopeVal === 'ALL') || (item.scopeOfWorks === scopeVal);

        return matchesQuery && matchesScope;
      });

      const container = document.getElementById('ready-cards-container');
      if (container) {
        container.className = this.viewMode === 'list' ? '' : 'ready-cards-grid';
        container.innerHTML = this.renderItems(filtered);
        this.bindCardButtons(filtered);
      }
    };

    const searchInput = document.getElementById('ready-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', filterItems);
    }

    const scopeFilter = document.getElementById('ready-scope-filter');
    if (scopeFilter) {
      scopeFilter.addEventListener('change', filterItems);
    }

    // Card / List view toggle
    const viewBtns = document.querySelectorAll('.btn-ready-view');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.viewMode = btn.getAttribute('data-view');
        viewBtns.forEach(b => b.classList.toggle('btn-primary', b === btn));
        viewBtns.forEach(b => b.classList.toggle('btn-outline', b !== btn));
        filterItems();
      });
    });

    // Live Realtime Subscription
    supabaseService.subscribeToReadyQueue(() => {
      console.log('[OIMS] Realtime queue update received. Refreshing list...');
      this.render();
    });

    this.bindCardButtons(items);
  }

  bindCardButtons(items) {
    const btns = this.container.querySelectorAll('.btn-start-install');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rn = btn.getAttribute('data-rn');
        const targetItem = items.find(i => 
          String(i.rnNo) === String(rn) || 
          String(i.id) === String(rn) || 
          i.rnNo === rn || 
          i.id === rn
        );
        const selectedData = targetItem || { id: rn, rnNo: rn };
        if (this.onSelectInstallation) {
          this.onSelectInstallation(selectedData);
        }
      });
    });
  }
}
