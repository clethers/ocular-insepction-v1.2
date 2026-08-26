// OIMS — Admin User Actions Edge Function
//
// Handles the two privileged user-management operations that the Supabase
// Auth Admin API requires a service-role key for, which the browser client
// (anon/publishable key) can never safely hold:
//   - reset_password: set a new temp password on an existing account and
//     flag it for a forced change on next login.
//   - create_user: provision a brand-new account with a temp password.
//     public.profiles is populated by the existing handle_new_user() DB
//     trigger from the user_metadata passed to admin.createUser(), so this
//     function does not touch the profiles table directly for creation.
//
// Every request is re-authorized here regardless of what the frontend
// already checked client-side: the caller's JWT is verified, then their
// own profiles.role is looked up and required to be 'admin' before any
// admin.* call is made. Never trust a role claim from the request body.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const VALID_ROLES = ['field_inspector', 'customer_care_manager', 'lead_engineer', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

// Cryptographically random temp password: 14 chars, guaranteed at least one
// of each character class so it always satisfies the app's own strength UI.
function generateTempPassword(): string {
  const LOWER = 'abcdefghjkmnpqrstuvwxyz';
  const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const DIGITS = '23456789';
  const SYMBOLS = '!@#$%^&*-_=+';
  const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
  const LENGTH = 14;

  const randomChar = (charset: string) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return charset[bytes[0] % charset.length];
  };

  const required = [randomChar(LOWER), randomChar(UPPER), randomChar(DIGITS), randomChar(SYMBOLS)];
  const rest = Array.from({ length: LENGTH - required.length }, () => randomChar(ALL));
  const chars = [...required, ...rest];

  // Fisher-Yates shuffle so the guaranteed classes aren't always up front.
  for (let i = chars.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function getEnv(names: string[]): string {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing required environment variable (tried: ${names.join(', ')})`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = getEnv(['SUPABASE_URL']);
    const serviceRoleKey = getEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 1. Verify the caller's JWT and resolve who they are.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse({ error: 'Missing bearer token.' }, 401);
    }

    const { data: callerData, error: callerErr } = await adminClient.auth.getUser(token);
    if (callerErr || !callerData?.user) {
      return jsonResponse({ error: 'Invalid or expired session.' }, 401);
    }

    // 2. Re-check the caller's app-level role from profiles — never trust
    //    anything the request body claims about the caller.
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', callerData.user.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'ACTIVE') {
      return jsonResponse({ error: 'Admin privileges required for this action.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'reset_password') {
      const targetUserId = (body?.userId || '').toString().trim();
      if (!targetUserId) {
        return jsonResponse({ error: 'userId is required.' }, 400);
      }

      const tempPassword = generateTempPassword();
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: tempPassword
      });
      if (updateErr) {
        return jsonResponse({ error: updateErr.message || 'Could not reset password.' }, 400);
      }

      const { error: flagErr } = await adminClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', targetUserId);
      if (flagErr) {
        // Password already rotated at this point — surface it but don't
        // pretend the whole operation failed, the temp password is real.
        return jsonResponse({
          tempPassword,
          warning: 'Password was reset, but the forced-change flag could not be set: ' + flagErr.message
        });
      }

      return jsonResponse({ tempPassword });
    }

    if (action === 'create_user') {
      const email = (body?.email || '').toString().trim().toLowerCase();
      const fullName = (body?.fullName || '').toString().trim();
      const role = (body?.role || '').toString().trim();
      const department = (body?.department || 'Operations').toString().trim();

      if (!EMAIL_RE.test(email)) {
        return jsonResponse({ error: 'A valid email address is required.' }, 400);
      }
      if (!fullName) {
        return jsonResponse({ error: 'Full name is required.' }, 400);
      }
      if (!VALID_ROLES.includes(role)) {
        return jsonResponse({ error: 'Invalid role.' }, 400);
      }

      const tempPassword = generateTempPassword();
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
          department,
          status: 'ACTIVE',
          must_change_password: true
        }
      });

      if (createErr || !created?.user) {
        return jsonResponse({ error: createErr?.message || 'Could not create user.' }, 400);
      }

      // public.profiles is populated by the on_auth_user_created trigger
      // from user_metadata above — nothing further to write here.
      return jsonResponse({ userId: created.user.id, tempPassword });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('[OIMS admin-user-actions] Unhandled error:', err);
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
});
