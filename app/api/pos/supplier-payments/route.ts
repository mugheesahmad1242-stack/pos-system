import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

const PAYMENT_SELECT = '*, pos_purchases(purchase_date, reference_number, total_amount)'

// GET /api/pos/supplier-payments?supplier_id=xxx -> full payment history for one
// supplier, most recent first. Each row carries its parent purchase's date/reference
// so the history view can show what each payment was against.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplier_id')

    if (!supplierId) {
      return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_supplier_payments')
      .select(PAYMENT_SELECT)
      .eq('supplier_id', supplierId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API /api/pos/supplier-payments] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/supplier-payments] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/supplier-payments { supplier_id, purchase_id, amount, payment_date,
// payment_method, notes } -> records ONE payment against ONE purchase as its own row.
// This never touches pos_purchases or pos_purchase_items directly and never overwrites
// the original purchase: inserting here fires pos_supplier_payments_after_change_trg
// (see supabase-pos-foundation-schema.sql), which calls pos_recalc_purchase to
// recompute that purchase's amount_paid / amount_due / payment_status from the full
// sum of its payments. Call this endpoint once per payment — full payment, one of
// several partial payments, or a final payment all go through the same path, so the
// complete history is always preserved as separate rows.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const { supplier_id, purchase_id, amount, payment_date, payment_method, notes } = body || {}

    if (!supplier_id || typeof supplier_id !== 'string') {
      return NextResponse.json({ error: 'supplier_id is required' }, { status: 400 })
    }

    if (!purchase_id || typeof purchase_id !== 'string') {
      return NextResponse.json({ error: 'purchase_id is required' }, { status: 400 })
    }

    const numericAmount = Number(amount)
    if (!(numericAmount > 0)) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Confirm the purchase exists, belongs to this supplier, and load its current
    // amount_due so we can reject a payment that would overpay it.
    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from('pos_purchases')
      .select('id, supplier_id, amount_due')
      .eq('id', purchase_id)
      .maybeSingle()

    if (purchaseError) {
      console.error('[API /api/pos/supplier-payments] Purchase lookup error:', purchaseError)
      return NextResponse.json({ error: purchaseError.message }, { status: 500 })
    }

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    }

    if (purchase.supplier_id !== supplier_id) {
      return NextResponse.json({ error: 'Purchase does not belong to this supplier' }, { status: 400 })
    }

    const amountDue = Number(purchase.amount_due) || 0
    if (numericAmount - amountDue > 0.009) {
      return NextResponse.json(
        { error: `Payment of Rs. ${numericAmount} exceeds the remaining balance of Rs. ${amountDue}` },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from('pos_supplier_payments')
      .insert([
        {
          supplier_id,
          purchase_id,
          amount: numericAmount,
          payment_date: payment_date || undefined,
          payment_method: payment_method || null,
          notes: notes || null,
        },
      ])
      .select(PAYMENT_SELECT)
      .single()

    if (error) {
      console.error('[API /api/pos/supplier-payments] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/supplier-payments] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}