/**
 * Synx Portal — Supabase Integration & Hybrid Cloud Data Service
 */

import { FormStorage } from '../components/formStorage.js';

class SupabaseService {
  constructor() {
    this.supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('synx_supabase_url') || '';
    this.supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || localStorage.getItem('synx_supabase_key') || '';
    this.client = null;
    this.initClient();
  }

  initClient() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log('[Synx Supabase] Connected to live Supabase backend instance:', this.supabaseUrl);
      } catch (err) {
        console.warn('[Synx Supabase] Initialization error:', err);
      }
    }
  }

  isConfigured() {
    return !!this.client;
  }

  // Caps how long we wait on a Supabase call before falling back to local data.
  // Without this, an unreachable backend retries with exponential backoff
  // (observed ~7.4s) before the underlying promise ever settles.
  withTimeout(promiseLike, ms = 3000, label = 'Supabase request') {
    // Supabase query builders are "thenables" that re-run their query on every
    // .then() call, so materialize a real Promise exactly once via
    // Promise.resolve() and reuse it below rather than calling .then() twice.
    const promise = Promise.resolve(promiseLike);
    promise.catch(() => {}); // avoid an unhandled rejection if this loses the race
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
    ]);
  }

  async fetchReadyInspections() {
    if (this.isConfigured()) {
      try {
        const { data, error } = await this.withTimeout(
          this.client
            .from('ocular_inspections')
            .select('*')
            .eq('status', 'READY_FOR_INSTALLATION')
            .order('created_at', { ascending: false }),
          3000,
          'Fetch ready inspections'
        );

        if (error) throw error;
        if (data && data.length > 0) {
          return data.map(item => this.mapSupabaseToLocal(item));
        }
      } catch (err) {
        console.warn('[Synx Supabase] Falling back to local storage cache:', err.message);
      }
    }

    // Fallback to local storage
    try {
      return FormStorage.listReadyInstallations() || [];
    } catch (e) {
      return [];
    }
  }

  async saveOcularInspection(formData) {
    const localSaved = FormStorage.saveReadyInstallation(formData);

    if (this.isConfigured()) {
      try {
        const payload = this.mapLocalToSupabase(formData);
        const { data, error } = await this.client
          .from('ocular_inspections')
          .upsert(payload, { onConflict: 'rn_no' })
          .select();

        if (error) throw error;
        console.log('[Synx Supabase] Saved ocular inspection to Supabase cloud:', data);
      } catch (err) {
        console.warn('[Synx Supabase] Saved locally. Sync pending to Supabase:', err.message);
      }
    }

    return localSaved;
  }

  async saveInstallationRecord(formData) {
    if (this.isConfigured()) {
      try {
        const payload = {
          rn_no: formData.rnNo,
          installation_no: formData.installationNo,
          client_name: formData.clientName,
          scope_of_works: formData.scopeOfWorks || 'Installation',
          commissioning_data: formData.tests || {},
          photo_attachments: formData.photos || [],
          installer_name: formData.installerName,
          installer_sig_img: formData.installerSigImg,
          client_rep_name: formData.clientRepName,
          client_rep_sig_img: formData.clientRepSigImg,
          status: 'COMMISSIONED'
        };

        const { data, error } = await this.client
          .from('installation_records')
          .insert([payload]);

        if (error) throw error;
        console.log('[Synx Supabase] Saved installation record to Supabase cloud:', data);
      } catch (err) {
        console.warn('[Synx Supabase] Saved locally. Sync pending:', err.message);
      }
    }

    return true;
  }

  // Single source of truth for local(camelCase)<->Supabase(snake_case) field
  // names, so the two directions can't drift apart again the way the old
  // hand-picked-subset versions of these functions did. deleted_at is
  // deliberately not here — it's an archive marker, never part of local
  // form data.
  static FIELD_MAP = [
    ['rnNo', 'rn_no'],
    ['installationNo', 'installation_no'],
    ['clientName', 'client_name'],
    ['contactNo', 'contact_no'],
    ['scopeOfWorks', 'scope_of_works'],
    ['locationAddress', 'location_address'],
    ['dateTime', 'date_time'],
    ['timeStart', 'time_start'],
    ['timeEnd', 'time_end'],
    ['voltageSystem', 'voltage_system'],
    ['voltageSpecify', 'voltage_specify'],
    ['mainBreaker', 'main_breaker'],
    ['noOfBranches', 'no_branches'],
    ['spareBreaker', 'spare_breaker'],
    ['spaceProvision', 'space_provision'],
    ['breakerBrandType', 'breaker_brand'],
    ['breakerBrandTypeOther', 'breaker_brand_other'],
    ['breakerMounting', 'breaker_mounting'],
    ['breakerMountingOther', 'breaker_mounting_other'],
    ['breakerDesign', 'breaker_design'],
    ['breakerDesignOther', 'breaker_design_other'],
    ['breakerPole', 'breaker_pole'],
    ['breakerPoleOther', 'breaker_pole_other'],
    ['groundingSystem', 'grounding_system'],
    ['groundingRodLocation', 'grounding_rod_location'],
    ['hasNema3r', 'nema3r_has'],
    ['nema3rBreaker', 'nema3r_breaker'],
    ['nema3rBrandType', 'nema3r_brand_type'],
    ['nema3rBrandTypeOther', 'nema3r_brand_type_other'],
    ['nema3rMounting', 'nema3r_mounting'],
    ['nema3rMountingOther', 'nema3r_mounting_other'],
    ['nema3rDesign', 'nema3r_design'],
    ['nema3rDesignOther', 'nema3r_design_other'],
    ['nema3rPole', 'nema3r_pole'],
    ['nema3rPoleOther', 'nema3r_pole_other'],
    ['chargerLocation', 'charger_location'],
    ['estimateDistance', 'estimate_distance'],
    ['conduitPvc', 'pvc_qty'],
    ['conduitEmt', 'emt_qty'],
    ['conduitImc', 'imc_qty'],
    ['conduitRsc', 'conduit_rsc_qty'],
    ['conduitPvcMoulding', 'conduit_pvc_moulding_qty'],
    ['conduitBlackFlexible', 'conduit_black_flexible_qty'],
    ['conduitPvcFlexibleOrange', 'conduit_pvc_flexible_orange_qty'],
    ['conduitOtherType', 'conduit_other_type'],
    ['conduitOtherQty', 'conduit_other_qty'],
    ['elbowEmt90', 'elbow_emt90_qty'],
    ['elbowImc90', 'elbow_imc90_qty'],
    ['elbowRsc90', 'elbow_rsc90_qty'],
    ['bodyLb', 'lb_qty'],
    ['bodyLr', 'lr_qty'],
    ['bodyLl', 'll_qty'],
    ['bodyC', 'body_c_qty'],
    ['bodyT', 't_qty'],
    ['liquidTightConnectorQty', 'liquid_tight_connector_qty'],
    ['liquidTightFlexLength', 'liquid_tight_flex_length'],
    ['connectorEmtSetScrew', 'connector_emt_set_screw_qty'],
    ['connectorEmtCompression', 'connector_emt_compression_qty'],
    ['couplingEmtSetScrew', 'coupling_emt_set_screw_qty'],
    ['couplingEmtCompression', 'coupling_emt_compression_qty'],
    ['clampCTwoHole', 'clamp_c_two_hole_qty'],
    ['clampCOneHole', 'clamp_c_one_hole_qty'],
    ['clampStrapMalleable', 'clamp_strap_malleable_qty'],
    ['boxUtility', 'utility_box_qty'],
    ['boxSquare', 'square_box_qty'],
    ['boxOctagon', 'octagon_box_qty'],
    ['boxJunction', 'junction_box_qty'],
    ['workRetrofitting', 'retrofittings'],
    ['workReplacement', 'replacement'],
    ['workNewInstallation', 'new_installation'],
    ['inspectedByName', 'inspected_by_name'],
    ['inspectorSigImg', 'inspector_sig_img'],
    ['witnessedByName', 'witnessed_by_name'],
    ['witnessSigImg', 'witness_sig_img']
  ];

  mapSupabaseToLocal(row) {
    const data = { id: row.id };
    for (const [localKey, column] of SupabaseService.FIELD_MAP) {
      data[localKey] = row[column];
    }
    data.dateTimeDisplay = row.date_time ? new Date(row.date_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
    data.photos = row.photo_attachments || {};
    data.status = row.status;
    return data;
  }

  mapLocalToSupabase(data) {
    const payload = {
      client_name: data.clientName || 'Unnamed Client',
      rn_no: data.rnNo || `RN-${Date.now()}`,
      installation_no: data.installationNo || `INST-${Date.now()}`
    };
    for (const [localKey, column] of SupabaseService.FIELD_MAP) {
      if (column === 'client_name' || column === 'rn_no' || column === 'installation_no') continue;
      if (data[localKey] !== undefined) payload[column] = data[localKey];
    }
    payload.photo_attachments = data.photos || {};
    payload.status = data.status || 'READY_FOR_INSTALLATION';
    return payload;
  }

  subscribeToReadyQueue(callback) {
    if (this.isConfigured()) {
      try {
        return this.client
          .channel('public:ocular_inspections')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ocular_inspections' }, payload => {
            console.log('[Synx Supabase Realtime] Event received:', payload);
            if (callback) callback(payload);
          })
          .subscribe();
      } catch (err) {
        console.warn('[Synx Supabase Realtime] Could not subscribe:', err);
      }
    }
    return null;
  }

  async fetchDashboardMetrics() {
    if (this.isConfigured()) {
      try {
        const { data: oculars } = await this.withTimeout(this.client.from('ocular_inspections').select('status'), 3000, 'Fetch ocular metrics');
        const { data: installs } = await this.withTimeout(this.client.from('installation_records').select('status'), 3000, 'Fetch installation metrics');

        const ocularList = oculars || [];
        const installList = installs || [];

        const installed = installList.length;
        const pending = ocularList.filter(o => o.status === 'READY_FOR_INSTALLATION' || o.status === 'PENDING').length;
        const cancelled = ocularList.filter(o => o.status === 'CANCELLED').length;
        const total = installed + pending + cancelled;
        const conversionRate = total > 0 ? (((installed + pending) / total) * 100).toFixed(1) + '%' : '0.0%';

        return {
          installed,
          pending,
          cancelled,
          conversionRate,
          totalLeads: ocularList.length,
          auditsCount: pending + installed,
          handoversCount: installed
        };
      } catch (err) {
        console.warn('[Synx Supabase] Could not fetch metrics from Supabase:', err.message);
      }
    }

    // Fallback to FormStorage local records (defaults to 0 if empty)
    const localItems = FormStorage.listReadyInstallations() || [];
    const installed = localItems.filter(i => i.status === 'INSTALLED' || i.status === 'COMMISSIONED').length;
    const pending = localItems.filter(i => !i.status || i.status === 'PENDING' || i.status === 'READY_FOR_INSTALLATION' || i.status === 'VERIFIED').length;
    const cancelled = localItems.filter(i => i.status === 'CANCELLED').length;
    const total = installed + pending + cancelled;
    const conversionRate = total > 0 ? (((installed + pending) / total) * 100).toFixed(1) + '%' : '0.0%';

    return {
      installed,
      pending,
      cancelled,
      conversionRate,
      totalLeads: localItems.length,
      auditsCount: pending + installed,
      handoversCount: installed
    };
  }
}

export const supabaseService = new SupabaseService();
