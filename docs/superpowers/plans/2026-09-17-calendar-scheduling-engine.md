# Calendar Scheduling Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory scheduled date/time to both the ocular-inspection and (new) installation assignment flows, back them with a real `scheduled_visits` table, and replace the hardcoded Manager Calendar mockup with a real one — while retiring the installer's self-serve "Ready for Installation" queue so the mandatory date actually gates who can start work.

**Architecture:** One new Supabase table (`scheduled_visits`) is the single source of truth for every scheduled visit (both ocular and installation). A small set of new `supabaseService` methods read/write it. Existing components (`salesPipeline.js`, `pendingSiteVisits.js`, `readyList.js`, `assignedInspectionsList.js`, `managerWorkspace.js`) are extended in place to show/collect scheduling data; one new component (`installationDispatch.js`) fills the gap that has no existing home (installation assignment didn't exist before this feature).

**Tech Stack:** Vanilla JS (ES modules, no framework), Vite, Supabase (Postgres + supabase-js v2). No test runner is configured in this repo (`package.json` has no test script/dependency) — verification throughout is manual, via `npm run dev` and the browser, matching this project's existing convention (see the spec's own Testing section and every prior plan's manual-verification approach).

**Spec:** `docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md`

## Global Constraints

- No Google Calendar integration — internal-only. Do not touch `user_google_credentials` or `oims_calendar_events`.
- Scheduling is mandatory at assignment time for both ocular and installation — never allow the assignment modals to submit without a start date/time.
- Conflicts are "warn but allow" — never hard-block a save on a conflict.
- Field Inspectors/Installers get read-only visibility only — no scheduling UI (create/edit/cancel) is ever shown to them.
- RLS on `scheduled_visits` stays permissive (`USING (true)` / `WITH CHECK (true)`) — access control is enforced in the app layer, matching every other OIMS table (`sales_leads`, `support_tickets`).
- Follow the existing `supabaseService` method shape exactly: `isConfigured()` guard, `withTimeout(promise, ms, label)`, try/catch with `console.warn('[OIMS Supabase] ...')`, dedicated `mapXToLocal(row)` per table.
- No shared modal/UI abstraction across the three scheduling-UI call sites (Assign for Inspection, Assign for Installation, Reschedule) — this codebase duplicates per-component UI rather than extracting shared components (compare `renderQACardView` vs `renderAssignInspectionContent`). Only pure date-math helpers are shared, via a new `js/utils/scheduling.js`.

---

## File Structure

**Create:**
- `supabase/migrations/2026-09-17-scheduled-visits.sql` — new table
- `js/utils/scheduling.js` — pure helpers: compute end time from a duration, format a time range, format a conflict warning
- `js/components/installationDispatch.js` — new Manager-side "Assign Installations" panel (Ready to Assign + Awaiting Installation + assign/reschedule modal)

**Modify:**
- `js/services/supabaseService.js` — add scheduling methods (§ below)
- `js/components/salesPipeline.js` — add mandatory date/duration + conflict warning to "Assign for Inspection"
- `js/components/pendingSiteVisits.js` — add "Scheduled Visit" column + "Reschedule" action
- `js/components/assignedInspectionsList.js` — add "Scheduled Visit" column (read-only)
- `js/components/readyList.js` — retire self-serve queue: query `ASSIGNED_PENDING_INSTALLATION` instead of `READY_FOR_INSTALLATION`, drop the fake preset merge, add "Scheduled Visit" column
- `js/components/managerWorkspace.js` — real Calendar tab, mount `InstallationDispatch` on a new `installdispatch` tab
- `js/components/appLayout.js` — enable the "Field Calendar" sidebar link, add "Assign Installations" link
- `js/router.js` — add `installdispatch` to the manager titleMap

---

### Task 1: Database — `scheduled_visits` table

**Files:**
- Create: `supabase/migrations/2026-09-17-scheduled-visits.sql`

**Interfaces:**
- Produces: table `public.scheduled_visits(id, visit_type, ocular_inspection_id, assigned_team, start_time, end_time, status, created_by, created_at, updated_at)`, columns and constraints exactly as below. Every later task's SQL/service code depends on these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================================
-- OIMS Migration: Calendar Scheduling Engine
-- Adds scheduled_visits — the single source of truth for every scheduled
-- ocular-inspection or installation site visit. Internal-only: no Google
-- Calendar dependency. See docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 'OCULAR' | 'INSTALLATION'
    visit_type VARCHAR(20) NOT NULL CHECK (visit_type IN ('OCULAR', 'INSTALLATION')),

    -- Always the ocular_inspections row, even for an INSTALLATION visit: no
    -- installation_records row exists yet at scheduling time (it's only
    -- created when the installer submits the form).
    ocular_inspection_id UUID NOT NULL REFERENCES public.ocular_inspections(id) ON DELETE CASCADE,

    assigned_team UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CANCELLED')),

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- At most one active scheduled visit per job per stage — rescheduling is an
-- UPDATE of this row, not a new insert.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_visit_per_job
    ON public.scheduled_visits(ocular_inspection_id, visit_type)
    WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_team_time
    ON public.scheduled_visits(assigned_team, start_time, end_time)
    WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_range
    ON public.scheduled_visits(start_time, end_time);

ALTER TABLE public.scheduled_visits ENABLE ROW LEVEL SECURITY;

-- Table-level RLS stays permissive; access control is enforced in the app
-- layer, same convention as sales_leads/support_tickets.
DROP POLICY IF EXISTS "Allow read scheduled visits" ON public.scheduled_visits;
DROP POLICY IF EXISTS "Allow insert scheduled visits" ON public.scheduled_visits;
DROP POLICY IF EXISTS "Allow update scheduled visits" ON public.scheduled_visits;

CREATE POLICY "Allow read scheduled visits" ON public.scheduled_visits FOR SELECT USING (true);
CREATE POLICY "Allow insert scheduled visits" ON public.scheduled_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update scheduled visits" ON public.scheduled_visits FOR UPDATE USING (true);
```

- [ ] **Step 2: Run the migration against the live Supabase project**

Open the Supabase project referenced by `VITE_SUPABASE_URL` in `.env` → SQL Editor → paste the contents of the migration file → Run.

- [ ] **Step 3: Verify the table exists with the right shape**

Run in the same SQL Editor:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'scheduled_visits'
ORDER BY ordinal_position;
```

Expected: 10 rows — `id, visit_type, ocular_inspection_id, assigned_team, start_time, end_time, status, created_by, created_at, updated_at` — matching the migration.

- [ ] **Step 4: Verify the constraints with a smoke insert/reject**

Run (replace the two UUIDs with any real `ocular_inspections.id` / `profiles.id` from your project — grab them via `SELECT id FROM public.ocular_inspections LIMIT 1;` and `SELECT id FROM public.profiles WHERE role = 'field_inspector' LIMIT 1;`):

```sql
INSERT INTO public.scheduled_visits (visit_type, ocular_inspection_id, assigned_team, start_time, end_time)
VALUES ('OCULAR', '<ocular_inspection_id>', '<profile_id>', NOW() + interval '1 day', NOW() + interval '1 day 1 hour');

-- This second insert for the SAME job/type should fail with a unique_violation:
INSERT INTO public.scheduled_visits (visit_type, ocular_inspection_id, assigned_team, start_time, end_time)
VALUES ('OCULAR', '<ocular_inspection_id>', '<profile_id>', NOW() + interval '2 day', NOW() + interval '2 day 1 hour');

-- Clean up:
DELETE FROM public.scheduled_visits WHERE ocular_inspection_id = '<ocular_inspection_id>';
```

Expected: first insert succeeds, second fails with `duplicate key value violates unique constraint "uniq_active_visit_per_job"`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/2026-09-17-scheduled-visits.sql
git commit -m "Add scheduled_visits table for the calendar scheduling engine"
```

---

### Task 2: Service layer — scheduling core

**Files:**
- Modify: `js/services/supabaseService.js`

**Interfaces:**
- Consumes: `this.client`, `this.isConfigured()`, `this.withTimeout(promise, ms, label)` — all already defined earlier in the class.
- Produces (used by Tasks 5–12):
  - `mapScheduledVisitToLocal(row)` → `{ id, visitType, ocularInspectionId, assignedTeam, startTime, endTime, status, createdBy, createdAt, updatedAt }`
  - `async scheduleVisit({ visitType, ocularInspectionId, assignedTeam, startTime, endTime, createdBy })` → mapped row
  - `async checkVisitConflict(assignedTeam, startTime, endTime, excludeVisitId = null)` → mapped conflicting row, or `null`
  - `async rescheduleVisit(visitId, { assignedTeam, startTime, endTime })` → mapped updated row
  - `async fetchScheduledVisitsForTeam(teamId)` → `Array<mapped row>`

- [ ] **Step 1: Add the methods**

Add this block to `js/services/supabaseService.js`, directly after the `mapTicketToLocal` method (after line 670, before the "Sales Pipeline" comment block at line 672):

```javascript
  // Calendar Scheduling Engine — see
  // docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md
  // and supabase/migrations/2026-09-17-scheduled-visits.sql. One active
  // ('SCHEDULED') row per (ocular_inspection_id, visit_type) — enforced by
  // a partial unique index, not application logic — so rescheduling is an
  // UPDATE of the existing row, never a second insert.
  mapScheduledVisitToLocal(row) {
    return {
      id: row.id,
      visitType: row.visit_type,
      ocularInspectionId: row.ocular_inspection_id,
      assignedTeam: row.assigned_team,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async scheduleVisit({ visitType, ocularInspectionId, assignedTeam, startTime, endTime, createdBy }) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const payload = {
      visit_type: visitType,
      ocular_inspection_id: ocularInspectionId,
      assigned_team: assignedTeam,
      start_time: startTime,
      end_time: endTime,
      created_by: createdBy || null
    };
    const { data, error } = await this.client
      .from('scheduled_visits')
      .insert([payload])
      .select();
    if (error) throw error;
    return (data && data[0]) ? this.mapScheduledVisitToLocal(data[0]) : this.mapScheduledVisitToLocal(payload);
  }

  // Plain overlap check: any other SCHEDULED visit for this team whose
  // [start_time, end_time) window intersects the proposed one. Returns the
  // conflicting visit (so the UI can show its time range) or null — this is
  // advisory ("warn but allow"), never used to block a save.
  async checkVisitConflict(assignedTeam, startTime, endTime, excludeVisitId = null) {
    if (!this.isConfigured()) return null;
    try {
      let query = this.client
        .from('scheduled_visits')
        .select('*')
        .eq('assigned_team', assignedTeam)
        .eq('status', 'SCHEDULED')
        .lt('start_time', endTime)
        .gt('end_time', startTime);
      if (excludeVisitId) {
        query = query.neq('id', excludeVisitId);
      }
      const { data, error } = await this.withTimeout(query.limit(1), 3000, 'Check visit conflict');
      if (error) throw error;
      return (data && data[0]) ? this.mapScheduledVisitToLocal(data[0]) : null;
    } catch (err) {
      console.warn('[OIMS Supabase] Could not check visit conflict:', err.message);
      return null;
    }
  }

  // Rescheduling updates the one active row in place (see the partial
  // unique index) rather than creating a new one — no reschedule history
  // is kept, per the spec's non-goals.
  async rescheduleVisit(visitId, { assignedTeam, startTime, endTime }) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    const payload = {
      assigned_team: assignedTeam,
      start_time: startTime,
      end_time: endTime,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await this.client
      .from('scheduled_visits')
      .update(payload)
      .eq('id', visitId)
      .select();
    if (error) throw error;
    return (data && data[0]) ? this.mapScheduledVisitToLocal(data[0]) : null;
  }

  // A team's own upcoming schedule — used by the read-only "Scheduled
  // Visit" columns on assignedInspectionsList.js and readyList.js.
  async fetchScheduledVisitsForTeam(teamId) {
    if (!teamId || !this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('scheduled_visits')
          .select('*')
          .eq('assigned_team', teamId)
          .eq('status', 'SCHEDULED')
          .order('start_time', { ascending: true }),
        3000,
        'Fetch scheduled visits for team'
      );
      if (error) throw error;
      return (data || []).map(row => this.mapScheduledVisitToLocal(row));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch scheduled visits for team:', err.message);
      return [];
    }
  }
```

- [ ] **Step 2: Verify with a manual smoke check**

Run `npm run dev`, open the browser console on any authenticated page, and run:

```javascript
const { supabaseService } = await import('/js/services/supabaseService.js');
// Use a real ocular_inspections.id and profiles.id from your project (Supabase table editor).
const visit = await supabaseService.scheduleVisit({
  visitType: 'OCULAR',
  ocularInspectionId: '<ocular_inspection_id>',
  assignedTeam: '<profile_id>',
  startTime: new Date(Date.now() + 86400000).toISOString(),
  endTime: new Date(Date.now() + 90000000).toISOString(),
  createdBy: null
});
console.log(visit); // should log the mapped row with a real id

const conflict = await supabaseService.checkVisitConflict('<profile_id>', new Date(Date.now() + 87000000).toISOString(), new Date(Date.now() + 91000000).toISOString());
console.log(conflict); // should log the visit created above (overlapping window)

const rescheduled = await supabaseService.rescheduleVisit(visit.id, { assignedTeam: '<profile_id>', startTime: new Date(Date.now() + 172800000).toISOString(), endTime: new Date(Date.now() + 176400000).toISOString() });
console.log(rescheduled.startTime); // should be the new time

const forTeam = await supabaseService.fetchScheduledVisitsForTeam('<profile_id>');
console.log(forTeam.length); // should be 1
```

Then delete the smoke-test row from the Supabase table editor (`scheduled_visits`) so it doesn't linger as fake data.

- [ ] **Step 3: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "Add scheduled_visits service methods: schedule, conflict check, reschedule, fetch by team"
```

---

### Task 3: Service layer — installation assignment

**Files:**
- Modify: `js/services/supabaseService.js`

**Interfaces:**
- Consumes: `mapSupabaseToLocal(row)`, `updateInspectionStatus(id, newStatus, extra)` (both already defined), `scheduleVisit(...)` (Task 2).
- Produces (used by Tasks 7 and 10):
  - `async fetchReadyForInstallation()` → `Array<mapped ocular_inspections row>`, `status === 'READY_FOR_INSTALLATION'`
  - `async fetchAssignedInstallations()` → `Array<mapped ocular_inspections row>`, `status === 'ASSIGNED_PENDING_INSTALLATION'`
  - `async assignForInstallation({ ocularInspectionId, assignedTeam, startTime, endTime, createdBy })` → mapped `scheduled_visits` row (throws on failure; rolls back the status change if scheduling fails)

- [ ] **Step 1: Add the methods**

Add this block directly after `fetchAllAssignedInspections` (after line 796, before `mapSalesLeadToLocal` at line 798):

```javascript
  // Manager-side "Ready to Assign" list for Assign for Installation —
  // every ocular_inspections row QA has approved but nobody has scheduled
  // an installation visit for yet.
  async fetchReadyForInstallation() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('ocular_inspections')
          .select('*')
          .eq('status', 'READY_FOR_INSTALLATION')
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        3000,
        'Fetch ready for installation'
      );
      if (error) throw error;
      return (data || []).map(row => this.mapSupabaseToLocal(row));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch ready-for-installation records:', err.message);
      return [];
    }
  }

  // Manager-side "Awaiting Installation" list — every record a Manager has
  // already run through Assign for Installation (has a scheduled_visits row)
  // but the installer hasn't submitted yet.
  async fetchAssignedInstallations() {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('ocular_inspections')
          .select('*')
          .eq('status', 'ASSIGNED_PENDING_INSTALLATION')
          .is('deleted_at', null)
          .order('created_at', { ascending: true }),
        3000,
        'Fetch assigned installations'
      );
      if (error) throw error;
      return (data || []).map(row => this.mapSupabaseToLocal(row));
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch assigned installations:', err.message);
      return [];
    }
  }

  // Assign for Installation — the installation-side twin of
  // createStubInspection. Advances an already-existing ocular_inspections
  // row (no new row is created; unlike ocular assignment, this stage
  // starts from a real record, not a stub) to ASSIGNED_PENDING_INSTALLATION
  // and schedules the visit. These are two separate writes — if the
  // schedule insert fails (e.g. a rare race on the unique index), the
  // status change is rolled back so the record doesn't end up stuck showing
  // "assigned" with no actual schedule behind it.
  async assignForInstallation({ ocularInspectionId, assignedTeam, startTime, endTime, createdBy }) {
    if (!this.isConfigured()) throw new Error('Cloud not configured');
    await this.updateInspectionStatus(ocularInspectionId, 'ASSIGNED_PENDING_INSTALLATION');
    try {
      return await this.scheduleVisit({
        visitType: 'INSTALLATION',
        ocularInspectionId,
        assignedTeam,
        startTime,
        endTime,
        createdBy
      });
    } catch (err) {
      try {
        await this.updateInspectionStatus(ocularInspectionId, 'READY_FOR_INSTALLATION');
      } catch (rollbackErr) {
        console.warn('[OIMS Supabase] Could not roll back status after failed installation scheduling:', rollbackErr.message);
      }
      throw err;
    }
  }
```

- [ ] **Step 2: Verify with a manual smoke check**

In the same running dev server, in the browser console (pick a real `ocular_inspections.id` whose `status` is `READY_FOR_INSTALLATION` — set one via the Supabase table editor if none exist):

```javascript
const { supabaseService } = await import('/js/services/supabaseService.js');
const before = await supabaseService.fetchReadyForInstallation();
console.log(before.length); // note this number

const result = await supabaseService.assignForInstallation({
  ocularInspectionId: '<ready_ocular_inspection_id>',
  assignedTeam: '<profile_id>',
  startTime: new Date(Date.now() + 86400000).toISOString(),
  endTime: new Date(Date.now() + 100000000).toISOString(),
  createdBy: null
});
console.log(result.visitType); // 'INSTALLATION'

const after = await supabaseService.fetchReadyForInstallation();
console.log(after.length); // before - 1

const assigned = await supabaseService.fetchAssignedInstallations();
console.log(assigned.some(r => r.id === '<ready_ocular_inspection_id>')); // true
```

Then, via the Supabase table editor: delete the `scheduled_visits` row this created and set that `ocular_inspections` row's `status` back to `READY_FOR_INSTALLATION` so the smoke test doesn't leave fake state behind.

- [ ] **Step 3: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "Add installation assignment service methods"
```

---

### Task 4: Service layer — calendar range fetch

**Files:**
- Modify: `js/services/supabaseService.js`

**Interfaces:**
- Consumes: `mapScheduledVisitToLocal(row)` (Task 2).
- Produces (used by Task 11):
  - `async fetchScheduledVisits({ from, to })` → `Array<{ ...mapped scheduled_visits row, clientName, rnNo, locationAddress }>`, sorted by `startTime` ascending, for every `SCHEDULED` visit whose `start_time` falls in `[from, to)`.

- [ ] **Step 1: Add the method**

Add directly after `fetchScheduledVisitsForTeam` (the last method added in Task 2):

```javascript
  // Manager Calendar's data source — every SCHEDULED visit starting in
  // [from, to), joined in-memory to ocular_inspections for display labels
  // (client name, RN, address) so the calendar component doesn't need a
  // second round-trip per visit.
  async fetchScheduledVisits({ from, to }) {
    if (!this.isConfigured()) return [];
    try {
      const { data, error } = await this.withTimeout(
        this.client
          .from('scheduled_visits')
          .select('*')
          .eq('status', 'SCHEDULED')
          .gte('start_time', from)
          .lt('start_time', to)
          .order('start_time', { ascending: true }),
        3000,
        'Fetch scheduled visits'
      );
      if (error) throw error;
      const visits = (data || []).map(row => this.mapScheduledVisitToLocal(row));
      if (visits.length === 0) return visits;

      const inspectionIds = [...new Set(visits.map(v => v.ocularInspectionId))];
      const { data: inspections, error: inspError } = await this.withTimeout(
        this.client
          .from('ocular_inspections')
          .select('id, client_name, rn_no, location_address')
          .in('id', inspectionIds),
        3000,
        'Fetch inspection labels for calendar'
      );
      if (inspError) throw inspError;
      const labelById = new Map((inspections || []).map(row => [row.id, row]));

      return visits.map(v => {
        const label = labelById.get(v.ocularInspectionId);
        return {
          ...v,
          clientName: label?.client_name || 'Unknown Client',
          rnNo: label?.rn_no || 'N/A',
          locationAddress: label?.location_address || ''
        };
      });
    } catch (err) {
      console.warn('[OIMS Supabase] Could not fetch scheduled visits:', err.message);
      return [];
    }
  }
```

- [ ] **Step 2: Verify with a manual smoke check**

```javascript
const { supabaseService } = await import('/js/services/supabaseService.js');
const visit = await supabaseService.scheduleVisit({
  visitType: 'OCULAR',
  ocularInspectionId: '<ocular_inspection_id>',
  assignedTeam: '<profile_id>',
  startTime: new Date().toISOString(),
  endTime: new Date(Date.now() + 3600000).toISOString(),
  createdBy: null
});
const from = new Date(Date.now() - 3600000).toISOString();
const to = new Date(Date.now() + 7200000).toISOString();
const visits = await supabaseService.fetchScheduledVisits({ from, to });
console.log(visits); // should include the visit above, with clientName/rnNo/locationAddress populated
```

Delete the smoke-test `scheduled_visits` row afterward via the Supabase table editor.

- [ ] **Step 3: Commit**

```bash
git add js/services/supabaseService.js
git commit -m "Add fetchScheduledVisits for the Manager Calendar"
```

---

### Task 5: `js/utils/scheduling.js` — shared date-math helpers

**Files:**
- Create: `js/utils/scheduling.js`

**Interfaces:**
- Produces (used by Tasks 6, 7, 8):
  - `computeEndTime(startLocalValue, durationMinutes)` → ISO string. `startLocalValue` is a `<input type="datetime-local">` value (`"YYYY-MM-DDTHH:mm"`).
  - `toIsoFromLocalInput(startLocalValue)` → ISO string, for converting the raw start input value.
  - `formatVisitTimeRange(startIso, endIso)` → human string, e.g. `"Sep 20, 2026, 9:00 AM – 10:00 AM"`.
  - `formatConflictWarning(conflict)` → human string describing an existing overlapping visit, e.g. `"This team already has a visit scheduled Sep 20, 2026, 9:00 AM – 10:00 AM."`. `conflict` is a `mapScheduledVisitToLocal`-shaped object (has `startTime`/`endTime`) or `null`.

- [ ] **Step 1: Write the file**

```javascript
/**
 * OIMS — Calendar Scheduling Date/Time Helpers
 * Pure functions shared by the three scheduling UIs (Assign for
 * Inspection, Assign for Installation, Reschedule) — see
 * docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md.
 */

// A <input type="datetime-local"> value has no timezone — the browser
// treats it as local time, so `new Date(value)` already interprets it
// correctly; .toISOString() then converts to the UTC string Postgres
// expects.
export function toIsoFromLocalInput(localValue) {
  return new Date(localValue).toISOString();
}

export function computeEndTime(startLocalValue, durationMinutes) {
  const start = new Date(startLocalValue);
  return new Date(start.getTime() + durationMinutes * 60000).toISOString();
}

const TIME_FMT = { hour: 'numeric', minute: '2-digit', hour12: true };
const DATE_FMT = { month: 'short', day: 'numeric', year: 'numeric' };

export function formatVisitTimeRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const datePart = start.toLocaleDateString('en-US', DATE_FMT);
  const startPart = start.toLocaleTimeString('en-US', TIME_FMT);
  const endPart = end.toLocaleTimeString('en-US', TIME_FMT);
  return `${datePart}, ${startPart} – ${endPart}`;
}

