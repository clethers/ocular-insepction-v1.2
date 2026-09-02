/**
 * Ocular Inspection Form Handler for OIMS
 * Renders interactive UI form matching physical EcoWorks inspection form
 */

import { SignaturePad } from '../components/signaturePad.js';
import { FormStorage } from '../components/formStorage.js';
import { SAMPLE_OCULAR_DATA } from '../sampleData.js';
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from '../components/authGuard.js';
import { isValidBase64Image } from '../utils/security.js';
import bannerUrl from '../../assets/ecoworks-banner.png';

const BREAKER_BRAND_OPTIONS = ['GE', 'Schneider', 'ABB', 'Shihlin', 'Koten', 'Royo'];
const BREAKER_MOUNTING_OPTIONS = ['Bolt-on', 'Plug-in', 'DIN Rail Mounted', 'Fixed/Panel-Mounted Type'];
const BREAKER_DESIGN_OPTIONS = ['MCB', 'MCCB'];
const BREAKER_POLE_OPTIONS = ['Single Pole (1P)', 'Double Pole (2P)', 'Three Pole (3P)', 'Four-Pole (4P)'];
const MAIN_BREAKER_OPTIONS = ['40A', '60A', '80A', '100A', '150A', '175A', '200A', '250A'];

export class OcularForm {
  constructor(containerElement) {
    this.container = containerElement;
    this.inspectorSig = null;
    this.witnessSig = null;
    this.currentStep = 1;
    this.totalSteps = 4;
  }

