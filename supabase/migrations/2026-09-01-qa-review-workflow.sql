-- Makes Customer Care's QA review a real gate: an inspector's submission
-- now lands as PENDING_QA (not READY_FOR_INSTALLATION), and only advances
-- once a customer_care_manager/lead_engineer/admin approves it. Rejecting
-- sets RE_INSPECTION_REQUESTED with a reason stored on the row itself so
-- the inspector sees it in their own history, not buried in the audit log.
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS qa_notes TEXT;
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS qa_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ocular_inspections ADD COLUMN IF NOT EXISTS qa_reviewed_at TIMESTAMPTZ;

ALTER TABLE public.ocular_inspections ALTER COLUMN status SET DEFAULT 'PENDING_QA';

CREATE INDEX IF NOT EXISTS idx_ocular_created_by ON public.ocular_inspections(created_by);

-- Existing rows already sitting in READY_FOR_INSTALLATION predate this gate
-- and were implicitly already "reviewed" under the old flow — leave them as
-- READY_FOR_INSTALLATION rather than retroactively sending them to QA.
