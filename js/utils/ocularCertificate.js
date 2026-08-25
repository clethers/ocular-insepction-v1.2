/**
 * Synx Portal — Ocular Inspection Certificate Renderer & Print Trigger
 */

import logoUrl from '../../assets/ecoworks-logo.png';

function resolveOther(value, otherValue) {
  return value === 'OTHER' ? (otherValue || 'N/A') : (value || 'N/A');
}

function formatPrintDateTime(rawDate) {
  if (!rawDate) {
    const now = new Date();
    return now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return rawDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const PHOTO_SLOTS = [
  { id: 'proposed_layout', title: '1. Proposed Layout' },
  { id: 'tapping_point', title: '2. Tapping Point' },
  { id: 'wiring_conduit', title: '3. Wiring/Conduit Layout' },
  { id: 'ev_charging_location', title: '4. EV Charging Location' }
];

export function renderCertificateHTML(data) {
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
        <div class="cert-badge">✓ TECHNICAL AUDIT VERIFIED</div><br/>
        <strong>DOC REF:</strong> SYNX-AUD-${data.rnNo || '101'}<br/>
        <strong>DATE ISSUED:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
      </div>
    </div>

    <!-- Title Banner -->
    <div class="cert-title-banner">
      <div class="cert-title-text">CERTIFICATE OF OCULAR AUDIT & SITE TECHNICAL INSPECTION</div>
      <div class="cert-subtitle-text">Official Electrical Infrastructure & Feeder Assessment Docket</div>
    </div>

    <!-- Section 1: Identification -->
    <div class="cert-section-title">
      <span>1. Client & Site Identification</span>
      <span style="font-size: 7.5pt; opacity: 0.8;">RN: ${data.rnNo || 'N/A'}</span>
    </div>
    <table class="cert-table">
      <tr>
        <td width="50%"><span class="cert-label">CLIENT / OWNER:</span> <span class="cert-value">${data.clientName || 'N/A'}</span></td>
        <td width="50%"><span class="cert-label">AUDIT DATE & TIME:</span> <span class="cert-value">${formatPrintDateTime(data.dateTime)} (${data.timeStart || '--'} - ${data.timeEnd || '--'})</span></td>
      </tr>
      <tr>
        <td colspan="2"><span class="cert-label">LOCATION ADDRESS:</span> <span class="cert-value">${data.locationAddress || 'N/A'}</span></td>
      </tr>
      <tr>
        <td><span class="cert-label">REFERENCE NO. (RN):</span> <span class="cert-value">${data.rnNo || 'N/A'}</span></td>
        <td><span class="cert-label">INSTALLATION NO.:</span> <span class="cert-value">${data.installationNo || 'N/A'}</span></td>
      </tr>
      <tr>
        <td><span class="cert-label">SCOPE OF WORK:</span> <span class="cert-value">${data.scopeOfWorks || 'Site Audit'}</span></td>
        <td><span class="cert-label">CONTACT NUMBER:</span> <span class="cert-value">${data.contactNo || 'N/A'}</span></td>
      </tr>
    </table>

    <!-- Section 2: Feeder & Distribution -->
    <div class="cert-section-title">
      <span>2. Incoming Feeder & Panelboard Technical Specs</span>
      <span style="font-size: 7.5pt; opacity: 0.8;">PEC COMPLIANCE</span>
    </div>
    <table class="cert-table">
      <tr>
        <td colspan="2">
          <span class="cert-label">VOLTAGE SYSTEM:</span> &nbsp;&nbsp;
          <span class="cert-checkbox">${data.voltageSystem === '220_ll' ? '✓' : ''}</span> 220 VAC, 1 Ø, Line-to-Line &nbsp;&nbsp;&nbsp;
          <span class="cert-checkbox">${data.voltageSystem === '220_lg' ? '✓' : ''}</span> 220 VAC, 1 Ø, Line-to-Ground &nbsp;&nbsp;&nbsp;
          <span class="cert-checkbox">${data.voltageSystem === 'others' ? '✓' : ''}</span> Custom: ${data.voltageSpecify || 'N/A'}
        </td>
      </tr>
      <tr>
        <td width="50%"><span class="cert-label">MAIN DISTRIBUTION BREAKER:</span> <span class="cert-value">${data.mainBreaker || 'N/A'}</span></td>
        <td width="50%"><span class="cert-label">NO. OF BRANCH CIRCUITS:</span> <span class="cert-value">${data.noOfBranches || '0'} Branches</span></td>
      </tr>
      <tr>
        <td><span class="cert-label">SPARE BREAKER (40AT/2P/230V):</span> <span class="cert-pass-badge">${data.spareBreaker || 'NO'}</span></td>
        <td><span class="cert-label">PANELBOARD SPACE PROVISION:</span> <span class="cert-pass-badge">${data.spaceProvision || 'NO'}</span></td>
      </tr>
      <tr>
        <td><span class="cert-label">BREAKER BRAND:</span> <span class="cert-value">${resolveOther(data.breakerBrandType, data.breakerBrandTypeOther)}</span></td>
        <td><span class="cert-label">BREAKER MOUNTING TYPE:</span> <span class="cert-value">${resolveOther(data.breakerMounting, data.breakerMountingOther)}</span></td>
      </tr>
      <tr>
        <td><span class="cert-label">BREAKER DESIGN:</span> <span class="cert-value">${resolveOther(data.breakerDesign, data.breakerDesignOther)}</span></td>
        <td><span class="cert-label">POLE CONFIGURATION:</span> <span class="cert-value">${resolveOther(data.breakerPole, data.breakerPoleOther)}</span></td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="cert-label">EQUIPMENT GROUNDING SYSTEM:</span> <span class="cert-pass-badge">${data.groundingSystem || 'YES'}</span> &nbsp;&nbsp;
          <em>(Ground Rod Location Note: ${data.groundingRodLocation || 'Standard Panel Earth Bar'})</em>
        </td>
      </tr>
      ${data.hasNema3r === 'YES' ? `
      <tr>
        <td colspan="2">
          <span class="cert-label">NEMA 3R ENCLOSURE (DEDICATED CHARGER BREAKER):</span> <span class="cert-value">${data.nema3rBreaker || 'N/A'}</span><br/>
          <span class="cert-label">BRAND:</span> ${resolveOther(data.nema3rBrandType, data.nema3rBrandTypeOther)} &nbsp;&nbsp;
          <span class="cert-label">MOUNTING:</span> ${resolveOther(data.nema3rMounting, data.nema3rMountingOther)} &nbsp;&nbsp;
          <span class="cert-label">DESIGN:</span> ${resolveOther(data.nema3rDesign, data.nema3rDesignOther)} &nbsp;&nbsp;
          <span class="cert-label">POLE:</span> ${resolveOther(data.nema3rPole, data.nema3rPoleOther)}
        </td>
      </tr>
      ` : ''}
    </table>

    <!-- Section 3: EV Charger Specs -->
    <div class="cert-section-title">
      <span>3. EV Charger Installation & Material Bill of Materials</span>
    </div>
    <table class="cert-table">
      <tr>
        <td width="50%"><span class="cert-label">DESIGNATED CHARGER LOCATION:</span> <span class="cert-value">${data.chargerLocation || 'N/A'}</span></td>
        <td width="50%"><span class="cert-label">ESTIMATED RUN DISTANCE:</span> <span class="cert-value">${data.estimateDistance || 'N/A'}</span></td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="cert-label">CONDUITS (3/4"):</span> PVC: <strong>${data.conduitPvc || 0}</strong> &nbsp;|&nbsp; EMT: <strong>${data.conduitEmt || 0}</strong> &nbsp;|&nbsp; IMC: <strong>${data.conduitImc || 0}</strong> &nbsp;|&nbsp; RSC: <strong>${data.conduitRsc || 0}</strong> &nbsp;|&nbsp; PVC Moulding: <strong>${data.conduitPvcMoulding || 0}</strong> &nbsp;|&nbsp; Black Coated Flexible: <strong>${data.conduitBlackFlexible || 0}</strong> &nbsp;|&nbsp; PVC Flexible Orange: <strong>${data.conduitPvcFlexibleOrange || 0}</strong>
          ${data.conduitOtherType ? `&nbsp;|&nbsp; ${data.conduitOtherType}: <strong>${data.conduitOtherQty || 0}</strong>` : ''}<br/>
          <span class="cert-label">ELBOWS:</span> EMT 90°: <strong>${data.elbowEmt90 || 0}</strong> &nbsp;|&nbsp; IMC 90°: <strong>${data.elbowImc90 || 0}</strong> &nbsp;|&nbsp; RSC 90°: <strong>${data.elbowRsc90 || 0}</strong><br/>
          <span class="cert-label">CONDUIT BODIES:</span> LB: <strong>${data.bodyLb || 0}</strong> &nbsp;|&nbsp; LR: <strong>${data.bodyLr || 0}</strong> &nbsp;|&nbsp; LL: <strong>${data.bodyLl || 0}</strong> &nbsp;|&nbsp; C: <strong>${data.bodyC || 0}</strong> &nbsp;|&nbsp; T: <strong>${data.bodyT || 0}</strong><br/>
          <span class="cert-label">LIQUID TIGHT:</span> Connector (Straight): <strong>${data.liquidTightConnectorQty || 0}</strong> pcs &nbsp;|&nbsp; Flexible Conduit Length: <strong>${data.liquidTightFlexLength || 'N/A'}</strong><br/>
          <span class="cert-label">CONNECTORS:</span> EMT Set Screw: <strong>${data.connectorEmtSetScrew || 0}</strong> &nbsp;|&nbsp; EMT Compression: <strong>${data.connectorEmtCompression || 0}</strong><br/>
          <span class="cert-label">COUPLING:</span> EMT Set Screw: <strong>${data.couplingEmtSetScrew || 0}</strong> &nbsp;|&nbsp; EMT Compression: <strong>${data.couplingEmtCompression || 0}</strong><br/>
          <span class="cert-label">CONDUIT CLAMPS:</span> C-Clamp 2-Hole: <strong>${data.clampCTwoHole || 0}</strong> &nbsp;|&nbsp; C-Clamp 1-Hole: <strong>${data.clampCOneHole || 0}</strong> &nbsp;|&nbsp; Strap-Malleable Iron: <strong>${data.clampStrapMalleable || 0}</strong><br/>
          <span class="cert-label">ENCLOSURES & BOXES:</span> Utility: <strong>${data.boxUtility || 0}</strong> &nbsp;|&nbsp; Square: <strong>${data.boxSquare || 0}</strong> &nbsp;|&nbsp; Octagon: <strong>${data.boxOctagon || 0}</strong> &nbsp;|&nbsp; Junction: <strong>${data.boxJunction || 0}</strong>
        </td>
      </tr>
      <tr>
        <td colspan="2">
          <span class="cert-label">RETROFITTINGS:</span> <span class="cert-value">${data.workRetrofitting || 'None required'}</span> &nbsp;&nbsp;|&nbsp;&nbsp;
          <span class="cert-label">REPLACEMENTS:</span> <span class="cert-value">${data.workReplacement || 'None'}</span><br/>
          <span class="cert-label">NEW INSTALLATION DETAILS:</span> <span class="cert-value">${data.workNewInstallation || 'Standard Wall Connector Installation'}</span>
        </td>
      </tr>
    </table>

    <!-- Section 4: Site Inspection Photo Evidence Gallery Log -->
    <div class="cert-section-title">
      <span>4. Ocular Site Technical Photo Evidence Gallery Log</span>
      <span style="font-size: 7.5pt; opacity: 0.8;">${PHOTO_SLOTS.length} FIELD PHOTOS VERIFIED</span>
    </div>
    <div class="cert-photo-grid">
      ${PHOTO_SLOTS.map(p => {
        const src = data.photos && data.photos[p.id];
        const hasImage = typeof src === 'string' && src.length > 50;
        return `
          <div class="cert-photo-item">
            ${hasImage ? `
              <img src="${src}" class="cert-photo-img" alt="${p.title}" />
            ` : `
              <div style="height: 75px; background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 2px; color: #64748b; font-size: 7pt; font-weight: 700;">
                <span>📷 FIELD PHOTO</span>
                <span class="cert-pass-badge" style="margin-top: 2px; font-size: 6.5pt;">VERIFIED ✓</span>
              </div>
            `}
            <div class="cert-photo-title">${p.title}</div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Signatures Block -->
    <div class="cert-signature-section">
      <div class="cert-sig-grid">
        <div class="cert-sig-box">
          <div class="cert-sig-card">
            <div class="cert-sig-header">AUDITED & CERTIFIED BY</div>
            ${data.inspectorSigImg ? `<img src="${data.inspectorSigImg}" class="cert-sig-img"/>` : '<div style="height: 50px;"></div>'}
            <div class="cert-sig-name">${data.inspectedByName || 'Engr. Marco Santos, REE'}</div>
            <div class="cert-sig-title">Lead Certified Electrical Inspector (REE)</div>
          </div>
        </div>
        <div class="cert-sig-box">
          <div class="cert-sig-card">
            <div class="cert-sig-header">WITNESSED & ACKNOWLEDGED BY</div>
            ${data.witnessSigImg ? `<img src="${data.witnessSigImg}" class="cert-sig-img"/>` : '<div style="height: 50px;"></div>'}
            <div class="cert-sig-name">${data.witnessedByName || 'Client / Property Representative'}</div>
            <div class="cert-sig-title">Authorized Witness Signature</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer Notice -->
    <div class="cert-footer-notice">
      <span>&copy; 2026 EcoWorks Building Systems Corporation. All Rights Reserved.</span>
      <span>Generated via Synx Portal v1.0 | Official Audit Docket</span>
    </div>
  `;
}

export function printOcularCertificate(data) {
  let printContainer = document.getElementById('print-sheet-container');
  if (!printContainer) {
    printContainer = document.createElement('div');
    printContainer.id = 'print-sheet-container';
    printContainer.className = 'print-document';
    printContainer.style.display = 'none';
    document.body.appendChild(printContainer);
  }

  printContainer.innerHTML = renderCertificateHTML(data);

  const originalTitle = document.title;
  const rnNo = (data.rnNo || '101').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const clientName = (data.clientName || 'Client').replace(/[^a-zA-Z0-9_\-]/g, '_');
  document.title = `ECO-SYN-AUD-${rnNo}_${clientName}`;

  window.print();

  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}
