import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

const PAYMENT_SELECT = '*, pos_sales(sale_date, notes, total_amount)'

// GET /api/pos/customer-payments?customer_id=xxx -> full payment history for one
// customer, most recent first. Each row carries its parent sale's date/notes so
// the history view can show what each payment was against.
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_customer_payments')
      .select(PAYMENT_SELECT)
      .eq('customer_id', customerId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API /api/pos/customer-payments] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/customer-payments] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// POST /api/pos/customer-payments { customer_id, sale_id, amount, payment_date,
// payment_method, notes } -> records ONE payment against ONE sale as its own row.
// This never touches pos_sales or pos_sale_items directly and never overwrites the
// original sale: inserting here fires pos_customer_payments_after_change_trg (see
// supabase-pos-foundation-schema.sql), which calls pos_recalc_sale to recompute that
// sale's amount_paid / amount_due / payment_status from the full sum of its payments.
// Call this endpoint once per payment — a full payment, one of several partial
// payments, or a final payment all go through the same path, so the complete
// history is always preserved as separate rows and the original credit amount is
// never overwritten.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()
    const { customer_id, sale_id, amount, payment_date, payment_method, notes } = body || {}

    if (!customer_id || typeof customer_id !== 'string') {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    if (!sale_id || typeof sale_id !== 'string') {
      return NextResponse.json({ error: 'sale_id is required' }, { status: 400 })
    }

    const numericAmount = Number(amount)
    if (!(numericAmount > 0)) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    // Confirm the sale exists, belongs to this customer, and load its current
    // amount_due so we can reject a payment that would overpay it.
    const { data: sale, error: saleError } = await supabaseAdmin
      .from('pos_sales')
      .select('id, customer_id, amount_due')
      .eq('id', sale_id)
      .maybeSingle()

    if (saleError) {
      console.error('[API /api/pos/customer-payments] Sale lookup error:', saleError)
      return NextResponse.json({ error: saleError.message }, { status: 500 })
    }

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    if (sale.customer_id !== customer_id) {
      return NextResponse.json({ error: 'Sale does not belong to this customer' }, { status: 400 })
    }

    const amountDue = Number(sale.amount_due) || 0
    if (numericAmount - amountDue > 0.009) {
      return NextResponse.json(
        { error: `Payment of Rs. ${numericAmount} exceeds the remaining balance of Rs. ${amountDue}` },
        { status: 400 },
      )
    }

    const { data, error } = await supabaseAdmin
      .from('pos_customer_payments')
      .insert([
        {
          customer_id,
          sale_id,
          amount: numericAmount,
          payment_date: payment_date || undefined,
          payment_method: payment_method || null,
          notes: notes || null,
        },
      ])
      .select(PAYMENT_SELECT)
      .single()

    if (error) {
      console.error('[API /api/pos/customer-payments] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/customer-payments] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}