# Manager & Admin Client Directory, Certificate Printing, and Client Archiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Manager role a real, Supabase-backed directory of every client served with a per-row Print button for a full, accurately-populated audit certificate; give the Admin role the same directory plus a per-row Delete (archive) action.

**Architecture:** Extend the `ocular_inspections` schema and `supabaseService`'s local↔Supabase field mapping so no form data is lost in transit, add `fetchAllInspections()`/`archiveInspection()`, extract the certificate template (removed earlier from the Ocular Form) into a standalone, data-driven `js/utils/ocularCertificate.js` module, build one `ClientDirectory` component shared by both roles (Admin gets a `canDelete` flag Manager doesn't), and mount it in place of Manager's hardcoded "360° Client Search" demo tab and as a new tab in `AdminWorkspace`.

**Tech Stack:** Vanilla ES modules, Vite, Supabase JS client v2. No test framework in this repo — verification is `node --check` for syntax, small throwaway Node scripts (with minimal `window`/`localStorage` shims) for logic that doesn't touch the DOM, `npm run build` for bundling, and a manual browser QA pass for anything DOM-dependent.

**Spec:** `docs/superpowers/specs/2026-08-25-manager-client-directory-design.md`

## Global Constraints

- No bulk "print all" or bulk "delete" action — both are per-row only.
- Do not touch `js/forms/installationForm.js` or its "Print / Export Handover Certificate" button/generator — separate feature, out of scope.
- Do not change route-level role-gating — Manager's workspace and Admin's workspace are already correctly gated in `router.js`; the new Admin Clients tab lives inside the already-admin-gated `AdminWorkspace`.
- No field-level edit capability on this list for either role — directory + print, plus archive for Admin only.
- No "Restore" UI and no "include archived" view in this pass — archived clients are hidden unconditionally from both roles' lists; the data isn't destroyed (soft delete via `deleted_at`), so recovery stays possible later without needing to build it now.
- Schema changes must be additive only (`ADD COLUMN IF NOT EXISTS`), never drop or rename existing columns.
- The status filter must be built from whatever `status` values are actually present in fetched data — never a hardcoded status enum (see spec's "ambiguity" note on why `Draft/Ready/Installed/Cancelled` doesn't match reality).
- Archiving must never be optimistic — the row stays in the list until `archiveInspection()` actually succeeds; on failure, show an error toast and leave the row untouched.

---

## Task 1: Schema migration — add the missing `ocular_inspections` columns, including the archive marker

**Files:**
- Create: `supabase/migrations/2026-08-25-ocular-inspection-full-fields.sql`
- Modify: `supabase/schema.sql:59-122` (the `ocular_inspections` `CREATE TABLE` block)

**Interfaces:**
- Produces: 36 new columns on `public.ocular_inspections` (35 certificate-data fields + `deleted_at`), listed in full in Step 1. Task 2 depends on the 35 data-field column names; Task 3 depends on `deleted_at` existing exactly as spelled here.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/2026-08-25-ocular-inspection-full-fields.sql`:

```sql
-- Adds the ocular_inspections columns needed so a manager's/admin's printed
-- certificate is fully populated regardless of which device/inspector
-- created the record, plus a soft-delete marker for the Admin archive
-- feature. Additive only — safe to run against an existing database.
-- See docs/superpowers/specs/2026-08-25-manager-client-directory-design.md.

ALTER TABLE public.ocular_inspections
  ADD COLUMN IF NOT EXISTS breaker_brand_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS breaker_mounting_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS breaker_design VARCHAR(50),
  ADD COLUMN IF NOT EXISTS breaker_design_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS breaker_pole VARCHAR(50),
  ADD COLUMN IF NOT EXISTS breaker_pole_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_has VARCHAR(10) DEFAULT 'NO',
  ADD COLUMN IF NOT EXISTS nema3r_breaker VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_brand_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_brand_type_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_mounting VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nema3r_mounting_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_design VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nema3r_design_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nema3r_pole VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nema3r_pole_other VARCHAR(100),
  ADD COLUMN IF NOT EXISTS conduit_rsc_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conduit_pvc_moulding_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conduit_black_flexible_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conduit_pvc_flexible_orange_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conduit_other_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS conduit_other_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elbow_emt90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elbow_imc90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elbow_rsc90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS body_c_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquid_tight_connector_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquid_tight_flex_length VARCHAR(50),
  ADD COLUMN IF NOT EXISTS connector_emt_set_screw_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connector_emt_compression_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupling_emt_set_screw_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupling_emt_compression_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clamp_c_two_hole_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clamp_c_one_hole_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clamp_strap_malleable_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
