CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Traceability back to the source spreadsheet row (e.g. "INSTCOM_1393748").
    -- NULL for leads created directly in OIMS. Unique-when-present so the
    -- one-time historical import can upsert and be safely re-run.
    legacy_row_id VARCHAR(100) UNIQUE,

    first_name VARCHAR(150),
    last_name VARCHAR(150),
    contact_no VARCHAR(50),
    email VARCHAR(255),
    installation_address TEXT,
    mode_of_communication VARCHAR(100),

    -- Join key to ocular_inspections.rn_no for the 360 view. Nullable: a
    -- lead may not have an RN yet (e.g. still at Initial Contact).
    rn_no VARCHAR(100) UNIQUE,

    -- Fixed, closed set. CANCELED is terminal and reachable from any prior
    -- stage.
    stage VARCHAR(30) NOT NULL DEFAULT 'INITIAL_CONTACT'
        CHECK (stage IN (
            'INITIAL_CONTACT', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED',
            'QUOTE_SENT', 'QUOTE_ACCEPTED', 'INSTALLATION_SCHEDULED',
            'INSTALLATION_COMPLETE', 'JOB_CHECKOUT_COMPLETE', 'CANCELED'
        )),

    -- Stamped the first time a lead reaches each stage. Kept even if the
    -- lead is later CANCELED, so "how far did this get before it fell
    -- through" is never lost.
    stage_initial_contact_at TIMESTAMPTZ,
    stage_site_visit_scheduled_at TIMESTAMPTZ,
    stage_site_visit_completed_at TIMESTAMPTZ,
    stage_quote_sent_at TIMESTAMPTZ,
    stage_quote_accepted_at TIMESTAMPTZ,
    stage_installation_scheduled_at TIMESTAMPTZ,
    stage_installation_complete_at TIMESTAMPTZ,
    stage_job_checkout_complete_at TIMESTAMPTZ,

    remarks TEXT, -- free text; carries the source sheet's Drive folder links

    -- The original, un-normalized status string from the source row (or
    -- manual entry), kept for audit purposes even after stage normalization.
    source_status_raw TEXT,

    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_rn_no ON public.sales_leads(rn_no);
CREATE INDEX IF NOT EXISTS idx_sales_leads_stage ON public.sales_leads(stage);
CREATE INDEX IF NOT EXISTS idx_sales_leads_created_at ON public.sales_leads(created_at DESC);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read sales leads" ON public.sales_leads FOR SELECT USING (true);
CREATE POLICY "Allow insert sales leads" ON public.sales_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update sales leads" ON public.sales_leads FOR UPDATE USING (true);
