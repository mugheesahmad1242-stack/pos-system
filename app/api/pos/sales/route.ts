import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

const SALE_SELECT =
  '*, pos_customers(name), pos_sale_items(*, pos_products(name))'

// GET /api/pos/sales
export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('pos_sales')
      .select(SALE_SELECT)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API /api/pos/sales] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/sales] Unexpected error:', err)

    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    )
  }
}

// POST /api/pos/sales
//
// Creates the complete sale through the existing database sale function,
// including the initial payment when supplied.
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()

    const customerId =
      body?.customer_id === null ||
      body?.customer_id === undefined ||
      body?.customer_id === ''
        ? null
        : String(body.customer_id)

    const items = Array.isArray(body?.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'Sale must contain at least one item' },
        { status: 400 },
      )
    }

    const paidAmount = Number(body?.paid_amount)

    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json(
        { error: 'Paid amount must be zero or greater' },
        { status: 400 },
      )
    }

    const normalizedItems = items.map((item: any) => ({
      product_id: String(item?.product_id || ''),
      quantity: Number(item?.quantity),
      unit_price: Number(item?.unit_price),
    }))

    for (const item of normalizedItems) {
      if (!item.product_id) {
        return NextResponse.json(
          { error: 'Each sale item requires a product' },
          { status: 400 },
        )
      }

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return NextResponse.json(
          { error: 'Quantity must be greater than zero' },
          { status: 400 },
        )
      }

      if (!Number.isFinite(item.unit_price) || item.unit_price <= 0) {
        return NextResponse.json(
          { error: 'Selling price must be greater than zero' },
          { status: 400 },
        )
      }
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin.rpc('pos_create_sale', {
      p_customer_id: customerId,
      p_items: normalizedItems,
      p_paid_amount: paidAmount,
    })

    if (error) {
      console.error('[API /api/pos/sales] Create error:', error)

      const message = error.message || 'Failed to create sale'
      const normalizedMessage = message.toLowerCase()

      return NextResponse.json(
        { error: message },
        {
          status:
            normalizedMessage.includes('insufficient stock')
              ? 409
              : 400,
        },
      )
    }

    return NextResponse.json(
      { data: { id: data } },
      { status: 201 },
    )
  } catch (err: any) {
    console.error('[API /api/pos/sales] Unexpected error:', err)

    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500 },
    )
  }
}