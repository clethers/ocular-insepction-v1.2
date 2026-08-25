-- Adds the ocular_inspections columns needed so a manager's/admin's printed
-- certificate is fully populated regardless of which device/inspector
-- created the record, plus a soft-delete marker for the Admin archive
-- feature. Additive only — safe to run against an existing database.
-- See docs/superpowers/specs/2026-08-25-manager-client-directory-design.md.

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
  ADD COLUMN IF NOT EXISTS clamp_strap_malleable_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
