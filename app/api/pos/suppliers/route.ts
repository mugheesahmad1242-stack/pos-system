import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

function escapeLikePattern(input: string) {
  return input.replace(/[%_\\]/g, (match) => `\\${match}`)
}

// GET /api/pos/suppliers?q=abc -> autocomplete matches while typing
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()

    const supabaseAdmin = getSupabaseAdmin()
    let query = supabaseAdmin
      .from('pos_suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(10)

    if (q) {
      query = query.ilike('name', `%${escapeLikePattern(q)}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API /api/pos/suppliers] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/suppliers] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/suppliers { name } -> reuses an existing case-insensitive
// match if one exists, otherwise creates a new supplier. `name` is citext,
// so equality here is already case-insensitive at the database level.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('pos_suppliers')
      .select('id, name')
      .eq('name', name)
      .maybeSingle()

    if (lookupError) {
      console.error('[API /api/pos/suppliers] Lookup error:', lookupError)
      return NextResponse.json({ error: lookupError.message }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json({ data: existing })
    }

    const { data, error } = await supabaseAdmin
      .from('pos_suppliers')
      .insert([{ name }])
      .select('id, name')
      .single()

    if (error) {
      // Race: another request created the same name between the lookup
      // above and this insert. Reuse it instead of erroring out.
      if (error.code === '23505') {
        const { data: raceExisting } = await supabaseAdmin
          .from('pos_suppliers')
          .select('id, name')
          .eq('name', name)
          .maybeSingle()

        if (raceExisting) {
          return NextResponse.json({ data: raceExisting })
        }
      }

      console.error('[API /api/pos/suppliers] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/suppliers] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
