import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

function escapeLikePattern(input: string) {
  return input.replace(/[%_\\]/g, (match) => `\\${match}`)
}

// GET /api/pos/products?q=cok       -> autocomplete matches while typing
// GET /api/pos/products?all=1       -> full catalog (active + inactive) with
//                                       unit/threshold, for the Inventory page
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const all = searchParams.get('all') === '1'

    const supabaseAdmin = getSupabaseAdmin()

    if (all) {
      const { data, error } = await supabaseAdmin
        .from('pos_products')
        .select('id, name, unit, low_stock_threshold, is_active, created_at')
        .order('name', { ascending: true })

      if (error) {
        console.error('[API /api/pos/products] Supabase error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }

    let query = supabaseAdmin
      .from('pos_products')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(10)

    if (q) {
      query = query.ilike('name', `%${escapeLikePattern(q)}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API /api/pos/products] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/products] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/products { name, unit?, low_stock_threshold? } -> reuses an
// existing case-insensitive match if one exists, otherwise creates a new
// product. Never creates a duplicate: `name` is a citext column, so equality
// here is already case-insensitive at the database level. `unit` and
// `low_stock_threshold` are optional so the purchase-entry autocomplete
// (which only ever sends `name`) keeps working unchanged; the Inventory
// page's "Add product" form sends all three.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const unit = typeof body?.unit === 'string' && body.unit.trim() ? body.unit.trim() : undefined

    let lowStockThreshold: number | undefined
    if (body?.low_stock_threshold !== undefined) {
      const parsed = Number(body.low_stock_threshold)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: 'low_stock_threshold must be zero or greater' },
          { status: 400 },
        )
      }
      lowStockThreshold = parsed
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('pos_products')
      .select('id, name')
      .eq('name', name)
      .maybeSingle()

    if (lookupError) {
      console.error('[API /api/pos/products] Lookup error:', lookupError)
      return NextResponse.json({ error: lookupError.message }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json({ data: existing })
    }

    const insertRow: Record<string, unknown> = { name }
    if (unit !== undefined) insertRow.unit = unit
    if (lowStockThreshold !== undefined) insertRow.low_stock_threshold = lowStockThreshold

    const { data, error } = await supabaseAdmin
      .from('pos_products')
      .insert([insertRow])
      .select('id, name')
      .single()

    if (error) {
      // Race: another request created the same name between the lookup
      // above and this insert. Reuse it instead of erroring out.
      if (error.code === '23505') {
        const { data: raceExisting } = await supabaseAdmin
          .from('pos_products')
          .select('id, name')
          .eq('name', name)
          .maybeSingle()

        if (raceExisting) {
          return NextResponse.json({ data: raceExisting })
        }
      }

      console.error('[API /api/pos/products] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/products] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
