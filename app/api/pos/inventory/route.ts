import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

// GET /api/pos/inventory -> current stock balance per product, so the
// purchase entry screen can show live totals after a purchase is saved.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('pos_inventory')
      .select('product_id, quantity, updated_at, pos_products(name, unit)')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[API /api/pos/inventory] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err: any) {
    console.error('[API /api/pos/inventory] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
