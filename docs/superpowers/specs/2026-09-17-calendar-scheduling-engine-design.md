# Calendar Scheduling Engine — Design

## Problem

OIMS routes leads through two field-visit stages — an ocular inspection,
then an installation — but neither stage has a real *date*. `Assign for
Inspection` (Sales Pipeline) only picks a team (`assigned_team`); an
installer just self-serves any `READY_FOR_INSTALLATION` record by typing
its RN into the installation form, with no assignment step at all. The
`date_time` columns on `ocular_inspections`/`installation_records` are
execution timestamps stamped when a form is filled out, not future
schedule dates.

The Manager Workspace's "Calendar" tab is a static, hardcoded mockup (a
fixed "August 2026" grid, one fake highlighted day) with no real data
behind it, and its sidebar link is `disabled`/"Coming Soon." A prior
migration (`20260814_google_calendar_integration.sql`, now
`oims_calendar_events` in `schema.sql`) scaffolds 2-way Google Calendar
sync, but no application code uses it, and its `gcal_event_id NOT NULL`
constraint makes it unusable without a real Google event — it isn't
reachable from this design.

## Goals

- A real date + time slot on both the ocular-inspection assignment flow
  and a new installation assignment flow, mandatory at assignment time.
- A new, symmetric "Assign for Installation" flow — team + schedule —
  since none exists today; installers currently have no assigned queue.
- A real Manager Workspace Calendar showing every scheduled visit
  (ocular + installation), replacing the hardcoded mockup.
- A read-only per-team calendar/agenda view for Field Inspectors and
  Installers, scoped to their own scheduled visits.
- Soft double-booking detection: warn when a team already has an
  overlapping visit, but allow the scheduler to confirm anyway.

## Consequence: retiring the installer's self-serve Ready queue

`readyList.js` (the "Ready for Installation Queue" inspector tab) already
shows every `READY_FOR_INSTALLATION` row carrying the viewer's own
`assigned_team` — inherited automatically from the ocular stage, no
Manager action involved — and lets an installer jump straight into the
install form. Left as-is, this bypasses the new mandatory-date
requirement entirely: nothing stops an installer from self-serving a
record the Manager hasn't scheduled yet.

So this design **retires** that self-serve path: `readyList.js`'s query
changes from `status = 'READY_FOR_INSTALLATION'` to `status =
'ASSIGNED_PENDING_INSTALLATION'`, and it now displays the scheduled
date/time (effectively becoming the installer's "Assigned Installations"
queue, the install-side twin of `assignedInspectionsList.js`). An
installer can no longer start an installation until a Manager has run it
through Assign for Installation.

## Non-goals

- No Google Calendar sync (OAuth, event creation, webhooks). This design
  is internal-only; `user_google_credentials`/`oims_calendar_events`
  stay untouched and unused. A later phase can project `scheduled_visits`
  rows into `oims_calendar_events` once that's built.
- No reschedule history/audit trail beyond the existing audit log —
  rescheduling overwrites the one active row for that visit rather than
  keeping prior versions.
- No changes to the existing hardcoded "Workload & Dispatch" tab
  (`renderDispatchTab`) — it's a separate, already-mocked piece of UI not
  touched by this feature.
- No self-scheduling by teams — per product decision, Field
  Inspectors/Installers only *view* their assigned visits; all
  scheduling actions stay on the Manager/Customer Care side.
- No hard blocking on conflicts — double-booking is a warning, not a
  validation error.

## Data model

New file `supabase/migrations/2026-09-17-scheduled-visits.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.scheduled_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 'OCULAR' | 'INSTALLATION'
    visit_type VARCHAR(20) NOT NULL CHECK (visit_type IN ('OCULAR', 'INSTALLATION')),

    -- Always the ocular_inspections row, even for an INSTALLATION visit:
    -- no installation_records row exists yet at scheduling time (it's
    -- only created when the installer submits the form).
    ocular_inspection_id UUID NOT NULL REFERENCES public.ocular_inspections(id) ON DELETE CASCADE,

    assigned_team UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),

    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CANCELLED')),

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- At most one active scheduled visit per job per stage — rescheduling
-- is an UPDATE of this row, not a new insert.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_visit_per_job
    ON public.scheduled_visits(ocular_inspection_id, visit_type)
    WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_scheduled_visits_team_time
    ON public.scheduled_visits(assigned_team, start_time, end_time)
    WHERE status = 'SCHEDULED';
CREATE INDEX IF NOT EXISTS idx_scheduled_visits_range
    ON public.scheduled_visits(start_time, end_time);

ALTER TABLE public.scheduled_visits ENABLE ROW LEVEL SECURITY;

-- Table-level RLS stays permissive; access control is enforced in the
-- app layer (route gating + read-only rendering for team roles), same
-- convention as sales_leads/support_tickets.
CREATE POLICY "Allow read scheduled visits" ON public.scheduled_visits FOR SELECT USING (true);
CREATE POLICY "Allow insert scheduled visits" ON public.scheduled_visits FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update scheduled visits" ON public.scheduled_visits FOR UPDATE USING (true);
```