export function formatConflictWarning(conflict) {
  if (!conflict) return '';
  return `This team already has a visit scheduled ${formatVisitTimeRange(conflict.startTime, conflict.endTime)}.`;
}
```

- [ ] **Step 2: Verify with a manual smoke check**

In the browser console:

```javascript
const { computeEndTime, formatVisitTimeRange, formatConflictWarning } = await import('/js/utils/scheduling.js');
console.log(computeEndTime('2026-09-20T09:00', 60)); // an ISO string ~1 hour after 9am local on 2026-09-20
console.log(formatVisitTimeRange('2026-09-20T01:00:00.000Z', '2026-09-20T02:00:00.000Z')); // a readable "Sep 20, 2026, ..." string
console.log(formatConflictWarning(null)); // ''
console.log(formatConflictWarning({ startTime: '2026-09-20T01:00:00.000Z', endTime: '2026-09-20T02:00:00.000Z' })); // "This team already has a visit scheduled ..."
```

- [ ] **Step 3: Commit**

```bash
git add js/utils/scheduling.js
git commit -m "Add shared date/time helpers for the calendar scheduling engine"
```

---

### Task 6: Assign for Inspection — mandatory date + conflict warning

**Files:**
- Modify: `js/components/salesPipeline.js:895-1022` (`renderAssignInspectionContent`, `confirmAssignInspection`)

**Interfaces:**
- Consumes: `supabaseService.checkVisitConflict`, `supabaseService.scheduleVisit` (Task 2); `toIsoFromLocalInput`, `computeEndTime`, `formatConflictWarning` (Task 5).

- [ ] **Step 1: Import the new helpers**

In `js/components/salesPipeline.js`, add after the existing `escapeHTML` import (line 13):

```javascript
import { toIsoFromLocalInput, computeEndTime, formatConflictWarning } from '../utils/scheduling.js';
```

- [ ] **Step 2: Add the scheduling fields to the modal**

In `renderAssignInspectionContent` (starting line 895), replace:

```javascript
      ${rnField}

      <div class="form-group">
        <label class="form-label" for="assign-team-select">Assign To</label>
        <select class="form-select" id="assign-team-select" ${teams.length === 0 ? 'disabled' : ''}>
          ${teams.length > 0
            ? teams.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.full_name)}</option>`).join('')
            : `<option value="">No field teams configured</option>`}
        </select>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-assign-inspection">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-assign-inspection" ${teams.length === 0 ? 'disabled' : ''}>Confirm</button>
      </div>
    `;