```

The old `liquid_tight_fittings` boolean and `liquid_tight_qty` columns are left untouched (not dropped) — they're just superseded by `liquid_tight_connector_qty`/`liquid_tight_flex_length`, which is what the current UI and certificate actually use.

`deleted_at` is the archive marker: `NULL` means active/visible, a timestamp means archived. No RLS change needed — archiving is an `UPDATE`, and the existing `"Allow update ocular inspections" USING (true)` policy in `supabase/schema.sql` already permits it.

- [ ] **Step 2: Update `supabase/schema.sql` so a fresh database gets the same columns**

In `supabase/schema.sql`, find the `ocular_inspections` `CREATE TABLE` block (starts at line 59, `CREATE TABLE IF NOT EXISTS public.ocular_inspections (`). Replace the entire block, from `CREATE TABLE IF NOT EXISTS public.ocular_inspections (` through its closing `);`, with:

```sql
CREATE TABLE IF NOT EXISTS public.ocular_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id VARCHAR(50) NOT NULL DEFAULT '#AUD-101',
    client_name VARCHAR(255) NOT NULL,
    date_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_start VARCHAR(50),
    time_end VARCHAR(50),
    rn_no VARCHAR(100) UNIQUE NOT NULL,
    installation_no VARCHAR(100),
    contact_no VARCHAR(100),
    scope_of_works VARCHAR(100) DEFAULT 'Site Inspection',
    location_address TEXT,
    gps_lat NUMERIC(10, 7),
    gps_lng NUMERIC(10, 7),

    -- Technical Feeder & Specs
    voltage_system VARCHAR(50),
    voltage_specify VARCHAR(100),
    main_breaker VARCHAR(100),
    no_branches INT DEFAULT 0,
    spare_breaker VARCHAR(10) DEFAULT 'YES',
    space_provision VARCHAR(10) DEFAULT 'YES',
    breaker_brand VARCHAR(100),
    breaker_brand_other VARCHAR(100),
    breaker_mounting VARCHAR(50),
    breaker_mounting_other VARCHAR(100),
    breaker_design VARCHAR(50),
    breaker_design_other VARCHAR(100),
    breaker_pole VARCHAR(50),
    breaker_pole_other VARCHAR(100),
    grounding_system VARCHAR(10) DEFAULT 'YES',
    grounding_rod_location TEXT,

    -- NEMA 3R Enclosure (Dedicated Charger Breaker, If Applicable)
    nema3r_has VARCHAR(10) DEFAULT 'NO',
    nema3r_breaker VARCHAR(100),
    nema3r_brand_type VARCHAR(100),
    nema3r_brand_type_other VARCHAR(100),
    nema3r_mounting VARCHAR(50),
    nema3r_mounting_other VARCHAR(100),
    nema3r_design VARCHAR(50),
    nema3r_design_other VARCHAR(100),
    nema3r_pole VARCHAR(50),
    nema3r_pole_other VARCHAR(100),

    -- EV Charger & Conduit Specs
    charger_location TEXT,
    estimate_distance VARCHAR(50),
    pvc_qty INT DEFAULT 0,
    emt_qty INT DEFAULT 0,
    imc_qty INT DEFAULT 0,
    conduit_rsc_qty INT DEFAULT 0,
    conduit_pvc_moulding_qty INT DEFAULT 0,
    conduit_black_flexible_qty INT DEFAULT 0,
    conduit_pvc_flexible_orange_qty INT DEFAULT 0,
    conduit_other_type VARCHAR(100),
    conduit_other_qty INT DEFAULT 0,
    liquid_tight_fittings VARCHAR(10) DEFAULT 'YES',
    liquid_tight_qty INT DEFAULT 0,
    liquid_tight_connector_qty INT DEFAULT 0,
    liquid_tight_flex_length VARCHAR(50),

    -- Elbows
    elbow_emt90_qty INT DEFAULT 0,
    elbow_imc90_qty INT DEFAULT 0,
    elbow_rsc90_qty INT DEFAULT 0,

    -- Conduit Bodies
    lb_qty INT DEFAULT 0,
    lr_qty INT DEFAULT 0,
    ll_qty INT DEFAULT 0,
    body_c_qty INT DEFAULT 0,
    t_qty INT DEFAULT 0,

    -- Connectors, Couplings & Clamps
    connector_emt_set_screw_qty INT DEFAULT 0,
    connector_emt_compression_qty INT DEFAULT 0,
    coupling_emt_set_screw_qty INT DEFAULT 0,
    coupling_emt_compression_qty INT DEFAULT 0,
    clamp_c_two_hole_qty INT DEFAULT 0,
    clamp_c_one_hole_qty INT DEFAULT 0,
    clamp_strap_malleable_qty INT DEFAULT 0,

    utility_box_qty INT DEFAULT 0,
    square_box_qty INT DEFAULT 0,
    octagon_box_qty INT DEFAULT 0,
    junction_box_qty INT DEFAULT 0,
    other_boxes_notes TEXT,

    -- Retrofittings & Remarks
    retrofittings TEXT,
    replacement TEXT,
    new_installation TEXT,

    -- Signatures & Verification
    inspected_by_name VARCHAR(255),
    inspector_sig_img TEXT,
    witnessed_by_name VARCHAR(255),
    witness_sig_img TEXT,

    -- Photo Attachments (Proposed Layout, Tapping Point, Wiring/Conduit, EV Location)
    photo_attachments JSONB DEFAULT '{}'::jsonb,

    -- Record Pipeline Status
    status VARCHAR(50) DEFAULT 'READY_FOR_INSTALLATION',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Archiving (soft delete) — NULL means active/visible, a timestamp means archived
    deleted_at TIMESTAMPTZ DEFAULT NULL
);
```

- [ ] **Step 3: Verify the two column lists match exactly**

Run this from the repo root to confirm both files declare the same 36 new columns (order-independent, count must match):

```bash
grep -oE "ADD COLUMN IF NOT EXISTS [a-z0-9_]+" supabase/migrations/2026-08-25-ocular-inspection-full-fields.sql | awk '{print $NF}' | sort > /tmp/migration_cols.txt
grep -oE "^\s+(breaker_brand_other|breaker_mounting_other|breaker_design|breaker_design_other|breaker_pole|breaker_pole_other|nema3r_[a-z_]+|conduit_rsc_qty|conduit_pvc_moulding_qty|conduit_black_flexible_qty|conduit_pvc_flexible_orange_qty|conduit_other_type|conduit_other_qty|elbow_[a-z0-9_]+|body_c_qty|liquid_tight_connector_qty|liquid_tight_flex_length|connector_emt_[a-z_]+|coupling_emt_[a-z_]+|clamp_[a-z_]+|deleted_at)" supabase/schema.sql | awk '{print $1}' | sort > /tmp/schema_cols.txt
diff /tmp/migration_cols.txt /tmp/schema_cols.txt && echo "MATCH: 36 columns" || echo "MISMATCH — fix before continuing"
wc -l /tmp/migration_cols.txt
```

Expected: `MATCH: 36 columns` and `36 /tmp/migration_cols.txt`. If it prints `MISMATCH`, the two files have drifted — reconcile them before moving to Task 2.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-25-ocular-inspection-full-fields.sql supabase/schema.sql
git commit -m "Add missing ocular_inspections columns for full certificate data and archiving"
```

