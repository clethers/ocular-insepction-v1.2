# Sales Pipeline (Customer Care Lead Tracker) — Design

## Problem

Customer Care currently tracks every incoming lead — from first contact through
quoting to installation — in an external spreadsheet
(`TESLA INTERNAL DATABASE (1) 1.xlsx`, sheet "CLIENT DATABASE"). It holds 306
real client records with: contact info, installation address, a free-text
`Status` column, and 8 paired checkbox+date columns tracking pipeline stages
(Initial Contact → Site Visit Scheduled/Completed → Quote Sent/Accepted →
Installation Scheduled/Complete → Job Checkout), plus a Remarks column holding
Google Drive folder links.

This data has no home in OIMS today. `ocular_inspections` is a technical
site-audit record (breaker specs, conduit counts, signatures) gated behind a
QA workflow (`PENDING_QA` → `READY_FOR_INSTALLATION`) — it has no fields for
sales-stage tracking and no free-text `Status` column to map onto. Importing
this data through the existing Client Directory CSV importer
(`clientDirectory.js`) would silently drop every stage/date/email/remarks
field and dump every row into `PENDING_QA`, since that importer only knows
`ocular_inspections`' columns.

The spreadsheet's `Status` column is also inconsistent — "Accepted" vs "Quote
Accepted", "Quote Sent" vs "Quote Sent To Customer", trailing whitespace, 3
blank rows — so a straight copy would carry the mess forward.

## Goals

- A new Supabase table, `sales_leads`, that becomes the live system of record
  for Customer Care's sales/onboarding pipeline going forward — not just a
  historical archive.
- Import the 306 existing spreadsheet rows into it once, with statuses
  normalized to a fixed, closed set of canonical stages.
- A new "Sales Pipeline" tab in the Manager Workspace (Customer Care Manager +
  Admin, matching who owns this data today) to search, filter, create, and
  advance leads.
- When a lead's RN Number matches a row in `ocular_inspections`, show that
  inspection's status alongside the lead — a 360° view without a formal join
  table.

## Non-goals

- No changes to `ocular_inspections` or its QA workflow — sales leads and
  inspections stay separate tables, linked only by matching `rn_no` values.
- No kanban/drag-and-drop board — a searchable/filterable table + detail
  view, matching the existing Client Directory pattern, is enough.
- No free-text status entry — the `stage` field is a fixed dropdown of 9
  values (see below). Anything not on that list doesn't get an easy path in;
  that's intentional, it's what prevents the "Accepted" vs "Quote Accepted"
  drift from recurring.
- No automatic linking/merging of a `sales_leads` row into `ocular_inspections`
  when a lead reaches "Installation Scheduled" — that remains a manual,
  separate step (someone fills out the actual Ocular Inspection Form). This
  design only makes the two visible together when RNs match.
- No bulk edit, no bulk delete.
- Stage/status canonicalization is being locked in "for now" per the
  product owner — expected to be revisited later; this design doesn't build
  in extensibility beyond a normal schema/enum change.

## Data model

New file `supabase/migrations/2026-09-13-sales-leads.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Traceability back to the source spreadsheet row (e.g. "INSTCOM_1393748").
    -- NULL for leads created directly in OIMS. Unique-when-present so the
    -- one-time historical import can upsert and be safely re-run.
    legacy_row_id VARCHAR(100) UNIQUE,

    first_name VARCHAR(150),
    last_name VARCHAR(150),
    contact_no VARCHAR(50),
    email VARCHAR(255),
    installation_address TEXT,
    mode_of_communication VARCHAR(100),

    -- Join key to ocular_inspections.rn_no for the 360 view. Nullable: a
    -- lead may not have an RN yet (e.g. still at Initial Contact).
    rn_no VARCHAR(100) UNIQUE,

    -- Fixed, closed set — see "Stage model" below. CANCELED is terminal and
    -- reachable from any prior stage.
    stage VARCHAR(30) NOT NULL DEFAULT 'INITIAL_CONTACT'
        CHECK (stage IN (
            'INITIAL_CONTACT', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED',
            'QUOTE_SENT', 'QUOTE_ACCEPTED', 'INSTALLATION_SCHEDULED',
            'INSTALLATION_COMPLETE', 'JOB_CHECKOUT_COMPLETE', 'CANCELED'
        )),

    -- Stamped the first time a lead reaches each stage. Kept even if the
    -- lead is later CANCELED, so "how far did this get before it fell
    -- through" is never lost.
    stage_initial_contact_at TIMESTAMPTZ,
    stage_site_visit_scheduled_at TIMESTAMPTZ,
    stage_site_visit_completed_at TIMESTAMPTZ,
    stage_quote_sent_at TIMESTAMPTZ,
    stage_quote_accepted_at TIMESTAMPTZ,
    stage_installation_scheduled_at TIMESTAMPTZ,
    stage_installation_complete_at TIMESTAMPTZ,
    stage_job_checkout_complete_at TIMESTAMPTZ,

    remarks TEXT, -- free text; carries the source sheet's Drive folder links

    -- The original, un-normalized status string from the source row (or
    -- manual entry), kept for audit purposes even after stage normalization.
    source_status_raw TEXT,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL -- soft delete/archive, same convention as ocular_inspections
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_rn_no ON public.sales_leads(rn_no);
CREATE INDEX IF NOT EXISTS idx_sales_leads_stage ON public.sales_leads(stage);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON public.sales_leads(created_at DESC);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

-- Table-level RLS stays permissive; real access control is enforced in the
-- app layer via AuthGuard role gating on the Manager Workspace route — same
-- convention as support_tickets (migrations/2026-09-09-support-tickets.sql).
CREATE POLICY "Allow read sales leads" ON public.sales_leads FOR SELECT USING (true);
CREATE POLICY "Allow insert sales leads" ON public.sales_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update sales leads" ON public.sales_leads FOR UPDATE USING (true);
```

