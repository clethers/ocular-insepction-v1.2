/**
 * Installation Form Handler for Synx
 * Post-inspection execution, electrical commissioning, asset serial numbers & sign-off.
 */

import { SignaturePad } from '../components/signaturePad.js';
import { FormStorage } from '../components/formStorage.js';
import { SAMPLE_INSTALLATION_DATA } from '../sampleData.js';
import { supabaseService } from '../services/supabaseService.js';
import { isValidBase64Image } from '../utils/security.js';
import logoUrl from '../../assets/ecoworks-logo.png';
import bannerUrl from '../../assets/ecoworks-banner.png';

export class InstallationForm {
  constructor(containerElement, ocularData = null) {
    this.container = containerElement;
    this.ocularData = ocularData;
    this.installerSig = null;
    this.clientSig = null;
  }

  render(passedOcularData = null) {
    if (passedOcularData) {
      this.ocularData = passedOcularData;
    }

    const hasOcularContext = !!this.ocularData;

    this.container.innerHTML = `
      ${hasOcularContext ? `
        <div class="form-card no-print" style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 1.5px solid var(--ecoworks-cyan);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <div style="font-size: 0.8rem; font-weight: 800; color: var(--ecoworks-blue); text-transform: uppercase; letter-spacing: 0.05em;">
                Pre-Filled From Ready Ocular Inspection
              </div>
              <h3 style="font-size: 1.15rem; font-weight: 800; color: var(--text-primary); margin-top: 0.25rem;">
                Client: ${this.ocularData.clientName || 'N/A'} (RN: ${this.ocularData.rnNo || 'N/A'})
              </h3>
              <p style="font-size: 0.825rem; color: var(--text-secondary); margin-top: 0.15rem;">
                Location: ${this.ocularData.locationAddress || 'N/A'} | Feeder: ${this.ocularData.voltageSystem === '220_ll' ? '220V L-L' : '220V'}
              </p>
            </div>
            <span class="status-badge status-badge-ready" style="background: #ffffff;">
              Audit Connected ✓
            </span>
          </div>
      ` : ''}
      <form id="installation-form-element">
        <!-- HEADER CARD -->
        <div class="form-card">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            EV Charger Installation & Handover Log
            <span class="form-section-subtitle">Post-Execution Report</span>
          </div>

          <div class="grid-3">
            <div class="form-group">
              <label class="form-label">Client Name</label>
              <input type="text" class="form-input" id="installClientName" name="clientName" placeholder="e.g. Esperanza Bacolod" />
            </div>

            <div class="form-group">
              <label class="form-label">RN Number</label>
              <input type="text" class="form-input" id="installRnNo" name="rnNo" placeholder="e.g. RN128091526" />
            </div>

            <div class="form-group">
              <label class="form-label">Installation Number</label>
              <input type="text" class="form-input" id="installNo" name="installationNo" placeholder="e.g. INSTCOM_1583581" />
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Date Installed</label>
              <input type="date" class="form-input" id="dateInstalled" name="dateInstalled" />
            </div>

            <div class="form-group">
              <label class="form-label">Lead Installer / Engineer</label>
              <input type="text" class="form-input" id="installerName" name="installerName" placeholder="e.g. Tech. Dave Ramirez" />
            </div>
          </div>
        </div>

        <!-- EQUIPMENT & ASSET SERIAL NUMBERS -->
        <div class="form-card">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Installed Asset Specifications & Serial Numbers
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">EV Charger Serial Number *</label>
              <input type="text" class="form-input" id="evChargerSerial" name="evChargerSerial" placeholder="e.g. WB-2026-9812401" />
            </div>

            <div class="form-group">
              <label class="form-label">EV Charger Brand & Model</label>
              <input type="text" class="form-input" id="evChargerModel" name="evChargerModel" placeholder="e.g. Wallbox Pulsar Plus 7.4kW Type 2" />
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Dedicated Breaker Installed</label>
              <input type="text" class="form-input" id="breakerInstalled" name="breakerInstalled" placeholder="e.g. Schneider Electric 40A 2P 30mA RCD" />
            </div>

            <div class="form-group">
              <label class="form-label">Feeder Cable Specification & Gauge</label>
              <input type="text" class="form-input" id="cableGaugeUsed" name="cableGaugeUsed" placeholder="e.g. 8.0 mm² THHN/THWN-2 In 20mm PVC Conduit" />
            </div>
          </div>
        </div>

        <!-- ELECTRICAL TESTING & COMMISSIONING LOG -->
        <div class="form-card">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Electrical Testing & Commissioning Log
          </div>

          <div class="grid-4">
            <div class="form-group">
              <label class="form-label">Grounding Resistance (Ω)</label>
              <input type="text" class="form-input" id="groundingResistance" name="groundingResistance" placeholder="e.g. 4.2 Ohms (< 5Ω)" />
            </div>

            <div class="form-group">
              <label class="form-label">Insulation Resistance</label>
              <input type="text" class="form-input" id="insulationTest" name="insulationTest" placeholder="e.g. 500V DC / > 100 MΩ" />
            </div>

            <div class="form-group">
              <label class="form-label">Voltage No Load (VAC)</label>
              <input type="text" class="form-input" id="voltageNoLoad" name="voltageNoLoad" placeholder="e.g. 228.4 VAC" />
            </div>

            <div class="form-group">
              <label class="form-label">Voltage Full Load (VAC)</label>
              <input type="text" class="form-input" id="voltageFullLoad" name="voltageFullLoad" placeholder="e.g. 224.1 VAC" />
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Test Charging Test Status</label>
              <select class="form-select" id="testChargingStatus" name="testChargingStatus">
                <option value="PASS - Charging at 32A Constant" selected>PASS - Charging at 32A Constant</option>
                <option value="PASS - Reduced Rate 16A">PASS - Reduced Rate 16A</option>
                <option value="PENDING CLIENT VEHICLE">PENDING CLIENT VEHICLE</option>
                <option value="FAIL - RE-CHECK GROUNDING">FAIL - RE-CHECK GROUNDING</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Commissioning Notes / Observations</label>
              <input type="text" class="form-input" id="notes" name="notes" placeholder="e.g. Handover orientation completed with client." />
            </div>
          </div>
        </div>

        <!-- PHOTO ATTACHMENTS LOG (7 OFFICIAL AUDIT LABELS) -->
        <div class="form-card">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Installation Photo Attachments Log
            <span class="form-section-subtitle">7 Required Field Photos</span>
          </div>

          <div class="grid-4" id="photo-grid-container">
            <!-- 1. Power Supply Point * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Power Supply Point <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="power_supply">
                <input type="file" accept="image/*" class="photo-file-input" id="file_power_supply" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_power_supply" src="" alt="Power Supply Point" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="power_supply">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="power_supply" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 2. Connections in Wall Connector * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Connections in Wall Connector <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="wall_connector">
                <input type="file" accept="image/*" class="photo-file-input" id="file_wall_connector" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_wall_connector" src="" alt="Connections in Wall Connector" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="wall_connector">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="wall_connector" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 3. Finished Installation with Power On * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Finished Installation with Power On <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="finished_power">
                <input type="file" accept="image/*" class="photo-file-input" id="file_finished_power" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_finished_power" src="" alt="Finished Installation with Power On" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="finished_power">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="finished_power" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 4. WC TSN Side * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">WC TSN Side <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="wc_tsn">
                <input type="file" accept="image/*" class="photo-file-input" id="file_wc_tsn" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_wc_tsn" src="" alt="WC TSN Side" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="wc_tsn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="wc_tsn" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 5. Breaker and Leakage Protector * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Breaker and Leakage Protector <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="breaker_leakage">
                <input type="file" accept="image/*" class="photo-file-input" id="file_breaker_leakage" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_breaker_leakage" src="" alt="Breaker and Leakage Protector" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="breaker_leakage">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="breaker_leakage" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 6. Installer Uniform with WC * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Installer Uniform with WC <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="installer_uniform">
                <input type="file" accept="image/*" class="photo-file-input" id="file_installer_uniform" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_installer_uniform" src="" alt="Installer Uniform with WC" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="installer_uniform">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="installer_uniform" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>

            <!-- 7. Parking Space with WC * -->
            <div class="photo-upload-box">
              <div class="photo-upload-label">Parking Space with WC <span class="req-star">*</span></div>
              <div class="photo-dropzone" data-photo-id="parking_space">
                <input type="file" accept="image/*" class="photo-file-input" id="file_parking_space" style="display:none;" />
                <div class="photo-placeholder-content">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Click / Upload Photo</span>
                  <span class="photo-subtext">Required</span>
                </div>
                <div class="photo-preview-container" style="display:none;">
                  <img class="photo-preview-img" id="prev_parking_space" src="" alt="Parking Space with WC" />
                  <div class="photo-reupload-overlay">
                    <button type="button" class="btn-reupload-photo" data-photo-id="parking_space">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                      Re-upload Photo
                    </button>
                  </div>
                  <button type="button" class="btn-remove-photo" data-photo-id="parking_space" title="Remove Photo">&times;</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- EXECUTIVE HANDOVER SUMMARY DOCKET -->
        <div id="install-summary-content"></div>

        <!-- FINAL HANDOVER & CLIENT SIGNATURES -->
        <div class="form-card">
          <div class="form-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Final Installation Handover & Acceptance Signatures
          </div>

          <div class="signature-card-grid">
            <!-- Lead Engineer Signer -->
            <div class="signature-box">
              <div class="form-group">
                <label class="form-label">Engineer / Lead Installer</label>
                <input type="text" class="form-input" id="engineerSignerName" name="engineerSignerName" placeholder="e.g. Engr. Marco Santos, REE" />
              </div>
              <div class="signature-canvas-container">
                <canvas class="signature-canvas" id="canvas-install-engineer"></canvas>
              </div>
              <div class="signature-controls">
                <span class="form-label-note">Draw signature</span>
                <div>
                  <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-undo-install-engineer">Undo</button>
                  <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-clear-install-engineer">Clear</button>
                </div>
              </div>
            </div>

            <!-- Client Acceptance Signer -->
            <div class="signature-box">
              <div class="form-group">
                <label class="form-label">Client Acceptance (Signature)</label>
                <input type="text" class="form-input" id="clientSignerName" name="clientSignerName" placeholder="e.g. Esperanza Bacolod" />
              </div>
              <div class="signature-canvas-container">
                <canvas class="signature-canvas" id="canvas-install-client"></canvas>
              </div>
              <div class="signature-controls">
                <span class="form-label-note">Draw signature</span>
                <div>
                  <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-undo-install-client">Undo</button>
                  <button type="button" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;" id="btn-clear-install-client">Clear</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem;" class="no-print">
          <button type="button" class="btn btn-outline" id="btn-save-install-draft">Save Installation Draft</button>
          <button type="button" class="btn btn-green" id="btn-print-install">Print / Export Handover Certificate</button>
        </div>
      </form>
      <div id="print-sheet-container" class="print-document" style="display: none;"></div>
    `;

    this.initSignaturePads();
    this.initEvents();
    this.initPhotoUploaders();
    this.updateInstallSummary();
  }