  render() {
    this.container.innerHTML = `
      <!-- Step Wizard Navigation Header -->
      <div class="wizard-progress-bar no-print">
        <div class="wizard-step active" data-step="1">
          <div class="wizard-step-num">1</div>
          <div class="wizard-step-label">Header & Client</div>
        </div>
        <div class="wizard-line" id="line-1"></div>
        <div class="wizard-step" data-step="2">
          <div class="wizard-step-num">2</div>
          <div class="wizard-step-label">Feeder & Panel</div>
        </div>
        <div class="wizard-line" id="line-2"></div>
        <div class="wizard-step" data-step="3">
          <div class="wizard-step-num">3</div>
          <div class="wizard-step-label">EV Charger & Materials</div>
        </div>
        <div class="wizard-line" id="line-3"></div>
        <div class="wizard-step" data-step="4">
          <div class="wizard-step-num">4</div>
          <div class="wizard-step-label">Works & Sign-off</div>
        </div>
      </div>

      <!-- Feeder Path Choice Overlay: gates Step 2 until Main Distribution vs NEMA 3R is picked -->
      <div class="modal-overlay no-print" id="feeder-path-overlay" style="display: none;">
        <div class="modal-dialog">
          <h3 class="modal-title">Which feeder path applies to this installation?</h3>
          <p class="modal-subtitle">This determines which section of Feeder &amp; Panel you'll fill out.</p>
          <div class="modal-choice-grid">
            <button type="button" class="modal-choice-btn" data-feeder-choice="NO">
              <span class="modal-choice-title">Main Distribution</span>
              <span class="modal-choice-desc">Standard incoming panelboard feeder</span>
            </button>
            <button type="button" class="modal-choice-btn" data-feeder-choice="YES">
              <span class="modal-choice-title">NEMA 3R Enclosure</span>
              <span class="modal-choice-desc">Dedicated charger breaker, bypasses main panel</span>
            </button>
          </div>
          <div class="modal-footer" id="feeder-path-overlay-footer" style="display: none;">
            <button type="button" class="btn btn-outline" id="btn-cancel-feeder-path">Cancel</button>
          </div>
        </div>
      </div>

      <form id="ocular-form-element">
        <!-- STEP 1: CLIENT & HEADER INFORMATION -->
        <div class="wizard-pane" id="pane-step-1">
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Header & Client Information
              <span class="form-section-subtitle">Basic Audit Details</span>
            </div>

            <!-- Hidden background date/time inputs -->
            <input type="hidden" id="dateTime" name="dateTime" />
            <input type="hidden" id="timeStart" name="timeStart" />
            <input type="hidden" id="timeEnd" name="timeEnd" />

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Client Name *</label>
                <input type="text" class="form-input" id="clientName" name="clientName" placeholder="e.g. Esperanza Bacolod" required />
              </div>

              <div class="form-group">
                <label class="form-label">Contact No.</label>
                <input type="text" class="form-input" id="contactNo" name="contactNo" placeholder="e.g. 0917-XXX-XXXX" />
              </div>
            </div>

            <div class="grid-3">
              <div class="form-group">
                <label class="form-label">RN No. *</label>
                <input type="text" class="form-input" id="rnNo" name="rnNo" placeholder="e.g. RN128091526" required />
              </div>

              <div class="form-group">
                <label class="form-label">Installation No. *</label>
                <input type="text" class="form-input" id="installationNo" name="installationNo" placeholder="e.g. INSTCOM_1583581" required />
              </div>

              <div class="form-group">
                <label class="form-label">Scope of Work</label>
                <select class="form-select" id="scopeOfWorks" name="scopeOfWorks">
                  <option value="Site Inspection">Site Inspection</option>
                  <option value="Installation">Installation</option>
                  <option value="Revisit" selected>Revisit</option>
                </select>
              </div>
            </div>

            <!-- Interactive GPS Inspection Location Map -->
            <div class="map-picker-wrapper" style="margin-bottom: 1rem;">
              <div id="ocular-map-container" class="map-container-box"></div>
              <input type="hidden" id="gpsPinCoordinates" name="gpsPinCoordinates" />
            </div>

            <!-- Location Address (Last Field in Step 1) -->
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Location / Address *</label>
              <textarea class="form-textarea" id="locationAddress" name="locationAddress" rows="2" placeholder="Complete Street, Barangay, City/Municipality" required></textarea>
            </div>
          </div>
        </div>

        <!-- STEP 2: INCOMING FEEDER & PANELBOARD -->
        <div class="wizard-pane" id="pane-step-2" style="display: none;">
          <!-- Incoming Feeder Card -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Incoming Feeder Specification
            </div>

            <div class="form-group">
              <label class="form-label">Voltage Systems</label>
              <div class="option-grid">
                <label class="custom-option">
                  <input type="radio" name="voltageSystem" value="220_ll" checked />
                  <span class="option-text">220 VAC, 1 Ø, L-L</span>
                </label>

                <label class="custom-option">
                  <input type="radio" name="voltageSystem" value="220_lg" />
                  <span class="option-text">220 VAC, 1 Ø, L-G</span>
                </label>

                <label class="custom-option">
                  <input type="radio" name="voltageSystem" value="others" />
                  <span class="option-text">Others (Specify)</span>
                </label>
              </div>
            </div>

            <div class="form-group" id="voltage-specify-group" style="display: none;">
              <label class="form-label">Others Voltage System Specification</label>
              <input type="text" class="form-input" id="voltageSpecify" name="voltageSpecify" placeholder="e.g. 230 VAC 3 Ø Delta" />
            </div>
          </div>

          <!-- Main Distribution Panelboard Card -->
          <div class="form-card" id="main-distribution-panelboard-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              Main Distribution Panelboard
            </div>

            <div class="grid-2">
              ${this.renderDropdownWithOther('mainBreaker', 'Main Breaker (Please Specify)', MAIN_BREAKER_OPTIONS)}

              ${this.renderQtyStepper('noOfBranches', 'No. of Branches (Please Specify)')}
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Is There Spare Breaker (40 AT, 2P, 230V)?</label>
                <div class="option-grid">
                  <label class="custom-option">
                    <input type="radio" name="spareBreaker" value="YES" checked />
                    <span class="option-text">YES</span>
                  </label>
                  <label class="custom-option">
                    <input type="radio" name="spareBreaker" value="NO" />
                    <span class="option-text">NO</span>
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Is There Space Provision?</label>
                <div class="option-grid">
                  <label class="custom-option">
                    <input type="radio" name="spaceProvision" value="YES" checked />
                    <span class="option-text">YES</span>
                  </label>
                  <label class="custom-option">
                    <input type="radio" name="spaceProvision" value="NO" />
                    <span class="option-text">NO</span>
                  </label>
                </div>
              </div>
            </div>

            ${this.renderDropdownWithOther('breakerBrandType', 'Existing Breaker Brand', BREAKER_BRAND_OPTIONS)}

            <div class="form-group">
              <label class="form-label">Type of Breaker</label>
              <div class="grid-3">
                ${this.renderDropdownWithOther('breakerMounting', 'Mounting Type', BREAKER_MOUNTING_OPTIONS)}
                ${this.renderDropdownWithOther('breakerDesign', 'Design', BREAKER_DESIGN_OPTIONS)}
                ${this.renderDropdownWithOther('breakerPole', 'Pole', BREAKER_POLE_OPTIONS)}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Is There Any Grounding Systems?</label>
              <div class="option-grid">
                <label class="custom-option">
                  <input type="radio" name="groundingSystem" value="YES" />
                  <span class="option-text">YES</span>
                </label>
                <label class="custom-option">
                  <input type="radio" name="groundingSystem" value="NO" checked />
                  <span class="option-text">NO</span>
                </label>
              </div>
            </div>

            <div class="form-group" id="grounding-rod-group">
              <label class="form-label">If NO: (Please Indicate Possible Location of Grounding Rod)</label>
              <textarea class="form-textarea" id="groundingRodLocation" name="groundingRodLocation" rows="2" placeholder="e.g. Soft soil area directly outside main panelboard wall"></textarea>
            </div>
          </div>

          <!-- NEMA 3R Enclosure Card (Dedicated Charger Breaker, Bypasses Main Panel) -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
              NEMA 3R Enclosure (Dedicated Charger Breaker, If Applicable)
            </div>

            <div class="form-group">
              <label class="form-label">Feeder Path Selected</label>
              <div class="feeder-path-readout">
                <span class="feeder-path-badge" id="feederPathBadge">Main Distribution</span>
                <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-change-feeder-path">Change</button>
              </div>
              <input type="hidden" id="hasNema3r" name="hasNema3r" value="NO" />
            </div>

            <div id="nema3r-detail-group" style="display: none;">
              <div class="form-group">
                <label class="form-label">NEMA 3R Breaker Rating (Please Specify)</label>
                <input type="text" class="form-input" id="nema3rBreaker" name="nema3rBreaker" placeholder="e.g. 40A 2P 230V" />
              </div>

              ${this.renderDropdownWithOther('nema3rBrandType', 'Brand', BREAKER_BRAND_OPTIONS)}

              <div class="form-group">
                <label class="form-label">Type of Breaker</label>
                <div class="grid-3">
                  ${this.renderDropdownWithOther('nema3rMounting', 'Mounting Type', BREAKER_MOUNTING_OPTIONS)}
                  ${this.renderDropdownWithOther('nema3rDesign', 'Design', BREAKER_DESIGN_OPTIONS)}
                  ${this.renderDropdownWithOther('nema3rPole', 'Pole', BREAKER_POLE_OPTIONS)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3: EV CHARGER INSTALLATION CHECKLIST -->
        <div class="wizard-pane" id="pane-step-3" style="display: none;">
          <!-- Card 1: Charger Placement -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.0 10.9 2 11 2 11.2V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
              EV Charger Installation Checklist
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Location of Charger (Please Specify)</label>
                <input type="text" class="form-input" id="chargerLocation" name="chargerLocation" placeholder="e.g. Garage Left Wall (Near Main Gate)" />
              </div>

              ${this.renderQtyStepper('estimateDistance', 'Estimated Distance from Tapping Point (Meters)')}
            </div>
          </div>

          <!-- Card 2: Conduit & Routing -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v4H4zM4 16h16v4H4zM6 8v8M18 8v8"/></svg>
              Conduit & Routing Materials (3/4")
            </div>

            <div class="form-group">
              <label class="form-label">Conduits</label>
              <div class="grid-3">
                ${this.renderQtyStepper('conduitPvc', 'PVC (Rigid)')}
                ${this.renderQtyStepper('conduitEmt', 'EMT')}
                ${this.renderQtyStepper('conduitImc', 'IMC')}
                ${this.renderQtyStepper('conduitRsc', 'RSC')}
                ${this.renderQtyStepper('conduitPvcMoulding', 'PVC Moulding')}
                ${this.renderQtyStepper('conduitBlackFlexible', 'Black Coated Flexible')}
                ${this.renderQtyStepper('conduitPvcFlexibleOrange', 'PVC Flexible Orange')}
              </div>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Other Conduit Type (Please Specify Type & Size)</label>
                <input type="text" class="form-input" id="conduitOtherType" name="conduitOtherType" placeholder="e.g. 1&quot; RSC" />
              </div>
              <div class="form-group">
                <label class="form-label">Other Conduit Qty</label>
                <input type="number" class="form-input" id="conduitOtherQty" name="conduitOtherQty" value="0" min="0" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Elbows</label>
              <div class="grid-3">
                ${this.renderQtyStepper('elbowEmt90', 'EMT Elbow 90°')}
                ${this.renderQtyStepper('elbowImc90', 'IMC Elbow 90°')}
                ${this.renderQtyStepper('elbowRsc90', 'RSC 90°')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Conduit Bodies (LB, LR, LL, C, T)</label>
              <div class="grid-4">
                ${this.renderMiniQty('bodyLb', 'LB')}
                ${this.renderMiniQty('bodyLr', 'LR')}
                ${this.renderMiniQty('bodyLl', 'LL')}
                ${this.renderMiniQty('bodyC', 'C')}
                ${this.renderMiniQty('bodyT', 'T')}
              </div>
            </div>
          </div>

          <!-- Card 3: Fittings & Connections -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Fittings & Connections (3/4")
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Liquid Tight Connector (Straight Type) Qty</label>
                <div class="qty-adjuster">
                  <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                  <input type="number" class="qty-input" id="liquidTightConnectorQty" name="liquidTightConnectorQty" value="4" min="0" />
                  <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Liquid Tight Flexible Conduit Length</label>
                <input type="text" class="form-input" id="liquidTightFlexLength" name="liquidTightFlexLength" placeholder="e.g. 30cm" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Connectors</label>
              <div class="grid-2">
                ${this.renderQtyStepper('connectorEmtSetScrew', 'EMT Set Screw Type')}
                ${this.renderQtyStepper('connectorEmtCompression', 'EMT Compression Type')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Coupling</label>
              <div class="grid-2">
                ${this.renderQtyStepper('couplingEmtSetScrew', 'EMT Set Screw Type')}
                ${this.renderQtyStepper('couplingEmtCompression', 'EMT Compression Type')}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Conduit Clamps</label>
              <div class="grid-3">
                ${this.renderQtyStepper('clampCTwoHole', 'C-Clamp 2-Hole')}
                ${this.renderQtyStepper('clampCOneHole', 'C-Clamp 1-Hole')}
                ${this.renderQtyStepper('clampStrapMalleable', 'Strap-Malleable Iron 1-Hole')}
              </div>
            </div>
          </div>

          <!-- Card 4: Electrical Boxes -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              Electrical Boxes
            </div>

            <div class="form-group">
              <label class="form-label">Electrical Boxes Quantity (PCS)</label>
              <div class="grid-4">
                ${this.renderQtyStepper('boxUtility', 'UTILITY')}
                ${this.renderQtyStepper('boxSquare', 'SQUARE BOX')}
                ${this.renderQtyStepper('boxOctagon', 'OCTAGON BOX')}
                ${this.renderQtyStepper('boxJunction', 'JUNCTION BOX')}
              </div>

              <div class="form-group" style="margin-top: 0.75rem;">
                <label class="form-label">Others Boxes / Enclosures Specify</label>
                <input type="text" class="form-input" id="boxOthers" name="boxOthers" placeholder="e.g. Weatherproof Enclosure IP65" />
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 4: OTHERS WORKS & DIGITAL SIGNATURES -->
        <div class="wizard-pane" id="pane-step-4" style="display: none;">
          <!-- Scope of Other Works Card -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Others Works Description
            </div>

            <div class="form-group">
              <label class="form-label">RETROFITTINGS</label>
              <input type="text" class="form-input" id="workRetrofitting" name="workRetrofitting" placeholder="Describe any retrofitting requirements..." />
            </div>

            <div class="form-group">
              <label class="form-label">REPLACEMENT</label>
              <input type="text" class="form-input" id="workReplacement" name="workReplacement" placeholder="Describe any component replacements needed..." />
            </div>

            <div class="form-group">
              <label class="form-label">NEW INSTALLATION</label>
              <input type="text" class="form-input" id="workNewInstallation" name="workNewInstallation" placeholder="Describe new equipment to be installed..." />
            </div>
          </div>

          <!-- PHOTO ATTACHMENTS LOG (4 OFFICIAL OCULAR LABELS) -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Ocular Site Photo Attachments Log
              <span class="form-section-subtitle">4 Required Audit Photos</span>
              <button type="button" class="btn btn-secondary no-print" id="btn-download-photos" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Photos
              </button>
            </div>

            <div class="grid-4" id="ocular-photo-grid-container">
              <!-- 1. Proposed Layout * -->
              <div class="photo-upload-box">
                <div class="photo-upload-label">Proposed Layout <span class="req-star">*</span></div>
                <div class="photo-dropzone" data-photo-id="proposed_layout">
                  <input type="file" accept="image/*" class="photo-file-input" id="file_proposed_layout" style="display:none;" />
                  <div class="photo-placeholder-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span>Click / Upload Photo</span>
                    <span class="photo-subtext">Required</span>
                  </div>
                  <div class="photo-preview-container" style="display:none;">
                    <img class="photo-preview-img" loading="lazy" id="prev_proposed_layout" src="" alt="Proposed Layout" />
                    <div class="photo-reupload-overlay">
                      <button type="button" class="btn-reupload-photo" data-photo-id="proposed_layout">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        Re-upload Photo
                      </button>
                    </div>
                    <button type="button" class="btn-remove-photo" data-photo-id="proposed_layout" title="Remove Photo">&times;</button>
                  </div>
                </div>
              </div>

              <!-- 2. Tapping Point * -->
              <div class="photo-upload-box">
                <div class="photo-upload-label">Tapping Point <span class="req-star">*</span></div>
                <div class="photo-dropzone" data-photo-id="tapping_point">
                  <input type="file" accept="image/*" class="photo-file-input" id="file_tapping_point" style="display:none;" />
                  <div class="photo-placeholder-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span>Click / Upload Photo</span>
                    <span class="photo-subtext">Required</span>
                  </div>
                  <div class="photo-preview-container" style="display:none;">
                    <img class="photo-preview-img" loading="lazy" id="prev_tapping_point" src="" alt="Tapping Point" />
                    <div class="photo-reupload-overlay">
                      <button type="button" class="btn-reupload-photo" data-photo-id="tapping_point">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        Re-upload Photo
                      </button>
                    </div>
                    <button type="button" class="btn-remove-photo" data-photo-id="tapping_point" title="Remove Photo">&times;</button>
                  </div>
                </div>
              </div>

              <!-- 3. Wiring/Conduit Layout * -->
              <div class="photo-upload-box">
                <div class="photo-upload-label">Wiring/Conduit Layout <span class="req-star">*</span></div>
                <div class="photo-dropzone" data-photo-id="wiring_conduit">
                  <input type="file" accept="image/*" class="photo-file-input" id="file_wiring_conduit" style="display:none;" />
                  <div class="photo-placeholder-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span>Click / Upload Photo</span>
                    <span class="photo-subtext">Required</span>
                  </div>
                  <div class="photo-preview-container" style="display:none;">
                    <img class="photo-preview-img" loading="lazy" id="prev_wiring_conduit" src="" alt="Wiring/Conduit Layout" />
                    <div class="photo-reupload-overlay">
                      <button type="button" class="btn-reupload-photo" data-photo-id="wiring_conduit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        Re-upload Photo
                      </button>
                    </div>
                    <button type="button" class="btn-remove-photo" data-photo-id="wiring_conduit" title="Remove Photo">&times;</button>
                  </div>
                </div>
              </div>

              <!-- 4. EV Charging Location * -->
              <div class="photo-upload-box">
                <div class="photo-upload-label">EV Charging Location <span class="req-star">*</span></div>
                <div class="photo-dropzone" data-photo-id="ev_charging_location">
                  <input type="file" accept="image/*" class="photo-file-input" id="file_ev_charging_location" style="display:none;" />
                  <div class="photo-placeholder-content">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    <span>Click / Upload Photo</span>
                    <span class="photo-subtext">Required</span>
                  </div>
                  <div class="photo-preview-container" style="display:none;">
                    <img class="photo-preview-img" loading="lazy" id="prev_ev_charging_location" src="" alt="EV Charging Location" />
                    <div class="photo-reupload-overlay">
                      <button type="button" class="btn-reupload-photo" data-photo-id="ev_charging_location">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                        Re-upload Photo
                      </button>
                    </div>
                    <button type="button" class="btn-remove-photo" data-photo-id="ev_charging_location" title="Remove Photo">&times;</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pre-Signature Executive Audit Summary Docket Card -->
          <div id="audit-summary-content">
            <!-- Dynamically populated via updateAuditSummary() -->
          </div>

          <!-- Digital Signatures Card -->
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Digital Verification & Signatures
            </div>

            <div class="signature-card-grid">
              <!-- Inspected By -->
              <div class="signature-box">
                <div class="form-group">
                  <label class="form-label">Inspected By (Inspector Name)</label>
                  <input type="text" class="form-input" id="inspectedByName" name="inspectedByName" placeholder="e.g. Engr. Marco Santos, REE" />
                </div>
                <div class="signature-canvas-container">
                  <canvas class="signature-canvas" id="canvas-inspector"></canvas>
                </div>
                <div class="signature-controls">
                  <span class="form-label-note">Draw signature inside box</span>
                  <div>
                    <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-undo-inspector">Undo</button>
                    <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-clear-inspector">Clear</button>
                  </div>
                </div>
              </div>

              <!-- Witnessed By -->
              <div class="signature-box">
                <div class="form-group">
                  <label class="form-label">Witnessed By (Client / Representative)</label>
                  <input type="text" class="form-input" id="witnessedByName" name="witnessedByName" placeholder="e.g. Esperanza Bacolod" />
                </div>
                <div class="signature-canvas-container">
                  <canvas class="signature-canvas" id="canvas-witness"></canvas>
                </div>
                <div class="signature-controls">
                  <span class="form-label-note">Draw signature inside box</span>
                  <div>
                    <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-undo-witness">Undo</button>
                    <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-clear-witness">Clear</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Floating Wizard Navigation Footer -->
        <div class="wizard-footer no-print">
          <button type="button" class="btn btn-outline" id="btn-prev" style="visibility: hidden;">
            ← Previous Step
          </button>
          
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-outline" id="btn-save-draft">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Save Draft
            </button>

            <button type="button" class="btn btn-primary" id="btn-next">
              Next Step →
            </button>

            <button type="button" class="btn btn-primary" id="btn-mark-ready" style="background: linear-gradient(135deg, var(--ecoworks-green), var(--ecoworks-green-shadow)); color: #fff; display: none; border-color: var(--ecoworks-green-light);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Submit for QA Review →
            </button>
          </div>
        </div>
      </form>
    `;

    this.initSignaturePads();
    this.initEvents();
    this.initWizard();
    this.setDefaultDateTime();
    this.initMap();
    this.initPhotoUploaders();

    window.ocularFormInstance = this;
    this.applyResumePayloadIfAny();
  }

