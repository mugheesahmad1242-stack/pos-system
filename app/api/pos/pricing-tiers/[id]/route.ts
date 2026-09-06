import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

// PATCH /api/pos/pricing-tiers/[id] { min_quantity?, unit_price? }
// Used by the Inventory edit drawer to adjust an existing tier's threshold
// or price in place.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body?.min_quantity !== undefined) {
      const minQuantity = Number(body.min_quantity)
      if (!Number.isFinite(minQuantity) || minQuantity <= 0) {
        return NextResponse.json(
          { error: 'min_quantity must be greater than zero' },
          { status: 400 },
        )
      }
      updates.min_quantity = minQuantity
    }

    if (body?.unit_price !== undefined) {
      const unitPrice = Number(body.unit_price)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json(
          { error: 'unit_price must be zero or greater' },
          { status: 400 },
        )
      }
      updates.unit_price = unitPrice
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_product_price_tiers')
      .update(updates)
      .eq('id', params.id)
      .select('id, product_id, min_quantity, unit_price, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A tier already exists for this quantity threshold' },
          { status: 409 },
        )
      }

      console.error('[API /api/pos/pricing-tiers/[id]] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/pricing-tiers/[id]] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/pos/pricing-tiers/[id]
// Removes a tier entirely. Sales already made using this tier's price are
// unaffected — pos_sale_items stores its own frozen unit_price snapshot,
// this table is only consulted when a new sale is being priced.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin
      .from('pos_product_price_tiers')
      .delete()
      .eq('id', params.id)

    if (error) {
      console.error('[API /api/pos/pricing-tiers/[id]] Delete error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: { id: params.id } })
  } catch (err: any) {
    console.error('[API /api/pos/pricing-tiers/[id]] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
