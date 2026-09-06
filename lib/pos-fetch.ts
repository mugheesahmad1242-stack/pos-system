import { supabase } from './supabase'

// ----------------------------------------------------------------------
// Drop-in replacement for the browser's fetch(), used for every call to
// /api/pos/*. It attaches the current Supabase session's access token as
// a Bearer header so the server-side requireAuth() check (lib/require-auth.ts)
// has something to verify. Without this, every request would arrive at
// the API with no credentials and get rejected with 401.
//
// Local development note: context/auth-context.tsx's mock user is a
// React-state fake — it never calls supabase.auth.setSession(), so
// supabase.auth.getSession() returns nothing for it. Without a fallback
// here, `pnpm dev` without real Supabase credentials would 401 on every
// request. DEV_MOCK_TOKEN is that fallback: lib/require-auth.ts accepts
// it, but only when the *server's* NODE_ENV is "development" — a value
// baked in at build/deploy time, not something a client request can
// spoof — so it's inert in any real deployment.
// ----------------------------------------------------------------------

export const DEV_MOCK_TOKEN = 'dev-mock-token'

export async function posFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const token =
    data?.session?.access_token ||
    (process.env.NODE_ENV === 'development' ? DEV_MOCK_TOKEN : undefined)

  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return fetch(input, { ...init, headers })
}
