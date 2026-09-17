-- ============================================================================
-- Wipe all Audit Queue, Installations, and Support Ticket data from the
-- live OIMS Supabase project
-- ============================================================================
-- WARNING: This runs directly against the LIVE production database
-- (the one configured in .env via VITE_SUPABASE_URL). Run it manually, once,
-- in the Supabase SQL editor -- not as part of any automated pipeline.
--
-- Scope, confirmed unconditional (every row, real or demo, is removed --
-- there is no filtering below):
--   - public.ocular_inspections     (the Audit Queue)
--   - public.installation_records   (Installations)
--   - public.support_tickets        (Support Tickets)
--
-- Client Lookup is NOT a separate table -- js/components/clientDirectory.js
-- derives it from ocular_inspections + installation_records, so wiping those
-- two clears Client Lookup too; nothing extra to run for it.
--
-- CASCADE fallout (also erased, since they only exist to describe rows in
-- the tables above -- this is expected, not a side effect to avoid):
--   - public.photo_attachments   (installation_id -> installation_records)
--
-- NOTE: public.oims_calendar_events (Google Calendar sync) does not exist
-- in this project's database -- the migration that creates it
-- (20260814_google_calendar_integration.sql) was never applied here, so
-- there is nothing to cascade there. Confirmed by the "relation does not
-- exist" error when this script first tried to verify it.
--
-- DO NOT touch public.sales_leads: that table holds ~306 REAL customer
-- records imported from Customer Care's spreadsheet (see
-- scripts/import_sales_leads.py). It is out of scope for this wipe and is
-- not referenced below.
--
-- NOT covered (run separately if you also want these gone):
--   - Files in the `inspection-photos` Storage bucket -- deleting the
--     photo_attachments rows above does not delete the underlying files.
--     See the query at the bottom of this script to find them.
--   - public.profiles / auth.users (login accounts) -- untouched.
-- ============================================================================

BEGIN;

TRUNCATE TABLE
    public.installation_records,
    public.ocular_inspections,
    public.support_tickets
CASCADE;

-- Verify before committing -- all four counts (including the cascaded
-- photo_attachments table) should read 0.
SELECT
    (SELECT count(*) FROM public.ocular_inspections)  AS ocular_inspections,
    (SELECT count(*) FROM public.installation_records) AS installation_records,
    (SELECT count(*) FROM public.support_tickets)      AS support_tickets,
    (SELECT count(*) FROM public.photo_attachments)    AS photo_attachments;

COMMIT;


-- ----------------------------------------------------------------------------
-- OPTIONAL, run after COMMIT: list files left behind in the
-- inspection-photos Storage bucket now that photo_attachments is empty.
-- TRUNCATE does not touch Storage -- delete these separately (Supabase
-- dashboard -> Storage, or the Storage API) if you want them gone too.
-- ----------------------------------------------------------------------------
-- SELECT name FROM storage.objects WHERE bucket_id = 'inspection-photos';
