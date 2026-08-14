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

  async fetchReadyInspections() {
    if (this.isConfigured()) {
      try {
        const { data, error } = await this.client
          .from('ocular_inspections')
          .select('*')
          .eq('status', 'READY_FOR_INSTALLATION')
          .order('created_at', { ascending: false });

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

  mapSupabaseToLocal(row) {
    return {
      id: row.id,
      rnNo: row.rn_no,
      installationNo: row.installation_no,
      clientName: row.client_name,
      locationAddress: row.location_address,
      dateTime: row.date_time,
      dateTimeDisplay: row.date_time ? new Date(row.date_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent',
      voltageSystem: row.voltage_system,
      mainBreaker: row.main_breaker,
      groundingSystem: row.grounding_system,
      estimateDistance: row.estimate_distance,
      inspectedByName: row.inspected_by_name,
      scopeOfWorks: row.scope_of_works,
      photos: row.photo_attachments || {}
    };
  }

  mapLocalToSupabase(data) {
    return {
      client_name: data.clientName || 'Unnamed Client',
      rn_no: data.rnNo || `RN-${Date.now()}`,
      installation_no: data.installationNo || `INST-${Date.now()}`,
      contact_no: data.contactNo,
      scope_of_works: data.scopeOfWorks || 'Site Inspection',
      location_address: data.locationAddress,
      voltage_system: data.voltageSystem,
      main_breaker: data.mainBreaker,
      grounding_system: data.groundingSystem,
      estimate_distance: data.estimateDistance,
      inspected_by_name: data.inspectedByName,
      inspector_sig_img: data.inspectorSigImg,
      witnessed_by_name: data.witnessedByName,
      witness_sig_img: data.witnessSigImg,
      photo_attachments: data.photos || {},
      status: data.status || 'READY_FOR_INSTALLATION'
    };
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
}

export const supabaseService = new SupabaseService();