---

## Task 2: Rewrite `mapLocalToSupabase`/`mapSupabaseToLocal` as a lossless, table-driven pair

**Files:**
- Modify: `js/services/supabaseService.js:127-165` (the two mapping methods)
- Test: none (no test framework in this repo) — verified via a throwaway Node script in Step 2 below

**Interfaces:**
- Consumes: nothing new — same call sites as today (`fetchReadyInspections`, `saveOcularInspection`, and the new `fetchAllInspections` from Task 3).
- Produces: `mapLocalToSupabase(data: object): object` and `mapSupabaseToLocal(row: object): object` — same signatures as before, now covering every field listed in Task 1 (except `deleted_at`, which is an archive marker never part of local form data and is deliberately not in this map) plus every field already handled previously (`rnNo`, `installationNo`, `clientName`, `contactNo`, `scopeOfWorks`, `locationAddress`, `dateTime`, `timeStart`, `timeEnd`, `voltageSystem`, `voltageSpecify`, `mainBreaker`, `noOfBranches`, `spareBreaker`, `spaceProvision`, `groundingSystem`, `groundingRodLocation`, `chargerLocation`, `estimateDistance`, `inspectedByName`, `inspectorSigImg`, `witnessedByName`, `witnessSigImg`). `photos`/`photo_attachments`, `status`, and `id` stay handled outside the field-map loop, same as before. `mapSupabaseToLocal` still derives `dateTimeDisplay` (consumed by `js/components/readyList.js:121`) — do not drop that.

- [ ] **Step 1: Replace the two mapping methods**

In `js/services/supabaseService.js`, find this exact block (currently lines 127-165):

```js
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
```

Replace it with:

```js
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
```

- [ ] **Step 2: Verify round-trip fidelity with a throwaway Node script**

Plain Node has no `window`/`localStorage`, which `SupabaseService`'s constructor touches at import time (the module exports a ready-made singleton). Shim just enough to import it safely, then exercise the two new methods directly:

Create `C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-field-map.mjs`:

```js
globalThis.window = {};
globalThis.localStorage = { length: 0, getItem: () => null, key: () => null };

const { supabaseService } = await import('c:/Users/CLSB/Documents/Synx/js/services/supabaseService.js');

const sample = {
  rnNo: 'RN-9001', clientName: 'Test Client', installationNo: 'INST-9001',
  contactNo: '0917', scopeOfWorks: 'Site Audit', locationAddress: '123 Test St',
  dateTime: '2026-08-25T00:00:00.000Z', timeStart: '9:00 AM', timeEnd: '11:00 AM',
  voltageSystem: '220_ll', voltageSpecify: '', mainBreaker: '100A', noOfBranches: '6',
  spareBreaker: 'YES', spaceProvision: 'YES',
  breakerBrandType: 'Schneider', breakerBrandTypeOther: '',
  breakerMounting: 'Bolt-on', breakerMountingOther: '',
  breakerDesign: 'MCCB', breakerDesignOther: '',
  breakerPole: 'Three Pole (3P)', breakerPoleOther: '',
  groundingSystem: 'YES', groundingRodLocation: '',
  hasNema3r: 'YES', nema3rBreaker: '40A 2P 230V',
  nema3rBrandType: 'ABB', nema3rBrandTypeOther: '',
  nema3rMounting: 'DIN Rail Mounted', nema3rMountingOther: '',
  nema3rDesign: 'MCB', nema3rDesignOther: '',
  nema3rPole: 'Double Pole (2P)', nema3rPoleOther: '',
  chargerLocation: 'Garage', estimateDistance: '15m',
  conduitPvc: '4', conduitEmt: '2', conduitImc: '0', conduitRsc: '1',
  conduitPvcMoulding: '0', conduitBlackFlexible: '0', conduitPvcFlexibleOrange: '0',
  conduitOtherType: '', conduitOtherQty: '0',
  elbowEmt90: '2', elbowImc90: '0', elbowRsc90: '0',
  bodyLb: '1', bodyLr: '0', bodyLl: '0', bodyC: '1', bodyT: '0',
  liquidTightConnectorQty: '2', liquidTightFlexLength: '1.5m',
  connectorEmtSetScrew: '3', connectorEmtCompression: '0',
  couplingEmtSetScrew: '2', couplingEmtCompression: '0',
  clampCTwoHole: '4', clampCOneHole: '0', clampStrapMalleable: '0',
  boxUtility: '1', boxSquare: '0', boxOctagon: '0', boxJunction: '1',
  workRetrofitting: 'None', workReplacement: 'None', workNewInstallation: 'Standard install',
  inspectedByName: 'Engr. Test', inspectorSigImg: '', witnessedByName: 'Witness Test', witnessSigImg: '',
  photos: { proposed_layout: 'data:image/png;base64,xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  status: 'READY_FOR_INSTALLATION'
};

const payload = supabaseService.mapLocalToSupabase(sample);
const roundTripped = supabaseService.mapSupabaseToLocal({ id: 'test-id', ...payload });

let failures = 0;
for (const key of Object.keys(sample)) {
  if (key === 'photos') {
    if (JSON.stringify(roundTripped.photos) !== JSON.stringify(sample.photos)) {
      console.error(`MISMATCH photos: ${JSON.stringify(roundTripped.photos)} !== ${JSON.stringify(sample.photos)}`);
      failures++;
    }
    continue;
  }
  if (String(roundTripped[key]) !== String(sample[key])) {
    console.error(`MISMATCH ${key}: got ${JSON.stringify(roundTripped[key])}, expected ${JSON.stringify(sample[key])}`);
    failures++;
  }
}

console.log(failures === 0 ? 'PASS: all fields round-tripped losslessly' : `FAIL: ${failures} field(s) lost or corrupted`);
process.exit(failures === 0 ? 0 : 1);
```

