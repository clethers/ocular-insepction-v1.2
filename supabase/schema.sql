-- ============================================================================
-- OIMS — Supabase Production Database Schema & Security Migration
-- EcoWorks Ocular Inspections, Manager Command Center & System Administration
-- ============================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Profiles Table (Auth & User Management Integration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'field_inspector',
    department VARCHAR(255) DEFAULT 'Operations',
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure columns exist for backwards compatibility on existing tables
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department VARCHAR(255) DEFAULT 'Operations';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, department, status, must_change_password)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'role', 'field_inspector'),
        COALESCE(NEW.raw_user_meta_data->>'department', 'Operations'),
        COALESCE(NEW.raw_user_meta_data->>'status', 'ACTIVE'),
        COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        department = EXCLUDED.department,
        status = EXCLUDED.status,
        must_change_password = EXCLUDED.must_change_password;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution binding
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Ocular Inspections Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ocular_inspections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id VARCHAR(50) NOT NULL DEFAULT '#AUD-101',
    client_name VARCHAR(255) NOT NULL,
    date_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    time_start VARCHAR(50),
    time_end VARCHAR(50),
    rn_no VARCHAR(100) UNIQUE NOT NULL,
    installation_no VARCHAR(100),
    contact_no VARCHAR(100),
    scope_of_works VARCHAR(100) DEFAULT 'Site Inspection',
    location_address TEXT,
    gps_lat NUMERIC(10, 7),
    gps_lng NUMERIC(10, 7),

    -- Technical Feeder & Specs
    voltage_system VARCHAR(50),
    voltage_specify VARCHAR(100),
    main_breaker VARCHAR(100),
    main_breaker_other VARCHAR(100),
    no_branches INT DEFAULT 0,
    spare_breaker VARCHAR(10) DEFAULT 'YES',
    space_provision VARCHAR(10) DEFAULT 'YES',
    breaker_brand VARCHAR(100),
    breaker_brand_other VARCHAR(100),
    breaker_mounting VARCHAR(50),
    breaker_mounting_other VARCHAR(100),
    breaker_design VARCHAR(50),
    breaker_design_other VARCHAR(100),
    breaker_pole VARCHAR(50),
    breaker_pole_other VARCHAR(100),
    grounding_system VARCHAR(10) DEFAULT 'YES',
    grounding_rod_location TEXT,

    -- NEMA 3R Enclosure (Dedicated Charger Breaker, If Applicable)
    nema3r_has VARCHAR(10) DEFAULT 'NO',
    nema3r_breaker VARCHAR(100),
    nema3r_brand_type VARCHAR(100),
    nema3r_brand_type_other VARCHAR(100),
    nema3r_mounting VARCHAR(50),
    nema3r_mounting_other VARCHAR(100),
    nema3r_design VARCHAR(50),
    nema3r_design_other VARCHAR(100),
    nema3r_pole VARCHAR(50),
    nema3r_pole_other VARCHAR(100),

    -- EV Charger & Conduit Specs
    charger_location TEXT,
    estimate_distance VARCHAR(50),
    pvc_qty INT DEFAULT 0,
    emt_qty INT DEFAULT 0,
    imc_qty INT DEFAULT 0,
    conduit_rsc_qty INT DEFAULT 0,
    conduit_pvc_moulding_qty INT DEFAULT 0,
    conduit_black_flexible_qty INT DEFAULT 0,
    conduit_pvc_flexible_orange_qty INT DEFAULT 0,
    conduit_other_type VARCHAR(100),
    conduit_other_qty INT DEFAULT 0,
    liquid_tight_fittings VARCHAR(10) DEFAULT 'YES',
    liquid_tight_qty INT DEFAULT 0,
    liquid_tight_connector_qty INT DEFAULT 0,
    liquid_tight_flex_length VARCHAR(50),

    -- Elbows
    elbow_emt90_qty INT DEFAULT 0,
    elbow_imc90_qty INT DEFAULT 0,
    elbow_rsc90_qty INT DEFAULT 0,

    -- Conduit Bodies
    lb_qty INT DEFAULT 0,
    lr_qty INT DEFAULT 0,
    ll_qty INT DEFAULT 0,
    body_c_qty INT DEFAULT 0,
    t_qty INT DEFAULT 0,

    -- Connectors, Couplings & Clamps
    connector_emt_set_screw_qty INT DEFAULT 0,
    connector_emt_compression_qty INT DEFAULT 0,
    coupling_emt_set_screw_qty INT DEFAULT 0,
    coupling_emt_compression_qty INT DEFAULT 0,
    clamp_c_two_hole_qty INT DEFAULT 0,
    clamp_c_one_hole_qty INT DEFAULT 0,
    clamp_strap_malleable_qty INT DEFAULT 0,

    utility_box_qty INT DEFAULT 0,
    square_box_qty INT DEFAULT 0,
    octagon_box_qty INT DEFAULT 0,
    junction_box_qty INT DEFAULT 0,
    other_boxes_notes TEXT,

    -- Retrofittings & Remarks
    retrofittings TEXT,
    replacement TEXT,
    new_installation TEXT,

    -- Signatures & Verification
    inspected_by_name VARCHAR(255),
    inspector_sig_img TEXT,
    witnessed_by_name VARCHAR(255),
    witness_sig_img TEXT,

    -- Photo Attachments (Proposed Layout, Tapping Point, Wiring/Conduit, EV Location)
    photo_attachments JSONB DEFAULT '{}'::jsonb,

    -- Record Pipeline Status
    status VARCHAR(50) DEFAULT 'READY_FOR_INSTALLATION',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Archiving (soft delete) — NULL means active/visible, a timestamp means archived
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexing for fast search queries
CREATE INDEX IF NOT EXISTS idx_ocular_rn_no ON public.ocular_inspections(rn_no);
CREATE INDEX IF NOT EXISTS idx_ocular_status ON public.ocular_inspections(status);
CREATE INDEX IF NOT EXISTS idx_ocular_client ON public.ocular_inspections(client_name);

