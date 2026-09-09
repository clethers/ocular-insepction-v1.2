/**
 * OIMS — Installations Register Print Renderer & Print Trigger
 * Prints a formal register of every commissioned installation, reusing the
 * same .cert-* print stylesheet as the per-client audit certificate.
 */

import logoUrl from '../../assets/ecoworks-logo.png';
import { escapeHTML } from './security.js';

function formatPrintDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function renderInstallationsListHTML(records) {
  return `
    <!-- Corporate Header -->
    <div class="cert-header">
      <div class="cert-brand">
        <img src="${logoUrl}" class="cert-logo" alt="EcoWorks Official Logo" />
        <div>
          <div class="cert-company-title">EcoWorks Building Systems Corporation</div>
          <div class="cert-company-sub">Electrical Engineering & EV Infrastructure Services</div>
        </div>
      </div>
      <div class="cert-doc-meta">
        <div class="cert-badge">✓ COMMISSIONED INSTALLATIONS</div><br/>
        <strong>DOC REF:</strong> OIMS-INST-REG-${new Date().getFullYear()}<br/>
        <strong>DATE ISSUED:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>
    </div>

    <!-- Title Banner -->
    <div class="cert-title-banner">
      <div class="cert-title-text">Register of Commissioned Installations</div>
      <div class="cert-subtitle-text">Clients Whose EV Charger / Electrical Installation Has Been Completed</div>
    </div>

    <!-- Register Table -->
    <div class="cert-section-title">
      <span>Installation Records</span>
      <span style="font-size: 7.5pt; opacity: 0.8;">TOTAL: ${records.length}</span>
    </div>
    <table class="cert-table">
      <thead>
        <tr>
          <th>Installation No.</th>
          <th>RN Number</th>
          <th>Client Name</th>
          <th>Scope of Works</th>
          <th>Installer</th>
          <th>Date Installed</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${records.map(r => `
          <tr>
            <td>${escapeHTML(r.installationNo || 'N/A')}</td>
            <td>${escapeHTML(r.rnNo || 'N/A')}</td>
            <td>${escapeHTML(r.clientName || 'Unnamed Client')}</td>
            <td>${escapeHTML(r.scopeOfWorks || 'Installation')}</td>
            <td>${escapeHTML(r.installerName || 'N/A')}</td>
            <td>${escapeHTML(formatPrintDate(r.createdAt))}</td>
            <td><span class="cert-pass-badge">${escapeHTML(r.status || 'COMMISSIONED')}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Document Footer -->
    <div class="cert-footer-notice">
      <span>&copy; 2026 EcoWorks Building Systems Corporation. All Rights Reserved.</span>
      <span>Generated via OIMS v1.0 | Installations Register</span>
    </div>
  `;
}

export function printInstallationsList(records) {
  let printContainer = document.getElementById('print-sheet-container');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'print-sheet-container';
    printContainer.className = 'print-document';
    printContainer.style.display = 'none';
    document.body.appendChild(printContainer);
  }

  printContainer.innerHTML = renderInstallationsListHTML(records);

  const originalTitle = document.title;
  document.title = `ECO-OIMS-INSTALLATIONS-REGISTER-${new Date().toISOString().slice(0, 10)}`;

  window.print();

  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}