Run:

```bash
node "C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-field-map.mjs"
```

Expected: `PASS: all fields round-tripped losslessly`. If it fails, the printed `MISMATCH` lines name the exact field to fix in `FIELD_MAP`.

- [ ] **Step 3: Syntax check and delete the throwaway script**

```bash
node --check js/services/supabaseService.js
rm "C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-field-map.mjs"
```

Expected: no output from `node --check` (success).

- [ ] **Step 4: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "Make Supabase field mapping lossless for the full ocular inspection form"
```

---

## Task 3: Add `fetchAllInspections()` (excluding archived records) and `archiveInspection()`

**Files:**
- Modify: `js/services/supabaseService.js` (add two new methods after `fetchReadyInspections`, before `saveOcularInspection`)

**Interfaces:**
- Consumes: `this.isConfigured()`, `this.withTimeout()`, `this.mapSupabaseToLocal()` (all existing), `FormStorage.listReadyInstallations()` (existing).
- Produces:
  - `async fetchAllInspections(): Promise<{ records: object[], source: 'cloud' | 'local' }>` — Task 6 (`ClientDirectory`) consumes this by destructuring `{ records, source }`.
  - `async archiveInspection(id: string): Promise<void>` — throws on failure (including "not configured"). Task 6 (`ClientDirectory`) calls this from its Delete handler and must catch the rejection itself.

- [ ] **Step 1: Add both methods**

In `js/services/supabaseService.js`, find the closing brace of `fetchReadyInspections` (the line `  }` immediately before `  async saveOcularInspection(formData) {`) and insert these two new methods between them:

```js

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
        console.warn('[Synx Supabase] Falling back to local storage cache:', err.message);
      }
    }

    try {
      return { records: FormStorage.listReadyInstallations() || [], source: 'local' };
    } catch (e) {
      return { records: [], source: 'local' };
    }
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
```

Note there is deliberately no local-storage fallback for `archiveInspection` — if Supabase is unreachable, it throws and the caller (`ClientDirectory`) is responsible for surfacing that as an error rather than silently pretending the archive succeeded.

- [ ] **Step 2: Verify both methods' non-configured behavior with a throwaway Node script**

Create `C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-fetch-all.mjs`:

```js
globalThis.window = {};
globalThis.localStorage = { length: 0, getItem: () => null, key: () => null };

const { supabaseService } = await import('c:/Users/CLSB/Documents/Synx/js/services/supabaseService.js');

const result = await supabaseService.fetchAllInspections();

if (result.source !== 'local') {
  console.error(`FAIL: expected source 'local' when unconfigured, got '${result.source}'`);
  process.exit(1);
}
if (!Array.isArray(result.records)) {
  console.error('FAIL: expected records to be an array');
  process.exit(1);
}

let archiveThrew = false;
try {
  await supabaseService.archiveInspection('some-id');
} catch (e) {
  archiveThrew = true;
  if (e.message !== 'Cloud not configured') {
    console.error(`FAIL: expected "Cloud not configured", got "${e.message}"`);
    process.exit(1);
  }
}
if (!archiveThrew) {
  console.error('FAIL: expected archiveInspection to throw when Supabase is not configured');
  process.exit(1);
}

console.log('PASS: fetchAllInspections falls back to local source, and archiveInspection throws cleanly, when Supabase is not configured');
```

Run:

```bash
node "C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-fetch-all.mjs"
```

Expected: `PASS: fetchAllInspections falls back to local source, and archiveInspection throws cleanly, when Supabase is not configured`.

This only proves the unconfigured/fallback branches — the `source: 'cloud'` branch of `fetchAllInspections` and the actual `UPDATE` in `archiveInspection` need a real, configured Supabase project to exercise, which this environment doesn't have. Manual follow-up once deployed: confirm against a real Supabase project that (a) a populated, non-archived `ocular_inspections` table comes back with `source: 'cloud'` and excludes any row with `deleted_at` set, and (b) `archiveInspection(id)` actually sets `deleted_at` on that row.

- [ ] **Step 3: Syntax check and delete the throwaway script**

```bash
node --check js/services/supabaseService.js
rm "C:\Users\CLSB\AppData\Local\Temp\claude\c--Users-CLSB-Documents-Synx\f3785cfa-c059-4843-8078-504ea3abc3fe\scratchpad\verify-fetch-all.mjs"
```

- [ ] **Step 4: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "Add fetchAllInspections() and archiveInspection() for the client directory"
```

