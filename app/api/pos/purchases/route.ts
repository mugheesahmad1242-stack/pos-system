import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

const PURCHASE_SELECT = '*, pos_suppliers(name), pos_purchase_items(*, pos_products(name))'

// GET /api/pos/purchases -> most recent purchases first, with supplier and
// line-item (product) names joined in for display.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_purchases')
      .select(PURCHASE_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API /api/pos/purchases] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/purchases] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/purchases -> creates the purchase header, every line item,
// and an optional initial supplier payment in one transaction via the
// pos_create_purchase RPC (see supabase-pos-purchase-entry.sql). Existing
// Feature 2 triggers then update stock, log the inventory movement, and
// compute the supplier amount due.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const { supplier_id, purchase_date, reference_number, notes, items, amount_paid, payment_method } = body || {}

    if (!supplier_id || typeof supplier_id !== 'string') {
      return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 })
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one purchase item is required' }, { status: 400 })
    }

    for (const item of items) {
      if (!item?.product_id || !(Number(item.quantity) > 0) || Number(item.unit_cost) < 0) {
        return NextResponse.json(
          { error: 'Each item needs a product, a quantity greater than 0, and a non-negative cost' },
          { status: 400 },
        )
      }
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: purchaseId, error: rpcError } = await supabaseAdmin.rpc('pos_create_purchase', {
      p_supplier_id: supplier_id,
      p_purchase_date: purchase_date || null,
      p_reference_number: reference_number || null,
      p_notes: notes || null,
      p_items: items.map((item: any) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
      })),
      p_amount_paid: Number(amount_paid) || 0,
      p_payment_method: payment_method || null,
    })

    if (rpcError) {
      console.error('[API /api/pos/purchases] RPC error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    const { data: purchase, error: fetchError } = await supabaseAdmin
      .from('pos_purchases')
      .select(PURCHASE_SELECT)
      .eq('id', purchaseId)
      .single()

    if (fetchError) {
      console.error('[API /api/pos/purchases] Fetch-after-create error:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    return NextResponse.json({ data: purchase })
  } catch (err: any) {
    console.error('[API /api/pos/purchases] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
