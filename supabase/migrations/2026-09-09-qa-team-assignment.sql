-- Adds an inspection-team assignment field to the Audit QA Queue, so
-- Customer Care can route each pending item to Inspection Team 1 or 2.
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(50);