  // Picked up by history.js when the inspector clicks "Resume & Resubmit"
  // on a rejected submission, or "Load Draft" on a local draft — both stash
  // their payload in sessionStorage before navigating here so it survives
  // the route change.
  applyResumePayloadIfAny() {
    let raw;
    try {
      raw = sessionStorage.getItem('oims_resume_ocular');
    } catch (e) {
      return;
    }
    if (!raw) return;

    try {
      sessionStorage.removeItem('oims_resume_ocular');
      const data = JSON.parse(raw);
      this.populateFormData(data, { silent: true });
      const noteSuffix = data.qaNotes ? ` Customer Care noted: "${data.qaNotes}"` : '';
      this.showToast(`Loaded ${data.rnNo || 'inspection'} for revision.${noteSuffix}`);
    } catch (e) {
      console.warn('[OIMS] Could not apply resume payload:', e);
    }
  }

  initPhotoUploaders() {
    const dropzones = this.container.querySelectorAll('#ocular-photo-grid-container .photo-dropzone');
    dropzones.forEach(dz => {
      const photoId = dz.getAttribute('data-photo-id');
      const fileInput = dz.querySelector('.photo-file-input');
      const prevContainer = dz.querySelector('.photo-preview-container');
      const prevImg = dz.querySelector('.photo-preview-img');

      dz.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-photo')) {
          e.stopPropagation();
          fileInput.value = '';
          prevImg.src = '';
          prevContainer.style.display = 'none';
          this.updateAuditSummary();
          return;
        }
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            prevImg.src = evt.target.result;
            prevContainer.style.display = 'block';
            this.showToast(`Photo updated: ${photoId.replace(/_/g, ' ')}`);
            this.updateAuditSummary();
          };
          reader.readAsDataURL(file);
        }
      });
    });
  }

  populatePhotos(photoObj) {
    if (!photoObj) return;
    const photoIds = ['proposed_layout', 'tapping_point', 'wiring_conduit', 'ev_charging_location'];
    photoIds.forEach(id => {
      const imgSrc = photoObj[id] || photoObj[`photo_${id}`];
      if (imgSrc) {
        const prevImg = document.getElementById(`prev_${id}`);
        const prevContainer = prevImg?.closest('.photo-preview-container');
        if (prevImg && prevContainer) {
          prevImg.src = imgSrc;
          prevContainer.style.display = 'block';
        }
      }
    });
  }

  initMap() {
    setTimeout(() => {
      const mapElem = document.getElementById('ocular-map-container');
      if (!mapElem || this.mapInitialized) return;

      const defaultLat = 14.5995;
      const defaultLng = 120.9842;

      if (typeof L !== 'undefined') {
        this.map = L.map('ocular-map-container').setView([defaultLat, defaultLng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(this.map);

        this.marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(this.map);

        const updatePosition = (lat, lng, fetchAddress = true) => {
          const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          const gpsInput = document.getElementById('gpsPinCoordinates');
          if (gpsInput) gpsInput.value = coordStr;

          if (fetchAddress) {
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                if (data && data.display_name) {
                  const addrInput = document.getElementById('locationAddress');
                  if (addrInput && (!addrInput.value || addrInput.value.trim() === '' || addrInput.value.includes('Manila'))) {
                    addrInput.value = data.display_name;
                  }
                }
              })
              .catch(() => {});
          }
        };

        updatePosition(defaultLat, defaultLng, false);

        this.marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          if (this.map) this.map.panTo([pos.lat, pos.lng], { animate: true });
          updatePosition(pos.lat, pos.lng, true);
        });

        this.map.on('click', (e) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          this.marker.setLatLng([lat, lng]);
          if (this.map) this.map.flyTo([lat, lng], 18, { animate: true, duration: 1 });
          updatePosition(lat, lng, true);
        });

        this.mapInitialized = true;
        this.triggerGpsDetection(true);
      }
    }, 200);
  }

  triggerGpsDetection(isAuto = false) {
    if ('geolocation' in navigator) {
      if (!isAuto) this.showToast('📡 Detecting exact inspection location GPS...');
      
      const handleSuccess = (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (this.map && this.marker) {
          this.map.flyTo([lat, lng], 18, { animate: true, duration: 1.2 });
          this.marker.setLatLng([lat, lng]);
        }

        const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        const gpsInput = document.getElementById('gpsPinCoordinates');
        if (gpsInput) gpsInput.value = coordStr;

        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.display_name) {
              const addrInput = document.getElementById('locationAddress');
              if (addrInput && (!addrInput.value || addrInput.value.trim() === '' || addrInput.value.includes('Manila'))) {
                addrInput.value = data.display_name;
              }
              this.showToast(`GPS Auto-detected: ${data.display_name.split(',')[0]}`);
            }
          })
          .catch(() => {
            this.showToast(`GPS coordinates auto-filled: ${coordStr}`);
          });
      };

      const handleError = (err) => {
        console.warn('Geolocation position error:', err);
        if (!isAuto) this.showToast('Unable to access GPS location. Please tap map pin to adjust site location.');
      };

      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        handleError,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else if (!isAuto) {
      this.showToast('Geolocation is not supported by your browser.');
    }
  }

  initSignaturePads() {
    setTimeout(() => {
      const cInspector = document.getElementById('canvas-inspector');
      const cWitness = document.getElementById('canvas-witness');

      if (cInspector && cWitness) {
        this.inspectorSig = new SignaturePad(cInspector, { color: '#0b1220' });
        this.witnessSig = new SignaturePad(cWitness, { color: '#0b1220' });

        document.getElementById('btn-clear-inspector').addEventListener('click', () => this.inspectorSig.clear());
        document.getElementById('btn-undo-inspector').addEventListener('click', () => this.inspectorSig.undo());

        document.getElementById('btn-clear-witness').addEventListener('click', () => this.witnessSig.clear());
        document.getElementById('btn-undo-witness').addEventListener('click', () => this.witnessSig.undo());
      }
    }, 100);
  }

  initWizard() {
    const steps = document.querySelectorAll('.wizard-step');
    steps.forEach(step => {
      step.addEventListener('click', () => {
        const stepNum = parseInt(step.getAttribute('data-step'), 10);
        this.goToStep(stepNum);
      });
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      if (this.currentStep < this.totalSteps) {
        this.goToStep(this.currentStep + 1);
      }
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
      if (this.currentStep > 1) {
        this.goToStep(this.currentStep - 1);
      }
    });
  }

  goToStep(stepNum) {
    this.currentStep = stepNum;

    for (let i = 1; i <= this.totalSteps; i++) {
      const pane = document.getElementById(`pane-step-${i}`);
      if (pane) pane.style.display = i === stepNum ? 'block' : 'none';

      const stepElem = document.querySelector(`.wizard-step[data-step="${i}"]`);
      if (stepElem) {
        if (i === stepNum) {
          stepElem.classList.add('active');
        } else {
          stepElem.classList.remove('active');
        }
        if (i < stepNum) {
          stepElem.classList.add('completed');
        }
      }

      const line = document.getElementById(`line-${i}`);
      if (line) {
        if (i < stepNum) {
          line.classList.add('active');
        } else {
          line.classList.remove('active');
        }
      }
    }

    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const readyBtn = document.getElementById('btn-mark-ready');

    if (prevBtn) prevBtn.style.visibility = stepNum > 1 ? 'visible' : 'hidden';
    if (nextBtn) {
      if (stepNum === this.totalSteps) {
        nextBtn.style.display = 'none';
      } else {
        nextBtn.style.display = 'inline-flex';
      }
    }
    if (readyBtn) {
      readyBtn.style.display = stepNum === this.totalSteps ? 'inline-flex' : 'none';
    }

    // Gate Step 2 behind the Feeder Path Choice Overlay until it's answered
    if (stepNum === 2) {
      const hidden = document.getElementById('hasNema3r');
      if (hidden && hidden.dataset.answered !== 'true') {
        this.showFeederPathOverlay({ blocking: true });
      }
    }

    // Auto-stamp Time Start when leaving Step 1 or navigating past it
    if (stepNum > 1) {
      const timeStartElem = document.getElementById('timeStart');
      if (timeStartElem && (!timeStartElem.value || timeStartElem.value.trim() === '')) {
        const now = new Date();
        timeStartElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    }

    // Auto-stamp Time End & Populate Audit Summary when reaching Step 4
    if (stepNum === 4) {
      this.updateAuditSummary();

      const timeEndElem = document.getElementById('timeEnd');
      if (timeEndElem && (!timeEndElem.value || timeEndElem.value.trim() === '')) {
        const now = new Date();
        timeEndElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      }

      setTimeout(() => {
        if (this.inspectorSig) this.inspectorSig.resizeCanvas();
        if (this.witnessSig) this.witnessSig.resizeCanvas();
      }, 150);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateAuditSummary() {
    const container = document.getElementById('audit-summary-content');
    if (!container) return;

    const data = this.getFormData();
    
    const clientName = data.clientName || 'N/A';
    const rnNo = data.rnNo || 'N/A';
    const installationNo = data.installationNo || 'N/A';
    const address = data.locationAddress || 'N/A';
    
    const voltage = data.voltageSystem === '220_ll' ? '220 VAC, 1 Ø, L-L' :
                  data.voltageSystem === '220_lg' ? '220 VAC, 1 Ø, L-G' :
                  (data.voltageSpecify || 'Custom System');
    const mainBreaker = data.mainBreaker === 'OTHER' ? (data.mainBreakerOther || 'Not Specified') : (data.mainBreaker || 'Not Specified');
    const spareBreaker = data.spareBreaker || 'YES';
    const grounding = data.groundingSystem || 'YES';

    const chargerType = data.recommendedCharger || '7.4kW AC Single-Phase';
    const distance = data.estimateDistance || 'N/A';
    const pvc = data.pvcQty || 0;
    const emt = data.emtQty || 0;
    const imc = data.imcQty || 0;

    const utilityBox = data.boxUtility || 0;
    const squareBox = data.boxSquare || 0;
    const octagonBox = data.boxOctagon || 0;
    const junctionBox = data.boxJunction || 0;

    container.innerHTML = `
      <div class="executive-docket-card">
        <!-- Docket Header Bar -->
        <div class="exec-docket-bar">
          <div class="exec-docket-brand">
            <div class="exec-docket-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            </div>
            <div>
              <div class="exec-docket-title">EXECUTIVE AUDIT SUMMARY DOCKET</div>
            </div>
          </div>

          <div class="exec-docket-meta">
            <span class="exec-meta-item font-mono">RN: <strong>${rnNo}</strong></span>
            <span class="exec-meta-item font-mono">INST: <strong>${installationNo}</strong></span>
          </div>
        </div>

        <!-- Audit Summary Table Matrix -->
        <div class="exec-summary-table-wrapper">
          <table class="exec-summary-table">
            <thead>
              <tr>
                <th style="width: 28%;">AUDIT CATEGORY</th>
                <th style="width: 32%;">SPECIFICATION PARAMETER</th>
                <th style="width: 40%;">VERIFIED FIELD AUDIT VALUE</th>
              </tr>
            </thead>
            <tbody>
              <!-- CLIENT & LOCATION -->
              <tr>
                <td rowspan="2" class="category-cell">
                  <div class="cat-title">1. CLIENT & LOCATION</div>
                </td>
                <td class="param-name">Client Name</td>
                <td class="param-val">${clientName}</td>
              </tr>
              <tr>
                <td class="param-name">Site Installation Address</td>
                <td class="param-val">${address}</td>
              </tr>

              <!-- FEEDER & PANELBOARD -->
              <tr>
                <td rowspan="3" class="category-cell">
                  <div class="cat-title">2. FEEDER & PANEL</div>
                </td>
                <td class="param-name">Voltage System</td>
                <td class="param-val">${voltage}</td>
              </tr>
              <tr>
                <td class="param-name">Main Distribution Breaker</td>
                <td class="param-val">${mainBreaker}</td>
              </tr>
              <tr>
                <td class="param-name">Spare 40A 2P 230V Breaker</td>
                <td class="param-val">${spareBreaker}</td>
              </tr>

              <!-- EV CHARGER & MATERIALS -->
              <tr>
                <td rowspan="4" class="category-cell">
                  <div class="cat-title">3. CHARGER & MATERIALS</div>
                </td>
                <td class="param-name">Recommended EV Charger</td>
                <td class="param-val">${chargerType}</td>
              </tr>
              <tr>
                <td class="param-name">Tapping Run & Grounding Rod</td>
                <td class="param-val">Est. Run: ${distance} | Grounding Rod: ${grounding}</td>
              </tr>
              <tr>
                <td class="param-name">Roughin Conduits & Boxes</td>
                <td class="param-val">PVC: ${pvc} | EMT: ${emt} | IMC: ${imc} | Boxes: ${utilityBox + squareBox + octagonBox + junctionBox} pcs</td>
              </tr>
              <tr>
                <td class="param-name">Audit Site Photos Verified</td>
                <td class="param-val">Proposed Layout, Tapping Point, Wiring/Conduit, EV Location</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  setDefaultDateTime() {
    const now = new Date();
    const isoString = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    const dateElem = document.getElementById('dateTime');
    if (dateElem && !dateElem.value) {
      dateElem.value = isoString;
    }

    // Auto-stamp Time Start if empty on initial render
    const timeStartElem = document.getElementById('timeStart');
    if (timeStartElem && (!timeStartElem.value || timeStartElem.value.trim() === '')) {
      timeStartElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  renderQtyStepper(name, label, defaultValue = 0) {
    return `
      <div class="stepper-card">
        <span class="option-text">${label}</span>
        <div class="qty-adjuster">
          <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
          <input type="number" class="qty-input" id="${name}" name="${name}" value="${defaultValue}" min="0" />
          <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
        </div>
      </div>
    `;
  }

  renderMiniQty(name, label, defaultValue = 0) {
    return `
      <div class="mini-input-card">
        <span class="mini-card-label">${label}</span>
        <input type="number" class="form-input" id="${name}" name="${name}" value="${defaultValue}" min="0" />
      </div>
    `;
  }

  renderDropdownWithOther(name, label, options) {
    return `
      <div class="form-group">
        <label class="form-label">${label}</label>
        <select class="form-select breaker-dropdown" id="${name}" name="${name}" data-other-target="${name}Other">
          <option value="">-- Select ${label} --</option>
          ${options.map(o => `<option value="${o}">${o}</option>`).join('')}
          <option value="OTHER">Other (Specify)</option>
        </select>
        <input type="text" class="form-input" id="${name}Other" name="${name}Other" placeholder="Please specify" style="display: none; margin-top: 0.5rem;" />
      </div>
    `;
  }

  initEvents() {
    // Preset Sample Data Loader (if present)
    const loadSampleBtn = document.getElementById('btn-load-sample');
    if (loadSampleBtn) {
      loadSampleBtn.addEventListener('click', () => {
        this.populateSampleData();
      });
    }

    // Save Draft
    const saveDraftBtn = document.getElementById('btn-save-draft');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', () => {
        this.saveFormDraft();
      });
    }

    // Submit for Customer Care QA Review
    const readyBtn = document.getElementById('btn-mark-ready');
    if (readyBtn) {
      readyBtn.addEventListener('click', async () => {
        // Auto-update Time End to exact completion time
        const timeEndElem = document.getElementById('timeEnd');
        if (timeEndElem) {
          const now = new Date();
          timeEndElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        }

        const formData = this.getFormData();
        formData.status = 'PENDING_QA';
        // Clear any prior QA review trail so a resubmission after a
        // rejection reads as a fresh, unreviewed submission.
        formData.qaNotes = null;
        formData.qaReviewedBy = null;
        formData.qaReviewedAt = null;

        const user = await AuthGuard.getSessionUser();
        if (user) formData.createdBy = user.id;

        FormStorage.saveReadyInstallation(formData);
        await supabaseService.saveOcularInspection(formData);
        this.showToast('Submitted for Customer Care QA Review! Synced to Supabase Cloud...');
        setTimeout(() => {
          import('../router.js').then(({ Router }) => Router.navigate('/ocular/history'));
        }, 1200);
      });
    }


    const downloadPhotosBtn = document.getElementById('btn-download-photos');
    if (downloadPhotosBtn) {
      downloadPhotosBtn.addEventListener('click', () => this.downloadAllPhotos());
    }

    // Toggle voltage specify group
    const voltageRadios = document.querySelectorAll('input[name="voltageSystem"]');
    voltageRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const specGroup = document.getElementById('voltage-specify-group');
        if (specGroup) {
          specGroup.style.display = e.target.value === 'others' ? 'block' : 'none';
        }
      });
    });

    // Toggle grounding rod location group
    const groundingRadios = document.querySelectorAll('input[name="groundingSystem"]');
    groundingRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const rodGroup = document.getElementById('grounding-rod-group');
        if (rodGroup) {
          rodGroup.style.display = e.target.value === 'NO' ? 'block' : 'none';
        }
      });
    });

    // Toggle "Other (Specify)" text field for any breaker dropdown (Brand, Mounting, Design, Pole)
    document.querySelectorAll('.breaker-dropdown').forEach(select => {
      select.addEventListener('change', (e) => {
        const otherField = document.getElementById(e.target.getAttribute('data-other-target'));
        if (otherField) {
          otherField.style.display = e.target.value === 'OTHER' ? 'block' : 'none';
        }
      });
    });

    // Feeder Path Choice Overlay: picking Main Distribution vs NEMA 3R Enclosure
    // drives which section of Feeder & Panel is shown (see goToStep and
    // applyFeederPathChoice). First-time entry into Step 2 blocks dismissal;
    // reopening via "Change" afterward does not.
    document.querySelectorAll('.modal-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyFeederPathChoice(btn.getAttribute('data-feeder-choice'));
      });
    });

    const changeFeederBtn = document.getElementById('btn-change-feeder-path');
    if (changeFeederBtn) {
      changeFeederBtn.addEventListener('click', () => this.showFeederPathOverlay({ blocking: false }));
    }

    const cancelFeederBtn = document.getElementById('btn-cancel-feeder-path');
    if (cancelFeederBtn) {
      cancelFeederBtn.addEventListener('click', () => this.hideFeederPathOverlay());
    }

    const feederOverlay = document.getElementById('feeder-path-overlay');
    if (feederOverlay) {
      feederOverlay.addEventListener('click', (e) => {
        if (e.target === feederOverlay && feederOverlay.dataset.blocking !== 'true') {
          this.hideFeederPathOverlay();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlay = document.getElementById('feeder-path-overlay');
      if (overlay && overlay.style.display !== 'none' && overlay.dataset.blocking !== 'true') {
        this.hideFeederPathOverlay();
      }
    });
  }

  showFeederPathOverlay({ blocking }) {
    const overlay = document.getElementById('feeder-path-overlay');
    if (!overlay) return;
    overlay.dataset.blocking = blocking ? 'true' : 'false';
    const footer = document.getElementById('feeder-path-overlay-footer');
    if (footer) footer.style.display = blocking ? 'none' : 'flex';
    overlay.style.display = 'flex';
  }

  hideFeederPathOverlay() {
    const overlay = document.getElementById('feeder-path-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  applyFeederPathChoice(value) {
    const hidden = document.getElementById('hasNema3r');
    if (hidden) {
      hidden.value = value;
      hidden.dataset.answered = 'true';
    }
    this.syncFeederPathVisibility(value);
    this.hideFeederPathOverlay();
  }

  // Applies a feeder-path answer's visual effect without opening the overlay
  // or touching the "answered" flag — used both by the live choice above and
  // by populateFormData() when restoring an already-answered draft.
  syncFeederPathVisibility(value) {
    const isYes = value === 'YES';
    const detailGroup = document.getElementById('nema3r-detail-group');
    if (detailGroup) detailGroup.style.display = isYes ? 'block' : 'none';
    const panelboardCard = document.getElementById('main-distribution-panelboard-card');
    if (panelboardCard) panelboardCard.style.display = isYes ? 'none' : 'block';
    const badge = document.getElementById('feederPathBadge');
    if (badge) badge.textContent = isYes ? 'NEMA 3R Enclosure' : 'Main Distribution';
  }

  populateSampleData() {
    this.populateFormData(SAMPLE_OCULAR_DATA, { silent: true });
    this.showToast('Sample form data (Esperanza Bacolod) loaded successfully!');
  }

  // Shared field-hydration routine: fills every input/select whose id
  // matches a data key, checks the matching radio group options, restores
  // photos, and restores signatures if the pads are already initialized.
  // Used by the sample-data loader, "Load Draft", and "Resume & Resubmit".
  populateFormData(data, { silent = false } = {}) {
    if (!data) return;

    for (const [key, value] of Object.entries(data)) {
      if (key === 'photos') continue;
      const field = document.getElementById(key);
      if (field && value !== undefined && value !== null) {
        field.value = value;
      }
    }

    ['voltageSystem', 'spareBreaker', 'spaceProvision', 'groundingSystem'].forEach((name) => {
      if (data[name]) {
        const radio = document.querySelector(`input[name="${name}"][value="${data[name]}"]`);
        if (radio) radio.checked = true;
      }
    });

    // hasNema3r is answered via the Feeder Path Choice Overlay, not a radio —
    // restoring an already-answered draft applies its effect silently
    // (marking it answered) rather than popping the overlay again.
    if (data.hasNema3r) {
      const hidden = document.getElementById('hasNema3r');
      if (hidden) {
        hidden.value = data.hasNema3r;
        hidden.dataset.answered = 'true';
      }
      this.syncFeederPathVisibility(data.hasNema3r);
    }

    if (data.photos) {
      this.populatePhotos(data.photos);
    }

    if (data.inspectorSigImg && this.inspectorSig) this.inspectorSig.fromDataURL(data.inspectorSigImg);
    if (data.witnessSigImg && this.witnessSig) this.witnessSig.fromDataURL(data.witnessSigImg);

    if (!silent) this.showToast('Form data loaded successfully!');
  }

  saveFormDraft() {
    const formData = this.getFormData();
    FormStorage.saveDraft('ocular_inspection', formData);
    this.showToast('Form draft saved locally!');
  }

  getFormData() {
    const form = document.getElementById('ocular-form-element');
    const formData = new FormData(form);
    const data = {};
    for (let [key, value] of formData.entries()) {
      data[key] = value;
    }

    const photoIds = ['proposed_layout', 'tapping_point', 'wiring_conduit', 'ev_charging_location'];
    data.photos = {};
    photoIds.forEach(id => {
      const prevImg = document.getElementById(`prev_${id}`);
      if (prevImg && prevImg.src && prevImg.src.length > 50) {
        data.photos[id] = prevImg.src;
        data[`photo_${id}`] = prevImg.src;
      }
    });

    if (this.inspectorSig) {
      const sigUrl = this.inspectorSig.toDataURL();
      if (isValidBase64Image(sigUrl)) data.inspectorSigImg = sigUrl;
    }
    if (this.witnessSig) {
      const witnessUrl = this.witnessSig.toDataURL();
      if (isValidBase64Image(witnessUrl)) data.witnessSigImg = witnessUrl;
    }
    return data;
  }

  showToast(message) {
    const container = document.querySelector('.toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7CB342" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  downloadAllPhotos() {
    const photoLabels = {
      proposed_layout: 'Proposed_Layout',
      tapping_point: 'Tapping_Point',
      wiring_conduit: 'Wiring_Conduit_Layout',
      ev_charging_location: 'EV_Charging_Location'
    };

    const rnNo = (document.getElementById('rnNo')?.value || 'AUD').replace(/[^a-zA-Z0-9_\-]/g, '_');
    let downloadCount = 0;

    for (const [id, label] of Object.entries(photoLabels)) {
      const img = document.getElementById(`prev_${id}`);
      if (!img || !isValidBase64Image(img.src)) continue;

      const mimeMatch = img.src.match(/^data:image\/([a-zA-Z0-9+]+);base64,/i);
      const ext = mimeMatch ? mimeMatch[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg') : 'jpg';

      const link = document.createElement('a');
      link.href = img.src;
      link.download = `${rnNo}_${label}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      downloadCount++;
    }

    this.showToast(downloadCount > 0
      ? `Downloading ${downloadCount} photo${downloadCount > 1 ? 's' : ''}...`
      : 'No photos uploaded yet to download.');
  }

}
