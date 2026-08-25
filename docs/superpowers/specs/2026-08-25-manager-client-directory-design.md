# Manager Client Directory & Certificate Printing — Design

## Problem

The Manager workspace's "360° Client Search" tab (`ManagerWorkspace.renderClientSearchTab()`) currently shows one hardcoded demo client — there is no real list of clients anywhere for the manager role. Separately, the Inspector's Ocular Form used to have a "Print / Export Form" button that generated a full audit certificate; that button was removed from the Inspector flow (it didn't belong there). The manager needs equivalent printing capability instead, exercised from a real, searchable list of every client the company has served.

## Goals

- Replace the demo "360° Client Search" tab with a real, Supabase-backed list of every `ocular_inspections` record (any status), searchable by name/RN/phone and filterable by status.
- Give each row a **Print** button that opens the full audit certificate (same layout as the one removed from the Ocular Form) for that specific client, populated with real data.
- Certificates must be complete regardless of which device/inspector created the underlying record — this requires closing a data-loss gap described below.

## Non-goals

- No bulk "print all" action (per-row only).
- No changes to `installationForm.js`'s separate "Print / Export Handover Certificate" — different button, different data, out of scope.
- No changes to role-gating: the Manager workspace (and therefore this tab) is already restricted to `CUSTOMER_CARE_MANAGER`, `LEAD_ENGINEER`, `ADMIN` via `AuthGuard.hasRole()` in `router.js`. Nothing new needed here.
- No write/edit capability on this list — read-only directory + print.

## The data-loss gap (why this isn't just a UI task)

`OcularForm.getFormData()` captures every named field on the form via `FormData`, so a local draft or "ready" record has full fidelity — this is what the old Ocular Form print button relied on. But `supabaseService.mapLocalToSupabase()` only ever wrote a small subset of fields to Supabase (`client_name`, `rn_no`, `installation_no`, `contact_no`, `scope_of_works`, `location_address`, `voltage_system`, `main_breaker`, `grounding_system`, `estimate_distance`, `inspected_by_name`, both signature images, `witnessed_by_name`, `photo_attachments`, `status`) — even fields that already have columns in `ocular_inspections` (e.g. `breaker_brand`, `breaker_mounting`, the conduit/box quantity columns) were never being written. `mapSupabaseToLocal()` reads back an even smaller subset.

Because a manager's client list must be Supabase-backed (a manager needs to see every inspector's records across devices, not just what's cached in one browser's localStorage), this gap would otherwise mean most printed certificates show "N/A" across the entire feeder/EV-charger/materials/NEMA3R sections. Fixing it is required to meet the goal above, not optional polish.

Additionally, the certificate template references several fields that don't exist as `ocular_inspections` columns *at all* yet, because they come from breaker-dropdown/NEMA3R UI work still uncommitted in `ocularForm.js`:

- `breakerDesign`, `breakerPole` (+ `Other` companions)
- The entire NEMA3R block: `hasNema3r`, `nema3rBreaker`, `nema3rBrandType`, `nema3rMounting`, `nema3rDesign`, `nema3rPole` (+ `Other` companions)
- `breakerBrandTypeOther`, `breakerMountingOther`

And several material/BOM fields the certificate uses have no column of any kind today:

