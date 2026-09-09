-- Adds the Support Tickets table for Customer Care escalations logged from
-- the Manager Workspace's Support Tickets tab. rn_no is a plain text field,
-- not a formal FK to ocular_inspections — same convention as assigned_team
-- in migrations/2026-09-09-qa-team-assignment.sql — since a ticket may not
-- always relate to a specific inspection record.
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name TEXT,
    rn_no TEXT,
    subject TEXT NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'NORMAL', -- 'HIGH', 'NORMAL', 'LOW'
    status VARCHAR(20) DEFAULT 'OPEN', -- 'OPEN', 'RESOLVED'
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON public.support_tickets(created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read support tickets" ON public.support_tickets FOR SELECT USING (true);
CREATE POLICY "Allow insert support tickets" ON public.support_tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update support tickets" ON public.support_tickets FOR UPDATE USING (true);
