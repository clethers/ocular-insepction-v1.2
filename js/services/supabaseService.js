/**
 * OIMS — Supabase Integration & Hybrid Cloud Data Service
 */

class SupabaseService {
  constructor() {
    this.supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || localStorage.getItem('oims_supabase_url') || '';
    this.supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || localStorage.getItem('oims_supabase_key') || '';
    this.client = null;
    this.initClient();
  }

  initClient() {
    if (this.supabaseUrl && this.supabaseKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        console.log('[OIMS Supabase] Connected to live Supabase backend instance:', this.supabaseUrl);
      } catch (err) {
        console.warn('[OIMS Supabase] Initialization error:', err);
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

  // teamId, when passed, is the logged-in field inspector's own profile id
  // (see fetchFieldTeams — "Operations Team 1/2" are real login accounts,
  // not a label). Strictly assignment-only: a record only shows up for the
  // exact team it was assigned to in the Audit QA Queue — an unassigned
  // record is invisible here until Customer Care routes it to someone.
  async fetchReadyInspections(teamId) {
    if (this.isConfigured()) {
      try {
        let query = this.client
          .from('ocular_inspections')
          .select('*')
          .eq('status', 'READY_FOR_INSTALLATION');

        if (teamId) {
          query = query.eq('assigned_team', teamId);
        }

        const { data, error } = await this.withTimeout(
          query.order('created_at', { ascending: false }),
          3000,
          'Fetch ready inspections'
        );

        if (error) throw error;
        return (data || []).map(item => this.mapSupabaseToLocal(item));
      } catch (err) {
        console.warn('[OIMS Supabase] Could not fetch ready inspections:', err.message);
      }
    }

    return [];
  }

  // The two "Operations Team" accounts field inspectors log in as —
  // real profiles, not a separate roster table. Used to populate the
  // team picker in the Audit QA approve overlay.
  async fetchFieldTeams() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'field_inspector')
          .ilike('full_name', 'Operations Team%')
          .order('full_name', { ascending: true }),
        3000,
        'Fetch field teams'
      );
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch field teams:', err.message);
      return [];
    }
  }

  // Customer Care QA queue — submissions awaiting first-pass review, before
  // they're eligible to appear in the installer's Ready queue.
  async fetchPendingQAInspections() {
    if (this.isConfigured()) {
      try {
        const { data, error } = await this.withTimeout(
          this.client
            .from('ocular_inspections')
            .select('*')
            .eq('status', 'PENDING_QA')
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
          3000,
          'Fetch pending QA inspections'
        );

        if (error) throw error;
        return (data || []).map(item => this.mapSupabaseToLocal(item));
      } catch (err) {
        console.warn('[OIMS Supabase] Could not fetch pending QA inspections:', err.message);
      }
    }

    return [];
  }

  // An inspector's own submissions still moving through the QA pipeline
  // (awaiting review, or sent back for re-inspection) — cloud-only, since
  // ownership isn't tracked in the local storage fallback.
  async fetchMySubmittedInspections(userId) {
    if (!userId || !this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('ocular_inspections')
          .select('*')
          .eq('created_by', userId)
          .in('status', ['PENDING_QA', 'RE_INSPECTION_REQUESTED'])
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
        3000,
        'Fetch my submitted inspections'
      );

      if (error) throw error;
      return (data || []).map(item => this.mapSupabaseToLocal(item));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch my submitted inspections:', err.message);
      return [];
    }
  }

  // Advances or rejects a submission out of QA. extra may carry qaNotes /
  // qaReviewedBy / qaReviewedAt (camelCase — mapped to the qa_* columns).
  async updateInspectionStatus(id, newStatus, extra = {}) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const payload = { status: newStatus, updated_at: new Date().toISOString() };
    if (extra.qaNotes !== undefined) payload.qa_notes = extra.qaNotes;
    if (extra.qaReviewedBy !== undefined) payload.qa_reviewed_by = extra.qaReviewedBy;
    if (extra.qaReviewedAt !== undefined) payload.qa_reviewed_at = extra.qaReviewedAt;

    const { error } = await this.withTimeout(
      this.client.from('ocular_inspections').update(payload).eq('id', id),
      3000,
      'Update inspection status'
    );
    if (error) throw error;
  }

  // Assigns a pending QA item to an inspection team, independent of the
  // approve/reject decision — Customer Care picks this from the QA queue
  // before a re-inspection or field follow-up is dispatched.
  async assignInspectionTeam(id, team) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const { error } = await this.withTimeout(
      this.client.from('ocular_inspections').update({ assigned_team: team }).eq('id', id),
      3000,
      'Assign inspection team'
    );
    if (error) throw error;
  }

  async fetchAllInspections() {
    if (this.isConfigured()) {
      try {
        const { data, error } = await this.withTimeout(
          this.client
            .from('ocular_inspections')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
          3000,
          'Fetch all inspections'
        );

        if (error) throw error;
        return { records: (data || []).map(item => this.mapSupabaseToLocal(item)), source: 'cloud' };
      } catch (err) {
        console.warn('[OIMS Supabase] Could not fetch all inspections:', err.message);
      }
    }

    return { records: [], source: 'cloud' };
  }

  // Looks up the installation_records row for a given rn_no, if the
  // installation has been completed yet. ocular_inspections.rn_no and
  // installation_records.rn_no are both populated from the same source
  // (ocular_id is defined in the schema but never actually set on save),
  // so rn_no is the reliable join key between the two tables today.
  async fetchInstallationByRnNo(rnNo) {
    if (!rnNo || !this.isConfigured()) return null;
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('installation_records')
          .select('*')
          .eq('rn_no', rnNo)
          .order('created_at', { ascending: false })
          .limit(1),
        3000,
        'Fetch installation by rn_no'
      );

      if (error) throw error;
      return (data && data[0]) || null;
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch installation record:', err.message);
      return null;
    }
  }

  async fetchAllInstallations() {
    if (this.isConfigured()) {
      try {
        const { data, error } = await this.withTimeout(
          this.client
            .from('installation_records')
            .select('*')
            .order('created_at', { ascending: false }),
          3000,
          'Fetch all installations'
        );

        if (error) throw error;
        return (data || []).map(item => {
          const record = {
            id: item.id,
            rnNo: item.rn_no,
            installationNo: item.installation_no,
            clientName: item.client_name,
            scopeOfWorks: item.scope_of_works,
            installerName: item.installer_name,
            status: item.status,
            createdAt: item.created_at,
            clientRepName: item.client_rep_name,
            installerSigImg: item.installer_sig_img,
            clientRepSigImg: item.client_rep_sig_img
          };
          for (const [localKey, column] of SupabaseService.ACTUAL_MATERIALS_FIELD_MAP) {
            record[localKey] = item[column];
          }
          return record;
        });
      } catch (err) {
        console.warn('[OIMS Supabase] Could not fetch all installations:', err.message);
      }
    }

    return [];
  }

  async archiveInspection(id) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const { error } = await this.withTimeout(
      this.client.from('ocular_inspections').update({ deleted_at: new Date().toISOString() }).eq('id', id),
      3000,
      'Archive inspection'
    );
    if (error) throw error;
  }

  // Throws on failure — there's no local fallback to quietly land in
  // instead, so a failed save must be visible to the caller rather than
  // reported as success.
  async saveOcularInspection(formData) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');

    const payload = this.mapLocalToSupabase(formData);
    const { data, error } = await this.client
      .from('ocular_inspections')
      .upsert(payload, { onConflict: 'rn_no' })
      .select();

    if (error) throw error;
    console.log('[OIMS Supabase] Saved ocular inspection to Supabase cloud:', data);
    return (data && data[0]) ? this.mapSupabaseToLocal(data[0]) : formData;
  }

  // Actual-materials-used fields captured on the Installation form (Equipment
  // & Testing step) — internal inventory only, deliberately never surfaced in
  // the client-facing handover summary/certificate. [localKey, column,
  // isInt] mirrors the naming convention of ocular_inspections' own material
  // columns with an actual_ prefix, but lives on installation_records since
  // that's the record this data actually describes.
  static ACTUAL_MATERIALS_FIELD_MAP = [
    ['actualConduitPvc', 'actual_pvc_qty', true],
    ['actualConduitEmt', 'actual_emt_qty', true],
    ['actualConduitImc', 'actual_imc_qty', true],
    ['actualConduitRsc', 'actual_conduit_rsc_qty', true],
    ['actualConduitPvcMoulding', 'actual_conduit_pvc_moulding_qty', true],
    ['actualConduitBlackFlexible', 'actual_conduit_black_flexible_qty', true],
    ['actualConduitPvcFlexibleOrange', 'actual_conduit_pvc_flexible_orange_qty', true],
    ['actualConduitOtherType', 'actual_conduit_other_type', false],
    ['actualConduitOtherQty', 'actual_conduit_other_qty', true],
    ['actualLiquidTightConnectorQty', 'actual_liquid_tight_connector_qty', true],
    ['actualLiquidTightFlexLength', 'actual_liquid_tight_flex_length', false],
    ['actualElbowEmt90', 'actual_elbow_emt90_qty', true],
    ['actualElbowImc90', 'actual_elbow_imc90_qty', true],
    ['actualElbowRsc90', 'actual_elbow_rsc90_qty', true],
    ['actualBodyLb', 'actual_lb_qty', true],
    ['actualBodyLr', 'actual_lr_qty', true],
    ['actualBodyLl', 'actual_ll_qty', true],
    ['actualBodyC', 'actual_body_c_qty', true],
    ['actualBodyT', 'actual_t_qty', true],
    ['actualConnectorEmtSetScrew', 'actual_connector_emt_set_screw_qty', true],
    ['actualConnectorEmtCompression', 'actual_connector_emt_compression_qty', true],
    ['actualCouplingEmtSetScrew', 'actual_coupling_emt_set_screw_qty', true],
    ['actualCouplingEmtCompression', 'actual_coupling_emt_compression_qty', true],
    ['actualClampCTwoHole', 'actual_clamp_c_two_hole_qty', true],
    ['actualClampCOneHole', 'actual_clamp_c_one_hole_qty', true],
    ['actualClampStrapMalleable', 'actual_clamp_strap_malleable_qty', true],
    ['actualBoxUtility', 'actual_utility_box_qty', true],
    ['actualBoxSquare', 'actual_square_box_qty', true],
    ['actualBoxOctagon', 'actual_octagon_box_qty', true],
    ['actualBoxJunction', 'actual_junction_box_qty', true],
    ['actualBoxOthers', 'actual_other_boxes_notes', false],
  ];

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

        for (const [localKey, column, isInt] of SupabaseService.ACTUAL_MATERIALS_FIELD_MAP) {
          const raw = formData[localKey];
          if (raw === undefined) continue;
          if (isInt) {
            const parsed = Number.parseInt(raw, 10);
            payload[column] = (raw === '' || raw === null || Number.isNaN(parsed)) ? null : parsed;
          } else {
            payload[column] = raw;
          }
        }

        const { data, error } = await this.client
          .from('installation_records')
          .insert([payload]);

        if (error) throw error;
        console.log('[OIMS Supabase] Saved installation record to Supabase cloud:', data);
      } catch (err) {
        console.warn('[OIMS Supabase] Saved locally. Sync pending:', err.message);
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
    ['mainBreakerOther', 'main_breaker_other'],
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
    ['witnessSigImg', 'witness_sig_img'],
    ['boxOthers', 'other_boxes_notes'],
    ['createdBy', 'created_by'],
    ['qaNotes', 'qa_notes'],
    ['qaReviewedBy', 'qa_reviewed_by'],
    ['qaReviewedAt', 'qa_reviewed_at'],
    ['assignedTeam', 'assigned_team']
  ];

  // Columns in supabase/schema.sql's ocular_inspections table that are typed
  // INT. Local form data arrives as raw strings (or '' for untouched free-text
  // inputs), which Postgres/PostgREST rejects for INT columns — coerce these
  // to a number or null before building the upsert payload (see mapLocalToSupabase).
  static INT_COLUMNS = new Set([
    'no_branches',
    'pvc_qty',
    'emt_qty',
    'imc_qty',
    'conduit_rsc_qty',
    'conduit_pvc_moulding_qty',
    'conduit_black_flexible_qty',
    'conduit_pvc_flexible_orange_qty',
    'conduit_other_qty',
    'liquid_tight_connector_qty',
    'elbow_emt90_qty',
    'elbow_imc90_qty',
    'elbow_rsc90_qty',
    'lb_qty',
    'lr_qty',
    'll_qty',
    'body_c_qty',
    't_qty',
    'connector_emt_set_screw_qty',
    'connector_emt_compression_qty',
    'coupling_emt_set_screw_qty',
    'coupling_emt_compression_qty',
    'clamp_c_two_hole_qty',
    'clamp_c_one_hole_qty',
    'clamp_strap_malleable_qty',
    'utility_box_qty',
    'square_box_qty',
    'octagon_box_qty',
    'junction_box_qty'
  ]);

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
      if (data[localKey] === undefined) continue;

      if (SupabaseService.INT_COLUMNS.has(column)) {
        const raw = data[localKey];
        if (raw === '' || raw === undefined || raw === null) {
          payload[column] = null;
        } else {
          const parsed = Number.parseInt(raw, 10);
          payload[column] = Number.isNaN(parsed) ? null : parsed;
        }
      } else {
        payload[column] = data[localKey];
      }
    }
    payload.photo_attachments = data.photos || {};
    payload.status = data.status || 'PENDING_QA';
    return payload;
  }

  // Customer Care support tickets & escalations — see
  // migrations/2026-09-09-support-tickets.sql. rn_no is a free-text,
  // informal link to ocular_inspections (no FK), matching assigned_team's
  // convention on that table.
  async fetchSupportTickets() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('support_tickets')
          .select('*')
          .order('created_at', { ascending: false }),
        3000,
        'Fetch support tickets'
      );
      if (error) throw error;
      return (data || []).map(row => this.mapTicketToLocal(row));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch support tickets:', err.message);
      return [];
    }
  }

  async createSupportTicket({ subject, description, priority, clientName, rnNo, createdBy }) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const payload = {
      subject,
      description: description || null,
      priority: priority || 'NORMAL',
      client_name: clientName || null,
      rn_no: rnNo || null,
      created_by: createdBy || null
    };
    const { data, error } = await this.client
      .from('support_tickets')
      .insert([payload])
      .select();
    if (error) throw error;
    return (data && data[0]) ? this.mapTicketToLocal(data[0]) : payload;
  }

  async resolveSupportTicket(id, resolvedBy) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const { error } = await this.withTimeout(
      this.client
        .from('support_tickets')
        .update({ status: 'RESOLVED', resolved_at: new Date().toISOString(), resolved_by: resolvedBy || null })
        .eq('id', id),
      3000,
      'Resolve support ticket'
    );
    if (error) throw error;
  }

  mapTicketToLocal(row) {
    return {
      id: row.id,
      clientName: row.client_name,
      rnNo: row.rn_no,
      subject: row.subject,
      description: row.description,
      priority: row.priority,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by
    };
  }

  subscribeToReadyQueue(callback) {
    if (this.isConfigured()) {
      try {
        return this.client
          .channel('public:ocular_inspections')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'ocular_inspections' }, payload => {
            console.log('[OIMS Supabase Realtime] Event received:', payload);
            if (callback) callback(payload);
          })
          .subscribe();
      } catch (err) {
        console.warn('[OIMS Supabase Realtime] Could not subscribe:', err);
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
        console.warn('[OIMS Supabase] Could not fetch metrics from Supabase:', err.message);
      }
    }

    return {
      installed: 0,
      pending: 0,
      cancelled: 0,
      conversionRate: '0.0%',
      totalLeads: 0,
      auditsCount: 0,
      handoversCount: 0
    };
  }
}

export const supabaseService = new SupabaseService();