---

## Task 4: Add a `CLIENT_RECORDS` audit log category

**Files:**
- Modify: `js/services/auditLogService.js:9-17`

**Interfaces:**
- Produces: `AUDIT_CATEGORIES.CLIENT_RECORDS === 'CLIENT_RECORDS'`. Task 6 (`ClientDirectory`) imports and uses this when logging an archive action.

- [ ] **Step 1: Add the category**

In `js/services/auditLogService.js`, find:

```js
export const AUDIT_CATEGORIES = {
  AUTHENTICATION: 'AUTHENTICATION',
  FORM_INSPECTION: 'FORM_INSPECTION',
  MANAGER_APPROVAL: 'MANAGER_APPROVAL',
  FIELD_DISPATCH: 'FIELD_DISPATCH',
  CUSTOMER_CARE: 'CUSTOMER_CARE',
  ADMIN_RBAC: 'ADMIN_RBAC',
  DATA_EXPORT: 'DATA_EXPORT'
};
```

Replace with:

```js
export const AUDIT_CATEGORIES = {
  AUTHENTICATION: 'AUTHENTICATION',
  FORM_INSPECTION: 'FORM_INSPECTION',
  MANAGER_APPROVAL: 'MANAGER_APPROVAL',
  FIELD_DISPATCH: 'FIELD_DISPATCH',
  CUSTOMER_CARE: 'CUSTOMER_CARE',
  ADMIN_RBAC: 'ADMIN_RBAC',
  DATA_EXPORT: 'DATA_EXPORT',
  CLIENT_RECORDS: 'CLIENT_RECORDS'
};
```

- [ ] **Step 2: Verify**

```bash
node --check js/services/auditLogService.js
grep -n "CLIENT_RECORDS" js/services/auditLogService.js
```

Expected: `node --check` prints nothing; the `grep` prints the one line just added.

- [ ] **Step 3: Commit**

```bash
git add js/services/auditLogService.js
git commit -m "Add CLIENT_RECORDS audit log category for client archiving"
```

---

## Task 5: Extract the certificate template into `js/utils/ocularCertificate.js`

**Files:**
- Create: `js/utils/ocularCertificate.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure module, only needs a data object shaped like what `mapSupabaseToLocal`/`getFormData` produce).
- Produces: `renderCertificateHTML(data: object): string` and `printOcularCertificate(data: object): void`. Task 6 (`ClientDirectory`) imports and calls `printOcularCertificate`.

- [ ] **Step 1: Create the module**

Create `js/utils/ocularCertificate.js`:

```js
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
```

- [ ] **Step 2: Syntax check**

```bash
node --check js/utils/ocularCertificate.js
```

Expected: no output (success). This only checks syntax — `renderCertificateHTML`/`printOcularCertificate` can't be executed under plain Node because the module imports a `.png` file, which Vite resolves but Node's module loader can't. The DOM-dependent half (`printOcularCertificate`) and the visual correctness of `renderCertificateHTML`'s output are covered by the manual browser QA pass in Task 7, Step 4.

- [ ] **Step 3: Commit**

```bash
git add js/utils/ocularCertificate.js
git commit -m "Extract ocular certificate rendering into a standalone, data-driven module"
```

---

## Task 6: `ClientDirectory` component — list, search, filter, print, and Admin-only delete

**Files:**
- Create: `js/components/clientDirectory.js`

**Interfaces:**
- Consumes: `supabaseService.fetchAllInspections()` and `supabaseService.archiveInspection(id)` (Task 3), `AUDIT_CATEGORIES.CLIENT_RECORDS` (Task 4), `printOcularCertificate(data)` (Task 5), `AppLayout.showToast(message)` (existing).
- Produces: `class ClientDirectory { constructor(container: HTMLElement, options?: { canDelete?: boolean }); render(): Promise<void>; }`. Task 7 (`ManagerWorkspace`) consumes this as `new ClientDirectory(stageEl).render()` (no delete). Task 8 (`AdminWorkspace`) consumes this as `new ClientDirectory(stageEl, { canDelete: true }).render()`.

- [ ] **Step 1: Create the component**

Create `js/components/clientDirectory.js`:

```js
/**
 * Synx Portal — Client Directory Component (`clientDirectory.js`)
 * Real, Supabase-backed list of every client served, searchable and
 * filterable, with a per-client Print button for the full audit
 * certificate. When canDelete is true (Admin only), also offers a
 * per-client Delete button that archives the record.
 */

import { supabaseService } from '../services/supabaseService.js';
import { printOcularCertificate } from '../utils/ocularCertificate.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';