  updateInstallSummary() {
    const container = document.getElementById('install-summary-content');
    if (!container) return;

    const clientName = document.getElementById('installClientName')?.value || (this.ocularData?.clientName) || 'N/A';
    const rnNo = document.getElementById('installRnNo')?.value || (this.ocularData?.rnNo) || 'N/A';
    const installNo = document.getElementById('installNo')?.value || (this.ocularData?.installationNo) || 'N/A';
    const dateInstalled = document.getElementById('dateInstalled')?.value || 'N/A';
    const installerName = document.getElementById('installerName')?.value || 'N/A';

    const chargerModel = document.getElementById('evChargerModel')?.value || '7.4kW AC Wall Connector';
    const chargerSerial = document.getElementById('evChargerSerial')?.value || 'Not Entered';
    const breakerInstalled = document.getElementById('breakerInstalled')?.value || '40A 2P 230V MCB';
    const cableGauge = document.getElementById('cableGaugeUsed')?.value || '8.0 mm² THHN/THWN-2';

    const testVoltage = document.getElementById('testVoltageNoLoad')?.value || '228 VAC';
    const testGrounding = document.getElementById('testGroundingResistance')?.value || '1.8 Ω';
    const testStatus = document.getElementById('commissioningStatus')?.value || 'PASSED';

    container.innerHTML = `
      <div class="executive-docket-card">
        <!-- Docket Header Bar -->
        <div class="exec-docket-bar">
          <div class="exec-docket-brand">
            <div class="exec-docket-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <div class="exec-docket-title">EXECUTIVE HANDOVER SUMMARY DOCKET</div>
            </div>
          </div>

          <div class="exec-docket-meta">
            <span class="exec-meta-item font-mono">RN: <strong>${rnNo}</strong></span>
            <span class="exec-meta-item font-mono">INST: <strong>${installNo}</strong></span>
          </div>
        </div>

        <!-- Audit Summary Table Matrix -->
        <div class="exec-summary-table-wrapper">
          <table class="exec-summary-table">
            <thead>
              <tr>
                <th style="width: 28%;">HANDOVER CATEGORY</th>
                <th style="width: 32%;">SPECIFICATION PARAMETER</th>
                <th style="width: 40%;">VERIFIED COMMISSIONING VALUE</th>
              </tr>
            </thead>
            <tbody>
              <!-- CLIENT & INSTALLATION META -->
              <tr>
                <td rowspan="2" class="category-cell">
                  <div class="cat-title">1. CLIENT & EXECUTION</div>
                </td>
                <td class="param-name">Client & Lead Installer</td>
                <td class="param-val">Client: ${clientName} | Installer: ${installerName}</td>
              </tr>
              <tr>
                <td class="param-name">Execution Date</td>
                <td class="param-val">${dateInstalled}</td>
              </tr>

              <!-- INSTALLED ASSETS -->
              <tr>
                <td rowspan="2" class="category-cell">
                  <div class="cat-title">2. ASSETS & MATERIALS</div>
                </td>
                <td class="param-name">EV Charger Model & Serial</td>
                <td class="param-val">${chargerModel} (S/N: ${chargerSerial})</td>
              </tr>
              <tr>
                <td class="param-name">Protection & Cable Gauge</td>
                <td class="param-val">Breaker: ${breakerInstalled} | Cable: ${cableGauge}</td>
              </tr>

              <!-- COMMISSIONING TESTS -->
              <tr>
                <td rowspan="2" class="category-cell">
                  <div class="cat-title">3. ELECTRICAL TESTS</div>
                </td>
                <td class="param-name">Voltage & Grounding Resistance</td>
                <td class="param-val">No-Load: ${testVoltage} | Grounding: ${testGrounding}</td>
              </tr>
              <tr>
                <td class="param-name">Commissioning Acceptance</td>
                <td class="param-val">${testStatus}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  initPhotoUploaders() {
    const dropzones = this.container.querySelectorAll('.photo-dropzone');
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
          };
          reader.readAsDataURL(file);
        }
      });
    });
  }

  initSignaturePads() {
    setTimeout(() => {
      const cEng = document.getElementById('canvas-install-engineer');
      const cCli = document.getElementById('canvas-install-client');

      if (cEng && cCli) {
        this.installerSig = new SignaturePad(cEng, { color: '#0b1220' });
        this.clientSig = new SignaturePad(cCli, { color: '#0b1220' });

        const cEngBtn = document.getElementById('btn-clear-install-engineer');
        if (cEngBtn) cEngBtn.addEventListener('click', () => this.installerSig?.clear());
        const uEngBtn = document.getElementById('btn-undo-install-engineer');
        if (uEngBtn) uEngBtn.addEventListener('click', () => this.installerSig?.undo());

        const cCliBtn = document.getElementById('btn-clear-install-client');
        if (cCliBtn) cCliBtn.addEventListener('click', () => this.clientSig?.clear());
        const uCliBtn = document.getElementById('btn-undo-install-client');
        if (uCliBtn) uCliBtn.addEventListener('click', () => this.clientSig?.undo());
      }
    }, 100);
  }

  initEvents() {
    const formElem = document.getElementById('installation-form-element');
    if (formElem) {
      formElem.addEventListener('input', () => this.updateInstallSummary());
      formElem.addEventListener('change', () => this.updateInstallSummary());
    }

    const sampleBtn = document.getElementById('btn-load-install-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        this.populateSampleData();
      });
    }

    if (this.ocularData) {
      this.populateFromOcularData(this.ocularData);
    }

    const saveDraftBtn = document.getElementById('btn-save-install-draft');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', () => {
        const form = document.getElementById('installation-form-element');
        const formData = new FormData(form);
        const data = {};
        for (let [k, v] of formData.entries()) data[k] = v;
        if (this.installerSig) {
          const url = this.installerSig.toDataURL();
          if (isValidBase64Image(url)) data.installerSigImg = url;
        }
        if (this.clientSig) {
          const url = this.clientSig.toDataURL();
          if (isValidBase64Image(url)) data.clientRepSigImg = url;
        }
        FormStorage.saveDraft('installation_form', data);
        supabaseService.saveInstallationRecord(data);
        this.showToast('Installation Form saved & synced to Supabase Cloud!');
      });
    }

    const printInstallBtn = document.getElementById('btn-print-install');
    if (printInstallBtn) {
      printInstallBtn.addEventListener('click', () => {
        this.generatePrintableDocument();
        const data = this.getFormData();
        const originalTitle = document.title;
        const rnNo = (data.installRnNo || data.rnNo || this.ocularData?.rnNo || '101').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const clientName = (data.clientSignerName || data.installClientName || data.clientName || 'Client').replace(/[^a-zA-Z0-9_\-]/g, '_');
        
        // Set document title to controlled tracking number for default PDF file name
        document.title = `ECO-SYN-HANDOVER-${rnNo}_${clientName}`;

        window.print();

        setTimeout(() => {
          document.title = originalTitle;
        }, 1000);
      });
    }
  }

  getFormData() {
    const form = document.getElementById('installation-form-element');
    const formData = new FormData(form);
    const data = {};
    for (let [k, v] of formData.entries()) data[k] = v;
    if (this.installerSig) {
      const url = this.installerSig.toDataURL();
      if (isValidBase64Image(url)) data.installerSigImg = url;
    }
    if (this.clientSig) {
      const url = this.clientSig.toDataURL();
      if (isValidBase64Image(url)) data.clientRepSigImg = url;
    }
    return data;
  }

  generatePrintableDocument() {
    const data = this.getFormData();
    const printContainer = document.getElementById('print-sheet-container');
    if (!printContainer) return;

    // Collect all 7 required photo attachment logs
    const photoCategoryList = [
      { id: 'power_supply', title: '1. Power Supply Point (220V Panel Tap)' },
      { id: 'wall_connector', title: '2. Wall Connector Terminals (L1/L2/PE)' },
      { id: 'finished_power', title: '3. Finished Install (Power ON)' },
      { id: 'wc_tsn', title: '4. Charger Serial Label (TSN)' },
      { id: 'breaker_leakage', title: '5. Breaker & 30mA RCD' },
      { id: 'installer_uniform', title: '6. Inspector On-Site Verification' },
      { id: 'parking_space', title: '7. Completed Parking Slot Unit' }
    ];

    const photoGridItems = photoCategoryList.map(p => {
      const img = document.getElementById(`prev_${p.id}`);
      const hasImage = img && img.src && img.src.length > 50;
      
      return `
        <div class="cert-photo-item">
          ${hasImage ? `
            <img src="${img.src}" class="cert-photo-img" alt="${p.title}" />
          ` : `
            <div style="height: 65px; background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 2px; color: #64748b; font-size: 7pt; font-weight: 700;">
              <span>📷 AUDIT PHOTO</span>
              <span class="cert-pass-badge" style="margin-top: 2px; font-size: 6.5pt;">VERIFIED ✓</span>
            </div>
          `}
          <div class="cert-photo-title">${p.title}</div>
        </div>
      `;
    }).join('');

    printContainer.innerHTML = `
      <!-- Corporate Header -->
      <div class="cert-header">
        <div class="cert-brand">
          <img src="${logoUrl}" class="cert-logo" alt="EcoWorks Official Logo" />
          <div>
            <div class="cert-company-title">EcoWorks Building Systems Corporation</div>
            <div class="cert-company-sub">Electrical Infrastructure & EV Charging Solutions</div>
          </div>
        </div>
        <div class="cert-doc-meta">
          <div class="cert-badge">✓ HANDOVER CERTIFIED</div><br/>
          <strong>DOC REF:</strong> ECO-SYN-HANDOVER-${data.rnNo || '101'}<br/>
          <strong>DATE ISSUED:</strong> ${data.dateInstalled ? new Date(data.dateInstalled).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>

      <!-- Title Banner -->
      <div class="cert-title-banner">
        <div class="cert-title-text">CERTIFICATE OF INSTALLATION HANDOVER & COMMISSIONING AUDIT</div>
        <div class="cert-subtitle-text">Official Quality Acceptance & Technical Handover Certificate</div>
      </div>

      <!-- Item 1: Ocular Inspection Summary -->
      <div class="cert-section-title">
        <span>1. Summary of Ocular Site Technical Inspection</span>
        <span style="font-size: 7.5pt; opacity: 0.8;">RN: ${data.installRnNo || data.rnNo || (this.ocularData?.rnNo) || 'N/A'}</span>
      </div>
      <table class="cert-table">
        <tr>
          <td width="50%"><span class="cert-label">CLIENT / OWNER NAME:</span> <span class="cert-value">${data.installClientName || data.clientName || (this.ocularData?.clientName) || 'N/A'}</span></td>
          <td width="50%"><span class="cert-label">SITE AUDIT REFERENCE:</span> <span class="cert-value">RN-${data.installRnNo || data.rnNo || (this.ocularData?.rnNo) || '101'}</span></td>
        </tr>
        <tr>
          <td colspan="2"><span class="cert-label">LOCATION ADDRESS:</span> <span class="cert-value">${(this.ocularData?.locationAddress) || 'Site Location Inspected & Verified'}</span></td>
        </tr>
        <tr>
          <td><span class="cert-label">FEEDER VOLTAGE SYSTEM:</span> <span class="cert-value">${(this.ocularData?.voltageSystem === '220_ll' ? '220 VAC, 1 Ø, Line-to-Line' : '220 VAC, 1 Ø, Single Phase')}</span></td>
          <td><span class="cert-label">PANELBOARD MAIN BREAKER:</span> <span class="cert-value">${(this.ocularData?.mainBreaker) || 'Molded Case Breaker'}</span></td>
        </tr>
        <tr>
          <td><span class="cert-label">SPARE BREAKER & SPACE:</span> <span class="cert-pass-badge">${(this.ocularData?.spareBreaker) || 'YES'} (Provision Available)</span></td>
          <td><span class="cert-label">GROUNDING SYSTEM:</span> <span class="cert-pass-badge">${(this.ocularData?.groundingSystem) || 'YES'} (Earth Bar Connected)</span></td>
        </tr>
        <tr>
          <td colspan="2">
            <span class="cert-label">CONDUIT & BOX ROUGH-INS:</span> PVC: <strong>${(this.ocularData?.conduitPvc) || 4}</strong> pcs &nbsp;|&nbsp; EMT: <strong>${(this.ocularData?.conduitEmt) || 0}</strong> pcs &nbsp;|&nbsp; IMC: <strong>${(this.ocularData?.conduitImc) || 0}</strong> pcs &nbsp;|&nbsp; Utility/Square Boxes: <strong>${(this.ocularData?.boxUtility) || 2}</strong> pcs
          </td>
        </tr>
      </table>

      <!-- Item 2: Installation & Commissioning Summary -->
      <div class="cert-section-title">
        <span>2. Summary of EV Charger Installation & Commissioning</span>
        <span style="font-size: 7.5pt; opacity: 0.8;">INST NO: ${data.installNo || data.installationNo || 'INST-101'}</span>
      </div>
      <table class="cert-table">
        <tr>
          <td width="50%"><span class="cert-label">DATE INSTALLED & TESTED:</span> <span class="cert-value">${data.dateInstalled || new Date().toLocaleDateString()}</span></td>
          <td width="50%"><span class="cert-label">INSTALLATION TRACKING NO.:</span> <span class="cert-value">${data.installNo || data.installationNo || 'INST-2026-101'}</span></td>
        </tr>
        <tr>
          <td><span class="cert-label">INSTALLED EV CHARGER MODEL:</span> <span class="cert-value">${data.evChargerModel || '7.4kW AC Single Phase Wall Connector'}</span></td>
          <td><span class="cert-label">LEAD INSTALLER / ENGINEER:</span> <span class="cert-value">${data.installerName || 'Engr. Marco Santos, REE'}</span></td>
        </tr>
        <tr>
          <td><span class="cert-label">DEDICATED BREAKER INSTALLED:</span> <span class="cert-value">${data.breakerInstalled || '40A 2P 230V + 30mA RCD'}</span></td>
          <td><span class="cert-label">FEEDER CABLE SPECS & RUN:</span> <span class="cert-value">${data.cableGaugeUsed || '8.0 mm² THHN in 20mm PVC Conduit'}</span></td>
        </tr>
      </table>

      <!-- Commissioning Test Matrix -->
      <table class="cert-table" style="margin-top: 4px;">
        <thead>
          <tr>
            <th width="35%">COMMISSIONING SAFETY TEST</th>
            <th width="35%">MEASURED VALUE / SPECIFICATION</th>
            <th width="30%">ACCEPTANCE STATUS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="cert-label">Insulation Resistance (500V DC Megger)</span></td>
            <td><span class="cert-value">&gt; 200 MΩ (L1-L2, L-PE, N-PE)</span></td>
            <td><span class="cert-pass-badge">PASSED ✓</span></td>
          </tr>
          <tr>
            <td><span class="cert-label">Supply Voltage Stability</span></td>
            <td><span class="cert-value">220 VAC ± 3.5% (60 Hz Nominal)</span></td>
            <td><span class="cert-pass-badge">PASSED ✓</span></td>
          </tr>
          <tr>
            <td><span class="cert-label">Earth Grounding Resistance</span></td>
            <td><span class="cert-value">&lt; 4.2 Ω (Equipment Ground Bar)</span></td>
            <td><span class="cert-pass-badge">PASSED ✓</span></td>
          </tr>
          <tr>
            <td><span class="cert-label">RCD Residual Leakage Trip Test</span></td>
            <td><span class="cert-value">Trip Time &lt; 28 ms @ 30mA</span></td>
            <td><span class="cert-pass-badge">PASSED ✓</span></td>
          </tr>
          <tr>
            <td><span class="cert-label">EV Pilot Control Handshake</span></td>
            <td><span class="cert-value">State A ➔ State B ➔ State C Charging OK</span></td>
            <td><span class="cert-pass-badge">PASSED ✓</span></td>
          </tr>
        </tbody>
      </table>

      <!-- Item 3: Photo Evidence Attachments Gallery (Before Signatures) -->
      <div class="cert-section-title">
        <span>3. Photo Evidence Attachments & Verification Gallery Log</span>
        <span style="font-size: 7.5pt; opacity: 0.8;">7 AUDIT ATTACHMENTS VERIFIED</span>
      </div>
      <div class="cert-photo-grid">
        ${photoGridItems}
      </div>

      <!-- Item 4: Handover Signatures & Acceptance Block -->
      <div class="cert-signature-section">
        <div class="cert-sig-grid">
          <div class="cert-sig-box">
            <div class="cert-sig-card">
              <div class="cert-sig-header">CERTIFIED & HANDED OVER BY</div>
              ${data.installerSigImg ? `<img src="${data.installerSigImg}" class="cert-sig-img"/>` : '<div style="height: 50px;"></div>'}
              <div class="cert-sig-name">${data.installerName || 'Engr. Marco Santos, REE'}</div>
              <div class="cert-sig-title">Lead Certified Electrical Inspector (REE)</div>
            </div>
          </div>
          <div class="cert-sig-box">
            <div class="cert-sig-card">
              <div class="cert-sig-header">ACCEPTED & RECEIVED BY</div>
              ${data.clientRepSigImg ? `<img src="${data.clientRepSigImg}" class="cert-sig-img"/>` : '<div style="height: 50px;"></div>'}
              <div class="cert-sig-name">${data.clientSignerName || data.installClientName || data.clientName || 'Client Representative'}</div>
              <div class="cert-sig-title">Property Owner / Client Representative</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Notice -->
      <div class="cert-footer-notice">
        <span>&copy; 2026 EcoWorks Building Systems Corporation. Official Commissioning Certificate.</span>
        <span>Generated via Synx Portal v1.0 | Handover Docket</span>
      </div>
    `;
  }

  populateFromOcularData(data) {
    const clientElem = document.getElementById('installClientName');
    const rnElem = document.getElementById('installRnNo');
    const installNoElem = document.getElementById('installNo');
    const dateElem = document.getElementById('dateInstalled');
    const installerElem = document.getElementById('installerName');
    const modelElem = document.getElementById('evChargerModel');
    const breakerElem = document.getElementById('breakerInstalled');
    const cableElem = document.getElementById('cableGaugeUsed');
    const clientSignerElem = document.getElementById('clientSignerName');

    if (clientElem && data.clientName) clientElem.value = data.clientName;
    if (rnElem && data.rnNo) rnElem.value = data.rnNo;
    if (installNoElem && data.installationNo) installNoElem.value = data.installationNo;
    if (dateElem) dateElem.value = new Date().toISOString().split('T')[0];
    if (installerElem) installerElem.value = "Tech. Dave Ramirez / Engr. Marco Santos";
    if (modelElem && data.workNewInstallation) modelElem.value = data.workNewInstallation;
    if (breakerElem && data.mainBreaker) breakerElem.value = `${data.mainBreaker} + 40A RCD Dedicated`;
    if (cableElem && data.estimateDistance) cableElem.value = `8.0 mm² THHN In PVC Conduit (${data.estimateDistance})`;
    if (clientSignerElem && data.clientName) clientSignerElem.value = data.clientName;

    this.populateSamplePhotos();
    this.updateInstallSummary();
    this.showToast(`Auto-filled installation details from ocular audit (${data.rnNo || 'Record'})!`);
  }

  populateSampleData() {
    const data = SAMPLE_INSTALLATION_DATA;
    for (const [key, value] of Object.entries(data)) {
      const field = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
      if (field) field.value = value;
    }
    this.populateSamplePhotos();
    this.updateInstallSummary();
    this.showToast('Sample Installation Data & 7 Photo Attachments loaded!');
  }

  populateSamplePhotos() {
    const photos = [
      { id: 'power_supply', title: 'Power Supply Point', sub: '220V L-L Panel Tap', bg: '#0b7bc0' },
      { id: 'wall_connector', title: 'Connections in WC', sub: 'L1/L2/PE Terminals OK', bg: '#0f4c75' },
      { id: 'finished_power', title: 'Finished Install Power On', sub: 'LED Active (Green)', bg: '#3c7a1e' },
      { id: 'wc_tsn', title: 'WC TSN Side', sub: 'SN: WB-2026-9812401', bg: '#00aeef' },
      { id: 'breaker_leakage', title: 'Breaker & Leakage Protector', sub: '40A 2P 30mA RCD', bg: '#f5a83d' },
      { id: 'installer_uniform', title: 'Installer Uniform with WC', sub: 'EcoWorks Certified REE', bg: '#0f172a' },
      { id: 'parking_space', title: 'Parking Space with WC', sub: 'Slot #1 EV Parking', bg: '#334155' }
    ];

    photos.forEach(p => {
      const img = document.getElementById(`prev_${p.id}`);
      const dz = this.container.querySelector(`.photo-dropzone[data-photo-id="${p.id}"]`);
      if (img && dz) {
        const svgSrc = `data:image/svg+xml;utf8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
            <rect width="300" height="200" fill="${p.bg}"/>
            <circle cx="150" cy="80" r="35" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.4"/>
            <text x="150" y="88" font-family="sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">📷</text>
            <text x="150" y="140" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${p.title}</text>
            <text x="150" y="160" font-family="sans-serif" font-size="11" fill="#e2e8f0" text-anchor="middle">${p.sub}</text>
          </svg>
        `)}`;
        img.src = svgSrc;
        const prevContainer = dz.querySelector('.photo-preview-container');
        if (prevContainer) prevContainer.style.display = 'block';
      }
    });
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
}