### Stage model

One `stage` column is both "current status" and "how far this lead has
progressed" — no separate cancellation flag. Advancing a lead sets `stage`
and stamps the matching `stage_*_at` column; canceling sets
`stage = 'CANCELED'` without touching the timestamps already recorded, so the
detail view can always show "reached Quote Sent on <date>, then canceled."

### Status normalization (import-time only)

Applied once, in the historical import script — not a runtime concern:

| Source `Status` value(s) | Canonical `stage` |
|---|---|
| Initial Customer Contact | `INITIAL_CONTACT` |
| Site Visit Scheduled | `SITE_VISIT_SCHEDULED` |
| Site Visit Completed | `SITE_VISIT_COMPLETED` |
| Quote Sent, Quote Sent To Customer | `QUOTE_SENT` |
| Accepted, Quote Accepted | `QUOTE_ACCEPTED` |
| Installation Scheduled | `INSTALLATION_SCHEDULED` |
| Installation Complete | `INSTALLATION_COMPLETE` |
| Provision Completed | `JOB_CHECKOUT_COMPLETE` (only 1 row; closest canonical match) |
| Installation Canceled (any stage) | `CANCELED` |
| *(blank, 3 rows)* | derived from whichever stage checkbox columns are `TRUE`, furthest one wins |

`source_status_raw` always keeps the literal original string, regardless of
which canonical value it mapped to.

### Linkage to `ocular_inspections`

No foreign key — `ocular_inspections.rn_no` is independently `UNIQUE NOT
NULL` and rows there and in `sales_leads` are created through entirely
different flows. The link is a runtime lookup: given a `sales_leads` row's
`rn_no`, query `ocular_inspections WHERE rn_no = $1 AND deleted_at IS NULL`.
If found, the lead's detail view shows that inspection's `status` and
submission date inline.

## One-time historical import

