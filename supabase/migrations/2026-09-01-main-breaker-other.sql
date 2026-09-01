-- Main Breaker (Please Specify) became a dropdown-with-"Other" field to
-- match the other breaker spec fields (brand/mounting/design/pole), so it
-- needs the same *_other companion column to hold the free-text value.
-- Additive only — safe to run against an existing database.

ALTER TABLE public.ocular_inspections
  ADD COLUMN IF NOT EXISTS main_breaker_other VARCHAR(100);