export class ClientDirectory {
  constructor(container, { canDelete = false } = {}) {
    this.container = container;
    this.canDelete = canDelete;
    this.records = [];
    this.dataSource = 'cloud';
    this.searchQuery = '';
    this.statusFilter = 'ALL';
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    const { records, source } = await supabaseService.fetchAllInspections();
    this.records = records;
    this.dataSource = source;
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Client Directory</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Every client served, searchable by name, RN number, or contact number.</p>

        <div id="client-directory-banner"></div>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <input type="text" id="input-client-directory-search" class="form-input" placeholder="Search client name, RN-88092, contact number..." style="flex: 1; min-width: 220px;" />
          <select id="select-client-directory-status" class="form-select" style="max-width: 220px;">
            <option value="ALL">All Statuses</option>
          </select>
        </div>

        <div id="client-directory-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading client records...</div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-client-directory-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const statusSelect = this.container.querySelector('#select-client-directory-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.statusFilter = e.target.value;
        this.renderList();
      });
    }
  }

  getFilteredRecords() {
    return this.records.filter(r => {
      if (this.statusFilter !== 'ALL' && r.status !== this.statusFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${r.clientName || ''} ${r.rnNo || ''} ${r.contactNo || ''}`.toLowerCase();
      return haystack.includes(this.searchQuery);
    });
  }

  renderList() {
    const banner = this.container.querySelector('#client-directory-banner');
    if (banner) {
      banner.innerHTML = this.dataSource === 'local'
        ? `<div style="padding: 0.75rem 1rem; background: #fff7ed; border: 1px solid #fdba74; border-radius: var(--radius-md); color: #9a3412; font-size: 0.8rem; margin-bottom: 1rem;">Showing locally cached records only — reconnect to see the full client list.</div>`
        : '';
    }

    const statusSelect = this.container.querySelector('#select-client-directory-status');
    if (statusSelect && statusSelect.dataset.populated !== 'true') {
      const statuses = [...new Set(this.records.map(r => r.status).filter(Boolean))];
      statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        statusSelect.appendChild(opt);
      });
      statusSelect.dataset.populated = 'true';
    }

    const listEl = this.container.querySelector('#client-directory-list');
    if (!listEl) return;

    if (this.records.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No client records found yet.</div>`;
      return;
    }

    const filtered = this.getFilteredRecords();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No clients match your search or filter.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${filtered.map(r => `
          <div style="padding: 1.25rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="color: #0f172a; font-size: 1rem;">${r.clientName || 'Unnamed Client'}</strong>
                <span class="badge" style="background: rgba(0, 174, 239, 0.15); color: var(--ecoworks-blue); font-size: 0.725rem; font-weight: 700; padding: 0.2rem 0.5rem;">${r.rnNo || 'N/A'}</span>
                <span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #475569; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.5rem;">${r.status || 'UNKNOWN'}</span>
              </div>
              <div style="font-size: 0.8rem; color: #64748b;">
                ${r.locationAddress || 'No address on file'} | ${r.dateTimeDisplay || 'Recent'}
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn btn-primary btn-print-client" data-rn="${r.rnNo || ''}" style="padding: 0.5rem 0.9rem; font-size: 0.8rem;">
                Print
              </button>
              ${this.canDelete ? `
                <button type="button" class="btn btn-secondary btn-delete-client" data-rn="${r.rnNo || ''}" style="padding: 0.5rem 0.9rem; font-size: 0.8rem; color: #F43F5E; border-color: #F43F5E;">
                  Delete
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    listEl.querySelectorAll('.btn-print-client').forEach(btn => {
      btn.addEventListener('click', () => {
        const rn = btn.getAttribute('data-rn');
        const record = this.records.find(r => r.rnNo === rn);
        if (record) printOcularCertificate(record);
      });
    });

    if (this.canDelete) {
      listEl.querySelectorAll('.btn-delete-client').forEach(btn => {
        btn.addEventListener('click', () => {
          const rn = btn.getAttribute('data-rn');
          const record = this.records.find(r => r.rnNo === rn);
          if (record) this.handleDelete(record);
        });
      });
    }
  }

  async handleDelete(record) {
    const confirmed = confirm(`Archive client "${record.clientName || 'Unnamed Client'}" (RN ${record.rnNo || 'N/A'})? This removes them from all client lists.`);
    if (!confirmed) return;

    try {
      await supabaseService.archiveInspection(record.id);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'CLIENT_ARCHIVED',
        description: `Archived client "${record.clientName}" (RN ${record.rnNo})`,
        severity: AUDIT_SEVERITY.WARNING,
        resourceId: record.id
      });
      this.records = this.records.filter(r => r.id !== record.id);
      this.renderList();
      AppLayout.showToast(`Archived client "${record.clientName || record.rnNo}".`);
    } catch (err) {
      console.warn('[Synx ClientDirectory] Archive failed:', err.message);
      AppLayout.showToast("Couldn't archive client — check your connection and try again.");
    }
  }
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check js/components/clientDirectory.js
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add js/components/clientDirectory.js
git commit -m "Add ClientDirectory component with print and admin-only archive"
```

---

## Task 7: Wire `ClientDirectory` into `ManagerWorkspace` (read-only, no delete)

**Files:**
- Modify: `js/components/managerWorkspace.js`

**Interfaces:**
- Consumes: `ClientDirectory` (Task 6), mounted without `canDelete` (defaults to `false`).

- [ ] **Step 1: Import `ClientDirectory` and remove the now-dead `searchQuery` state**

In `js/components/managerWorkspace.js`, find:

```js
import { supabaseService } from '../services/supabaseService.js';
import { FormStorage } from './formStorage.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dispatch'; // 'dispatch', 'qa', 'clientsearch', 'calendar', 'tickets', 'materials', 'sms', 'kpis'
    this.searchQuery = '';
    this.readyItems = [];
    this.loadData();
  }
```

Replace with:

```js
import { supabaseService } from '../services/supabaseService.js';
import { FormStorage } from './formStorage.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { ClientDirectory } from './clientDirectory.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dispatch'; // 'dispatch', 'qa', 'clientsearch', 'calendar', 'tickets', 'materials', 'sms', 'kpis'
    this.readyItems = [];
    this.loadData();
  }