`ocular_inspections` gets one new status value used only by the
installation flow: `ASSIGNED_PENDING_INSTALLATION`, inserted between
`READY_FOR_INSTALLATION` and the eventual `installation_records` row. No
schema change needed for this — `status` is already a free `VARCHAR(50)`.

### Conflict check

A plain overlap query, run before confirming a schedule (and excluding
the row being rescheduled, if any):

```sql
SELECT id FROM public.scheduled_visits
WHERE assigned_team = $1
  AND status = 'SCHEDULED'
  AND id != COALESCE($4, '00000000-0000-0000-0000-000000000000')
  AND start_time < $3  -- new end_time
  AND end_time > $2;   -- new start_time
```

Any row returned means "this team already has a visit that overlaps" —
surfaced as a warning banner, not a blocker.

## Status flow (new segment)

```
Lead → ASSIGNED_PENDING_INSPECTION  (scheduled_visits: OCULAR)
     → PENDING_QA → READY_FOR_INSTALLATION
     → ASSIGNED_PENDING_INSTALLATION  (scheduled_visits: INSTALLATION)   ← new
     → (installer submits) → installation_records row created (status COMMISSIONED)
```

`ocular_inspections.status` is not touched again after the installer
submits — same as today; `installation_records` remains the source of
truth for "actually installed."

## UI

### 1. Assign for Inspection (extend existing)

`js/components/salesPipeline.js` — `renderAssignInspectionContent` /
`confirmAssignInspection` (around line 895–1022) gain a required
scheduling section between the team `<select>` and the modal footer:

```html
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
<div id="assign-visit-conflict-warning" class="form-warning" style="display: none;"></div>
```