A standalone script, `scripts/import_sales_leads.py`, run manually once
(not part of the app or CI, not a project dependency — this repo has no
Python tooling otherwise, so it stays a throwaway dev-time script rather
than adding an npm package to `package.json` just to parse one spreadsheet
once). Uses `openpyxl` (read the sheet) and the standard library's
`urllib.request` (call Supabase's PostgREST API directly) — no new
project dependencies either way.

1. Reads `srcs/TESLA INTERNAL DATABASE (1) 1.xlsx`, sheet "CLIENT DATABASE",
   rows 2–307 (the sheet has ~680 rows of blank padding after that).
2. Applies the normalization table above to derive `stage` and
   `source_status_raw`.
3. Splits `Status` into the per-stage `stage_*_at` timestamps using the
   sheet's own "DATE ACCOMPLISHED"/"DATE SCHEDULED" columns where present.
4. Upserts into `sales_leads` via a `POST` to
   `{VITE_SUPABASE_URL}/rest/v1/sales_leads` with
   `Prefer: resolution=merge-duplicates` and `on_conflict=legacy_row_id` —
   authenticated with the same `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` already in `.env` (this project has no
   service-role key configured anywhere, and doesn't need one: every RLS
   policy on `sales_leads`, like every other OIMS table, is
   `USING (true)` / `WITH CHECK (true)` — access control is enforced in
   the app layer, not RLS). Keyed on `legacy_row_id` — safe to re-run.
5. Prints a summary (rows read, inserted, updated, skipped-with-reason) for
   manual verification against the known counts (306 total, 104 Installation
   Complete, 97 Initial Contact, 51 Canceled — see prior status breakdown).

## UI

### Navigation

`js/components/appLayout.js` — new entry under the existing **OPERATIONS &
MGR CARE** section (visible to `isManager`, i.e. `CUSTOMER_CARE_MANAGER`,
`LEAD_ENGINEER`, or `ADMIN`), alongside 360° Client Lookup and Installations:

```html
<a href="/manager/pipeline" class="sidebar-nav-btn ...">
  <span>Sales Pipeline</span>
</a>
```

### Component

New `js/components/salesPipeline.js`, mounted into `ManagerWorkspace`'s
`#manager-tab-stage` exactly like `ClientDirectory`/`InstallationsDirectory`
are today (`managerWorkspace.js` gets a new `activeTab === 'pipeline'`
branch and a corresponding tab button).

Mockup approved: https://claude.ai/code/artifact/d2e97ca5-1f57-4262-8a7e-fdd9fc2230db
(fabricated sample data, EcoWorks palette/chrome for layout review only).

Mirrors `ClientDirectory`'s established structure:

- Search input (name, RN, contact number) + a row of stage-count pills above
  the table ("All 306", "Initial Contact 97", "Canceled 51", ...) as the
  primary filter — quicker to scan than a bare dropdown given the pipeline is
  bimodal (heavy at Initial Contact and Installation Complete, thin in the
  middle). The `<select>` filter stays too, for parity with `ClientDirectory`
  and as the control screen readers/keyboard users get.
- Stage badges use a fixed color per stage that reads as progress at a
  glance: neutral gray (Initial Contact) → blue/cyan (site visit) → gold
  (quoting) → green, deepening with each install stage (Installation
  Scheduled → Complete → Job Checkout) → rose (Canceled, breaks the
  gradient deliberately).
- Sortable table (desktop) / stacked record cards (mobile) — same responsive
  pattern already used across the app (per the recent stacked-card mobile
  work). Rows with no `rn_no` yet show "No RN yet" rather than blank.
- **Add Lead** button → modal form (first/last name, contact, email,
  address, mode of communication; stage defaults to `INITIAL_CONTACT`).
- Row **detail view**: full stage history (which `stage_*_at` are set),
  remarks, a stage-advance control (dropdown + "Update" — sets `stage` and
  stamps the matching timestamp), and — when `rn_no` matches an
  `ocular_inspections` row — that inspection's status shown inline.
- **Import CSV** button for *future* bulk adds (e.g. another Customer Care
  export later) — a dedicated parser for `sales_leads`' column set, separate
  from the one-time xlsx migration script and from `ClientDirectory`'s
  existing CSV importer (which is `ocular_inspections`-specific and stays
  untouched). A `stage` column value not in the fixed 9-value list is a
  row-level import error (same pattern as `ClientDirectory.handleImportFile`
  flagging rows and letting valid rows still import) — the closed-dropdown
  guarantee holds for CSV-imported rows too, not just ones entered by hand.
- Archive (soft-delete) action, available to anyone who can reach the Manager
  Workspace (the `/manager` route is already gated to Customer Care Manager /
  Lead Engineer / Admin — same access level as resolving a Support Ticket or
  approving Audit QA there today, no extra per-action role check). Uses the
  same `deleted_at` convention as `ClientDirectory.handleDelete`, which *is*
  Admin-only — that stricter gate exists there because Client Directory is
  also reachable from the Admin Workspace's own Clients tab and needs to
  distinguish the two hosts; Sales Pipeline has only the one host, so no
  extra flag is needed.

### Service layer

New methods on `js/services/supabaseService.js`, following the existing
method shapes (`fetchAllInspections`, `bulkImportInspections`, etc.):

- `fetchAllSalesLeads()`
- `fetchOcularInspectionByRnNo(rnNo)` — given a lead's RN number, looks up
  the matching `ocular_inspections` row for the detail view's 360 panel.
  Read-only cross-reference; same convention as the existing
  `fetchInstallationByRnNo`.
- `createSalesLead(data)`
- `updateSalesLeadStage(id, stage)`
- `bulkImportSalesLeads(rows)`
- `archiveSalesLead(id)`

Each create/update/import/archive action logs through the existing
`auditLogService` under the `CLIENT_RECORDS` category, same as
`ClientDirectory`'s import/archive actions today.

## Testing

- Migration script: run against a dev Supabase project, verify row count
  (306) and stage distribution match the known breakdown; re-run and verify
  no duplicates are created (upsert on `legacy_row_id` holds).
- Manual UI pass: search by name/RN/contact, filter by each stage including
  Canceled, add a lead, advance it through a couple of stages, cancel a
  lead, confirm audit log entries appear, confirm the RN-linkage panel shows
  a matching `ocular_inspections` record when one exists and stays blank
  when it doesn't.
- Mobile viewport check for the stacked-card list, matching the app's
  existing responsive pattern.