-- ----------------------------------------------------------------------------
-- 3. Installation & Commissioning Records Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.installation_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ocular_id UUID REFERENCES public.ocular_inspections(id) ON DELETE SET NULL,
    rn_no VARCHAR(100) NOT NULL,
    installation_no VARCHAR(100) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    scope_of_works VARCHAR(100) DEFAULT 'Installation',
    date_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Commissioning Checklist & Photos (JSONB)
    commissioning_data JSONB DEFAULT '{}'::jsonb,
    photo_attachments JSONB DEFAULT '{}'::jsonb,
    
    -- Handover Signatures
    installer_name VARCHAR(255),
    installer_sig_img TEXT,
    client_rep_name VARCHAR(255),
    client_rep_sig_img TEXT,
    
    status VARCHAR(50) DEFAULT 'COMMISSIONED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installation_rn_no ON public.installation_records(rn_no);
CREATE INDEX IF NOT EXISTS idx_installation_status ON public.installation_records(status);

-- ----------------------------------------------------------------------------
-- 4. Equipment Master Data Catalog Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_data_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL, -- 'chargers', 'breakers', 'conduits', 'scopes'
    item_key VARCHAR(100) UNIQUE NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_data_category ON public.master_data_catalog(category);

-- ----------------------------------------------------------------------------
-- 5. Photo Attachments Table (Storage Integration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.photo_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    installation_id UUID REFERENCES public.installation_records(id) ON DELETE CASCADE,
    photo_category VARCHAR(50) NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. System & Security Audit Logs Table (Immutable Event Logging)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'AUTHENTICATION', 'FORM_INSPECTION', 'MANAGER_APPROVAL', 'FIELD_DISPATCH', 'CUSTOMER_CARE', 'ADMIN_RBAC'
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'INFO', -- 'INFO', 'WARNING', 'CRITICAL'
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    description TEXT NOT NULL,
    changes_delta JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_category ON public.system_audit_logs(category);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.system_audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON public.system_audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON public.system_audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. Enable Row Level Security (RLS) & Role Access Control (RBAC)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocular_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to fetch current authenticated user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid();
    RETURN COALESCE(user_role, 'field_inspector');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles Policies
CREATE POLICY "Allow users read inspector profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Allow admin manage all profiles" ON public.profiles FOR ALL USING (public.get_user_role() = 'admin');

-- Self-update is scoped to a person's own row, with role/status/email
-- changes blocked for non-admins via a trigger (see
-- prevent_self_privilege_escalation below) rather than relying on RLS alone.
CREATE POLICY "Allow users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF public.get_user_role() <> 'admin' THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.status IS DISTINCT FROM OLD.status
           OR NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Not authorized to change role, status, or email on your own profile.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_prevent_self_privilege_escalation ON public.profiles;
CREATE TRIGGER trigger_prevent_self_privilege_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- Ocular Inspections Policies
CREATE POLICY "Allow read ocular inspections" ON public.ocular_inspections FOR SELECT USING (true);
CREATE POLICY "Allow insert ocular inspections" ON public.ocular_inspections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update ocular inspections" ON public.ocular_inspections FOR UPDATE USING (true);
CREATE POLICY "Allow delete ocular inspections for admin" ON public.ocular_inspections FOR DELETE USING (public.get_user_role() IN ('admin', 'lead_engineer'));

-- Installation Records Policies
CREATE POLICY "Allow read installation records" ON public.installation_records FOR SELECT USING (true);
CREATE POLICY "Allow insert installation records" ON public.installation_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update installation records" ON public.installation_records FOR UPDATE USING (true);
CREATE POLICY "Allow delete installation records for admin" ON public.installation_records FOR DELETE USING (public.get_user_role() IN ('admin', 'lead_engineer'));

-- Master Data Catalog Policies
CREATE POLICY "Allow read master data catalog" ON public.master_data_catalog FOR SELECT USING (true);
CREATE POLICY "Allow admin manage master data catalog" ON public.master_data_catalog FOR ALL USING (public.get_user_role() IN ('admin', 'lead_engineer'));

-- Photo Attachments Policies
CREATE POLICY "Allow read photo attachments" ON public.photo_attachments FOR SELECT USING (true);
CREATE POLICY "Allow insert photo attachments" ON public.photo_attachments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update photo attachments" ON public.photo_attachments FOR UPDATE USING (true);

-- System Audit Logs Policies
CREATE POLICY "Allow read audit logs for authenticated users" ON public.system_audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow insert audit logs for all authenticated users" ON public.system_audit_logs FOR INSERT WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 8. Supabase Storage Bucket Security Policies (`inspection-photos`)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('inspection-photos', 'inspection-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow field tech upload inspection photos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'inspection-photos');

CREATE POLICY "Allow public read inspection photos" ON storage.objects
FOR SELECT USING (bucket_id = 'inspection-photos');

-- ----------------------------------------------------------------------------
-- 9. Enable Supabase Realtime Publication
-- ----------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.ocular_inspections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.installation_records;

-- ----------------------------------------------------------------------------
-- 10. Audit Logging Triggers
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ocular_inspection_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.system_audit_logs (
            actor_id,
            actor_email,
            actor_role,
            category,
            event_type,
            severity,
            resource_type,
            resource_id,
            description,
            changes_delta
        ) VALUES (
            auth.uid(),
            COALESCE(auth.jwt()->>'email', 'system@ecoworks.ph'),
            public.get_user_role(),
            'FORM_INSPECTION',
            'OCULAR_RECORD_UPDATED',
            'INFO',
            'ocular_inspections',
            NEW.rn_no,
            'Ocular inspection record ' || NEW.rn_no || ' updated status to ' || NEW.status,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'client_name', NEW.client_name
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_ocular_audit_log ON public.ocular_inspections;
CREATE TRIGGER trigger_ocular_audit_log
    AFTER UPDATE ON public.ocular_inspections
    FOR EACH ROW EXECUTE FUNCTION public.log_ocular_inspection_changes();

-- ----------------------------------------------------------------------------
-- 11. Google Calendar Integration Tables (OAuth Credentials & Event Mappings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_google_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    scope TEXT,
    token_expiry TIMESTAMP WITH TIME ZONE NOT NULL,
    calendar_id VARCHAR(255) DEFAULT 'primary',
    is_sync_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_google_account UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_credentials_user ON public.user_google_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_google_credentials_email ON public.user_google_credentials(email);

CREATE TABLE IF NOT EXISTS public.oims_calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inspection_id UUID REFERENCES public.ocular_inspections(id) ON DELETE CASCADE,
    installation_id UUID REFERENCES public.installation_records(id) ON DELETE CASCADE,
    assigned_inspector_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    gcal_event_id VARCHAR(255) NOT NULL,
    gcal_calendar_id VARCHAR(255) DEFAULT 'primary',
    event_title VARCHAR(255) NOT NULL,
    event_description TEXT,
    event_location TEXT,
    google_maps_url TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    html_link TEXT,
    sync_status VARCHAR(50) DEFAULT 'SYNCED',
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_gcal_event UNIQUE (gcal_calendar_id, gcal_event_id)
);

CREATE INDEX IF NOT EXISTS idx_oims_gcal_inspection ON public.oims_calendar_events(inspection_id);
CREATE INDEX IF NOT EXISTS idx_oims_gcal_installation ON public.oims_calendar_events(installation_id);
CREATE INDEX IF NOT EXISTS idx_oims_gcal_inspector ON public.oims_calendar_events(assigned_inspector_id);
CREATE INDEX IF NOT EXISTS idx_oims_gcal_time ON public.oims_calendar_events(start_time, end_time);

ALTER TABLE public.user_google_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oims_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users access own google credentials" ON public.user_google_credentials;
DROP POLICY IF EXISTS "Allow read calendar events" ON public.oims_calendar_events;
DROP POLICY IF EXISTS "Allow insert calendar events" ON public.oims_calendar_events;
DROP POLICY IF EXISTS "Allow update calendar events" ON public.oims_calendar_events;
DROP POLICY IF EXISTS "Allow delete calendar events" ON public.oims_calendar_events;

CREATE POLICY "Allow users access own google credentials" 
ON public.user_google_credentials FOR ALL 
USING (auth.uid() = user_id OR public.get_user_role() = 'admin');

CREATE POLICY "Allow read calendar events" 
ON public.oims_calendar_events FOR SELECT USING (true);

CREATE POLICY "Allow insert calendar events" 
ON public.oims_calendar_events FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update calendar events" 
ON public.oims_calendar_events FOR UPDATE USING (true);

CREATE POLICY "Allow delete calendar events" 
ON public.oims_calendar_events FOR DELETE 
USING (public.get_user_role() IN ('admin', 'lead_engineer', 'operations_manager'));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.oims_calendar_events;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
