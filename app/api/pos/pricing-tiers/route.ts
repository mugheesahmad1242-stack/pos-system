import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

// GET /api/pos/pricing-tiers            -> every tier for every product,
//                                           used by the POS/Orders screen to
//                                           resolve automatic prices client-side
//                                           without one request per product.
// GET /api/pos/pricing-tiers?product_id=<id> -> tiers for a single product,
//                                           used by the Inventory edit drawer.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('product_id')

    const supabaseAdmin = getSupabaseAdmin()

    let query = supabaseAdmin
      .from('pos_product_price_tiers')
      .select('id, product_id, min_quantity, unit_price, created_at, updated_at')
      .order('product_id', { ascending: true })
      .order('min_quantity', { ascending: true })

    if (productId) {
      query = query.eq('product_id', productId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[API /api/pos/pricing-tiers] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/pricing-tiers] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/pricing-tiers { product_id, min_quantity, unit_price }
// Creates a new quantity-price rule for a product. One rule per exact
// min_quantity per product (enforced by a DB unique constraint); creating a
// duplicate threshold returns 409 so the Inventory UI can surface a clear
// error instead of a generic 500.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()

    const productId = typeof body?.product_id === 'string' ? body.product_id.trim() : ''
    const minQuantity = Number(body?.min_quantity)
    const unitPrice = Number(body?.unit_price)

    if (!productId) {
      return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
    }

    if (!Number.isFinite(minQuantity) || minQuantity <= 0) {
      return NextResponse.json(
        { error: 'min_quantity must be greater than zero' },
        { status: 400 },
      )
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: 'unit_price must be zero or greater' },
        { status: 400 },
      )
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('pos_product_price_tiers')
      .insert([{ product_id: productId, min_quantity: minQuantity, unit_price: unitPrice }])
      .select('id, product_id, min_quantity, unit_price, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A tier already exists for this quantity threshold' },
          { status: 409 },
        )
      }

      if (error.code === '23503') {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }

      console.error('[API /api/pos/pricing-tiers] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err: any) {
    console.error('[API /api/pos/pricing-tiers] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
