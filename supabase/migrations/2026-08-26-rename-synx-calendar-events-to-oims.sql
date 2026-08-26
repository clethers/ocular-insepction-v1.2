-- OIMS — Migration: Rename legacy synx_calendar_events table/indexes to oims_calendar_events
-- Product rebrand from Synx to OIMS (Ocular Inspection Management System). RLS policies,
-- constraints, and the supabase_realtime publication membership stay attached automatically
-- since Postgres ties them to the table's OID, not its name.

ALTER TABLE IF EXISTS public.synx_calendar_events RENAME TO oims_calendar_events;

ALTER INDEX IF EXISTS idx_synx_gcal_inspection RENAME TO idx_oims_gcal_inspection;
ALTER INDEX IF EXISTS idx_synx_gcal_installation RENAME TO idx_oims_gcal_installation;
ALTER INDEX IF EXISTS idx_synx_gcal_inspector RENAME TO idx_oims_gcal_inspector;
ALTER INDEX IF EXISTS idx_synx_gcal_time RENAME TO idx_oims_gcal_time;
