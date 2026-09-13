# Sales Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Customer Care's external lead-tracking spreadsheet into OIMS as a new `sales_leads` Supabase table, plus a searchable/filterable "Sales Pipeline" tab in the Manager Workspace, plus a one-time import of the 306 real records already in the spreadsheet.

**Architecture:** One new table (`sales_leads`) independent of `ocular_inspections`, linked only by matching `rn_no` at read time. One new component (`js/components/salesPipeline.js`) mounted into the existing `ManagerWorkspace`, following the exact structural pattern already used by `ClientDirectory`/`SupportTicketsPanel`. New `supabaseService.js` methods follow the existing `support_tickets` method shapes (cloud-only, no local-storage fallback). A one-time Python script seeds the historical data directly via Supabase's REST API — no new npm dependency for a throwaway script.

**Tech Stack:** Vanilla JS (Vite, no framework), Supabase (Postgres + PostgREST), plain CSS (existing `forms.css`/`main.css` classes reused, no new stylesheet). Python 3 + `openpyxl` for the one-time historical import only (not a project dependency).

**Spec:** [docs/superpowers/specs/2026-09-13-sales-pipeline-design.md](../specs/2026-09-13-sales-pipeline-design.md)

## Global Constraints

- `stage` is a fixed, closed set of exactly 9 values (no free text, ever):
  `INITIAL_CONTACT`, `SITE_VISIT_SCHEDULED`, `SITE_VISIT_COMPLETED`,
  `QUOTE_SENT`, `QUOTE_ACCEPTED`, `INSTALLATION_SCHEDULED`,
  `INSTALLATION_COMPLETE`, `JOB_CHECKOUT_COMPLETE`, `CANCELED`.
- No new npm dependencies. No new CSS files/classes beyond what already
  exists in `css/forms.css`/`css/main.css` (`form-card`, `form-input`,
  `form-select`, `form-group`, `form-label`, `directory-table*`,
  `record-card`/`record-top`/`record-meta`/`record-sub`, `hide-on-mobile`,
  `hide-on-desktop`, `modal-overlay`, `modal-dialog`, `modal-title`,
  `modal-subtitle`, `modal-footer`, `btn`/`btn-primary`/`btn-outline`/
  `btn-link`, `pipeline-stepper`/`pipeline-step`/`pipeline-connector`).
- RLS on `sales_leads` stays permissive (`USING (true)` /
  `WITH CHECK (true)`) — same convention as every other OIMS table; access
  control is enforced by the `/manager` route's role gate in
  `js/router.js`, not by RLS.
- This repo has **no automated test framework** (`package.json` has no
  test script, no test files exist anywhere). Every task below is
  verified manually — running the dev server and exercising the feature
  in a browser, or running a script and inspecting its output — matching
  how the rest of this codebase is verified today. Do not introduce a
  test framework as part of this plan.
- Soft-delete via `deleted_at`, same convention as `ocular_inspections`.
- The historical import script (Task 8) is a one-time, run-once-by-hand
  tool. It is not wired into the app, into CI, or into `package.json`.

---

### Task 1: Database migration — `sales_leads` table

**Files:**
- Create: `supabase/migrations/2026-09-13-sales-leads.sql`

**Interfaces:**
- Produces: the `public.sales_leads` table, columns and `stage` CHECK
  constraint as below — every later task reads/writes this exact shape.

- [ ] **Step 1: Write the migration file**

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

    -- Fixed, closed set. CANCELED is terminal and reachable from any prior
    -- stage.
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
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_rn_no ON public.sales_leads(rn_no);
CREATE INDEX IF NOT EXISTS idx_sales_leads_stage ON public.sales_leads(stage);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON public.sales_leads(created_at DESC);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read sales leads" ON public.sales_leads FOR SELECT USING (true);
CREATE POLICY "Allow insert sales leads" ON public.sales_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update sales leads" ON public.sales_leads FOR UPDATE USING (true);
```

- [ ] **Step 2: Apply the migration**

Open the Supabase project's SQL Editor (dashboard → SQL Editor) and run
the contents of the file above. This project has no `supabase` CLI
config (`supabase/config.toml` doesn't exist) — every existing migration
in `supabase/migrations/` is applied the same way, by hand.

- [ ] **Step 3: Verify**

In the same SQL Editor, run:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sales_leads' ORDER BY ordinal_position;
```

Expected: 22 rows, matching every column above.

```sql
SELECT * FROM public.sales_leads LIMIT 1;
```

