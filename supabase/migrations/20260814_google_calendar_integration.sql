-- ============================================================================
-- Synx Portal — Supabase Migration: Google Calendar & System Calendar Integration
-- EcoWorks Ocular Inspections, Field Dispatches & 2-Way Calendar Sync
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. User Google OAuth Credentials Table
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

-- Indexing for quick credential lookups
CREATE INDEX IF NOT EXISTS idx_google_credentials_user ON public.user_google_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_google_credentials_email ON public.user_google_credentials(email);

-- ----------------------------------------------------------------------------
-- 2. Synx Calendar Events Table (Google Calendar 2-Way Event Mapping)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.synx_calendar_events (
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
    sync_status VARCHAR(50) DEFAULT 'SYNCED', -- 'SYNCED', 'PENDING', 'ERROR', 'CANCELLED'
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_gcal_event UNIQUE (gcal_calendar_id, gcal_event_id)
);

-- Indexing for fast calendar queries & dispatch lookups
CREATE INDEX IF NOT EXISTS idx_synx_gcal_inspection ON public.synx_calendar_events(inspection_id);
CREATE INDEX IF NOT EXISTS idx_synx_gcal_installation ON public.synx_calendar_events(installation_id);
CREATE INDEX IF NOT EXISTS idx_synx_gcal_inspector ON public.synx_calendar_events(assigned_inspector_id);
CREATE INDEX IF NOT EXISTS idx_synx_gcal_time ON public.synx_calendar_events(start_time, end_time);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_google_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synx_calendar_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS "Allow users access own google credentials" ON public.user_google_credentials;
DROP POLICY IF EXISTS "Allow read calendar events" ON public.synx_calendar_events;
DROP POLICY IF EXISTS "Allow insert calendar events" ON public.synx_calendar_events;
DROP POLICY IF EXISTS "Allow update calendar events" ON public.synx_calendar_events;
DROP POLICY IF EXISTS "Allow delete calendar events" ON public.synx_calendar_events;

-- Credentials RLS Policies (Users manage their own OAuth credentials; Admin full access)
CREATE POLICY "Allow users access own google credentials" 
ON public.user_google_credentials 
FOR ALL 
USING (auth.uid() = user_id OR public.get_user_role() = 'admin');

-- Calendar Events RLS Policies
CREATE POLICY "Allow read calendar events" 
ON public.synx_calendar_events 
FOR SELECT 
USING (true);

CREATE POLICY "Allow insert calendar events" 
ON public.synx_calendar_events 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow update calendar events" 
ON public.synx_calendar_events 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow delete calendar events" 
ON public.synx_calendar_events 
FOR DELETE 
USING (public.get_user_role() IN ('admin', 'lead_engineer', 'operations_manager'));

-- ----------------------------------------------------------------------------
-- 4. Enable Supabase Realtime Publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.synx_calendar_events;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