- `conduitRsc`, `conduitPvcMoulding`, `conduitBlackFlexible`, `conduitPvcFlexibleOrange`, `conduitOtherType`, `conduitOtherQty`
- `elbowEmt90`, `elbowImc90`, `elbowRsc90` (elbows are entirely absent from the schema)
- `bodyC` (schema has `lb_qty`/`lr_qty`/`ll_qty`/`t_qty` but no "C" body type)
- `connectorEmtSetScrew`, `connectorEmtCompression`
- `couplingEmtSetScrew`, `couplingEmtCompression`
- `clampCTwoHole`, `clampCOneHole`, `clampStrapMalleable`
- `liquidTightConnectorQty`, `liquidTightFlexLength` (schema has a differently-shaped `liquid_tight_fittings` boolean + `liquid_tight_qty`, which no longer matches the UI's field names)

Decision: **full data plumbing** — extend the schema for all of the above, and rewrite both mapping functions to carry every field losslessly. This is a bigger migration than "just NEMA3R," but it's what "full audit certificate, always complete" actually requires.

## Design

### 1. Schema migration

New file `supabase/migrations/2026-08-25-ocular-inspection-full-fields.sql` (additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so it's safe to replay against an already-provisioned database):

```sql
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
  ADD COLUMN IF NOT EXISTS clamp_strap_malleable_qty INT DEFAULT 0;
```

The old `liquid_tight_fittings` boolean and `liquid_tight_qty` columns are left in place (not dropped — no destructive changes), just no longer written to; `liquid_tight_connector_qty`/`liquid_tight_flex_length` are the ones the current UI and certificate actually use.

`supabase/schema.sql` itself is also updated in place (adding the same columns to the `CREATE TABLE` block) so a fresh database provisioned from scratch already has the full set — the migration file exists for databases that already exist.

### 2. Mapping rewrite (`js/services/supabaseService.js`)

`mapLocalToSupabase(data)` and `mapSupabaseToLocal(row)` are rewritten as a matched pair covering every field listed above plus the ones already partially handled, so a record survives a round trip through Supabase with no field loss. Both functions are table-driven off one `{ localKey, column }` list to keep the two directions from drifting apart again.

### 3. Fetching (`js/services/supabaseService.js`)

New method:

```js
async fetchAllInspections() {
  if (this.isConfigured()) {
    try {
      const { data, error } = await this.withTimeout(
        this.client.from('ocular_inspections').select('*').order('created_at', { ascending: false }),
        3000,
        'Fetch all inspections'
      );
      if (error) throw error;
      return { records: (data || []).map(r => this.mapSupabaseToLocal(r)), source: 'cloud' };
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
```

Returning `{ records, source }` (rather than a bare array, like `fetchReadyInspections` does) lets the UI distinguish "empty list" from "couldn't reach the cloud, showing a partial local cache" — see Error handling below.

### 4. `ClientDirectory` component (new — `js/components/clientDirectory.js`)

Replaces the body of `ManagerWorkspace.renderClientSearchTab()`. `ManagerWorkspace` instantiates it against a container the same way `InspectorWorkspace` instantiates `OcularForm`/`InstallationForm`/`ReadyList`. Owns:

- Fetching via `supabaseService.fetchAllInspections()` on render, with a loading state.
- A search input (client name / RN / phone, client-side substring match over the already-fetched list — no per-keystroke re-fetch).
- A status filter, with options built dynamically from whatever distinct `status` values are actually present in the fetched records (plus an "All" option), rather than a hardcoded enum. This matters because tracing the current code shows `ocular_inspections.status` is *only* ever written as `'READY_FOR_INSTALLATION'` today — the Manager QA approve/reject buttons (`renderQATab`) only log an audit event and show a toast, they don't call Supabase to change status, and "installed" is tracked as a separate row in `installation_records`, not a status value on this table. A hardcoded `Draft/Ready/Installed/Cancelled` filter would mostly show empty buckets against real data. Building options from what's actually present keeps the filter honest today and automatically picks up new status values if the QA flow is wired to real writes later — that wiring itself is out of scope here.
- Rendering one row per client: name, RN, address, status badge, date — with a **Print** button.
- The "cloud unavailable, showing cached data" banner when `source === 'local'`.

### 5. Certificate module (new — `js/utils/ocularCertificate.js`)

Extracted from the certificate-generation code removed from `ocularForm.js`, adapted to be data-driven rather than DOM-driven, and exported for reuse:

```js
export function renderCertificateHTML(data) { ... }   // returns the certificate markup string
export function printOcularCertificate(data) { ... }   // injects into #print-sheet-container, sets document.title, window.print(), restores title
```

**Required adaptation, not a verbatim copy:** the original photo gallery section read live images directly from the Ocular Form's DOM (`document.getElementById('prev_${id}')`). That DOM doesn't exist when printing from the manager's client list — a fetched record only has `data.photos[id]` (from the `photo_attachments` JSONB column). The photo section is rewritten to source from `data.photos[id]` directly, with the same "no photo yet" placeholder fallback the original had.

`printOcularCertificate` is responsible for creating the hidden `#print-sheet-container` div on demand (append to `document.body` if not already present) rather than assuming a specific host page's markup has one, since it's now called from the Manager workspace rather than the Ocular Form page.

`ClientDirectory`'s row Print button calls `printOcularCertificate(row)` with that row's already-fetched data — no extra network call needed at print time.

## Data flow

Manager opens the Clients tab → `ClientDirectory.render()` calls `fetchAllInspections()` → rows render → manager searches/filters client-side → clicks Print on a row → `printOcularCertificate(row)` builds the hidden certificate DOM, sets the PDF-filename-friendly document title, opens the print dialog, restores the title after. Entirely read-only; no writes anywhere in this feature.

## Error handling

- Supabase unreachable/times out → `fetchAllInspections()` returns `source: 'local'`; `ClientDirectory` shows a banner ("Showing locally cached records only — reconnect to see the full client list") instead of silently presenting a partial list as complete.
- No records at all → existing empty-state pattern already used elsewhere in this file (e.g. `renderHistoryStage`'s "No saved local drafts found").
- A row with missing fields (pre-migration record, or a draft that never reached later steps) → certificate already handles this via `data.field || 'N/A'` throughout; no new handling needed.

## Testing / verification

No test framework exists in this repo currently, so verification is manual:

1. Seed a few `ocular_inspections` rows directly in Supabase, including at least one with a `status` other than `READY_FOR_INSTALLATION` (to exercise the dynamic filter) and one with NEMA3R and breaker-design/pole data populated.
2. Confirm the Clients tab lists all of them, search narrows by name/RN/phone, and the status filter's options match the distinct statuses actually present.
3. Click Print on the NEMA3R-populated row and confirm the certificate's feeder/breaker/NEMA3R/materials sections are actually populated (proving the schema + mapping fix worked), not the old all-"N/A" result.
4. Click Print on a sparse/older row and confirm it still renders cleanly with "N/A" placeholders rather than erroring.
5. Confirm the migration is additive-only and doesn't break `fetchReadyInspections()` or `fetchDashboardMetrics()`, which read the same table.