Expected: succeeds, returns 0 rows (table exists and is empty).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-09-13-sales-leads.sql
git commit -m "feat: add sales_leads table for Customer Care lead pipeline"
```

---

### Task 2: Service layer — read methods

**Files:**
- Modify: `js/services/supabaseService.js:643` (insert before
  `subscribeToReadyQueue(callback) {`, right after `mapTicketToLocal`'s
  closing `}`)

**Interfaces:**
- Consumes: `this.client`, `this.isConfigured()`, `this.withTimeout()` —
  all already defined earlier in the same class.
- Produces:
  - `supabaseService.fetchAllSalesLeads()` → `Promise<Array<SalesLead>>`
    (mapped, camelCase objects; `[]` on any failure — never throws)
  - `supabaseService.fetchOcularInspectionByRnNo(rnNo)` →
    `Promise<{status, created_at} | null>` (raw row, snake_case — same
    convention as the existing `fetchInstallationByRnNo`)
  - `supabaseService.mapSalesLeadToLocal(row)` → `SalesLead` object with
    fields: `id, legacyRowId, firstName, lastName, clientName, contactNo,
    email, installationAddress, modeOfCommunication, rnNo, stage,
    stageInitialContactAt, stageSiteVisitScheduledAt,
    stageSiteVisitCompletedAt, stageQuoteSentAt, stageQuoteAcceptedAt,
    stageInstallationScheduledAt, stageInstallationCompleteAt,
    stageJobCheckoutCompleteAt, remarks, sourceStatusRaw, createdBy,
    createdAt, updatedAt`

- [ ] **Step 1: Insert the three methods**

Open `js/services/supabaseService.js`. Find this exact block (currently
lines 628–643):

```js
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
```

Replace it with (adds the three new methods between `mapTicketToLocal`
and `subscribeToReadyQueue`, nothing else changes):

```js
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

  // Sales Pipeline — Customer Care's lead-tracking table (see
  // supabase/migrations/2026-09-13-sales-leads.sql). Independent of
  // ocular_inspections; linked only by matching rn_no, looked up on
  // demand via fetchOcularInspectionByRnNo below.
  async fetchAllSalesLeads() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('sales_leads')
          .select('*')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
        3000,
        'Fetch all sales leads'
      );
      if (error) throw error;
      return (data || []).map(row => this.mapSalesLeadToLocal(row));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch sales leads:', err.message);
      return [];
    }
  }

  // Given a sales lead's RN number, looks up the matching
  // ocular_inspections row (if an actual inspection has since been
  // submitted for it) — used by the Sales Pipeline detail view's 360
  // panel. Read-only cross-reference; same convention as the existing
  // fetchInstallationByRnNo.
  async fetchOcularInspectionByRnNo(rnNo) {
    if (!rnNo || !this.isConfigured()) return null;
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('ocular_inspections')
          .select('status, created_at')
          .eq('rn_no', rnNo)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1),
        3000,
        'Fetch ocular inspection by rn_no'
      );
      if (error) throw error;
      return (data && data[0]) || null;
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch linked ocular inspection:', err.message);
      return null;
    }
  }

  mapSalesLeadToLocal(row) {
    const firstName = row.first_name || '';
    const lastName = row.last_name || '';
    return {
      id: row.id,
      legacyRowId: row.legacy_row_id,
      firstName,
      lastName,
      clientName: `${firstName} ${lastName}`.trim() || 'Unnamed Lead',
      contactNo: row.contact_no,
      email: row.email,
      installationAddress: row.installation_address,
      modeOfCommunication: row.mode_of_communication,
      rnNo: row.rn_no,
      stage: row.stage,
      stageInitialContactAt: row.stage_initial_contact_at,
      stageSiteVisitScheduledAt: row.stage_site_visit_scheduled_at,
      stageSiteVisitCompletedAt: row.stage_site_visit_completed_at,
      stageQuoteSentAt: row.stage_quote_sent_at,
      stageQuoteAcceptedAt: row.stage_quote_accepted_at,
      stageInstallationScheduledAt: row.stage_installation_scheduled_at,
      stageInstallationCompleteAt: row.stage_installation_complete_at,
      stageJobCheckoutCompleteAt: row.stage_job_checkout_complete_at,
      remarks: row.remarks,
      sourceStatusRaw: row.source_status_raw,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  subscribeToReadyQueue(callback) {
```

- [ ] **Step 2: Verify**

Run `npm run dev`, open the app in a browser, open the browser console,
and run:

```js
const { supabaseService } = await import('/js/services/supabaseService.js');
await supabaseService.fetchAllSalesLeads();
```

Expected: `[]` (table is empty — Task 1 just created it), no thrown
error, no red console error.

- [ ] **Step 3: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "feat: add sales lead read methods to supabaseService"
```

---

### Task 3: Service layer — write methods

**Files:**
- Modify: `js/services/supabaseService.js` (insert immediately after the
  block added in Task 2, i.e. right after `mapSalesLeadToLocal`'s closing
  `}` and before `subscribeToReadyQueue`)

**Interfaces:**
- Consumes: `this.client`, `this.isConfigured()`, `this.withTimeout()`,
  `this.mapSalesLeadToLocal()` (Task 2).
- Produces:
  - `supabaseService.createSalesLead({firstName, lastName, contactNo,
    email, installationAddress, modeOfCommunication, createdBy})` →
    `Promise<SalesLead>` (throws on failure)
  - `supabaseService.updateSalesLeadStage(id, stage)` → `Promise<void>`
    (throws on failure; stamps the matching `stage_*_at` column only if
    it isn't already set)
  - `supabaseService.archiveSalesLead(id)` → `Promise<void>` (throws on
    failure)
  - `supabaseService.bulkImportSalesLeads(rows)` → `Promise<Array<SalesLead>>`
    where each `row` is `{firstName, lastName, contactNo, email,
    installationAddress, modeOfCommunication, rnNo, stage, remarks}`
    (throws on failure)

- [ ] **Step 1: Insert the four methods + static column map**

Insert immediately after the `mapSalesLeadToLocal` method added in Task
2 (i.e. between it and `subscribeToReadyQueue`):

```js
  // Maps a sales_leads.stage value to the DB column that gets stamped
  // the first time a lead reaches it. CANCELED has no column of its own
  // — see updateSalesLeadStage.
  static SALES_STAGE_COLUMNS = {
    INITIAL_CONTACT: 'stage_initial_contact_at',
    SITE_VISIT_SCHEDULED: 'stage_site_visit_scheduled_at',
    SITE_VISIT_COMPLETED: 'stage_site_visit_completed_at',
    QUOTE_SENT: 'stage_quote_sent_at',
    QUOTE_ACCEPTED: 'stage_quote_accepted_at',
    INSTALLATION_SCHEDULED: 'stage_installation_scheduled_at',
    INSTALLATION_COMPLETE: 'stage_installation_complete_at',
    JOB_CHECKOUT_COMPLETE: 'stage_job_checkout_complete_at'
  };

  async createSalesLead({ firstName, lastName, contactNo, email, installationAddress, modeOfCommunication, createdBy }) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const now = new Date().toISOString();
    const payload = {
      first_name: firstName,
      last_name: lastName,
      contact_no: contactNo || null,
      email: email || null,
      installation_address: installationAddress || null,
      mode_of_communication: modeOfCommunication || null,
      stage: 'INITIAL_CONTACT',
      stage_initial_contact_at: now,
      created_by: createdBy || null
    };

    const { data, error } = await this.client
      .from('sales_leads')
      .insert([payload])
      .select();

    if (error) throw error;
    return (data && data[0]) ? this.mapSalesLeadToLocal(data[0]) : this.mapSalesLeadToLocal(payload);
  }

  // Advances (or cancels) a lead. Stamps the matching stage_*_at column
  // only the first time that stage is reached — moving a lead back and
  // forth, or re-selecting its current stage, never overwrites a
  // timestamp already recorded.
  async updateSalesLeadStage(id, stage) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const now = new Date().toISOString();
    const payload = { stage, updated_at: now };
    const column = SupabaseService.SALES_STAGE_COLUMNS[stage];

    if (column) {
      const { data: existing, error: fetchError } = await this.withTimeout(
        this.client.from('sales_leads').select(column).eq('id', id).single(),
        3000,
        'Fetch sales lead stage timestamp'
      );
      if (fetchError) throw fetchError;
      if (!existing || !existing[column]) payload[column] = now;
    }

    const { error } = await this.withTimeout(
      this.client.from('sales_leads').update(payload).eq('id', id),
      3000,
      'Update sales lead stage'
    );
    if (error) throw error;
  }

  async archiveSalesLead(id) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const { error } = await this.withTimeout(
      this.client.from('sales_leads').update({ deleted_at: new Date().toISOString() }).eq('id', id),
      3000,
      'Archive sales lead'
    );
    if (error) throw error;
  }

  // Bulk-creates sales leads from a parsed CSV (Sales Pipeline's Import
  // CSV button — future bulk adds, distinct from the one-time historical
  // xlsx migration). Upserts on rn_no so re-running an import with
  // overlapping RNs updates rather than errors; multiple rows with a
  // null rn_no never conflict with each other (Postgres treats each NULL
  // as distinct for uniqueness).
  async bulkImportSalesLeads(rows) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    if (!rows || rows.length === 0) return [];

    const payload = rows.map(r => ({
      first_name: r.firstName,
      last_name: r.lastName,
      contact_no: r.contactNo || null,
      email: r.email || null,
      installation_address: r.installationAddress || null,
      mode_of_communication: r.modeOfCommunication || null,
      rn_no: r.rnNo || null,
      stage: r.stage || 'INITIAL_CONTACT',
      remarks: r.remarks || null
    }));

    const { data, error } = await this.client
      .from('sales_leads')
      .upsert(payload, { onConflict: 'rn_no' })
      .select();

    if (error) throw error;
    return (data || []).map(row => this.mapSalesLeadToLocal(row));
  }

```

- [ ] **Step 2: Verify**

Run `npm run dev`, open the browser console:

```js
const { supabaseService } = await import('/js/services/supabaseService.js');
const lead = await supabaseService.createSalesLead({ firstName: 'Test', lastName: 'Lead', createdBy: null });
console.log(lead.stage, lead.stageInitialContactAt); // 'INITIAL_CONTACT', an ISO timestamp
await supabaseService.updateSalesLeadStage(lead.id, 'SITE_VISIT_SCHEDULED');
await supabaseService.archiveSalesLead(lead.id);
```

Expected: no thrown errors. In the Supabase SQL Editor,
`SELECT stage, deleted_at FROM sales_leads WHERE first_name = 'Test';`
shows `stage = 'SITE_VISIT_SCHEDULED'` and a non-null `deleted_at`.

- [ ] **Step 3: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "feat: add sales lead write methods to supabaseService"
```

---

### Task 4: Sales Pipeline component (list) + navigation wiring

**Files:**
- Create: `js/components/salesPipeline.js`
- Modify: `js/components/appLayout.js:80-122`
- Modify: `js/components/managerWorkspace.js:1-70`
- Modify: `js/router.js:214-238`

**Interfaces:**
- Consumes: `supabaseService.fetchAllSalesLeads()` (Task 2).
- Produces: `export class SalesPipeline { constructor(container); async render(); }`
  — same shape as `ClientDirectory`, mountable into any container element.
  Later tasks (5–7) extend this same class.

- [ ] **Step 1: Create the component**

```js
/**
 * OIMS — Sales Pipeline Component (`salesPipeline.js`)
 * Customer Care's lead-tracking pipeline: searchable/filterable list of
 * every sales_leads row, with a per-lead detail view for stage history,
 * updating a lead's stage, and archiving.
 * See docs/superpowers/specs/2026-09-13-sales-pipeline-design.md.
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { escapeHTML } from '../utils/security.js';

export const STAGES = [
  { key: 'INITIAL_CONTACT', label: 'Initial Contact', color: '#64748b' },
  { key: 'SITE_VISIT_SCHEDULED', label: 'Site Visit Scheduled', color: '#0B7BC0' },
  { key: 'SITE_VISIT_COMPLETED', label: 'Site Visit Completed', color: '#00AEEF' },
  { key: 'QUOTE_SENT', label: 'Quote Sent', color: '#F5A83D' },
  { key: 'QUOTE_ACCEPTED', label: 'Quote Accepted', color: '#c17a1f' },
  { key: 'INSTALLATION_SCHEDULED', label: 'Installation Scheduled', color: '#7CB342' },
  { key: 'INSTALLATION_COMPLETE', label: 'Installation Complete', color: '#3C7A1E' },
  { key: 'JOB_CHECKOUT_COMPLETE', label: 'Job Checkout Complete', color: '#2E5E16' },
  { key: 'CANCELED', label: 'Canceled', color: '#F43F5E' }
];

export function stageMeta(key) {
  return STAGES.find(s => s.key === key) || STAGES[0];
}

export class SalesPipeline {
  constructor(container) {
    this.container = container;
    this.leads = [];
    this.searchQuery = '';
    this.stageFilter = 'ALL';
  }

  async render() {
    this.container.innerHTML = this.renderShell();
    this.bindStaticEvents();

    try {
      this.leads = await supabaseService.fetchAllSalesLeads();
    } catch (e) {
      console.warn('[OIMS] Could not fetch sales leads:', e);
      this.leads = [];
    }
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="margin-bottom: 0.5rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.25rem;">Sales Pipeline</h3>
          <p style="font-size: 0.825rem; color: #64748b; margin: 0;">Every lead from first contact through installation, searchable by name, RN number, or contact number.</p>
        </div>

        <div style="display: flex; gap: 0.75rem; margin: 1.25rem 0; flex-wrap: wrap;">
          <input type="text" id="input-pipeline-search" class="form-input" placeholder="Search name, RN-123099045, contact number..." style="flex: 1; min-width: 220px;" />
          <select id="select-pipeline-stage" class="form-select" style="max-width: 220px;">
            <option value="ALL">All Stages</option>
            ${STAGES.map(s => `<option value="${s.key}">${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </div>

        <div id="pipeline-stage-pills" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1.25rem;"></div>

        <div id="pipeline-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading sales leads...</div>
        </div>
      </div>
    `;
  }

  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-pipeline-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const stageSelect = this.container.querySelector('#select-pipeline-stage');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        this.stageFilter = e.target.value;
        this.renderList();
      });
    }
  }

  getFilteredLeads() {
    return this.leads.filter(l => {
      if (this.stageFilter !== 'ALL' && l.stage !== this.stageFilter) return false;
      if (!this.searchQuery) return true;
      const haystack = `${l.clientName} ${l.rnNo || ''} ${l.contactNo || ''}`.toLowerCase();
      return haystack.includes(this.searchQuery);
    });
  }

  renderPills() {
    const wrap = this.container.querySelector('#pipeline-stage-pills');
    if (!wrap) return;

    const counts = {};
    this.leads.forEach(l => { counts[l.stage] = (counts[l.stage] || 0) + 1; });

    const pillHtml = (key, label, color, count) => {
      const active = this.stageFilter === key;
      const bg = active ? color : '#ffffff';
      const fg = active ? '#ffffff' : '#334155';
      const border = active ? color : '#cbd5e1';
      return `<button type="button" class="btn-pipeline-pill" data-stage="${key}" style="border: 1px solid ${border}; background: ${bg}; color: ${fg}; border-radius: var(--radius-full); font-size: 0.72rem; font-weight: 700; padding: 0.35rem 0.7rem;">${escapeHTML(label)} <span style="opacity: 0.85;">${count}</span></button>`;
    };

    const pills = [pillHtml('ALL', 'All', '#0f172a', this.leads.length)];
    STAGES.forEach(s => {
      if (counts[s.key]) pills.push(pillHtml(s.key, s.label, s.color, counts[s.key]));
    });

    wrap.innerHTML = pills.join('');
    wrap.querySelectorAll('.btn-pipeline-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.stageFilter = btn.getAttribute('data-stage');
        const select = this.container.querySelector('#select-pipeline-stage');
        if (select) select.value = this.stageFilter;
        this.renderList();
      });
    });
  }

  renderList() {
    this.renderPills();

    const listEl = this.container.querySelector('#pipeline-list');
    if (!listEl) return;

    if (this.leads.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No sales leads yet.</div>`;
      return;
    }

    const filtered = this.getFilteredLeads();

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No leads match your search or filter.</div>`;
      return;
    }

    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const badge = (key) => {
      const m = stageMeta(key);
      return `<span style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; font-weight: 700; padding: 0.3rem 0.6rem; border-radius: var(--radius-full); background: ${m.color}22; color: ${m.color};"><span style="width: 7px; height: 7px; border-radius: 50%; background: ${m.color};"></span>${escapeHTML(m.label)}</span>`;
    };

    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>RN Number</th>
              <th>Client Name</th>
              <th>Stage</th>
              <th>Contact No</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => `
              <tr>
                <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(l.rnNo || 'No RN yet')}</span></td>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(l.clientName)}</td>
                <td data-label="Stage">${badge(l.stage)}</td>
                <td data-label="Contact No" style="color: #64748b;">${escapeHTML(l.contactNo || 'N/A')}</td>
                <td data-label="Last Updated" style="color: #64748b;">${fmtDate(l.updatedAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${filtered.map(l => `
          <div class="record-card">
            <div class="record-top">
              <span class="record-title">${escapeHTML(l.clientName)}</span>
              ${badge(l.stage)}
            </div>
            <div class="record-meta">
              <span class="rn">${escapeHTML(l.rnNo || 'No RN yet')}</span>
              <span class="dot">&middot;</span>
              <span>${fmtDate(l.updatedAt)}</span>
            </div>
            <div class="record-sub">${escapeHTML(l.installationAddress || 'No address on file')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}
```

- [ ] **Step 2: Wire the sidebar link**

In `js/components/appLayout.js`, find this exact block (lines 92–96):

```html
              <a href="/manager/qa" class="sidebar-nav-btn ${isActive('/manager/qa') ? 'active' : ''}" title="Audit QA Queue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/></svg>
                <span>Audit QA Queue</span>
              </a>
```

Insert a new nav link immediately after it (before the `360° Client
Lookup` link at line 93 in the original file):

```html
              <a href="/manager/qa" class="sidebar-nav-btn ${isActive('/manager/qa') ? 'active' : ''}" title="Audit QA Queue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="9 14 11 16 15 12"/></svg>
                <span>Audit QA Queue</span>
              </a>

              <a href="/manager/pipeline" class="sidebar-nav-btn ${isActive('/manager/pipeline') ? 'active' : ''}" title="Sales Pipeline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                <span>Sales Pipeline</span>
              </a>
```

- [ ] **Step 3: Wire the router**

In `js/router.js`, find this exact block (lines 214–225):

```js
  static async renderManagerWorkspace(pathname) {
    const tabMatch = pathname.replace('/manager', '').replace('/', '') || 'qa';
    const titleMap = {
      dispatch: 'Workload & Field Dispatch Command Center',
      qa: 'Audit QA Review Queue',
      clientsearch: '360° Client & Account Lookup',
      installations: 'Installations',
      calendar: 'Field Operations Calendar',
      tickets: 'Support Tickets Hub',
      materials: 'Material Demand & Allocation',
      kpis: 'Operations KPIs & Performance Analytics'
    };
```

Replace it with (adds one `titleMap` entry, nothing else changes):

```js
  static async renderManagerWorkspace(pathname) {
    const tabMatch = pathname.replace('/manager', '').replace('/', '') || 'qa';
    const titleMap = {
      dispatch: 'Workload & Field Dispatch Command Center',
      qa: 'Audit QA Review Queue',
      pipeline: 'Sales Pipeline',
      clientsearch: '360° Client & Account Lookup',
      installations: 'Installations',
      calendar: 'Field Operations Calendar',
      tickets: 'Support Tickets Hub',
      materials: 'Material Demand & Allocation',
      kpis: 'Operations KPIs & Performance Analytics'
    };
```

- [ ] **Step 4: Mount the component in ManagerWorkspace**

In `js/components/managerWorkspace.js`, find this exact block (lines
6–58):

```js
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { ClientDirectory } from './clientDirectory.js';
import { InstallationsDirectory } from './installationsDirectory.js';
import { SupportTicketsPanel } from './supportTicketsPanel.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'qa'; // 'dispatch', 'qa', 'clientsearch', 'installations', 'calendar', 'tickets', 'materials', 'sms', 'kpis' — qa is the only tab wired to real data, so it's the default landing tab
    this.pendingQAItems = [];
    this.qaLoading = false;
    this.qaLoaded = false;
    this.qaViewMode = 'card'; // 'card' or 'list'
    this.fieldTeams = []; // "Operations Team 1/2" accounts — see fetchFieldTeams
  }

  async render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">

        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${(this.activeTab === 'clientsearch' || this.activeTab === 'installations' || this.activeTab === 'tickets') ? '' : this.renderTabStage()}
        </div>

      </div>

      <!-- Approve Audit QA Confirmation Overlay -->
      <div class="modal-overlay no-print" id="qa-approve-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 460px;">
          <div id="qa-approve-content"></div>
        </div>
      </div>

    `;

    if (this.activeTab === 'clientsearch') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new ClientDirectory(stage).render();
    }

    if (this.activeTab === 'installations') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new InstallationsDirectory(stage).render();
    }

    if (this.activeTab === 'tickets') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new SupportTicketsPanel(stage, { canResolve: true }).render();
    }

    this.bindEvents();
```

Replace it with (adds the `salesPipeline.js` import, adds `'pipeline'`
to the tab list, adds `'pipeline'` to the condition that skips
`renderTabStage()`, and mounts `SalesPipeline` — nothing else changes):

```js
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { AppLayout } from './appLayout.js';
import { ClientDirectory } from './clientDirectory.js';
import { InstallationsDirectory } from './installationsDirectory.js';
import { SupportTicketsPanel } from './supportTicketsPanel.js';
import { SalesPipeline } from './salesPipeline.js';

export class ManagerWorkspace {
  constructor(container) {
    this.container = container;
    this.activeTab = 'qa'; // 'dispatch', 'qa', 'pipeline', 'clientsearch', 'installations', 'calendar', 'tickets', 'materials', 'sms', 'kpis' — qa is the only tab wired to real data, so it's the default landing tab
    this.pendingQAItems = [];
    this.qaLoading = false;
    this.qaLoaded = false;
    this.qaViewMode = 'card'; // 'card' or 'list'
    this.fieldTeams = []; // "Operations Team 1/2" accounts — see fetchFieldTeams
  }

  async render() {
    this.container.innerHTML = `
      <div class="manager-workspace-wrapper" style="padding: 0;">

        <!-- Stage Container -->
        <div id="manager-tab-stage">
          ${(this.activeTab === 'pipeline' || this.activeTab === 'clientsearch' || this.activeTab === 'installations' || this.activeTab === 'tickets') ? '' : this.renderTabStage()}
        </div>

      </div>

      <!-- Approve Audit QA Confirmation Overlay -->
      <div class="modal-overlay no-print" id="qa-approve-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 460px;">
          <div id="qa-approve-content"></div>
        </div>
      </div>

    `;

    if (this.activeTab === 'pipeline') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new SalesPipeline(stage).render();
    }

    if (this.activeTab === 'clientsearch') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new ClientDirectory(stage).render();
    }

    if (this.activeTab === 'installations') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new InstallationsDirectory(stage).render();
    }

    if (this.activeTab === 'tickets') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new SupportTicketsPanel(stage, { canResolve: true }).render();
    }

    this.bindEvents();
```

- [ ] **Step 5: Verify**

Run `npm run dev`, log in as a Customer Care Manager (or Admin), and:

1. Confirm a **Sales Pipeline** link appears in the sidebar under
   "Operations & Mgr Care", between Audit QA Queue and 360° Client
   Lookup.
2. Click it. URL becomes `/manager/pipeline`, page title reads "Sales
   Pipeline", and the panel shows "No sales leads yet." (table is still
   empty).
3. Confirm no console errors.
4. Log in as a Field Inspector — confirm the Sales Pipeline link does
   **not** appear (the `isManager` gate in `appLayout.js` already covers
   this; no new code needed for it, just verify it holds).

- [ ] **Step 6: Commit**

```bash
git add js/components/salesPipeline.js js/components/appLayout.js js/components/managerWorkspace.js js/router.js
git commit -m "feat: add Sales Pipeline list view and navigation"
```

---

### Task 5: Add Lead

**Files:**
- Modify: `js/components/salesPipeline.js`

**Interfaces:**
- Consumes: `supabaseService.createSalesLead()` (Task 3),
  `AuthGuard.getSessionUser()`, `auditLogService.logEvent()`,
  `AppLayout.showToast()`.
- Produces: `openAddLeadOverlay()`, `closeAddLeadOverlay()`,
  `confirmAddLead(btn)` methods on `SalesPipeline`.

- [ ] **Step 1: Add the button and modal markup to `renderShell()`**

In `js/components/salesPipeline.js`, find:

```js
  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="margin-bottom: 0.5rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.25rem;">Sales Pipeline</h3>
          <p style="font-size: 0.825rem; color: #64748b; margin: 0;">Every lead from first contact through installation, searchable by name, RN number, or contact number.</p>
        </div>
```

Replace it with (wraps the title block in a flex row and adds the
button; everything after this line in `renderShell()` is unchanged):

```js
  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.25rem;">Sales Pipeline</h3>
            <p style="font-size: 0.825rem; color: #64748b; margin: 0;">Every lead from first contact through installation, searchable by name, RN number, or contact number.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-add-lead" style="padding: 0.6rem 1rem; font-size: 0.825rem;">+ Add Lead</button>
        </div>
```

Then find the end of `renderShell()`:

```js
        <div id="pipeline-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading sales leads...</div>
        </div>
      </div>
    `;
  }
```

Replace it with (adds the modal overlay as a sibling after the
`form-card` div, matching `ClientDirectory`'s convention):

```js
        <div id="pipeline-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading sales leads...</div>
        </div>
      </div>

      <!-- Add Lead Overlay -->
      <div class="modal-overlay no-print" id="add-lead-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 520px;">
          <div id="add-lead-content"></div>
        </div>
      </div>
    `;
  }
```

- [ ] **Step 2: Wire the button and overlay dismissal in `bindStaticEvents()`**

Find:

```js
  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-pipeline-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const stageSelect = this.container.querySelector('#select-pipeline-stage');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        this.stageFilter = e.target.value;
        this.renderList();
      });
    }
  }
```

Replace it with:

```js
  bindStaticEvents() {
    const searchInput = this.container.querySelector('#input-pipeline-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.renderList();
      });
    }

    const stageSelect = this.container.querySelector('#select-pipeline-stage');
    if (stageSelect) {
      stageSelect.addEventListener('change', (e) => {
        this.stageFilter = e.target.value;
        this.renderList();
      });
    }

    const addLeadBtn = this.container.querySelector('#btn-add-lead');
    if (addLeadBtn) {
      addLeadBtn.addEventListener('click', () => this.openAddLeadOverlay());
    }

    const addLeadOverlay = this.container.querySelector('#add-lead-overlay');
    if (addLeadOverlay) {
      addLeadOverlay.addEventListener('click', (e) => {
        if (e.target === addLeadOverlay) this.closeAddLeadOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#add-lead-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeAddLeadOverlay();
    });
  }
```

- [ ] **Step 3: Add the three methods**

Add these as new methods on the `SalesPipeline` class, immediately after
`renderList()`'s closing `}` (before the class's final closing `}`):

```js
  openAddLeadOverlay() {
    const overlay = this.container.querySelector('#add-lead-overlay');
    const content = this.container.querySelector('#add-lead-content');
    if (!overlay || !content) return;

    content.innerHTML = `
      <h3 class="modal-title">Add Lead</h3>
      <p class="modal-subtitle">New leads start at Initial Customer Contact.</p>

      <div class="form-group">
        <label class="form-label">First Name</label>
        <input type="text" class="form-input" id="lead-first-name" placeholder="Juan" />
      </div>

      <div class="form-group">
        <label class="form-label">Last Name</label>
        <input type="text" class="form-input" id="lead-last-name" placeholder="Dela Cruz" />
      </div>

      <div class="form-group">
        <label class="form-label">Contact Number <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="lead-contact-no" placeholder="639171234567" />
      </div>

      <div class="form-group">
        <label class="form-label">Email <span class="form-label-note">(optional)</span></label>
        <input type="email" class="form-input" id="lead-email" placeholder="juan@email.com" />
      </div>

      <div class="form-group">
        <label class="form-label">Installation Address <span class="form-label-note">(optional)</span></label>
        <input type="text" class="form-input" id="lead-address" placeholder="Unit 4B, Green Meadows, Quezon City" />
      </div>

      <div class="form-group">
        <label class="form-label">Mode of Communication <span class="form-label-note">(optional)</span></label>
        <select class="form-select" id="lead-mode">
          <option value="">Not specified</option>
          <option value="Phone Call">Phone Call</option>
          <option value="Viber">Viber</option>
          <option value="Email">Email</option>
          <option value="Walk-in">Walk-in</option>
        </select>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-add-lead">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-add-lead">Save Lead</button>
      </div>
    `;

    content.querySelector('#btn-cancel-add-lead').addEventListener('click', () => this.closeAddLeadOverlay());
    content.querySelector('#btn-confirm-add-lead').addEventListener('click', (e) => this.confirmAddLead(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeAddLeadOverlay() {
    const overlay = this.container.querySelector('#add-lead-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmAddLead(btn) {
    const content = this.container.querySelector('#add-lead-content');
    const firstName = content.querySelector('#lead-first-name').value.trim();
    const lastName = content.querySelector('#lead-last-name').value.trim();

    if (!firstName || !lastName) {
      AppLayout.showToast('First and last name are required.');
      return;
    }

    const contactNo = content.querySelector('#lead-contact-no').value.trim();
    const email = content.querySelector('#lead-email').value.trim();
    const installationAddress = content.querySelector('#lead-address').value.trim();
    const modeOfCommunication = content.querySelector('#lead-mode').value;

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const user = await AuthGuard.getSessionUser();
      const lead = await supabaseService.createSalesLead({
        firstName,
        lastName,
        contactNo: contactNo || null,
        email: email || null,
        installationAddress: installationAddress || null,
        modeOfCommunication: modeOfCommunication || null,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_CREATED',
        description: `Added sales lead "${lead.clientName}"`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.leads.unshift(lead);
      this.closeAddLeadOverlay();
      AppLayout.showToast(`Lead added: ${lead.clientName}`);
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not create sales lead:', e);
      AppLayout.showToast('Could not add lead — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Save Lead';
    }
  }
```

- [ ] **Step 4: Verify**

`npm run dev`, navigate to Sales Pipeline, click **+ Add Lead**, submit
with both name fields blank — confirm the toast "First and last name are
required." appears and nothing is created. Fill in First Name "Maria",
Last Name "Santos", Contact Number "639170001122", submit — confirm the
overlay closes, a toast "Lead added: Maria Santos" appears, and the row
appears in the table with an "Initial Contact" badge. Repeat to add 2
more leads with different names so Task 6/7 have data to work with.
Refresh the page — confirm all 3 leads persist (real Supabase write).

- [ ] **Step 5: Commit**

```bash
git add js/components/salesPipeline.js
git commit -m "feat: add Add Lead flow to Sales Pipeline"
```

---

### Task 6: Lead detail view (stage timeline, remarks, linked inspection, stage update, archive)

**Files:**
- Modify: `js/components/salesPipeline.js`

**Interfaces:**
- Consumes: `supabaseService.fetchOcularInspectionByRnNo()` (Task 2),
  `supabaseService.updateSalesLeadStage()`,
  `supabaseService.archiveSalesLead()` (Task 3), `STAGES`, `stageMeta()`
  (Task 4).
- Produces: `openDetail(id)`, `closeDetail()`,
  `renderDetailContent(lead, linkedInspection)`,
  `confirmStageUpdate(id, newStage, btn)`, `handleArchive(lead, btn)`.

- [ ] **Step 1: Add the "Actions" column to the table and cards**

Find (the `renderList()` method's `listEl.innerHTML` assignment):

```js
    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>RN Number</th>
              <th>Client Name</th>
              <th>Stage</th>
              <th>Contact No</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => `
              <tr>
                <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(l.rnNo || 'No RN yet')}</span></td>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(l.clientName)}</td>
                <td data-label="Stage">${badge(l.stage)}</td>
                <td data-label="Contact No" style="color: #64748b;">${escapeHTML(l.contactNo || 'N/A')}</td>
                <td data-label="Last Updated" style="color: #64748b;">${fmtDate(l.updatedAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${filtered.map(l => `
          <div class="record-card">
            <div class="record-top">
              <span class="record-title">${escapeHTML(l.clientName)}</span>
              ${badge(l.stage)}
            </div>
            <div class="record-meta">
              <span class="rn">${escapeHTML(l.rnNo || 'No RN yet')}</span>
              <span class="dot">&middot;</span>
              <span>${fmtDate(l.updatedAt)}</span>
            </div>
            <div class="record-sub">${escapeHTML(l.installationAddress || 'No address on file')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
```

Replace it with (adds an Actions column/button to both the table and the
mobile cards, and wires them after the `innerHTML` assignment):

```js
    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>RN Number</th>
              <th>Client Name</th>
              <th>Stage</th>
              <th>Contact No</th>
              <th>Last Updated</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(l => `
              <tr>
                <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(l.rnNo || 'No RN yet')}</span></td>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(l.clientName)}</td>
                <td data-label="Stage">${badge(l.stage)}</td>
                <td data-label="Contact No" style="color: #64748b;">${escapeHTML(l.contactNo || 'N/A')}</td>
                <td data-label="Last Updated" style="color: #64748b;">${fmtDate(l.updatedAt)}</td>
                <td data-label="Actions" style="text-align: right;"><button type="button" class="btn-link btn-view-lead" data-id="${l.id}">View Details</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${filtered.map(l => `
          <div class="record-card">
            <div class="record-top">
              <span class="record-title">${escapeHTML(l.clientName)}</span>
              ${badge(l.stage)}
            </div>
            <div class="record-meta">
              <span class="rn">${escapeHTML(l.rnNo || 'No RN yet')}</span>
              <span class="dot">&middot;</span>
              <span>${fmtDate(l.updatedAt)}</span>
            </div>
            <div class="record-sub">${escapeHTML(l.installationAddress || 'No address on file')}</div>
            <div class="record-actions">
              <button type="button" class="btn-view-lead" data-id="${l.id}">View Details</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    listEl.querySelectorAll('.btn-view-lead').forEach(btn => {
      btn.addEventListener('click', () => this.openDetail(btn.getAttribute('data-id')));
    });
  }
```

- [ ] **Step 2: Add the detail overlay markup to `renderShell()`**

Find (the end of `renderShell()`, as left by Task 5):

```js
      <!-- Add Lead Overlay -->
      <div class="modal-overlay no-print" id="add-lead-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 520px;">
          <div id="add-lead-content"></div>
        </div>
      </div>
    `;
  }
```

Replace it with:

```js
      <!-- Add Lead Overlay -->
      <div class="modal-overlay no-print" id="add-lead-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 520px;">
          <div id="add-lead-content"></div>
        </div>
      </div>

      <!-- Lead Detail Overlay -->
      <div class="modal-overlay no-print" id="lead-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="lead-detail-content"></div>
        </div>
      </div>
    `;
  }
```

- [ ] **Step 3: Wire overlay dismissal in `bindStaticEvents()`**

Find the end of `bindStaticEvents()` (as left by Task 5):

```js
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#add-lead-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeAddLeadOverlay();
    });
  }
```

Replace it with:

```js
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#add-lead-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeAddLeadOverlay();
    });

    const detailOverlay = this.container.querySelector('#lead-detail-overlay');
    if (detailOverlay) {
      detailOverlay.addEventListener('click', (e) => {
        if (e.target === detailOverlay) this.closeDetail();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#lead-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeDetail();
    });
  }
```

- [ ] **Step 4: Add the detail methods**

Add these as new methods on the `SalesPipeline` class, after the methods
added in Task 5 (before the class's final closing `}`):

```js
  async openDetail(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return;

    const overlay = this.container.querySelector('#lead-detail-overlay');
    const content = this.container.querySelector('#lead-detail-content');
    if (!overlay || !content) return;

    content.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">Loading...</div>`;
    overlay.style.display = 'flex';

    const linkedInspection = lead.rnNo ? await supabaseService.fetchOcularInspectionByRnNo(lead.rnNo) : null;
    content.innerHTML = this.renderDetailContent(lead, linkedInspection);

    content.querySelector('#btn-close-lead-detail').addEventListener('click', () => this.closeDetail());

    const stageSelect = content.querySelector('#detail-stage-select');
    const updateBtn = content.querySelector('#btn-update-stage');
    if (updateBtn && stageSelect) {
      updateBtn.addEventListener('click', () => this.confirmStageUpdate(lead.id, stageSelect.value, updateBtn));
    }

    const archiveBtn = content.querySelector('#btn-archive-lead');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', () => this.handleArchive(lead, archiveBtn));
    }
  }

  closeDetail() {
    const overlay = this.container.querySelector('#lead-detail-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  renderDetailContent(lead, linkedInspection) {
    const stampField = {
      INITIAL_CONTACT: 'stageInitialContactAt',
      SITE_VISIT_SCHEDULED: 'stageSiteVisitScheduledAt',
      SITE_VISIT_COMPLETED: 'stageSiteVisitCompletedAt',
      QUOTE_SENT: 'stageQuoteSentAt',
      QUOTE_ACCEPTED: 'stageQuoteAcceptedAt',
      INSTALLATION_SCHEDULED: 'stageInstallationScheduledAt',
      INSTALLATION_COMPLETE: 'stageInstallationCompleteAt',
      JOB_CHECKOUT_COMPLETE: 'stageJobCheckoutCompleteAt'
    };
    const progressStages = STAGES.filter(s => s.key !== 'CANCELED');
    const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

    const stepperHtml = progressStages.map((s, i) => {
      const reached = !!lead[stampField[s.key]];
      const prevReached = i > 0 && !!lead[stampField[progressStages[i - 1].key]];
      return `
        ${i > 0 ? `<div class="pipeline-connector ${prevReached ? 'active' : ''}"></div>` : ''}
        <div class="pipeline-step ${reached ? 'completed' : ''}">
          <div class="pipeline-step-icon">${reached ? '&#10003;' : i + 1}</div>
          <div class="pipeline-step-label">${escapeHTML(s.label)}</div>
          ${reached ? `<div style="font-size: 0.65rem; color: #94a3b8;">${fmtDate(lead[stampField[s.key]])}</div>` : ''}
        </div>
      `;
    }).join('');

    const canceledFlag = lead.stage === 'CANCELED'
      ? `<div style="margin-top: 0.75rem; padding: 0.6rem 0.85rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-md); color: #b91c1c; font-size: 0.8rem; font-weight: 600;">Canceled as of ${fmtDate(lead.updatedAt)}</div>`
      : '';

    const linkCard = linkedInspection
      ? `<div style="margin-top: 1rem; padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid #bae6fd; background: #f0f9ff;">
           <div style="font-size: 0.82rem; font-weight: 700; color: #0f172a;">Linked Ocular Inspection Found</div>
           <div style="font-size: 0.78rem; color: #64748b; margin-top: 0.15rem;">Status: <strong style="color: #0f172a;">${escapeHTML((linkedInspection.status || '').replace(/_/g, ' '))}</strong> &middot; submitted ${fmtDate(linkedInspection.created_at)}</div>
         </div>`
      : `<div style="margin-top: 1rem; padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid #e2e8f0; color: #64748b; font-size: 0.82rem;">No matching Ocular Inspection record yet for this RN number.</div>`;

    return `
      <h3 class="modal-title">${escapeHTML(lead.clientName)}</h3>
      <p class="modal-subtitle">${lead.rnNo ? escapeHTML(lead.rnNo) + ' &middot; ' : ''}${escapeHTML(lead.installationAddress || 'No address on file')}</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; margin-top: 1.25rem;">
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Contact Number</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.contactNo || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Email</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.email || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Mode of Communication</div><div style="font-size: 0.85rem; font-weight: 600; margin-top: 0.2rem;">${escapeHTML(lead.modeOfCommunication || 'N/A')}</div></div>
        <div><div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #64748b;">Current Stage</div><div style="font-size: 0.85rem; font-weight: 700; margin-top: 0.2rem; color: ${stageMeta(lead.stage).color};">${escapeHTML(stageMeta(lead.stage).label)}</div></div>
      </div>

      <div style="overflow-x: auto;">
        <div class="pipeline-stepper">${stepperHtml}</div>
      </div>
      ${canceledFlag}

      ${lead.remarks ? `<div style="margin-top: 1.25rem; padding: 0.85rem 1rem; background: #f8fafc; border-radius: var(--radius-md); font-size: 0.82rem; color: #334155; border: 1px solid #e2e8f0;">${escapeHTML(lead.remarks)}</div>` : ''}

      ${linkCard}

      <div style="margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid #e2e8f0; display: flex; gap: 0.6rem; align-items: flex-end; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 180px;">
          <label class="form-label" for="detail-stage-select">Update Stage</label>
          <select class="form-select" id="detail-stage-select">
            ${STAGES.map(s => `<option value="${s.key}" ${s.key === lead.stage ? 'selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="btn btn-primary" id="btn-update-stage">Update</button>
      </div>

      <div class="modal-footer" style="justify-content: space-between;">
        <button type="button" class="btn-link" id="btn-archive-lead" style="color: #F43F5E;">Archive Lead</button>
        <button type="button" class="btn btn-outline" id="btn-close-lead-detail">Close</button>
      </div>
    `;
  }

  async confirmStageUpdate(id, newStage, btn) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || newStage === lead.stage) return;

    btn.disabled = true;
    btn.textContent = 'Updating...';

    try {
      await supabaseService.updateSalesLeadStage(id, newStage);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_STAGE_UPDATED',
        description: `Updated "${lead.clientName}" to stage ${newStage}`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: id
      });
      lead.stage = newStage;
      lead.updatedAt = new Date().toISOString();
      AppLayout.showToast(`Stage updated to "${stageMeta(newStage).label}"`);
      this.closeDetail();
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not update sales lead stage:', e);
      AppLayout.showToast('Could not update stage — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Update';
    }
  }

  async handleArchive(lead, btn) {
    const confirmed = confirm(`Archive lead "${lead.clientName}"? This removes them from the Sales Pipeline list.`);
    if (!confirmed) return;

    btn.disabled = true;

    try {
      await supabaseService.archiveSalesLead(lead.id);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_ARCHIVED',
        description: `Archived sales lead "${lead.clientName}"`,
        severity: AUDIT_SEVERITY.WARNING,
        resourceId: lead.id
      });
      this.leads = this.leads.filter(l => l.id !== lead.id);
      this.closeDetail();
      AppLayout.showToast(`Archived "${lead.clientName}".`);
      this.renderList();
    } catch (e) {
      console.warn('[OIMS] Could not archive sales lead:', e);
      AppLayout.showToast('Could not archive — check your connection and try again.');
      btn.disabled = false;
    }
  }
```

- [ ] **Step 5: Verify**

`npm run dev`, navigate to Sales Pipeline (should still have the 3 test
leads from Task 5). Click **View Details** on one — confirm the modal
shows a stage timeline with "Initial Contact" marked complete and the
rest pending, contact/email/mode fields, and "No matching Ocular
Inspection record yet for this RN number." Change **Update Stage** to
"Site Visit Scheduled" and click **Update** — confirm a toast appears,
the modal closes, and the row's badge updates to "Site Visit Scheduled".
Reopen the same lead's detail — confirm the timeline now shows both
Initial Contact and Site Visit Scheduled as complete, each with a date.
Click **Archive Lead**, confirm the browser confirm dialog, confirm the
row disappears from the list. Refresh the page — confirm the archived
lead stays gone (real soft-delete).

- [ ] **Step 6: Commit**

```bash
git add js/components/salesPipeline.js
git commit -m "feat: add lead detail view, stage updates, and archiving"
```

---

### Task 7: Import CSV

**Files:**
- Modify: `js/components/salesPipeline.js`

**Interfaces:**
- Consumes: `supabaseService.bulkImportSalesLeads()` (Task 3), `STAGES`
  (Task 4).
- Produces: `parseCSV(text)`, `handleImportFile(file)`,
  `openImportOverlay()`, `closeImportOverlay()`, `confirmImport(btn)`.

- [ ] **Step 1: Add the button and file input to `renderShell()`**

Find (as left by Task 5):

```js
          <button type="button" class="btn btn-primary" id="btn-add-lead" style="padding: 0.6rem 1rem; font-size: 0.825rem;">+ Add Lead</button>
        </div>
```

Replace it with:

```js
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-outline" id="btn-import-leads" style="padding: 0.6rem 1rem; font-size: 0.825rem;">Import CSV</button>
            <input type="file" id="input-import-leads-file" accept=".csv,text/csv" style="display: none;" />
            <button type="button" class="btn btn-primary" id="btn-add-lead" style="padding: 0.6rem 1rem; font-size: 0.825rem;">+ Add Lead</button>
          </div>
        </div>
```

Find the end of `renderShell()` (as left by Task 6):

```js
      <!-- Lead Detail Overlay -->
      <div class="modal-overlay no-print" id="lead-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="lead-detail-content"></div>
        </div>
      </div>
    `;
  }
```

Replace it with:

```js
      <!-- Lead Detail Overlay -->
      <div class="modal-overlay no-print" id="lead-detail-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 640px;">
          <div id="lead-detail-content"></div>
        </div>
      </div>

      <!-- Import Leads Preview Overlay -->
      <div class="modal-overlay no-print" id="import-leads-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 760px; max-height: 85vh; display: flex; flex-direction: column;">
          <div id="import-leads-content" style="overflow-y: auto;"></div>
        </div>
      </div>
    `;
  }
```

- [ ] **Step 2: Wire the button and overlay dismissal in `bindStaticEvents()`**

Find the end of `bindStaticEvents()` (as left by Task 6):

```js
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#lead-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeDetail();
    });
  }
```

Replace it with:

```js
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#lead-detail-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeDetail();
    });

    const importBtn = this.container.querySelector('#btn-import-leads');
    const importFileInput = this.container.querySelector('#input-import-leads-file');
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.handleImportFile(file);
        importFileInput.value = '';
      });
    }

    const importOverlay = this.container.querySelector('#import-leads-overlay');
    if (importOverlay) {
      importOverlay.addEventListener('click', (e) => {
        if (e.target === importOverlay) this.closeImportOverlay();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const overlayEl = this.container.querySelector('#import-leads-overlay');
      if (overlayEl && overlayEl.style.display !== 'none') this.closeImportOverlay();
    });
  }
```

- [ ] **Step 3: Add the import methods**

Add these as new methods on the `SalesPipeline` class, after the methods
added in Task 6 (before the class's final closing `}`):

```js
  // Minimal RFC4180-style CSV parser — handles quoted fields, embedded
  // commas, and escaped ("") quotes. Same implementation as
  // ClientDirectory.parseCSV; not meant to handle arbitrary spreadsheet
  // exports, just a simple lead-import sheet.
  parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(r => r.some(cell => cell.trim() !== ''));
  }

  async handleImportFile(file) {
    const text = await file.text();
    const rows = this.parseCSV(text);

    if (rows.length < 2) {
      AppLayout.showToast('CSV file has no data rows.');
      return;
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const colIndex = (names) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i !== -1) return i;
      }
      return -1;
    };

    const idx = {
      firstName: colIndex(['first name', 'firstname']),
      lastName: colIndex(['last name', 'lastname']),
      rnNo: colIndex(['rn number', 'rn no', 'rnno', 'rn']),
      contactNo: colIndex(['contact no', 'contact number', 'contactno', 'phone']),
      email: colIndex(['email']),
      installationAddress: colIndex(['installation address', 'address', 'location']),
      modeOfCommunication: colIndex(['mode of communication', 'mode']),
      stage: colIndex(['stage']),
      remarks: colIndex(['remarks'])
    };

    if (idx.firstName === -1 || idx.lastName === -1) {
      AppLayout.showToast('CSV must include "First Name" and "Last Name" columns.');
      return;
    }

    const get = (cols, i) => (i !== -1 && cols[i] !== undefined) ? cols[i].trim() : '';
    const stageKeys = new Set(STAGES.map(s => s.key));

    this.pendingImportRows = rows.slice(1).map((cols, i) => {
      const firstName = get(cols, idx.firstName);
      const lastName = get(cols, idx.lastName);
      const stageRaw = get(cols, idx.stage).toUpperCase().replace(/\s+/g, '_');
      const errors = [];
      if (!firstName) errors.push('Missing First Name');
      if (!lastName) errors.push('Missing Last Name');
      if (stageRaw && !stageKeys.has(stageRaw)) errors.push(`Unrecognized stage "${get(cols, idx.stage)}"`);

      return {
        rowNum: i + 2,
        firstName,
        lastName,
        rnNo: get(cols, idx.rnNo),
        contactNo: get(cols, idx.contactNo),
        email: get(cols, idx.email),
        installationAddress: get(cols, idx.installationAddress),
        modeOfCommunication: get(cols, idx.modeOfCommunication),
        stage: stageKeys.has(stageRaw) ? stageRaw : 'INITIAL_CONTACT',
        remarks: get(cols, idx.remarks),
        errors
      };
    });

    this.openImportOverlay();
  }

  openImportOverlay() {
    const overlay = this.container.querySelector('#import-leads-overlay');
    const content = this.container.querySelector('#import-leads-content');
    if (!overlay || !content) return;

    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    const invalidCount = this.pendingImportRows.length - validRows.length;

    content.innerHTML = `
      <h3 class="modal-title">Import Leads from CSV</h3>
      <p class="modal-subtitle">
        ${this.pendingImportRows.length} row${this.pendingImportRows.length === 1 ? '' : 's'} found — ${validRows.length} ready to import${invalidCount ? `, ${invalidCount} skipped due to errors` : ''}.
      </p>

      <div style="overflow: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-lg); max-height: 340px;">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Name</th>
              <th>RN Number</th>
              <th>Contact No</th>
              <th>Stage</th>
            </tr>
          </thead>
          <tbody>
            ${this.pendingImportRows.map(r => `
              <tr style="${r.errors.length ? 'background: #fef2f2;' : ''}">
                <td style="color: #64748b;">${r.rowNum}</td>
                <td style="font-weight: 600; color: #0f172a;">${escapeHTML(`${r.firstName} ${r.lastName}`.trim() || '—')}</td>
                <td style="color: var(--ecoworks-blue); font-weight: 700;">${escapeHTML(r.rnNo || '—')}</td>
                <td style="color: #64748b;">${escapeHTML(r.contactNo || '—')}</td>
                <td style="color: ${r.errors.length ? '#dc2626' : '#64748b'};">${r.errors.length ? escapeHTML(r.errors.join(', ')) : escapeHTML(stageMeta(r.stage).label)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-import-leads">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-import-leads" ${validRows.length === 0 ? 'disabled' : ''}>Import ${validRows.length} Lead${validRows.length === 1 ? '' : 's'}</button>
      </div>
    `;

    content.querySelector('#btn-cancel-import-leads').addEventListener('click', () => this.closeImportOverlay());
    const confirmBtn = content.querySelector('#btn-confirm-import-leads');
    if (confirmBtn) confirmBtn.addEventListener('click', (e) => this.confirmImport(e.currentTarget));

    overlay.style.display = 'flex';
  }

  closeImportOverlay() {
    const overlay = this.container.querySelector('#import-leads-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  async confirmImport(btn) {
    const validRows = this.pendingImportRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) return;

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const imported = await supabaseService.bulkImportSalesLeads(validRows);
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEADS_IMPORTED',
        description: `Imported ${imported.length} sales lead(s) via CSV`,
        severity: AUDIT_SEVERITY.INFO
      });
      this.closeImportOverlay();
      AppLayout.showToast(`Imported ${imported.length} lead(s).`);

      this.leads = await supabaseService.fetchAllSalesLeads();
      this.renderList();
    } catch (err) {
      console.warn('[OIMS SalesPipeline] Import failed:', err.message);
      AppLayout.showToast('Could not import leads — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }
```

Also add the `pendingImportRows` field to the constructor. Find:

```js
  constructor(container) {
    this.container = container;
    this.leads = [];
    this.searchQuery = '';
    this.stageFilter = 'ALL';
  }
```

Replace it with:

```js
  constructor(container) {
    this.container = container;
    this.leads = [];
    this.searchQuery = '';
    this.stageFilter = 'ALL';
    this.pendingImportRows = [];
  }
```

- [ ] **Step 4: Verify**

Create a local file `test-leads.csv`:

```csv
First Name,Last Name,RN Number,Contact No,Email,Stage
Carlo,Reyes,RN999000111,639170009988,carlo@example.com,QUOTE_SENT
,Bad Row,RN999000222,,,
Ella,Tan,,639170009999,ella@example.com,NOT_A_STAGE
```

`npm run dev`, navigate to Sales Pipeline, click **Import CSV**, select
`test-leads.csv`. Confirm the preview shows 3 rows: row 1 valid (Quote
Sent), row 2 flagged "Missing First Name" (red), row 3 flagged
`Unrecognized stage "NOT_A_STAGE"` (red), and the button reads "Import 1
Lead". Click it — confirm a toast "Imported 1 lead(s)." and Carlo Reyes
appears in the list with a "Quote Sent" badge. Delete the local test
file when done.

- [ ] **Step 5: Commit**

```bash
git add js/components/salesPipeline.js
git commit -m "feat: add CSV import to Sales Pipeline"
```

---

### Task 8: One-time historical import from the spreadsheet

**Files:**
- Create: `scripts/import_sales_leads.py`

**Interfaces:**
- Consumes: `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`),
  `srcs/TESLA INTERNAL DATABASE (1) 1.xlsx`, the `sales_leads` table
  (Task 1) via PostgREST.
- Produces: up to 306 rows in `sales_leads`, `legacy_row_id` populated,
  safely re-runnable.

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
One-time import of Customer Care's lead-tracking spreadsheet into the
sales_leads table. Run manually, once, from the repo root:

    python scripts/import_sales_leads.py

Safe to re-run: upserts on legacy_row_id.

Requires: pip install openpyxl
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

import openpyxl

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX_PATH = os.path.join(REPO_ROOT, "srcs", "TESLA INTERNAL DATABASE (1) 1.xlsx")
ENV_PATH = os.path.join(REPO_ROOT, ".env")

# Positional column map (1-indexed, matches the sheet's fixed layout).
COL_LEGACY_ID = 1
COL_RN_NO = 2
COL_FIRST_NAME = 3
COL_LAST_NAME = 4
COL_CONTACT_NO = 5
COL_ADDRESS = 6
COL_EMAIL = 7
COL_MODE = 8
COL_STATUS = 9
COL_REMARKS = 26

# (checkbox column, date column, sales_leads column) triples, in pipeline
# order — this is also the "furthest True wins" order used to derive a
# stage for the 3 rows with a blank Status.
STAGE_PAIRS = [
    (10, 11, "INITIAL_CONTACT", "stage_initial_contact_at"),
    (12, 13, "SITE_VISIT_SCHEDULED", "stage_site_visit_scheduled_at"),
    (14, 15, "SITE_VISIT_COMPLETED", "stage_site_visit_completed_at"),
    (16, 17, "QUOTE_SENT", "stage_quote_sent_at"),
    (18, 19, "QUOTE_ACCEPTED", "stage_quote_accepted_at"),
    (20, 21, "INSTALLATION_SCHEDULED", "stage_installation_scheduled_at"),
    (22, 23, "INSTALLATION_COMPLETE", "stage_installation_complete_at"),
    (24, 25, "JOB_CHECKOUT_COMPLETE", "stage_job_checkout_complete_at"),
]

STATUS_MAP = {
    "initial customer contact": "INITIAL_CONTACT",
    "site visit scheduled": "SITE_VISIT_SCHEDULED",
    "site visit completed": "SITE_VISIT_COMPLETED",
    "quote sent": "QUOTE_SENT",
    "quote sent to customer": "QUOTE_SENT",
    "accepted": "QUOTE_ACCEPTED",
    "quote accepted": "QUOTE_ACCEPTED",
    "installation scheduled": "INSTALLATION_SCHEDULED",
    "installation complete": "INSTALLATION_COMPLETE",
    "provision completed": "JOB_CHECKOUT_COMPLETE",
    "installation canceled": "CANCELED",
}


def load_env():
    values = {}
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    url = values.get("VITE_SUPABASE_URL")
    key = values.get("VITE_SUPABASE_ANON_KEY")
    if not url or not key:
        sys.exit("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env")
    return url, key


def clean_str(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        value = str(int(value))
    value = str(value).strip()
    return value or None


def clean_date(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def normalize_status(raw):
    if not raw:
        return None
    key = re.sub(r"\s+", " ", raw.strip().lower())
    return STATUS_MAP.get(key)


def build_row(ws, row_num):
    legacy_id = clean_str(ws.cell(row=row_num, column=COL_LEGACY_ID).value)
    if not legacy_id:
        return None

    status_raw = ws.cell(row=row_num, column=COL_STATUS).value
    stage = normalize_status(status_raw)

    stamps = {}
    furthest_stage = None
    for checkbox_col, date_col, stage_key, db_col in STAGE_PAIRS:
        checked = ws.cell(row=row_num, column=checkbox_col).value is True
        if checked:
            furthest_stage = stage_key
            stamps[db_col] = clean_date(ws.cell(row=row_num, column=date_col).value)

    if not stage:
        stage = furthest_stage or "INITIAL_CONTACT"

    payload = {
        "legacy_row_id": legacy_id,
        "rn_no": clean_str(ws.cell(row=row_num, column=COL_RN_NO).value),
        "first_name": clean_str(ws.cell(row=row_num, column=COL_FIRST_NAME).value),
        "last_name": clean_str(ws.cell(row=row_num, column=COL_LAST_NAME).value),
        "contact_no": clean_str(ws.cell(row=row_num, column=COL_CONTACT_NO).value),
        "installation_address": clean_str(ws.cell(row=row_num, column=COL_ADDRESS).value),
        "email": clean_str(ws.cell(row=row_num, column=COL_EMAIL).value),
        "mode_of_communication": clean_str(ws.cell(row=row_num, column=COL_MODE).value),
        "remarks": clean_str(ws.cell(row=row_num, column=COL_REMARKS).value),
        "stage": stage,
        "source_status_raw": clean_str(status_raw),
    }
    payload.update(stamps)
    return payload


def upsert(url, key, rows):
    endpoint = f"{url.rstrip('/')}/rest/v1/sales_leads?on_conflict=legacy_row_id"
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST")
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=representation")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    url, key = load_env()
    wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
    ws = wb["CLIENT DATABASE"]

    rows = []
    skipped = 0
    for row_num in range(2, 308):
        row = build_row(ws, row_num)
        if row is None:
            skipped += 1
            continue
        rows.append(row)

    print(f"Read {len(rows)} rows ({skipped} skipped — no legacy id).")

    stage_counts = {}
    for r in rows:
        stage_counts[r["stage"]] = stage_counts.get(r["stage"], 0) + 1
    for stage, count in sorted(stage_counts.items(), key=lambda x: -x[1]):
        print(f"  {stage}: {count}")

    result = upsert(url, key, rows)
    print(f"Upserted {len(result)} rows into sales_leads.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
pip install openpyxl
python scripts/import_sales_leads.py
```

- [ ] **Step 3: Verify**

Expected console output: `Read 306 rows (0 skipped...)`, a stage
breakdown headed by `INSTALLATION_COMPLETE: 104`,
`INITIAL_CONTACT: 97`, `CANCELED: 51`, and `Upserted 306 rows...`.

Then, in the Supabase SQL Editor:

```sql
SELECT stage, COUNT(*) FROM sales_leads GROUP BY stage ORDER BY COUNT(*) DESC;
```

Expected: matches the console breakdown exactly (9 rows,
`INSTALLATION_COMPLETE` highest at 104).

```sql
SELECT count(*) FROM sales_leads WHERE legacy_row_id IS NOT NULL;
```

Expected: `306`.

Re-run `python scripts/import_sales_leads.py` a second time — confirm
the row count in Supabase stays at 306 (upsert, not duplicate insert).

Finally, `npm run dev`, navigate to Sales Pipeline — confirm the 306
imported leads (plus any test leads from earlier tasks) appear, search
and stage-filter both work against the real data, and the stage-count
pills roughly match the breakdown above.

- [ ] **Step 4: Commit**

```bash
git add scripts/import_sales_leads.py
git commit -m "feat: add one-time historical import script for sales_leads"
```

**Do not commit the spreadsheet itself** (`srcs/TESLA INTERNAL DATABASE
(1) 1.xlsx`) — it contains real customer names, phone numbers, and
emails. Confirm `git status` doesn't show it staged before this commit.

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — schema (Task 1),
  status normalization + linkage (Tasks 2/8), the 9-stage closed dropdown
  (Tasks 4/5/6/7 all reference the same `STAGES` constant), the UI
  component in full (Tasks 4–7), navigation (Task 4), the historical
  import (Task 8). Nothing in the spec lacks a task.
- **Type consistency:** `STAGES`/`stageMeta()` (Task 4) is the single
  source of truth for stage keys/labels/colors, imported by reference
  (not redefined) in every later task. `SupabaseService.SALES_STAGE_COLUMNS`
  (Task 3) and the Python script's `STAGE_PAIRS` (Task 8) both enumerate
  the same 8 progressing stages in the same order — verified against
  each other above.
- **No placeholders:** every step above shows complete, working code —
  no "similar to Task N," no TODOs.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-13-sales-pipeline.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
