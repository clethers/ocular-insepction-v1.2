/**
 * Ocular Inspection Form Handler for Synx
 * Renders interactive UI form matching physical EcoWorks inspection form
 */

import { SignaturePad } from '../components/signaturePad.js';
import { FormStorage } from '../components/formStorage.js';
import { SAMPLE_OCULAR_DATA } from '../sampleData.js';
import { supabaseService } from '../services/supabaseService.js';
import { isValidBase64Image } from '../utils/security.js';
import logoUrl from '../../assets/ecoworks-logo.png';
import bannerUrl from '../../assets/ecoworks-banner.png';

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
          <div class="form-card">
            <div class="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              Main Distribution Panelboard
            </div>

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Main Breaker (Please Specify)</label>
                <input type="text" class="form-input" id="mainBreaker" name="mainBreaker" placeholder="e.g. 60A 2P 230V Bolt-On" />
              </div>

              <div class="form-group">
                <label class="form-label">No. of Branches (Please Specify)</label>
                <input type="text" class="form-input" id="noOfBranches" name="noOfBranches" placeholder="e.g. 8 Circuits" />
              </div>
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

            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Existing Breaker Brand and Type</label>
                <input type="text" class="form-input" id="breakerBrandType" name="breakerBrandType" placeholder="e.g. Schneider Electric Bolt-on" />
              </div>

              <div class="form-group">
                <label class="form-label">Breaker Mounting Type</label>
                <div class="option-grid">
                  <label class="custom-option">
                    <input type="radio" name="breakerMounting" value="BOLT-ON" checked />
                    <span class="option-text">BOLT-ON</span>
                  </label>
                  <label class="custom-option">
                    <input type="radio" name="breakerMounting" value="PLUG-IN" />
                    <span class="option-text">PLUG-IN</span>
                  </label>
                </div>
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
        </div>

        <!-- STEP 3: EV CHARGER INSTALLATION CHECKLIST -->
        <div class="wizard-pane" id="pane-step-3" style="display: none;">
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

              <div class="form-group">
                <label class="form-label">Estimated Distance from Tapping Point</label>
                <input type="text" class="form-input" id="estimateDistance" name="estimateDistance" placeholder="e.g. 14 Meters" />
              </div>
            </div>

            <!-- Roughins Conduit Quantities -->
            <div class="form-group">
              <label class="form-label">Roughins (Conduit Type & Quantity)</label>
              <div class="grid-3">
                <div class="stepper-card">
                  <span class="option-text">PVC Conduit</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="conduitPvc" name="conduitPvc" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>

                <div class="stepper-card">
                  <span class="option-text">EMT Conduit</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="conduitEmt" name="conduitEmt" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>

                <div class="stepper-card">
                  <span class="option-text">IMC Conduit</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="conduitImc" name="conduitImc" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Conduit Fittings -->
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Liquid Tight Fittings</label>
                <div class="field-row">
                  <div class="option-grid" style="flex: 1;">
                    <label class="custom-option">
                      <input type="radio" name="liquidTightFittings" value="YES" checked />
                      <span class="option-text">YES</span>
                    </label>
                    <label class="custom-option">
                      <input type="radio" name="liquidTightFittings" value="NO" />
                      <span class="option-text">NO</span>
                    </label>
                  </div>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="liquidTightQty" name="liquidTightQty" value="4" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Conduit Bodies (LB, LR, LL, T)</label>
                <div class="grid-4">
                  <div class="mini-input-card">
                    <span class="mini-card-label">LB</span>
                    <input type="number" class="form-input" id="bodyLb" name="bodyLb" value="0" min="0" />
                  </div>
                  <div class="mini-input-card">
                    <span class="mini-card-label">LR</span>
                    <input type="number" class="form-input" id="bodyLr" name="bodyLr" value="0" min="0" />
                  </div>
                  <div class="mini-input-card">
                    <span class="mini-card-label">LL</span>
                    <input type="number" class="form-input" id="bodyLl" name="bodyLl" value="0" min="0" />
                  </div>
                  <div class="mini-input-card">
                    <span class="mini-card-label">T</span>
                    <input type="number" class="form-input" id="bodyT" name="bodyT" value="0" min="0" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Electrical Boxes -->
            <div class="form-group">
              <label class="form-label">Electrical Boxes Quantity (PCS)</label>
              <div class="grid-4">
                <div class="stepper-card">
                  <span class="option-text">UTILITY</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="boxUtility" name="boxUtility" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>

                <div class="stepper-card">
                  <span class="option-text">SQUARE BOX</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="boxSquare" name="boxSquare" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>

                <div class="stepper-card">
                  <span class="option-text">OCTAGON BOX</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="boxOctagon" name="boxOctagon" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>

                <div class="stepper-card">
                  <span class="option-text">JUNCTION BOX</span>
                  <div class="qty-adjuster">
                    <button type="button" class="qty-btn" onclick="this.nextElementSibling.stepDown()">-</button>
                    <input type="number" class="qty-input" id="boxJunction" name="boxJunction" value="0" min="0" />
                    <button type="button" class="qty-btn" onclick="this.previousElementSibling.stepUp()">+</button>
                  </div>
                </div>
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
                    <img class="photo-preview-img" id="prev_proposed_layout" src="" alt="Proposed Layout" />
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
                    <img class="photo-preview-img" id="prev_tapping_point" src="" alt="Tapping Point" />
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
                    <img class="photo-preview-img" id="prev_wiring_conduit" src="" alt="Wiring/Conduit Layout" />
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
                    <img class="photo-preview-img" id="prev_ev_charging_location" src="" alt="EV Charging Location" />
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

            <button type="button" class="btn btn-green" id="btn-print-preview">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print / Export Form
            </button>

            <button type="button" class="btn btn-primary" id="btn-next">
              Next Step →
            </button>

            <button type="button" class="btn btn-primary" id="btn-mark-ready" style="background: linear-gradient(135deg, var(--ecoworks-green), var(--ecoworks-green-shadow)); color: #fff; display: none; border-color: var(--ecoworks-green-light);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Mark Ready for Installation →
            </button>
          </div>
        </div>
      </form>

      <!-- Printable Sheet Container (Rendered on Demand) -->
      <div id="print-sheet-container" class="print-document" style="display: none;"></div>
    `;

    this.initSignaturePads();
    this.initEvents();
    this.initWizard();
    this.setDefaultDateTime();
    this.initMap();
    this.initPhotoUploaders();
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
    const mainBreaker = data.mainBreaker || 'Not Specified';
    const spareBreaker = data.spareBreaker || 'YES';
    const grounding = data.groundingSystem || 'YES';

    const chargerType = data.recommendedCharger || '7.4kW AC Single-Phase';
    const distance = data.distanceFromTapping || 'N/A';
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

    // Mark Ready for Installation
    const readyBtn = document.getElementById('btn-mark-ready');
    if (readyBtn) {
      readyBtn.addEventListener('click', () => {
        // Auto-update Time End to exact completion time
        const timeEndElem = document.getElementById('timeEnd');
        if (timeEndElem) {
          const now = new Date();
          timeEndElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        }

        const formData = this.getFormData();
        formData.status = 'READY_FOR_INSTALLATION';
        FormStorage.saveReadyInstallation(formData);
        supabaseService.saveOcularInspection(formData);
        this.showToast('Inspection marked READY FOR INSTALLATION! Synced to Supabase Cloud...');
        setTimeout(() => {
          const readyNavBtn = document.querySelector('[data-view="ready"]');
          if (readyNavBtn) readyNavBtn.click();
        }, 1200);
      });
    }

    // Print / Export
    const printPreviewBtn = document.getElementById('btn-print-preview');
    if (printPreviewBtn) {
      printPreviewBtn.addEventListener('click', () => {
        // Auto-update Time End before export if empty
        const timeEndElem = document.getElementById('timeEnd');
        if (timeEndElem && (!timeEndElem.value || timeEndElem.value.trim() === '')) {
          const now = new Date();
          timeEndElem.value = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        }

        this.generatePrintableDocument();
        const data = this.getFormData();
        const originalTitle = document.title;
        const rnNo = (data.rnNo || '101').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const clientName = (data.clientName || 'Client').replace(/[^a-zA-Z0-9_\-]/g, '_');

        // Set document title to controlled tracking number for default PDF file name
        document.title = `ECO-SYN-AUD-${rnNo}_${clientName}`;

        window.print();

        setTimeout(() => {
          document.title = originalTitle;
        }, 1000);
      });
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
  }

  populateSampleData() {
    const data = SAMPLE_OCULAR_DATA;
    for (const [key, value] of Object.entries(data)) {
      const field = document.getElementById(key);
      if (field) {
        field.value = value;
      }
    }

    // Radio fields
    if (data.voltageSystem) {
      const radio = document.querySelector(`input[name="voltageSystem"][value="${data.voltageSystem}"]`);
      if (radio) radio.checked = true;
    }
    if (data.spareBreaker) {
      const radio = document.querySelector(`input[name="spareBreaker"][value="${data.spareBreaker}"]`);
      if (radio) radio.checked = true;
    }
    if (data.spaceProvision) {
      const radio = document.querySelector(`input[name="spaceProvision"][value="${data.spaceProvision}"]`);
      if (radio) radio.checked = true;
    }
    if (data.breakerMounting) {
      const radio = document.querySelector(`input[name="breakerMounting"][value="${data.breakerMounting}"]`);
      if (radio) radio.checked = true;
    }
    if (data.groundingSystem) {
      const radio = document.querySelector(`input[name="groundingSystem"][value="${data.groundingSystem}"]`);
      if (radio) radio.checked = true;
    }
    if (data.liquidTightFittings) {
      const radio = document.querySelector(`input[name="liquidTightFittings"][value="${data.liquidTightFittings}"]`);
      if (radio) radio.checked = true;
    }

    if (data.photos) {
      this.populatePhotos(data.photos);
    }

    this.showToast('Sample form data (Esperanza Bacolod) loaded successfully!');
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

  formatPrintDateTime(rawDate) {
    if (!rawDate) {
      const now = new Date();
      return now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return rawDate;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  generatePrintableDocument() {
    const data = this.getFormData();
    const printContainer = document.getElementById('print-sheet-container');
    
    printContainer.innerHTML = `
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
          <td width="50%"><span class="cert-label">AUDIT DATE & TIME:</span> <span class="cert-value">${this.formatPrintDateTime(data.dateTime)} (${data.timeStart || '--'} - ${data.timeEnd || '--'})</span></td>
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
          <td><span class="cert-label">BREAKER BRAND / TYPE:</span> <span class="cert-value">${data.breakerBrandType || 'N/A'}</span></td>
          <td><span class="cert-label">BREAKER MOUNTING TYPE:</span> <span class="cert-value">${data.breakerMounting || 'Bolt-on'}</span></td>
        </tr>
        <tr>
          <td colspan="2">
            <span class="cert-label">EQUIPMENT GROUNDING SYSTEM:</span> <span class="cert-pass-badge">${data.groundingSystem || 'YES'}</span> &nbsp;&nbsp;
            <em>(Ground Rod Location Note: ${data.groundingRodLocation || 'Standard Panel Earth Bar'})</em>
          </td>
        </tr>
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
            <span class="cert-label">CONDUIT ROUGH-IN REQUIREMENTS:</span> PVC: <strong>${data.conduitPvc || 0}</strong> pcs &nbsp;|&nbsp; EMT: <strong>${data.conduitEmt || 0}</strong> pcs &nbsp;|&nbsp; IMC: <strong>${data.conduitImc || 0}</strong> pcs<br/>
            <span class="cert-label">FITTINGS & CONDUIT BODIES:</span> Liquid-Tight: <strong>${data.liquidTightQty || 0}</strong> pcs (${data.liquidTightFittings || 'YES'}) &nbsp;|&nbsp; LB: <strong>${data.bodyLb || 0}</strong> &nbsp;|&nbsp; LR: <strong>${data.bodyLr || 0}</strong> &nbsp;|&nbsp; LL: <strong>${data.bodyLl || 0}</strong> &nbsp;|&nbsp; T: <strong>${data.bodyT || 0}</strong><br/>
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
        <span style="font-size: 7.5pt; opacity: 0.8;">4 FIELD PHOTOS VERIFIED</span>
      </div>
      <div class="cert-photo-grid">
        ${[
          { id: 'proposed_layout', title: '1. Proposed Layout' },
          { id: 'tapping_point', title: '2. Tapping Point' },
          { id: 'wiring_conduit', title: '3. Wiring/Conduit Layout' },
          { id: 'ev_charging_location', title: '4. EV Charging Location' }
        ].map(p => {
          const img = document.getElementById(`prev_${p.id}`);
          const hasImage = img && img.src && img.src.length > 50;
          return `
            <div class="cert-photo-item">
              ${hasImage ? `
                <img src="${img.src}" class="cert-photo-img" alt="${p.title}" />
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
}
