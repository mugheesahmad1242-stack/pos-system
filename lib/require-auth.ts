import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// ----------------------------------------------------------------------
// Server-side session gate for the pos_ API routes.
//
// Every app/api/pos/* route talks to Supabase through getSupabaseAdmin()
// (lib/supabase-admin.ts), which uses the service-role key and therefore
// bypasses RLS entirely. That's correct for how the app needs to write
// data, but it means RLS policies give zero protection against a request
// that hits these routes directly (curl, Postman, a script) without ever
// going through the UI. This helper is the thing that actually stops
// that: every route must call it first and bail out on failure.
//
// It verifies the caller's Supabase access token (sent as a bearer token
// by lib/supabase.ts's fetch wrapper) against Supabase Auth. No valid,
// non-expired token -> no access, full stop.
// ----------------------------------------------------------------------

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://zrjbmaesmbqqgxknidea.supabase.co'
// Mirrors lib/supabase.ts's existing fallback anon key, so this check
// behaves identically to the client whether or not env vars are set —
// consistent with this project's existing "don't crash on missing env
// vars" pattern (see context.md changelog item 7).
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyamJtYWVzbWJxcWd4a25pZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjI2NTMsImV4cCI6MjA5MDY5ODY1M30.RT5zmprjWA5Y5NG4VSVpODU9X4llY1_8tfY-9bXQuGg'

export async function requireAuth(
  request: Request,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized: missing session token' },
        { status: 401 },
      ),
    }
  }

  // Local development escape hatch, matching context/auth-context.tsx's
  // mock user and lib/pos-fetch.ts's DEV_MOCK_TOKEN. Gated on the
  // server process's own NODE_ENV — not derived from anything the
  // request sends — so this branch is structurally dead in production
  // builds regardless of what token value a client presents.
  if (process.env.NODE_ENV === 'development' && token === 'dev-mock-token') {
    return { ok: true }
  }

  if (!anonKey) {
    console.error(
      '[requireAuth] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — cannot verify sessions.',
    )
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server auth is misconfigured' },
        { status: 500 },
      ),
    }
  }

  const client = createClient(supabaseUrl, anonKey)
  const { data, error } = await client.auth.getUser(token)

  if (error || !data?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized: invalid or expired session' },
        { status: 401 },
      ),
    }
  }

  return { ok: true }
}
