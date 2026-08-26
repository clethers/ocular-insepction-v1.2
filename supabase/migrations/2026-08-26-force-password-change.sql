-- Adds a flag so admin-created accounts (issued a temp password directly,
-- not via self-serve signup) can be forced to set their own password before
-- reaching any page. Existing/self-serve accounts default to false.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- Backfill: the 9 accounts enrolled 2026-08-26 with generated temp passwords.
UPDATE public.profiles SET must_change_password = true
WHERE email IN (
  'accounting@ecoworksph.com',
  'albertcledera@ecoworksph.com',
  'customercare@ecoworksph.com',
  'engineer@ecoworksph.com',
  'inspectorteam@ecoworksph.com',
  'markcledera@ecoworksph.com',
  'nicolecledera@ecoworksph.com',
  'operationsteam1@ecoworksph.com',
  'operationsteam2@ecoworksph.com'
);

-- Let future admin-created accounts opt into the same gate via
-- raw_user_meta_data.must_change_password at creation time.
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

-- "Allow users update own profile" was deliberately dropped in an earlier
-- security review (self-update let a user set their own role to 'admin').
-- Restore self-update, but only for a person's own row, and guard the
-- privileged columns (role/status/email) with a trigger instead of relying
-- on RLS alone — needed so a non-admin account can clear its own
-- must_change_password flag after setting a new password.
DROP POLICY IF EXISTS "Allow users update own profile" ON public.profiles;
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