```

with:

```javascript
      ${rnField}

      <div class="form-group">
        <label class="form-label" for="assign-team-select">Assign To</label>
        <select class="form-select" id="assign-team-select" ${teams.length === 0 ? 'disabled' : ''}>
          ${teams.length > 0
            ? teams.map(t => `<option value="${escapeHTML(t.id)}">${escapeHTML(t.full_name)}</option>`).join('')
            : `<option value="">No field teams configured</option>`}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="assign-visit-start">Scheduled Visit</label>
        <input type="datetime-local" class="form-input" id="assign-visit-start" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="assign-visit-duration">Expected Duration</label>
        <select class="form-select" id="assign-visit-duration">
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240">4 hours</option>
        </select>
      </div>

      <div id="assign-visit-conflict-warning" style="display: none; margin: 0.75rem 0; padding: 0.6rem 0.85rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-md); color: #92400e; font-size: 0.8rem; font-weight: 600;"></div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-assign-inspection">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-assign-inspection" ${teams.length === 0 ? 'disabled' : ''}>Confirm</button>
      </div>
    `;
```

- [ ] **Step 3: Add mandatory-field and conflict-check logic to the confirm handler**

In `confirmAssignInspection` (starting line 941), replace:

```javascript
  async confirmAssignInspection(lead, btn) {
    const content = this.container.querySelector('#assign-inspection-content');
    const select = content.querySelector('#assign-team-select');
    const assignedTeam = select ? select.value : '';
    if (!assignedTeam) {
      AppLayout.showToast('Select a team to assign this lead to.');
      return;
    }

    let rnNo = lead.rnNo;
    if (!rnNo) {
      const rnInput = content.querySelector('#assign-rn-input');
      rnNo = rnInput ? rnInput.value.trim() : '';
      if (!rnNo) {
        AppLayout.showToast('Enter an RN Number for this lead first.');
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Assigning...';
```

with:

```javascript
  async confirmAssignInspection(lead, btn) {
    const content = this.container.querySelector('#assign-inspection-content');
    const select = content.querySelector('#assign-team-select');
    const assignedTeam = select ? select.value : '';
    if (!assignedTeam) {
      AppLayout.showToast('Select a team to assign this lead to.');
      return;
    }

    let rnNo = lead.rnNo;
    if (!rnNo) {
      const rnInput = content.querySelector('#assign-rn-input');
      rnNo = rnInput ? rnInput.value.trim() : '';
      if (!rnNo) {
        AppLayout.showToast('Enter an RN Number for this lead first.');
        return;
      }
    }

    const startInput = content.querySelector('#assign-visit-start');
    const startLocalValue = startInput ? startInput.value : '';
    if (!startLocalValue) {
      AppLayout.showToast('Pick a date and time for the visit.');
      return;
    }
    const durationSelect = content.querySelector('#assign-visit-duration');
    const durationMinutes = Number.parseInt(durationSelect ? durationSelect.value : '60', 10);
    const startTime = toIsoFromLocalInput(startLocalValue);
    const endTime = computeEndTime(startLocalValue, durationMinutes);

    // Warn-but-allow: the first click checks for a conflict and, if found,
    // shows the warning and turns the button into an explicit second
    // confirmation instead of proceeding straight to the save.
    const warningBox = content.querySelector('#assign-visit-conflict-warning');
    if (btn.dataset.conflictAcknowledged !== 'true') {
      const conflict = await supabaseService.checkVisitConflict(assignedTeam, startTime, endTime);
      if (conflict) {
        warningBox.textContent = formatConflictWarning(conflict);
        warningBox.style.display = 'block';
        btn.dataset.conflictAcknowledged = 'true';
        btn.textContent = 'Confirm Anyway';
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Assigning...';
```

- [ ] **Step 4: Schedule the visit once the inspection is created**

Still in `confirmAssignInspection`, find:

```javascript
      const user = await AuthGuard.getSessionUser();
      await supabaseService.createStubInspection({
        clientName: lead.clientName,
        rnNo,
        contactNo: lead.contactNo,
        locationAddress: lead.installationAddress,
        assignedTeam,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'SALES_LEAD_ASSIGNED_FOR_INSPECTION',
        description: `Assigned sales lead "${lead.clientName}" for Ocular Inspection`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: lead.id
      });
```

and replace with:

```javascript
      const user = await AuthGuard.getSessionUser();
      const inspection = await supabaseService.createStubInspection({
        clientName: lead.clientName,
        rnNo,
        contactNo: lead.contactNo,
        locationAddress: lead.installationAddress,
        assignedTeam,
        createdBy: user?.id || null
      });
      await supabaseService.scheduleVisit({
        visitType: 'OCULAR',
        ocularInspectionId: inspection.id,
        assignedTeam,
        startTime,
        endTime,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'OCULAR_VISIT_SCHEDULED',
        description: `Assigned sales lead "${lead.clientName}" for Ocular Inspection`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: lead.id
      });
```

- [ ] **Step 5: Manual verification**

Run `npm run dev`, log in as a Customer Care / Manager account, go to Sales Pipeline, click "Assign for Inspection" on any lead:
1. Leave the date blank and click Confirm → expect the toast "Pick a date and time for the visit." and no navigation/save.
2. Fill in a date/time, click Confirm → expect it to succeed as before (toast "Assigned ... for inspection.").
3. Open the Sales Pipeline again, assign a *different* lead to the *same team* with a start time that overlaps the first assignment's window → expect the amber warning box to appear and the button to read "Confirm Anyway"; click it again → expect the assignment to proceed.
4. In the Supabase table editor, confirm a `scheduled_visits` row exists for each new inspection with the right `start_time`/`end_time`/`assigned_team`.

- [ ] **Step 6: Commit**

```bash
git add js/components/salesPipeline.js
git commit -m "Require a scheduled date on Assign for Inspection, with conflict warning"
```

---

### Task 7: Manager visibility — "Scheduled Visit" column + Reschedule on Pending Site Visits

**Files:**
- Modify: `js/components/pendingSiteVisits.js` (whole file, 119 lines)

