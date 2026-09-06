import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ----------------------------------------------------------------------
// SERVER-ONLY client for the new beverage-shop (`pos_`) tables.
//
// Why this exists instead of reusing lib/supabase.ts's anon-key client:
// supabase-pos-foundation-schema.sql enables RLS on every pos_ table with
// policies scoped `TO authenticated` (by design — see that file's comments).
// This app's existing API routes (app/api/products, app/api/categories, ...)
// create their own supabase-js client server-side with just the anon key
// and never forward the browser's session/JWT, so those requests hit
// Postgres as the `anon` role. That's fine for the legacy tables (their
// policies are `USING (true)` for any role), but it would make every
// pos_ write fail its RLS check.
//
// The correct fix is the service role key: it bypasses RLS and is only
// ever used from trusted server code (API routes), never sent to the
// browser. This is exactly the boundary the pos_ policies were written to
// protect — "blocks the public anon key from reading/writing shop data
// directly" — so nothing about Feature 2's schema/policies needs to change.
// ----------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://zrjbmaesmbqqgxknidea.supabase.co'
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let cachedClient: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Purchase entry writes to pos_ tables, which require ' +
      'the `authenticated` role under RLS. Add SUPABASE_SERVICE_ROLE_KEY to .env.local ' +
      '(Supabase Dashboard -> Project Settings -> API -> service_role key) and to your deployment env.'
    )
  }

  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }

  return cachedClient
}