`confirmAssignInspection` gains, right before `createStubInspection`:
1. Validate the start field is filled (block submit with a toast if not
   — same pattern as the existing "Select a team" / "Enter an RN
   Number" checks).
2. Compute `end_time = start + duration`.
3. Call `supabaseService.checkVisitConflict(assignedTeam, start, end)`.
   If it returns a hit and this is the first submit attempt, render the
   warning banner and change the Confirm button to "Confirm Anyway" —
   require a second click to proceed (this mirrors no existing pattern
   exactly, but is the simplest honest implementation of "warn but
   allow": the user must consciously acknowledge the specific warning
   text before it proceeds).
4. On confirm: `createStubInspection` (as today) returns the new
   inspection's id, then `supabaseService.scheduleVisit({ visitType:
   'OCULAR', ocularInspectionId, assignedTeam, startTime, endTime,
   createdBy })`.
5. Audit log: new event type `OCULAR_VISIT_SCHEDULED` under the existing
   `AUDIT_CATEGORIES.CLIENT_RECORDS`.

### 2. Assign for Installation (new)

New component `js/components/installationDispatch.js`, mirroring
`pendingSiteVisits.js`'s structure but combining two sections in one
panel (there's no separate "origin" screen for installations the way
Sales Pipeline is for inspections):

- **Ready to Assign** — every `ocular_inspections` row with
  `status = 'READY_FOR_INSTALLATION'`. Each row gets an "Assign for
  Installation" button opening a modal identical in shape to Assign for
  Inspection's (team picker via `fetchAllFieldInspectors`, required
  `datetime-local` start, duration select — default 4 hours instead of
  1 — conflict check, warn-but-allow).
  Confirm calls `supabaseService.assignForInstallation({
  ocularInspectionId, assignedTeam, startTime, endTime, createdBy })`,
  which updates `ocular_inspections.status = 'ASSIGNED_PENDING_INSTALLATION'`
  and inserts the `scheduled_visits` row (mirrors
  `createStubInspection` + `scheduleVisit`, just against an existing row
  instead of creating a stub). Audit event `INSTALLATION_VISIT_SCHEDULED`.
- **Awaiting Installation** — every row with
  `status = 'ASSIGNED_PENDING_INSTALLATION'`, read-only, showing team +
  scheduled date/time (mirrors `pendingSiteVisits.js`'s existing
  read-only list exactly).

New Manager Workspace tab `activeTab === 'installdispatch'`, new sidebar
entry "Assign Installations" in `appLayout.js`, placed next to
"Pending Site Visits" — same role gate as the rest of that nav section
(`isManager`).

### 3. Manager Workspace Calendar (replace mockup)

`managerWorkspace.js`'s `renderCalendarTab` (currently hardcoded, lines
272–295) becomes real: a month grid built from
`supabaseService.fetchScheduledVisits({ from, to })`, joined in-memory
to `ocular_inspections` (client name, RN, address) for labels. Each day
cell shows a compact chip per visit — time, RN, client, color-coded by
`visit_type` (e.g. blue for OCULAR, green for INSTALLATION). Controls:
month navigation (prev/next), a team filter, and a visit-type filter.
Clicking a chip opens the relevant record's existing detail view
(`ClientDirectory`'s client detail for OCULAR, `InstallationsDirectory`-
style lookup for INSTALLATION once installed, or just the schedule
details if not yet installed).

The sidebar's disabled "Field Calendar (Coming Soon)" link
(`appLayout.js` line 113) becomes a real link to `/manager/calendar`
(the route/tab plumbing already exists — `router.js` already labels it
"Field Operations Calendar" and `managerWorkspace.js` already switches
on `activeTab === 'calendar'`; only the disabled markup and the render
body change).

### 4. Reschedule (Manager only)

Postponed visits are routine, so both Manager-side visibility lists gain
a lightweight "Reschedule" action (not exposed to teams — consistent
with "teams view only"):

- `pendingSiteVisits.js` — a "Reschedule" link per row, next to the
  existing status badge. Opens the same modal shape as Assign for
  Inspection (team + start + duration + conflict check), pre-filled
  with the visit's current values.
- The "Awaiting Installation" section of `installationDispatch.js` —
  same "Reschedule" link/modal, pre-filled from that visit's row.

Both call `supabaseService.rescheduleVisit(visitId, { assignedTeam,
startTime, endTime })` — an `UPDATE` of the existing `scheduled_visits`
row (not a new insert; the partial unique index means there's only ever
one active row per job/stage to update). The conflict check passes this
visit's own id as `excludeVisitId` so it doesn't flag itself. Audit
event `OCULAR_VISIT_RESCHEDULED` / `INSTALLATION_VISIT_RESCHEDULED`.

No cancellation UI in this phase (`status = 'CANCELLED'` exists in the
schema for future use, but nothing sets it yet) — reassigning to a new
date/team via Reschedule is the only supported change.

### 5. Team-side read-only view

Rather than a separate new widget, the scheduled date/time is surfaced
directly on the two queues a team already checks — smaller, more
discoverable, and consistent with "follow existing patterns":

- `assignedInspectionsList.js` (`ASSIGNED_PENDING_INSPECTION` queue) — a
  new "Scheduled Visit" column showing the visit's `start_time` (falls
  back to "Not yet scheduled" if somehow absent, though it's mandatory
  going forward).
- `readyList.js` — per the retirement above, now queries
  `ASSIGNED_PENDING_INSTALLATION` instead of `READY_FOR_INSTALLATION`
  and gains the same "Scheduled Visit" column.

Both stay read-only for teams — no edit/cancel controls, consistent
with the "view only" product decision. Both use a new
`fetchScheduledVisitsForTeam(teamId)` service method (returning
`SCHEDULED` visits for that team, keyed by `ocular_inspection_id`) to
look up the date/time to display alongside each row.

## Service layer

New methods on `js/services/supabaseService.js`, following the existing
method shapes (`createStubInspection`, `fetchAllAssignedInspections`,
etc.):

- `scheduleVisit({ visitType, ocularInspectionId, assignedTeam,
  startTime, endTime, createdBy })` — inserts a `scheduled_visits` row.
  Used both by Assign for Inspection and (indirectly, via
  `assignForInstallation`) installation assignment.
- `checkVisitConflict(assignedTeam, startTime, endTime, excludeVisitId =
  null)` — the overlap query above; returns the conflicting row (or
  `null`).
- `assignForInstallation({ ocularInspectionId, assignedTeam, startTime,
  endTime, createdBy })` — updates `ocular_inspections.status` to
  `ASSIGNED_PENDING_INSTALLATION` and calls `scheduleVisit` with
  `visitType: 'INSTALLATION'`.
- `fetchReadyForInstallation()` — `ocular_inspections` where `status =
  'READY_FOR_INSTALLATION'` (for the new "Ready to Assign" list).
- `fetchAssignedInstallations()` — `ocular_inspections` where `status =
  'ASSIGNED_PENDING_INSTALLATION'`, joined to their `scheduled_visits`
  row (for the "Awaiting Installation" list).
- `fetchScheduledVisits({ from, to })` — all `SCHEDULED` visits with
  `start_time` in range, for the Manager Calendar.
- `fetchScheduledVisitsForTeam(teamId)` — upcoming `SCHEDULED` visits
  for one team, for the team-side agenda.
- `rescheduleVisit(visitId, { assignedTeam, startTime, endTime })` —
  updates an existing `scheduled_visits` row in place.

Each schedule/reschedule action logs through the existing
`auditLogService` under `AUDIT_CATEGORIES.CLIENT_RECORDS`, matching
`SALES_LEAD_ASSIGNED_FOR_INSPECTION`'s existing convention.

## Testing

- Manual UI pass (per this project's UI-verification convention): assign
  an ocular visit and confirm the date is mandatory (can't submit
  blank); assign a second visit for the same team overlapping the
  first and confirm the warning appears and "Confirm Anyway" is needed;
  assign an installation from "Ready to Assign" and confirm it moves to
  "Awaiting Installation" with the right date/time; confirm the Manager
  Calendar renders both visit types in the right day cells; log in as
  the assigned team and confirm the "Scheduled Visit" column shows on
  both their queues, read-only (no edit/cancel controls rendered); log
  in as an installer and confirm a `READY_FOR_INSTALLATION` record
  no longer appears anywhere in their workspace until a Manager has run
  it through Assign for Installation.
- Mobile viewport check for the calendar grid and the new modals' date
  pickers, matching the app's existing responsive pattern.