**Interfaces:**
- Consumes: `supabaseService.fetchScheduledVisitsForTeam` (Task 2, used per-record via a bulk fetch — see below), `supabaseService.checkVisitConflict`, `supabaseService.rescheduleVisit` (Task 2); `supabaseService.fetchAllFieldInspectors` (existing); `toIsoFromLocalInput`, `computeEndTime`, `formatVisitTimeRange`, `formatConflictWarning` (Task 5).

- [ ] **Step 1: Fetch each record's scheduled visit alongside the records**

Replace the full file with:

```javascript
/**
 * OIMS — Pending Site Visits Panel (`pendingSiteVisits.js`)
 * Manager-side visibility over every Ocular Inspection lead Customer Care
 * has assigned to a Field Inspector — spans both lifecycle stages, from
 * dispatch (ASSIGNED_PENDING_INSPECTION) through the inspector's QA
 * submission (PENDING_QA), so Customer Care can see the whole handoff
 * without waiting for it to reach the Audit QA Queue. Each
 * ASSIGNED_PENDING_INSPECTION row also shows its scheduled visit date/time
 * and can be rescheduled — see
 * docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md.
 */

import { supabaseService } from '../services/supabaseService.js';
import { escapeHTML } from '../utils/security.js';
import { AppLayout } from './appLayout.js';
import { toIsoFromLocalInput, computeEndTime, formatVisitTimeRange, formatConflictWarning } from '../utils/scheduling.js';

export class PendingSiteVisits {
  constructor(container) {
    this.container = container;
    this.records = [];
    this.fieldTeams = [];
    this.visitsByInspectionId = new Map();
  }

  async render() {
    this.container.innerHTML = this.renderShell();

    try {
      const [records, teams] = await Promise.all([
        supabaseService.fetchAllAssignedInspections(),
        supabaseService.fetchAllFieldInspectors()
      ]);
      this.records = records;
      this.fieldTeams = teams;

      // One scheduled_visits fetch per distinct team on-screen, rather than
      // per row — small teams pool (2-4 accounts today), so this stays
      // cheap while avoiding an N-row-N-query pattern.
      const teamIds = [...new Set(records.map(r => r.assignedTeam).filter(Boolean))];
      const visitLists = await Promise.all(teamIds.map(id => supabaseService.fetchScheduledVisitsForTeam(id)));
      this.visitsByInspectionId = new Map();
      visitLists.flat().forEach(v => {
        if (v.visitType === 'OCULAR') this.visitsByInspectionId.set(v.ocularInspectionId, v);
      });
    } catch (e) {
      console.warn('[OIMS] Could not fetch pending site visits:', e);
      this.records = [];
    }
    this.renderList();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Pending Site Visits</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Every lead assigned to the Ocular Inspection Team, from dispatch through QA submission.</p>

        <div id="pending-site-visits-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading assigned inspections...</div>
        </div>
      </div>

      <div class="modal-overlay no-print" id="reschedule-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 460px;">
          <div id="reschedule-content"></div>
        </div>
      </div>
    `;
  }

  teamNameFor(assignedTeam) {
    const team = this.fieldTeams.find(t => t.id === assignedTeam);
    return team ? team.full_name : 'Unassigned';
  }

  statusMeta(status) {
    switch (status) {
      case 'ASSIGNED_PENDING_INSPECTION': return { label: 'Awaiting Site Visit', bg: 'rgba(0, 174, 239, 0.15)', color: 'var(--ecoworks-blue)' };
      case 'PENDING_QA': return { label: 'Submitted, Awaiting QA', bg: '#fef3c7', color: '#d97706' };
      default: return { label: status || 'Unknown', bg: '#f1f5f9', color: '#64748b' };
    }
  }

  scheduledVisitLabel(record) {
    const visit = this.visitsByInspectionId.get(record.id);
    return visit ? formatVisitTimeRange(visit.startTime, visit.endTime) : 'Not yet scheduled';
  }

  renderList() {
    const listEl = this.container.querySelector('#pending-site-visits-list');
    if (!listEl) return;

    if (this.records.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: #64748b;">No leads currently assigned to the Ocular Inspection Team.</div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="directory-table-wrapper hide-on-mobile">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>RN Number</th>
              <th>Assigned To</th>
              <th>Scheduled Visit</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.records.map(r => {
              const meta = this.statusMeta(r.status);
              const canReschedule = r.status === 'ASSIGNED_PENDING_INSPECTION' && this.visitsByInspectionId.has(r.id);
              return `
                <tr>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                  <td data-label="RN Number" style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                  <td data-label="Assigned To" style="color: #64748b;">${escapeHTML(this.teamNameFor(r.assignedTeam))}</td>
                  <td data-label="Scheduled Visit" style="color: #64748b;">${escapeHTML(this.scheduledVisitLabel(r))}</td>
                  <td data-label="Status"><span class="badge" style="background: ${meta.bg}; color: ${meta.color}; font-size: 0.7rem; font-weight: 800; padding: 0.2rem 0.55rem;">${escapeHTML(meta.label)}</span></td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    ${canReschedule ? `<button type="button" class="btn-link btn-reschedule-visit" data-id="${r.id}">Reschedule</button>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="hide-on-desktop">
        ${this.records.map(r => {
          const meta = this.statusMeta(r.status);
          const canReschedule = r.status === 'ASSIGNED_PENDING_INSPECTION' && this.visitsByInspectionId.has(r.id);
          return `
            <div class="record-card">
              <div class="record-top">
                <span class="record-title">${escapeHTML(r.clientName || 'Unnamed Client')}</span>
                <span class="record-badge" style="background: ${meta.bg}; color: ${meta.color};">${escapeHTML(meta.label)}</span>
              </div>
              <div class="record-meta">
                <span class="rn">${escapeHTML(r.rnNo || 'N/A')}</span>
              </div>
              <div class="record-sub">Assigned to ${escapeHTML(this.teamNameFor(r.assignedTeam))}</div>
              <div class="record-sub">Scheduled: ${escapeHTML(this.scheduledVisitLabel(r))}</div>
              ${canReschedule ? `<button type="button" class="btn-link btn-reschedule-visit" data-id="${r.id}" style="margin-top: 0.4rem;">Reschedule</button>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;

    this.bindRowButtons();
  }

  bindRowButtons() {
    this.container.querySelectorAll('.btn-reschedule-visit').forEach(btn => {
      btn.addEventListener('click', () => this.openRescheduleOverlay(btn.getAttribute('data-id')));
    });
    const overlay = this.container.querySelector('#reschedule-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeRescheduleOverlay();
      });
    }
  }

  openRescheduleOverlay(recordId) {
    const record = this.records.find(r => r.id === recordId);
    const visit = this.visitsByInspectionId.get(recordId);
    if (!record || !visit) return;

    const overlay = this.container.querySelector('#reschedule-overlay');
    const content = this.container.querySelector('#reschedule-content');
    if (!overlay || !content) return;

    content.innerHTML = this.renderRescheduleContent(record, visit);
    overlay.style.display = 'flex';

    content.querySelector('#btn-cancel-reschedule').addEventListener('click', () => this.closeRescheduleOverlay());
    content.querySelector('#btn-confirm-reschedule').addEventListener('click', (e) => this.confirmReschedule(record, visit, e.currentTarget));
  }

  closeRescheduleOverlay() {
    const overlay = this.container.querySelector('#reschedule-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  renderRescheduleContent(record, visit) {
    const localStart = new Date(visit.startTime);
    localStart.setMinutes(localStart.getMinutes() - localStart.getTimezoneOffset());
    const localValue = localStart.toISOString().slice(0, 16);

    return `
      <h3 class="modal-title">Reschedule Visit</h3>
      <p class="modal-subtitle">${escapeHTML(record.clientName || 'Unnamed Client')} &middot; RN ${escapeHTML(record.rnNo || 'N/A')}</p>

      <div class="form-group">
        <label class="form-label" for="reschedule-team-select">Assign To</label>
        <select class="form-select" id="reschedule-team-select">
          ${this.fieldTeams.map(t => `<option value="${escapeHTML(t.id)}" ${t.id === record.assignedTeam ? 'selected' : ''}>${escapeHTML(t.full_name)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="reschedule-visit-start">Scheduled Visit</label>
        <input type="datetime-local" class="form-input" id="reschedule-visit-start" value="${localValue}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="reschedule-visit-duration">Expected Duration</label>
        <select class="form-select" id="reschedule-visit-duration">
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240">4 hours</option>
        </select>
      </div>

      <div id="reschedule-conflict-warning" style="display: none; margin: 0.75rem 0; padding: 0.6rem 0.85rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-md); color: #92400e; font-size: 0.8rem; font-weight: 600;"></div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-reschedule">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-reschedule">Confirm</button>
      </div>
    `;
  }

  async confirmReschedule(record, visit, btn) {
    const content = this.container.querySelector('#reschedule-content');
    const assignedTeam = content.querySelector('#reschedule-team-select').value;
    const startLocalValue = content.querySelector('#reschedule-visit-start').value;
    if (!startLocalValue) {
      AppLayout.showToast('Pick a date and time for the visit.');
      return;
    }
    const durationMinutes = Number.parseInt(content.querySelector('#reschedule-visit-duration').value, 10);
    const startTime = toIsoFromLocalInput(startLocalValue);
    const endTime = computeEndTime(startLocalValue, durationMinutes);

    const warningBox = content.querySelector('#reschedule-conflict-warning');
    if (btn.dataset.conflictAcknowledged !== 'true') {
      const conflict = await supabaseService.checkVisitConflict(assignedTeam, startTime, endTime, visit.id);
      if (conflict) {
        warningBox.textContent = formatConflictWarning(conflict);
        warningBox.style.display = 'block';
        btn.dataset.conflictAcknowledged = 'true';
        btn.textContent = 'Confirm Anyway';
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await supabaseService.rescheduleVisit(visit.id, { assignedTeam, startTime, endTime });
      if (assignedTeam !== record.assignedTeam) {
        await supabaseService.assignInspectionTeam(record.id, assignedTeam);
      }
      AppLayout.showToast('Visit rescheduled.');
      this.closeRescheduleOverlay();
      this.render();
    } catch (e) {
      console.warn('[OIMS] Could not reschedule visit:', e);
      AppLayout.showToast('Could not reschedule — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  }
}
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, log in as Manager, go to Pending Site Visits:
1. Confirm every `ASSIGNED_PENDING_INSPECTION` row shows its scheduled date/time in the new "Scheduled Visit" column (from an inspection assigned in Task 6's verification).
2. Click "Reschedule" on one, change the date, Confirm → expect the toast "Visit rescheduled." and the column to reflect the new time on refresh.
3. Reschedule it again to a time that overlaps another team's existing visit → expect the amber warning and "Confirm Anyway" flow (same as Task 6).
4. Confirm a `PENDING_QA` row shows no "Reschedule" button (already submitted, not applicable).
5. Check the mobile layout (resize below 700px, or DevTools device mode) — confirm the stacked card shows "Scheduled:" and the Reschedule link.

- [ ] **Step 3: Commit**

```bash
git add js/components/pendingSiteVisits.js
git commit -m "Show scheduled visit time and add Reschedule to Pending Site Visits"
```

---

### Task 8: New "Assign Installations" panel

**Files:**
- Create: `js/components/installationDispatch.js`

**Interfaces:**
- Consumes: `supabaseService.fetchReadyForInstallation`, `supabaseService.fetchAssignedInstallations`, `supabaseService.assignForInstallation`, `supabaseService.checkVisitConflict`, `supabaseService.rescheduleVisit`, `supabaseService.fetchAllFieldInspectors`, `supabaseService.fetchScheduledVisitsForTeam` (Tasks 2–3); `toIsoFromLocalInput`, `computeEndTime`, `formatVisitTimeRange`, `formatConflictWarning` (Task 5); `auditLogService`, `AUDIT_CATEGORIES`, `AUDIT_SEVERITY` (existing); `AppLayout.showToast` (existing); `escapeHTML` (existing).
- Produces: `export class InstallationDispatch { constructor(containerElement) {...} async render() {...} }` — mounted by Task 9 exactly like `SalesPipeline`/`PendingSiteVisits`.

- [ ] **Step 1: Write the component**

```javascript
/**
 * OIMS — Installation Dispatch Panel (`installationDispatch.js`)
 * Manager-side "Assign for Installation" flow — the installation-lifecycle
 * twin of Sales Pipeline's "Assign for Inspection" + Pending Site Visits.
 * Two sections in one panel (there's no separate "origin" screen for
 * installations the way Sales Pipeline is for inspections):
 *   - Ready to Assign: READY_FOR_INSTALLATION records with no schedule yet.
 *   - Awaiting Installation: ASSIGNED_PENDING_INSTALLATION records, with
 *     their scheduled date/time and a Reschedule action.
 * See docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md.
 */

import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { AppLayout } from './appLayout.js';
import { auditLogService, AUDIT_CATEGORIES, AUDIT_SEVERITY } from '../services/auditLogService.js';
import { escapeHTML } from '../utils/security.js';
import { toIsoFromLocalInput, computeEndTime, formatVisitTimeRange, formatConflictWarning } from '../utils/scheduling.js';

export class InstallationDispatch {
  constructor(container) {
    this.container = container;
    this.readyRecords = [];
    this.assignedRecords = [];
    this.fieldTeams = [];
    this.visitsByInspectionId = new Map();
  }

  async render() {
    this.container.innerHTML = this.renderShell();

    try {
      const [ready, assigned, teams] = await Promise.all([
        supabaseService.fetchReadyForInstallation(),
        supabaseService.fetchAssignedInstallations(),
        supabaseService.fetchAllFieldInspectors()
      ]);
      this.readyRecords = ready;
      this.assignedRecords = assigned;
      this.fieldTeams = teams;

      const teamIds = [...new Set(assigned.map(r => r.assignedTeam).filter(Boolean))];
      const visitLists = await Promise.all(teamIds.map(id => supabaseService.fetchScheduledVisitsForTeam(id)));
      this.visitsByInspectionId = new Map();
      visitLists.flat().forEach(v => {
        if (v.visitType === 'INSTALLATION') this.visitsByInspectionId.set(v.ocularInspectionId, v);
      });
    } catch (e) {
      console.warn('[OIMS] Could not load installation dispatch data:', e);
      this.readyRecords = [];
      this.assignedRecords = [];
    }

    this.renderReadyList();
    this.renderAssignedList();
    this.bindStaticEvents();
  }

  renderShell() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); margin-bottom: 1.5rem;">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Ready to Assign</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">QA-approved records with no installation visit scheduled yet.</p>
        <div id="install-ready-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading...</div>
        </div>
      </div>

      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin-bottom: 0.5rem;">Awaiting Installation</h3>
        <p style="font-size: 0.825rem; color: #64748b; margin-bottom: 1.25rem;">Scheduled installation visits, not yet submitted by the installer.</p>
        <div id="install-assigned-list">
          <div style="text-align: center; padding: 2rem; color: #64748b;">Loading...</div>
        </div>
      </div>

      <div class="modal-overlay no-print" id="install-assign-overlay" style="display: none;">
        <div class="modal-dialog" style="max-width: 460px;">
          <div id="install-assign-content"></div>
        </div>
      </div>
    `;
  }

  teamNameFor(assignedTeam) {
    const team = this.fieldTeams.find(t => t.id === assignedTeam);
    return team ? team.full_name : 'Unassigned';
  }

  renderReadyList() {
    const el = this.container.querySelector('#install-ready-list');
    if (!el) return;

    if (this.readyRecords.length === 0) {
      el.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: #64748b;">Nothing waiting to be assigned.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="directory-table-wrapper">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>RN Number</th>
              <th>Address</th>
              <th>Currently Assigned Team</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.readyRecords.map(r => `
              <tr>
                <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                <td data-label="RN Number" style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                <td data-label="Address" style="color: #64748b;">${escapeHTML(r.locationAddress || 'No address on file')}</td>
                <td data-label="Currently Assigned Team" style="color: #64748b;">${escapeHTML(this.teamNameFor(r.assignedTeam))}</td>
                <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                  <button type="button" class="btn-link btn-assign-installation" data-id="${r.id}">Assign for Installation</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    el.querySelectorAll('.btn-assign-installation').forEach(btn => {
      btn.addEventListener('click', () => this.openAssignOverlay(btn.getAttribute('data-id')));
    });
  }

  renderAssignedList() {
    const el = this.container.querySelector('#install-assigned-list');
    if (!el) return;

    if (this.assignedRecords.length === 0) {
      el.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: #64748b;">No installations currently scheduled.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="directory-table-wrapper">
        <table class="directory-table">
          <thead>
            <tr>
              <th>Client Name</th>
              <th>RN Number</th>
              <th>Assigned To</th>
              <th>Scheduled Visit</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.assignedRecords.map(r => {
              const visit = this.visitsByInspectionId.get(r.id);
              return `
                <tr>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(r.clientName || 'Unnamed Client')}</td>
                  <td data-label="RN Number" style="color: #64748b;">${escapeHTML(r.rnNo || 'N/A')}</td>
                  <td data-label="Assigned To" style="color: #64748b;">${escapeHTML(this.teamNameFor(r.assignedTeam))}</td>
                  <td data-label="Scheduled Visit" style="color: #64748b;">${escapeHTML(visit ? formatVisitTimeRange(visit.startTime, visit.endTime) : 'Not yet scheduled')}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    ${visit ? `<button type="button" class="btn-link btn-reschedule-installation" data-id="${r.id}">Reschedule</button>` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    el.querySelectorAll('.btn-reschedule-installation').forEach(btn => {
      btn.addEventListener('click', () => this.openRescheduleOverlay(btn.getAttribute('data-id')));
    });
  }

  bindStaticEvents() {
    const overlay = this.container.querySelector('#install-assign-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.closeOverlay();
      });
    }
  }

  closeOverlay() {
    const overlay = this.container.querySelector('#install-assign-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // --- Assign for Installation (Ready to Assign -> Awaiting Installation) ---

  openAssignOverlay(recordId) {
    const record = this.readyRecords.find(r => r.id === recordId);
    if (!record) return;

    const overlay = this.container.querySelector('#install-assign-overlay');
    const content = this.container.querySelector('#install-assign-content');
    if (!overlay || !content) return;

    content.innerHTML = `
      <h3 class="modal-title">Assign for Installation</h3>
      <p class="modal-subtitle">${escapeHTML(record.clientName || 'Unnamed Client')} &middot; RN ${escapeHTML(record.rnNo || 'N/A')}</p>

      <div class="form-group">
        <label class="form-label" for="install-team-select">Assign To</label>
        <select class="form-select" id="install-team-select" ${this.fieldTeams.length === 0 ? 'disabled' : ''}>
          ${this.fieldTeams.length > 0
            ? this.fieldTeams.map(t => `<option value="${escapeHTML(t.id)}" ${t.id === record.assignedTeam ? 'selected' : ''}>${escapeHTML(t.full_name)}</option>`).join('')
            : `<option value="">No field teams configured</option>`}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="install-visit-start">Scheduled Visit</label>
        <input type="datetime-local" class="form-input" id="install-visit-start" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="install-visit-duration">Expected Duration</label>
        <select class="form-select" id="install-visit-duration">
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240" selected>4 hours</option>
          <option value="480">Full day (8 hours)</option>
        </select>
      </div>

      <div id="install-conflict-warning" style="display: none; margin: 0.75rem 0; padding: 0.6rem 0.85rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-md); color: #92400e; font-size: 0.8rem; font-weight: 600;"></div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-install-assign">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-install-assign" ${this.fieldTeams.length === 0 ? 'disabled' : ''}>Confirm</button>
      </div>
    `;
    overlay.style.display = 'flex';

    content.querySelector('#btn-cancel-install-assign').addEventListener('click', () => this.closeOverlay());
    content.querySelector('#btn-confirm-install-assign').addEventListener('click', (e) => this.confirmAssign(record, e.currentTarget));
  }

  async confirmAssign(record, btn) {
    const content = this.container.querySelector('#install-assign-content');
    const assignedTeam = content.querySelector('#install-team-select').value;
    if (!assignedTeam) {
      AppLayout.showToast('Select a team to assign this installation to.');
      return;
    }
    const startLocalValue = content.querySelector('#install-visit-start').value;
    if (!startLocalValue) {
      AppLayout.showToast('Pick a date and time for the visit.');
      return;
    }
    const durationMinutes = Number.parseInt(content.querySelector('#install-visit-duration').value, 10);
    const startTime = toIsoFromLocalInput(startLocalValue);
    const endTime = computeEndTime(startLocalValue, durationMinutes);

    const warningBox = content.querySelector('#install-conflict-warning');
    if (btn.dataset.conflictAcknowledged !== 'true') {
      const conflict = await supabaseService.checkVisitConflict(assignedTeam, startTime, endTime);
      if (conflict) {
        warningBox.textContent = formatConflictWarning(conflict);
        warningBox.style.display = 'block';
        btn.dataset.conflictAcknowledged = 'true';
        btn.textContent = 'Confirm Anyway';
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Assigning...';
    try {
      const user = await AuthGuard.getSessionUser();
      await supabaseService.assignForInstallation({
        ocularInspectionId: record.id,
        assignedTeam,
        startTime,
        endTime,
        createdBy: user?.id || null
      });
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'INSTALLATION_VISIT_SCHEDULED',
        description: `Assigned "${record.clientName}" for Installation`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: record.id
      });
      this.closeOverlay();
      AppLayout.showToast(`Assigned "${escapeHTML(record.clientName)}" for installation.`);
      this.render();
    } catch (e) {
      console.warn('[OIMS] Could not assign for installation:', e);
      AppLayout.showToast('Could not assign for installation — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  }

  // --- Reschedule (Awaiting Installation) ---

  openRescheduleOverlay(recordId) {
    const record = this.assignedRecords.find(r => r.id === recordId);
    const visit = this.visitsByInspectionId.get(recordId);
    if (!record || !visit) return;

    const overlay = this.container.querySelector('#install-assign-overlay');
    const content = this.container.querySelector('#install-assign-content');
    if (!overlay || !content) return;

    const localStart = new Date(visit.startTime);
    localStart.setMinutes(localStart.getMinutes() - localStart.getTimezoneOffset());
    const localValue = localStart.toISOString().slice(0, 16);

    content.innerHTML = `
      <h3 class="modal-title">Reschedule Installation</h3>
      <p class="modal-subtitle">${escapeHTML(record.clientName || 'Unnamed Client')} &middot; RN ${escapeHTML(record.rnNo || 'N/A')}</p>

      <div class="form-group">
        <label class="form-label" for="install-reschedule-team-select">Assign To</label>
        <select class="form-select" id="install-reschedule-team-select">
          ${this.fieldTeams.map(t => `<option value="${escapeHTML(t.id)}" ${t.id === record.assignedTeam ? 'selected' : ''}>${escapeHTML(t.full_name)}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="install-reschedule-start">Scheduled Visit</label>
        <input type="datetime-local" class="form-input" id="install-reschedule-start" value="${localValue}" required />
      </div>

      <div class="form-group">
        <label class="form-label" for="install-reschedule-duration">Expected Duration</label>
        <select class="form-select" id="install-reschedule-duration">
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="240" selected>4 hours</option>
          <option value="480">Full day (8 hours)</option>
        </select>
      </div>

      <div id="install-reschedule-conflict-warning" style="display: none; margin: 0.75rem 0; padding: 0.6rem 0.85rem; background: #fef3c7; border: 1px solid #fde68a; border-radius: var(--radius-md); color: #92400e; font-size: 0.8rem; font-weight: 600;"></div>

      <div class="modal-footer">
        <button type="button" class="btn btn-outline" id="btn-cancel-install-reschedule">Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-confirm-install-reschedule">Confirm</button>
      </div>
    `;
    overlay.style.display = 'flex';

    content.querySelector('#btn-cancel-install-reschedule').addEventListener('click', () => this.closeOverlay());
    content.querySelector('#btn-confirm-install-reschedule').addEventListener('click', (e) => this.confirmReschedule(record, visit, e.currentTarget));
  }

  async confirmReschedule(record, visit, btn) {
    const content = this.container.querySelector('#install-assign-content');
    const assignedTeam = content.querySelector('#install-reschedule-team-select').value;
    const startLocalValue = content.querySelector('#install-reschedule-start').value;
    if (!startLocalValue) {
      AppLayout.showToast('Pick a date and time for the visit.');
      return;
    }
    const durationMinutes = Number.parseInt(content.querySelector('#install-reschedule-duration').value, 10);
    const startTime = toIsoFromLocalInput(startLocalValue);
    const endTime = computeEndTime(startLocalValue, durationMinutes);

    const warningBox = content.querySelector('#install-reschedule-conflict-warning');
    if (btn.dataset.conflictAcknowledged !== 'true') {
      const conflict = await supabaseService.checkVisitConflict(assignedTeam, startTime, endTime, visit.id);
      if (conflict) {
        warningBox.textContent = formatConflictWarning(conflict);
        warningBox.style.display = 'block';
        btn.dataset.conflictAcknowledged = 'true';
        btn.textContent = 'Confirm Anyway';
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await supabaseService.rescheduleVisit(visit.id, { assignedTeam, startTime, endTime });
      if (assignedTeam !== record.assignedTeam) {
        await supabaseService.assignInspectionTeam(record.id, assignedTeam);
      }
      auditLogService.logEvent({
        category: AUDIT_CATEGORIES.CLIENT_RECORDS,
        eventType: 'INSTALLATION_VISIT_RESCHEDULED',
        description: `Rescheduled installation visit for "${record.clientName}"`,
        severity: AUDIT_SEVERITY.INFO,
        resourceId: record.id
      });
      this.closeOverlay();
      AppLayout.showToast('Installation visit rescheduled.');
      this.render();
    } catch (e) {
      console.warn('[OIMS] Could not reschedule installation visit:', e);
      AppLayout.showToast('Could not reschedule — check your connection and try again.');
      btn.disabled = false;
      btn.textContent = 'Confirm';
    }
  }
}
```

- [ ] **Step 2: Manual verification** (after Task 9 wires this into a route — do Task 9 first, then come back to verify both together; note this dependency and proceed to Task 9 before testing)

- [ ] **Step 3: Commit**

```bash
git add js/components/installationDispatch.js
git commit -m "Add Installation Dispatch panel: Assign for Installation + Reschedule"
```

---

### Task 9: Wire Installation Dispatch into the Manager Workspace

**Files:**
- Modify: `js/components/managerWorkspace.js:1-70` (imports, `render`)
- Modify: `js/components/appLayout.js:103-107` (nav)
- Modify: `js/router.js:223-234` (titleMap)

**Interfaces:**
- Consumes: `InstallationDispatch` (Task 8).

- [ ] **Step 1: Import and mount the new component**

In `js/components/managerWorkspace.js`, add the import after line 13 (`import { PendingSiteVisits } from './pendingSiteVisits.js';`):

```javascript
import { InstallationDispatch } from './installationDispatch.js';
```

Update the tab docstring/comment on line 19:

```javascript
    this.activeTab = 'qa'; // 'dispatch', 'qa', 'pipeline', 'pendingvisits', 'clientsearch', 'installations', 'installdispatch', 'calendar', 'tickets', 'materials', 'sms', 'kpis' — qa is the only tab wired to real data, so it's the default landing tab
```

Update the exclusion list on line 33, from:

```javascript
          ${(this.activeTab === 'pipeline' || this.activeTab === 'pendingvisits' || this.activeTab === 'clientsearch' || this.activeTab === 'installations' || this.activeTab === 'tickets') ? '' : this.renderTabStage()}
```

to:

```javascript
          ${(this.activeTab === 'pipeline' || this.activeTab === 'pendingvisits' || this.activeTab === 'clientsearch' || this.activeTab === 'installations' || this.activeTab === 'installdispatch' || this.activeTab === 'tickets') ? '' : this.renderTabStage()}
```

Add a mount block after the existing `if (this.activeTab === 'installations') { ... }` block (after line 65):

```javascript
    if (this.activeTab === 'installdispatch') {
      const stage = this.container.querySelector('#manager-tab-stage');
      new InstallationDispatch(stage).render();
    }
```

- [ ] **Step 2: Add the sidebar link**

In `js/components/appLayout.js`, add a new link directly after the "Installations" link (after line 106, before "Pending Site Visits"):

```javascript
              <a href="/manager/installdispatch" class="sidebar-nav-btn ${isActive('/manager/installdispatch') ? 'active' : ''}" title="Assign Installations">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>
                <span>Assign Installations</span>
              </a>
```

- [ ] **Step 3: Add the route title**

In `js/router.js`, add to the `titleMap` object in `renderManagerWorkspace` (after `installations: 'Installations',` on line 229):

```javascript
      installdispatch: 'Assign Installations',
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, log in as Manager, confirm "Assign Installations" appears in the sidebar under OPERATIONS & MGR CARE, click it, land on `/manager/installdispatch`, and confirm both sections render (empty states are fine if no data exists yet). Then, from Task 8's deferred verification:
1. Find or create a record with `status = 'READY_FOR_INSTALLATION'` (via the Audit QA Queue's Approve action, or directly in the Supabase table editor).
2. Confirm it appears under "Ready to Assign."
3. Click "Assign for Installation," leave the date blank, click Confirm → expect the toast blocking submission.
4. Fill in team + date, Confirm → expect it to move from "Ready to Assign" to "Awaiting Installation" with the right team/time shown.
5. Click "Reschedule" on it, change the date, Confirm → expect the updated time to show.
6. In the Supabase table editor, confirm the record's `ocular_inspections.status` is now `ASSIGNED_PENDING_INSTALLATION` and a matching `scheduled_visits` row (`visit_type = 'INSTALLATION'`) exists.

- [ ] **Step 5: Commit**

```bash
git add js/components/managerWorkspace.js js/components/appLayout.js js/router.js
git commit -m "Wire Installation Dispatch panel into the Manager Workspace"
```

---

### Task 10: Retire the self-serve Ready-for-Installation queue

**Files:**
- Modify: `js/components/readyList.js` (whole file, 321 lines)

**Interfaces:**
- Consumes: `supabaseService.fetchAssignedInstallations`, `supabaseService.fetchScheduledVisitsForTeam` (Tasks 2–3); `formatVisitTimeRange` (Task 5). Removes the dependency on `READY_INSTALLATIONS_PRESETS` from `../sampleData.js` and on `supabaseService.fetchReadyInspections`.

- [ ] **Step 1: Switch the data source and drop the fake presets**

In `js/components/readyList.js`:

Remove the import on line 6:

```javascript
import { READY_INSTALLATIONS_PRESETS } from '../sampleData.js';
```

Add after the existing `escapeHTML` import (line 9):

```javascript
import { formatVisitTimeRange } from '../utils/scheduling.js';
```

Replace the `render()` method's data-loading block (lines 18-47):

```javascript
  async render() {
    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Loading Verified Ocular Audits Queue...
        </div>
      </div>
    `;

    let cloudReadyItems = [];

    try {
      const user = await AuthGuard.getSessionUser();
      cloudReadyItems = (await supabaseService.fetchReadyInspections(user?.id)) || [];
    } catch (e) {
      console.warn('[OIMS] Could not fetch cloud inspections:', e);
    }

    const readyItems = [...cloudReadyItems, ...READY_INSTALLATIONS_PRESETS];

    // Deduplicate by rnNo if any match
    const uniqueItems = [];
    const seenRn = new Set();
    for (const item of readyItems) {
      const rn = item.rnNo || item.id;
      if (rn && !seenRn.has(rn)) {
        seenRn.add(rn);
        uniqueItems.push(item);
      }
    }
```

with:

```javascript
  async render() {
    this.container.innerHTML = `
      <div class="ready-pipeline-container">
        <div class="form-card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Loading Assigned Installations Queue...
        </div>
      </div>
    `;

    let uniqueItems = [];
    this.visitByInspectionId = new Map();

    try {
      const user = await AuthGuard.getSessionUser();
      // As of the calendar scheduling engine, an installer only sees
      // records a Manager has explicitly scheduled (ASSIGNED_PENDING_INSTALLATION)
      // — no more self-serve pickup of any READY_FOR_INSTALLATION record.
      // See docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md.
      const allAssigned = (await supabaseService.fetchAssignedInstallations()) || [];
      uniqueItems = allAssigned.filter(item => item.assignedTeam === user?.id);

      if (user?.id) {
        const visits = await supabaseService.fetchScheduledVisitsForTeam(user.id);
        visits.forEach(v => {
          if (v.visitType === 'INSTALLATION') this.visitByInspectionId.set(v.ocularInspectionId, v);
        });
      }
    } catch (e) {
      console.warn('[OIMS] Could not fetch assigned installations:', e);
    }
```

- [ ] **Step 2: Update the remaining reference to `uniqueItems`**

The line right after (previously closing the old block) reads:

```javascript
    this.container.innerHTML = `
```

No change needed there — `uniqueItems` is now produced directly by Step 1's replacement instead of being built by the old dedup loop. Confirm the surrounding template (lines 49-98 in the original) still references `uniqueItems` — it does, no further edit needed for the shell markup.

- [ ] **Step 3: Update copy and add the scheduled-visit display**

Replace the title/subtitle in the shell (`VERIFIED OCULAR AUDITS QUEUE` / `Search & Filter Approved Inspection Records`, lines 59-60):

```javascript
                <h2 class="search-form-title">ASSIGNED INSTALLATIONS QUEUE</h2>
                <span class="search-form-subtitle">Site Visits Scheduled by Customer Care</span>
```

Replace both empty-state messages (`renderListView`, lines 118-120, and `renderCards`, lines 165-167 — identical text in both):

```javascript
          <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">No Assigned Installations</h3>
          <p style="font-size: 0.85rem; margin-top: 0.3rem;">Installations a Manager schedules for your team will appear here.</p>
```

In `renderListView` (the table), replace the `<th>Audit Date</th>` header (line 136) with:

```javascript
                <th>Scheduled Visit</th>
```

and replace the corresponding cell (line 148):

```javascript
                  <td data-label="Audit Date" style="color: #64748b;">${escapeHTML(item.dateTimeDisplay || (item.dateTime ? new Date(item.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent'))}</td>
```

with:

```javascript
                  <td data-label="Scheduled Visit" style="color: #64748b;">${escapeHTML(this.scheduledVisitLabel(item))}</td>
```

In `renderCards`, replace the header date line (line 178):

```javascript
            <span>Audit Date: <strong>${item.dateTimeDisplay || (item.dateTime ? new Date(item.dateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent')}</strong></span>
```

with:

```javascript
            <span>Scheduled Visit: <strong>${escapeHTML(this.scheduledVisitLabel(item))}</strong></span>
```

Add the helper method (anywhere in the class, e.g. directly above `renderItems`):

```javascript
  scheduledVisitLabel(item) {
    const visit = this.visitByInspectionId.get(item.id);
    return visit ? formatVisitTimeRange(visit.startTime, visit.endTime) : 'Not yet scheduled';
  }
```

- [ ] **Step 4: Manual verification**

Run `npm run dev`, log in as the Field Inspector team account used in Task 9's verification, go to the "Ready for Installation Queue" tab (still reachable at the same `/ocular/ready` route — the retirement is a data/copy change, not a route change):
1. Confirm the title now reads "ASSIGNED INSTALLATIONS QUEUE" and the record assigned in Task 9 appears, with its scheduled date/time shown in place of "Audit Date."
2. Confirm no fake/demo records appear (the old `READY_INSTALLATIONS_PRESETS` entries are gone).
3. Log in as a *different* field inspector account not assigned to that record — confirm it does NOT appear for them (per-team scoping still holds).
4. Find a record still sitting at plain `READY_FOR_INSTALLATION` (not yet run through Assign for Installation) — confirm it does NOT appear anywhere in this installer's workspace, confirming the mandatory-date gate actually holds.
5. Click "Start Installation Form" on the assigned record — confirm it still opens the Installation Handover Form pre-filled, unchanged from before.

- [ ] **Step 5: Commit**

```bash
git add js/components/readyList.js
git commit -m "Retire self-serve Ready queue: installers now see only Manager-scheduled installations"
```

---

### Task 11: Manager Calendar — replace the mockup

**Files:**
- Modify: `js/components/managerWorkspace.js` (`renderCalendarTab`, plus new state/methods)
- Modify: `js/components/appLayout.js:113-116` (enable the sidebar link)

**Interfaces:**
- Consumes: `supabaseService.fetchScheduledVisits({ from, to })` (Task 4), `supabaseService.fetchAllFieldInspectors` (existing).

- [ ] **Step 1: Import `escapeHTML`**

`managerWorkspace.js` doesn't currently import it (check with `grep -n "^import" js/components/managerWorkspace.js` — confirm no `escapeHTML` import exists before adding, in case an earlier task already added one). Add after the last existing import (after line 14, `import { PendingSiteVisits } from './pendingSiteVisits.js';` — or after Task 9's `InstallationDispatch` import if Task 9 ran first):

```javascript
import { escapeHTML } from '../utils/security.js';
```

- [ ] **Step 2: Add calendar state to the constructor**

In `js/components/managerWorkspace.js`, in the constructor (after line 24, `this.fieldTeams = [];`):

```javascript
    const today = new Date();
    this.calendarYear = today.getFullYear();
    this.calendarMonth = today.getMonth(); // 0-11
    this.calendarVisits = [];
    this.calendarTeams = [];
    this.calendarTeamFilter = 'ALL';
    this.calendarTypeFilter = 'ALL';
    this.calendarLoading = false;
    this.calendarLoaded = false;
```

- [ ] **Step 3: Load calendar data the same way the QA queue does**

In the `render()` method, after the existing QA-load block (after line 81, `await this.loadQAQueue();` and its closing `}`):

```javascript
    if (this.activeTab === 'calendar' && !this.calendarLoading && !this.calendarLoaded) {
      await this.loadCalendarVisits();
    }
```

Add the loader method directly after `loadQAQueue` (after line 100):

```javascript
  async loadCalendarVisits() {
    this.calendarLoading = true;
    try {
      const from = new Date(this.calendarYear, this.calendarMonth, 1).toISOString();
      const to = new Date(this.calendarYear, this.calendarMonth + 1, 1).toISOString();
      const [visits, teams] = await Promise.all([
        supabaseService.fetchScheduledVisits({ from, to }),
        supabaseService.fetchAllFieldInspectors()
      ]);
      this.calendarVisits = visits;
      this.calendarTeams = teams;
    } catch (e) {
      console.warn('[OIMS] Could not load calendar visits:', e);
      this.calendarVisits = [];
    }
    this.calendarLoading = false;
    this.calendarLoaded = true;
    if (this.activeTab === 'calendar') this.render();
  }

  changeCalendarMonth(delta) {
    this.calendarMonth += delta;
    if (this.calendarMonth > 11) { this.calendarMonth = 0; this.calendarYear += 1; }
    if (this.calendarMonth < 0) { this.calendarMonth = 11; this.calendarYear -= 1; }
    this.calendarLoaded = false;
    this.render();
  }
```

- [ ] **Step 4: Replace the hardcoded `renderCalendarTab`**

Replace the entire existing method (lines 272-295):

```javascript
  // TAB 4: Field Calendar
  renderCalendarTab() {
    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0;">Inspector Field Visit Calendar & Dispatcher</h3>
          <span style="font-size: 0.85rem; color: var(--ecoworks-blue); font-weight: 700;">August 2026</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; text-align: center; font-size: 0.8rem; margin-bottom: 0.5rem;">
          <strong style="color: #64748b;">Mon</strong><strong style="color: #64748b;">Tue</strong><strong style="color: #64748b;">Wed</strong><strong style="color: #64748b;">Thu</strong><strong style="color: #64748b;">Fri</strong><strong style="color: #64748b;">Sat</strong><strong style="color: #64748b;">Sun</strong>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem;">
          ${Array.from({ length: 14 }).map((_, idx) => `
            <div style="padding: 0.75rem 0.5rem; min-height: 70px; background: #ffffff; border: 1px solid ${idx === 10 ? 'var(--ecoworks-blue)' : '#e2e8f0'}; border-radius: var(--radius-md); font-size: 0.75rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <span style="font-weight: 700; color: ${idx === 10 ? 'var(--ecoworks-blue)' : '#64748b'};">Aug ${idx + 1}</span>
              ${idx === 10 ? '<div style="margin-top: 0.35rem; padding: 0.2rem; background: rgba(0,174,239,0.15); border-radius: 4px; color: var(--ecoworks-blue); font-weight: 700; font-size: 0.675rem;">3 Visits Scheduled</div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
```

with:

```javascript
  // TAB 4: Field Calendar — every scheduled ocular + installation visit,
  // built from scheduled_visits via fetchScheduledVisits. See
  // docs/superpowers/specs/2026-09-17-calendar-scheduling-engine-design.md.
  renderCalendarTab() {
    if (this.calendarLoading) {
      return `
        <div class="form-card" style="text-align: center; padding: 3rem; color: #64748b;">
          Loading scheduled visits...
        </div>
      `;
    }

    const monthLabel = new Date(this.calendarYear, this.calendarMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const filteredVisits = this.calendarVisits.filter(v =>
      (this.calendarTeamFilter === 'ALL' || v.assignedTeam === this.calendarTeamFilter) &&
      (this.calendarTypeFilter === 'ALL' || v.visitType === this.calendarTypeFilter)
    );

    return `
      <div class="form-card" style="padding: 1.5rem; background: #ffffff; border-radius: var(--radius-xl); box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
          <h3 style="font-weight: 800; font-size: 1.1rem; color: #0f172a; margin: 0;">Field Operations Calendar</h3>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button type="button" class="btn btn-outline" id="btn-calendar-prev" style="padding: 0.35rem 0.65rem;">&larr;</button>
            <span style="font-size: 0.9rem; color: var(--ecoworks-blue); font-weight: 700; min-width: 140px; text-align: center;">${escapeHTML(monthLabel)}</span>
            <button type="button" class="btn btn-outline" id="btn-calendar-next" style="padding: 0.35rem 0.65rem;">&rarr;</button>
          </div>
        </div>

        <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;">
          <select class="form-select" id="calendar-team-filter" style="max-width: 220px;">
            <option value="ALL">All Teams</option>
            ${this.calendarTeams.map(t => `<option value="${escapeHTML(t.id)}" ${this.calendarTeamFilter === t.id ? 'selected' : ''}>${escapeHTML(t.full_name)}</option>`).join('')}
          </select>
          <select class="form-select" id="calendar-type-filter" style="max-width: 220px;">
            <option value="ALL">Ocular + Installation</option>
            <option value="OCULAR" ${this.calendarTypeFilter === 'OCULAR' ? 'selected' : ''}>Ocular Only</option>
            <option value="INSTALLATION" ${this.calendarTypeFilter === 'INSTALLATION' ? 'selected' : ''}>Installation Only</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem; text-align: center; font-size: 0.8rem; margin-bottom: 0.5rem;">
          <strong style="color: #64748b;">Sun</strong><strong style="color: #64748b;">Mon</strong><strong style="color: #64748b;">Tue</strong><strong style="color: #64748b;">Wed</strong><strong style="color: #64748b;">Thu</strong><strong style="color: #64748b;">Fri</strong><strong style="color: #64748b;">Sat</strong>
        </div>

        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.5rem;">
          ${this.renderCalendarCells(filteredVisits)}
        </div>
      </div>
    `;
  }

  renderCalendarCells(visits) {
    const firstOfMonth = new Date(this.calendarYear, this.calendarMonth, 1);
    const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
    const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

    const visitsByDay = new Map();
    visits.forEach(v => {
      const day = new Date(v.startTime).getDate();
      if (!visitsByDay.has(day)) visitsByDay.set(day, []);
      visitsByDay.get(day).push(v);
    });

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push(`<div></div>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dayVisits = (visitsByDay.get(day) || []).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      cells.push(`
        <div style="padding: 0.5rem; min-height: 80px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: var(--radius-md); font-size: 0.7rem; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <span style="font-weight: 700; color: #64748b;">${day}</span>
          ${dayVisits.map(v => {
            const isOcular = v.visitType === 'OCULAR';
            const bg = isOcular ? 'rgba(0,174,239,0.15)' : 'rgba(16,185,129,0.15)';
            const fg = isOcular ? 'var(--ecoworks-blue)' : '#059669';
            const time = new Date(v.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `
              <div class="calendar-visit-chip" data-id="${v.id}" style="margin-top: 0.3rem; padding: 0.2rem 0.3rem; background: ${bg}; border-radius: 4px; color: ${fg}; font-weight: 700; font-size: 0.65rem; cursor: default; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHTML(v.clientName)} (${escapeHTML(v.rnNo)})">
                ${escapeHTML(time)} &middot; ${escapeHTML(v.rnNo)}
              </div>
            `;
          }).join('')}
        </div>
      `);
    }

    return cells.join('');
  }
```

- [ ] **Step 5: Bind the new controls**

In `bindEvents()` (starting line 459), add after the existing "Approve overlay dismissal" block (after the `document.addEventListener('keydown', ...)` block that ends around line 514 — search for the next blank line/method boundary and insert there, keeping it inside `bindEvents()`):

```javascript
    // Calendar month navigation + filters
    const prevBtn = this.container.querySelector('#btn-calendar-prev');
    if (prevBtn) prevBtn.addEventListener('click', () => this.changeCalendarMonth(-1));
    const nextBtn = this.container.querySelector('#btn-calendar-next');
    if (nextBtn) nextBtn.addEventListener('click', () => this.changeCalendarMonth(1));
    const teamFilter = this.container.querySelector('#calendar-team-filter');
    if (teamFilter) {
      teamFilter.addEventListener('change', () => {
        this.calendarTeamFilter = teamFilter.value;
        this.render();
      });
    }
    const typeFilter = this.container.querySelector('#calendar-type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', () => {
        this.calendarTypeFilter = typeFilter.value;
        this.render();
      });
    }
```

- [ ] **Step 6: Enable the sidebar link**

In `js/components/appLayout.js`, replace the disabled link (lines 113-116):

```javascript
              <a class="sidebar-nav-btn disabled" title="Field Operations Calendar (Coming Soon)" aria-disabled="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Field Calendar</span>
              </a>
```

with:

```javascript
              <a href="/manager/calendar" class="sidebar-nav-btn ${isActive('/manager/calendar') ? 'active' : ''}" title="Field Operations Calendar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Field Calendar</span>
              </a>
```

- [ ] **Step 7: Manual verification**

Run `npm run dev`, log in as Manager:
1. Confirm "Field Calendar" is now a clickable (not disabled) sidebar link, and it navigates to `/manager/calendar`.
2. Confirm the calendar shows the current real month (not "August 2026") with correct weekday alignment (check that the 1st of the month lands under the right weekday).
3. Confirm the ocular visit from Task 6 and the installation visit from Task 9 both appear as chips on their correct days, in different colors (blue vs green).
4. Click the team filter and select a specific team — confirm only that team's chips remain.
5. Click the visit-type filter — confirm filtering to "Ocular Only"/"Installation Only" works.
6. Click the prev/next month arrows — confirm the month changes and a fresh fetch happens (chips disappear/reappear correctly for months with/without data).
7. Check the mobile viewport (below 700px) — confirm the 7-column grid still fits without horizontal overflow (shrink chip font-size further if it doesn't — adjust the inline `font-size: 0.65rem` on the chip if needed).

- [ ] **Step 8: Commit**

```bash
git add js/components/managerWorkspace.js js/components/appLayout.js
git commit -m "Replace the Manager Calendar mockup with a real month view of scheduled visits"
```

---

### Task 12: Ocular team read-only "Scheduled Visit" column

**Files:**
- Modify: `js/components/assignedInspectionsList.js` (whole file, 183 lines)

**Interfaces:**
- Consumes: `supabaseService.fetchScheduledVisitsForTeam` (Task 2); `formatVisitTimeRange` (Task 5).

- [ ] **Step 1: Fetch the team's scheduled visits alongside the assigned inspections**

Replace the import block (lines 7-9):

```javascript
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { escapeHTML } from '../utils/security.js';
```

with:

```javascript
import { supabaseService } from '../services/supabaseService.js';
import { AuthGuard } from './authGuard.js';
import { escapeHTML } from '../utils/security.js';
import { formatVisitTimeRange } from '../utils/scheduling.js';
```

Replace the data-loading block in `render()` (lines 26-34):

```javascript
    let items = [];
    try {
      const user = await AuthGuard.getSessionUser();
      items = (await supabaseService.fetchAssignedInspections(user?.id)) || [];
    } catch (e) {
      console.warn('[OIMS] Could not fetch assigned inspections:', e);
    }

    this.items = items;
```

with:

```javascript
    let items = [];
    this.visitByInspectionId = new Map();
    try {
      const user = await AuthGuard.getSessionUser();
      items = (await supabaseService.fetchAssignedInspections(user?.id)) || [];
      if (user?.id) {
        const visits = await supabaseService.fetchScheduledVisitsForTeam(user.id);
        visits.forEach(v => {
          if (v.visitType === 'OCULAR') this.visitByInspectionId.set(v.ocularInspectionId, v);
        });
      }
    } catch (e) {
      console.warn('[OIMS] Could not fetch assigned inspections:', e);
    }

    this.items = items;
```

- [ ] **Step 2: Add the column**

In `renderList` (starting line 75), replace the table header (lines 90-97):

```javascript
              <tr>
                <th>RN Number</th>
                <th>Client Name</th>
                <th>Address</th>
                <th>Waiting Since</th>
                <th style="text-align: right;">Actions</th>
              </tr>
```

with:

```javascript
              <tr>
                <th>RN Number</th>
                <th>Client Name</th>
                <th>Address</th>
                <th>Scheduled Visit</th>
                <th>Waiting Since</th>
                <th style="text-align: right;">Actions</th>
              </tr>
```

and the row template (lines 100-109):

```javascript
              ${items.map(item => `
                <tr>
                  <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(item.rnNo || 'N/A')}</span></td>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(item.clientName || 'Unnamed Client')}</td>
                  <td data-label="Address" style="color: #64748b;">${escapeHTML(item.locationAddress || 'No address on file')}</td>
                  <td data-label="Waiting Since" style="color: #64748b;">${escapeHTML(this.formatWaiting(item.createdAt))}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-link btn-start-inspection" data-rn="${item.rnNo || item.id}">Start Inspection</button>
                  </td>
                </tr>
              `).join('')}
```

with:

```javascript
              ${items.map(item => `
                <tr>
                  <td data-label="RN Number"><span style="font-weight: 700; color: var(--ecoworks-blue);">${escapeHTML(item.rnNo || 'N/A')}</span></td>
                  <td data-label="Client Name" style="font-weight: 600; color: #0f172a;">${escapeHTML(item.clientName || 'Unnamed Client')}</td>
                  <td data-label="Address" style="color: #64748b;">${escapeHTML(item.locationAddress || 'No address on file')}</td>
                  <td data-label="Scheduled Visit" style="color: #64748b;">${escapeHTML(this.scheduledVisitLabel(item))}</td>
                  <td data-label="Waiting Since" style="color: #64748b;">${escapeHTML(this.formatWaiting(item.createdAt))}</td>
                  <td data-label="Actions" style="text-align: right; white-space: nowrap;">
                    <button type="button" class="btn-link btn-start-inspection" data-rn="${item.rnNo || item.id}">Start Inspection</button>
                  </td>
                </tr>
              `).join('')}
```

Add the helper method directly above `formatWaiting` (before line 120):

```javascript
  scheduledVisitLabel(item) {
    const visit = this.visitByInspectionId.get(item.id);
    return visit ? formatVisitTimeRange(visit.startTime, visit.endTime) : 'Not yet scheduled';
  }

```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as the Field Inspector team assigned in Task 6's verification, go to the Assigned Inspections Queue tab:
1. Confirm a new "Scheduled Visit" column shows the date/time picked in Task 6.
2. Confirm no edit/cancel controls appear next to it (read-only, per the product decision).
3. Confirm the existing "Start Inspection" button still works unchanged.

- [ ] **Step 4: Commit**

```bash
git add js/components/assignedInspectionsList.js
git commit -m "Show scheduled visit time on the Assigned Inspections Queue"
```

---

## Final End-to-End Verification

After all 12 tasks are committed, run through the full lifecycle once, in order, as a last sanity check:

1. As Customer Care: Sales Pipeline → Assign for Inspection (with a date) → confirm it appears in Pending Site Visits with that date, and on the Manager Calendar.
2. As the assigned Field Inspector: Assigned Inspections Queue shows the scheduled date → Start Inspection → submit the ocular form.
3. As Manager: Audit QA Queue → Approve → record now appears in Assign Installations' "Ready to Assign."
4. As Manager: Assign for Installation (with a date, on a *different* team than the ocular team to confirm team reassignment works) → confirm it moves to "Awaiting Installation" and appears on the Manager Calendar in installation's color.
5. As the newly assigned Installer: their "Ready for Installation Queue" (now Assigned Installations) shows the record with its scheduled date → Start Installation Form → submit.
6. Confirm the original ocular team does NOT see this installation in their own queue (it was reassigned to a different team in step 4).
7. Try scheduling two visits for the same team with overlapping times anywhere in the flow → confirm the warning always appears and "Confirm Anyway" always works.