```

- [ ] **Step 2: Give the Clients tab its own stage, mirroring how `InspectorWorkspace` hosts stateful sub-components**

Find:

```js
  render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">
        
        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${this.renderTabStage()}
        </div>

      </div>
    `;

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'qa':
        return this.renderQATab();
      case 'clientsearch':
        return this.renderClientSearchTab();
      case 'calendar':
        return this.renderCalendarTab();
      case 'tickets':
        return this.renderTicketsTab();
      case 'materials':
        return this.renderMaterialsTab();
      case 'kpis':
        return this.renderKPIsTab();
      case 'dispatch':
      default:
        return this.renderDispatchTab();
    }
  }
```

Replace with:

```js
  render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">
        
        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${this.activeTab === 'clientsearch' ? '' : this.renderTabStage()}
        </div>

      </div>
    `;

    if (this.activeTab === 'clientsearch') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new ClientDirectory(stage).render();
    }

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'qa':
        return this.renderQATab();
      case 'calendar':
        return this.renderCalendarTab();
      case 'tickets':
        return this.renderTicketsTab();
      case 'materials':
        return this.renderMaterialsTab();
      case 'kpis':
        return this.renderKPIsTab();
      case 'dispatch':
      default:
        return this.renderDispatchTab();
    }
  }
```

- [ ] **Step 3: Delete `renderClientSearchTab()` and the old client-search event binding**

Find and delete this entire method (it's fully superseded by `ClientDirectory`):

```js
  // TAB 3: 360 Client Search & Timeline
  renderClientSearchTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">360° Client & Installation Account Search</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Search by Client Name, RN Number, Installation No., or Contact Phone Number.</p>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1.5rem;">
          <input type="text" id="input-client-search" class="form-input" placeholder="Search client name, RN-88092, #AUD-101..." value="${this.searchQuery}" style="flex: 1;" />
          <button type="button" class="btn btn-primary" id="btn-trigger-client-search">Search Account</button>
        </div>

        <div style="padding: 1.5rem; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
            <div>
              <h4 style="margin: 0; color: #0f172a; font-size: 1.1rem;">Ayala Land Commercial EV Charging Depot</h4>
              <span style="font-size: 0.775rem; color: #64748b;">Reference: RN-88092 | Contact: +63 917 555 0192</span>
            </div>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-size: 0.75rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: var(--radius-full);">STATUS: READY FOR INSTALLATION</span>
          </div>

          <!-- Step-by-Step Status Timeline -->
          <div style="display: flex; justify-content: space-between; position: relative; margin-top: 1.5rem;">
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #10B981; color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">✓</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #0f172a; display: block;">Audit Requested</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 08</span>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #10B981; color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">✓</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #0f172a; display: block;">Ocular Conducted</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 10</span>
            </div>
            <div style="text-align: center; flex: 1;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--ecoworks-blue); color: #fff; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">3</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--ecoworks-blue); display: block;">Manager Approved</span>
              <span style="font-size: 0.7rem; color: #64748b;">Aug 11 (Today)</span>
            </div>
            <div style="text-align: center; flex: 1; opacity: 0.5;">
              <div style="width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.35rem auto; font-size: 0.75rem; font-weight: 800;">4</div>
              <span style="font-size: 0.75rem; font-weight: 700; color: #64748b; display: block;">Install Scheduled</span>
              <span style="font-size: 0.7rem; color: #64748b;">Pending</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

```

Then find and delete this block at the end of `bindEvents()`:

```js

    // Client search button
    const searchBtn = this.container.querySelector('#btn-trigger-client-search');
    const searchInput = this.container.querySelector('#input-client-search');
    if (searchBtn && searchInput) {
      searchBtn.addEventListener('click', () => {
        this.searchQuery = searchInput.value;
        AppLayout.showToast(`Searching client account: "${this.searchQuery}"`);
      });
    }
  }
}
```

Replace it with just the closing braces:

```js
  }
}
```

- [ ] **Step 4: Syntax check, full build, and manual browser QA**

```bash
node --check js/components/managerWorkspace.js
npm run build
```

Expected: `node --check` prints nothing (success); `npm run build` completes without errors.

Then, manually (this repo has no test framework or browser automation, so this step is a human/future-session checklist, matching the spec's own "Testing / verification" section):

1. `npm run dev`, log in as a user with the `CUSTOMER_CARE_MANAGER`, `LEAD_ENGINEER`, or `ADMIN` role, and navigate to the Manager workspace's Clients tab (previously "360° Client Search").
2. Confirm it no longer shows the hardcoded "Ayala Land Commercial EV Charging Depot" demo and instead lists real `ocular_inspections` rows (or the "showing locally cached records" banner if Supabase isn't configured in that environment).
3. Type into the search box and confirm the list narrows by name/RN/contact number.
4. Change the status filter and confirm it narrows by status; confirm the dropdown's options match the distinct `status` values actually present in the data (not a hardcoded list).
5. Click **Print** on a row that has NEMA3R and breaker-design/pole data populated (seeded per Task 1's migration/verification) and confirm the print preview shows those sections filled in rather than "N/A" — this is the proof that Task 1/2's schema and mapping fix actually worked end to end.
6. Click **Print** on a sparse/older row (missing most technical fields) and confirm it still renders cleanly with "N/A" placeholders throughout rather than erroring.
7. Confirm the migration didn't break existing readers of the same table: the Ready Queue (`fetchReadyInspections`, still filtered to `READY_FOR_INSTALLATION`) and the Admin dashboard metrics (`fetchDashboardMetrics`) still load without errors.
8. Confirm there is **no Delete button** anywhere on Manager's Clients tab.
9. Confirm `js/forms/installationForm.js`'s "Print / Export Handover Certificate" button still works unchanged (it was never touched by this plan).

- [ ] **Step 5: Commit**

```bash
git add js/components/managerWorkspace.js
git commit -m "Replace the manager's demo client search with the real ClientDirectory"
```

---

## Task 8: Wire `ClientDirectory` into `AdminWorkspace` (with delete)

**Files:**
- Modify: `js/components/adminWorkspace.js`

**Interfaces:**
- Consumes: `ClientDirectory` (Task 6), mounted with `{ canDelete: true }`.

- [ ] **Step 1: Import `ClientDirectory` and add `'clients'` to the tab list**

In `js/components/adminWorkspace.js`, find:

```js
import { userService, USER_ROLES, ROLE_LABELS } from '../services/userService.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { masterDataService } from '../services/masterDataService.js';
import { supabaseService } from '../services/supabaseService.js';
import { AppLayout } from './appLayout.js';
import { FormStorage } from './formStorage.js';

