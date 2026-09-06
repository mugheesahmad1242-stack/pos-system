import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

// GET /api/pos/settings -> the single pos_business_settings row. Used by the
// Settings page's Business & Invoice tab, and mirrors the same row the
// dashboard/financials/receipt PDF already read via /api/pos/reports.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_business_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle()

    if (error) {
      console.error('[API /api/pos/settings] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/settings] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/pos/settings { shop_name, currency, address, phone, invoice_prefix,
// default_low_stock_threshold, tax_rate } -> updates the single settings row.
// Only known columns are accepted; everything else in the request body is
// ignored so this can't be used to write arbitrary columns.
export async function PUT(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const body = await request.json()

    const updates: Record<string, unknown> = {}

    if (typeof body?.shop_name === 'string') {
      const name = body.shop_name.trim()
      if (!name) {
        return NextResponse.json({ error: 'Shop name cannot be empty' }, { status: 400 })
      }
      updates.shop_name = name
    }

    if (typeof body?.currency === 'string' && body.currency.trim()) {
      updates.currency = body.currency.trim()
    }

    if (typeof body?.address === 'string') {
      updates.address = body.address.trim() || null
    }

    if (typeof body?.phone === 'string') {
      updates.phone = body.phone.trim() || null
    }

    if (typeof body?.invoice_prefix === 'string' && body.invoice_prefix.trim()) {
      updates.invoice_prefix = body.invoice_prefix.trim()
    }

    if (body?.default_low_stock_threshold !== undefined) {
      const threshold = Number(body.default_low_stock_threshold)
      if (!Number.isFinite(threshold) || threshold < 0) {
        return NextResponse.json(
          { error: 'Default low stock threshold must be zero or greater' },
          { status: 400 },
        )
      }
      updates.default_low_stock_threshold = threshold
    }

    if (body?.tax_rate !== undefined) {
      const taxRate = Number(body.tax_rate)
      if (!Number.isFinite(taxRate) || taxRate < 0) {
        return NextResponse.json({ error: 'Tax rate must be zero or greater' }, { status: 400 })
      }
      updates.tax_rate = taxRate
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_business_settings')
      .update(updates)
      .eq('id', true)
      .select('*')
      .single()

    if (error) {
      console.error('[API /api/pos/settings] Update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[API /api/pos/settings] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
