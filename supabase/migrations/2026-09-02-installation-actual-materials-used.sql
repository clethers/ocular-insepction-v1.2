-- Tracks materials actually consumed during installation, separate from the
-- ocular inspection's planned/estimated quantities. Internal inventory use
-- only — deliberately never surfaced in the client-facing handover summary
-- or printed certificate. Mirrors ocular_inspections' own material columns
-- with an actual_ prefix, but lives on installation_records since that's
-- the record this data actually describes. Additive only — safe to run
-- against an existing database.

ALTER TABLE public.installation_records
  ADD COLUMN IF NOT EXISTS actual_pvc_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_emt_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_imc_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_conduit_rsc_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_conduit_pvc_moulding_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_conduit_black_flexible_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_conduit_pvc_flexible_orange_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_conduit_other_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS actual_conduit_other_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_liquid_tight_connector_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_liquid_tight_flex_length VARCHAR(50),
  ADD COLUMN IF NOT EXISTS actual_elbow_emt90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_elbow_imc90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_elbow_rsc90_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_lb_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_lr_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_ll_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_body_c_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_t_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_connector_emt_set_screw_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_connector_emt_compression_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_coupling_emt_set_screw_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_coupling_emt_compression_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_clamp_c_two_hole_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_clamp_c_one_hole_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_clamp_strap_malleable_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_utility_box_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_square_box_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_octagon_box_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_junction_box_qty INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_other_boxes_notes TEXT;