export class AdminWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dashboard'; // 'dashboard', 'users', 'audit', 'masterdata', 'integrations'
    this.analyticsTimeframe = 'month';
    this.cloudMetrics = null;
    this.loadMetrics();
  }
```

Replace with:

```js
import { userService, USER_ROLES, ROLE_LABELS } from '../services/userService.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { masterDataService } from '../services/masterDataService.js';
import { supabaseService } from '../services/supabaseService.js';
import { AppLayout } from './appLayout.js';
import { FormStorage } from './formStorage.js';
import { ClientDirectory } from './clientDirectory.js';

export class AdminWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'dashboard'; // 'dashboard', 'users', 'clients', 'audit', 'masterdata', 'integrations'
    this.analyticsTimeframe = 'month';
    this.cloudMetrics = null;
    this.loadMetrics();
  }
```

- [ ] **Step 2: Give the Clients tab its own stage, mirroring `ManagerWorkspace`'s Task 7 change**

Find:

```js
  render() {
    this.container.innerHTML = `
      <div class="admin-workspace-wrapper" style="padding: 0;">
        
        <!-- Tab Content Target -->
        <div id="admin-tab-stage">
          ${this.renderTabStage()}
        </div>

      </div>
    `;

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'audit':
        return this.renderAuditLogsTab();
      case 'users':
        return this.renderUsersTab();
      case 'masterdata':
        return this.renderMasterDataTab();
      case 'integrations':
        return this.renderIntegrationsTab();
      case 'dashboard':
      default:
        return this.renderDashboardTab();
    }
  }
```

Replace with:

```js
  render() {
    this.container.innerHTML = `
      <div class="admin-workspace-wrapper" style="padding: 0;">
        
        <!-- Tab Content Target -->
        <div id="admin-tab-stage">
          ${this.activeTab === 'clients' ? '' : this.renderTabStage()}
        </div>

      </div>
    `;

    if (this.activeTab === 'clients') {
      const stage = this.container.querySelector('#admin-tab-stage');
      new ClientDirectory(stage, { canDelete: true }).render();
    }

    this.bindEvents();
  }

  renderTabStage() {
    switch (this.activeTab) {
      case 'audit':
        return this.renderAuditLogsTab();
      case 'users':
        return this.renderUsersTab();
      case 'masterdata':
        return this.renderMasterDataTab();
      case 'integrations':
        return this.renderIntegrationsTab();
      case 'dashboard':
      default:
        return this.renderDashboardTab();
    }
  }
```

Note: `loadMetrics()` (above `render()`) already guards its own re-render with `this.activeTab === 'dashboard'`, so it needs no change — it simply won't touch the DOM while the Clients tab is active.

- [ ] **Step 3: Syntax check, full build, and manual browser QA**

```bash
node --check js/components/adminWorkspace.js
npm run build
```

Expected: `node --check` prints nothing (success); `npm run build` completes without errors.

Then, manually (same rationale as Task 7 Step 4 — no test framework or browser automation in this repo):

1. `npm run dev`, log in as `ADMIN`, and navigate to the Admin workspace's new **Clients** tab.
2. Confirm it lists the same clients Manager's Clients tab shows (or the "showing locally cached records" banner under the same conditions), and that search/filter work identically.
3. Confirm **Delete** buttons are present here (unlike Manager's tab).
4. Click Delete on a seeded test row, confirm the `confirm()` dialog, confirm it: the row disappears from Admin's list immediately, a `CLIENT_RECORDS` / `CLIENT_ARCHIVED` entry appears in the Admin's existing Audit Logs tab, and reloading Manager's Clients tab no longer shows that client either (because `fetchAllInspections()` now filters `deleted_at IS NULL`).
5. Simulate an archive failure (e.g. disconnect network mid-click, or point at an unconfigured Supabase instance) and confirm the row stays in the list with an error toast rather than disappearing silently.
6. Confirm `js/forms/installationForm.js`'s certificate and Manager's Clients tab Print button are both unaffected by this task.

- [ ] **Step 4: Commit**

```bash
git add js/components/adminWorkspace.js
git commit -m "Add Admin Clients tab with client archiving"
```
