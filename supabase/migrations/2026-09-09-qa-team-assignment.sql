-- Adds an inspection-team assignment field to the Audit QA Queue, so
-- Customer Care can route each pending item to a field team. Stores the
-- profiles.id (UUID) of the "Operations Team 1/2" login accounts —
-- those are real accounts, not a separate roster, so this is a plain FK
-- by convention rather than a formal REFERENCES constraint.
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS assigned_team VARCHAR(50);
