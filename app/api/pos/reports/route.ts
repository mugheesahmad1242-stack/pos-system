import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireAuth } from '@/lib/require-auth'

const today = () => new Date().toISOString().slice(0, 10)

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00Z`)

  return Number.isNaN(date.getTime()) ? null : value
}

export async function GET(request: Request) {
  try {
    const authResult = await requireAuth(request)
    if (!authResult.ok) return authResult.response

    const { searchParams } = new URL(request.url)

    const requestedFrom = validDate(searchParams.get('from'))
    const requestedTo = validDate(searchParams.get('to'))

    const from = requestedFrom || requestedTo || today()
    const to = requestedTo || requestedFrom || today()

    if (from > to) {
      return NextResponse.json(
        { error: '`from` cannot be after `to`' },
        { status: 400 },
      )
    }

    const supabase = getSupabaseAdmin()

    const [
      salesResult,
      purchasesResult,
      customerPaymentsResult,
      supplierPaymentsResult,
      inventoryResult,
      settingsResult,
    ] = await Promise.all([
      supabase
        .from('pos_sales')
        .select(
          'id, receipt_number, customer_id, sale_date, total_amount, amount_paid, amount_due, payment_status, created_at, pos_customers(name), pos_sale_items(id, product_id, quantity, unit_price, unit_cost, line_total, line_cost_total, pos_products(name))',
        )
        .gte('sale_date', from)
        .lte('sale_date', to)
        .order('created_at', { ascending: false }),

      supabase
        .from('pos_purchases')
        .select(
          'id, supplier_id, purchase_date, reference_number, total_amount, amount_paid, amount_due, payment_status, created_at, pos_suppliers(name)',
        )
        .gte('purchase_date', from)
        .lte('purchase_date', to)
        .order('created_at', { ascending: false }),

      supabase
        .from('pos_customer_payments')
        .select(
          'id, customer_id, sale_id, amount, payment_date, payment_method, notes, created_at, pos_customers(name), pos_sales(receipt_number)',
        )
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('created_at', { ascending: false }),

      supabase
        .from('pos_supplier_payments')
        .select(
          'id, supplier_id, purchase_id, amount, payment_date, payment_method, notes, created_at, pos_suppliers(name), pos_purchases(reference_number)',
        )
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('created_at', { ascending: false }),

      supabase
        .from('pos_inventory')
        .select(
          'product_id, quantity, updated_at, pos_products(id, name, unit, low_stock_threshold, is_active)',
        ),

      supabase
        .from('pos_business_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle(),
    ])

    const firstError = [
      salesResult.error,
      purchasesResult.error,
      customerPaymentsResult.error,
      supplierPaymentsResult.error,
      inventoryResult.error,
      settingsResult.error,
    ].find(Boolean)

    if (firstError) {
      console.error('[API /api/pos/reports] Supabase error:', firstError)

      return NextResponse.json(
        { error: firstError.message },
        { status: 500 },
      )
    }

    const sales = salesResult.data || []
    const purchases = purchasesResult.data || []
    const customerPayments = customerPaymentsResult.data || []
    const supplierPayments = supplierPaymentsResult.data || []
    const inventory = inventoryResult.data || []

    const salesWithProfit = sales.map((sale: any) => {
      const revenue = (sale.pos_sale_items || []).reduce(
        (sum: number, item: any) =>
          sum + Number(item.line_total || 0),
        0,
      )

      const cost = (sale.pos_sale_items || []).reduce(
        (sum: number, item: any) =>
          sum + Number(item.line_cost_total || 0),
        0,
      )

      return {
        ...sale,
        profit: revenue - cost,
        actual_cost: cost,
      }
    })

    const currentReceivablesResult = await supabase
      .from('pos_sales')
      .select('amount_due')
      .gt('amount_due', 0)

    const currentPayablesResult = await supabase
      .from('pos_purchases')
      .select('amount_due')
      .gt('amount_due', 0)

    if (
      currentReceivablesResult.error ||
      currentPayablesResult.error
    ) {
      const error =
        currentReceivablesResult.error ||
        currentPayablesResult.error

      console.error(
        '[API /api/pos/reports] Balance error:',
        error,
      )

      return NextResponse.json(
        {
          error:
            error?.message ||
            'Failed to load balances',
        },
        { status: 500 },
      )
    }

    const receivables = (
      currentReceivablesResult.data || []
    ).reduce(
      (sum, row) => sum + Number(row.amount_due || 0),
      0,
    )

    const payables = (
      currentPayablesResult.data || []
    ).reduce(
      (sum, row) => sum + Number(row.amount_due || 0),
      0,
    )

    const stockRows = inventory.map((row: any) => ({
      ...row,
      quantity: Number(row.quantity || 0),
      low_stock_threshold: Number(
        row.pos_products?.low_stock_threshold || 0,
      ),
    }))

    const lowStock = stockRows.filter(
      (row: any) =>
        row.pos_products?.is_active !== false &&
        row.quantity <= row.low_stock_threshold,
    )

    const salesTotal = salesWithProfit.reduce(
      (sum, sale: any) =>
        sum + Number(sale.total_amount || 0),
      0,
    )

    const profitTotal = salesWithProfit.reduce(
      (sum, sale: any) =>
        sum + Number(sale.profit || 0),
      0,
    )

    const purchaseTotal = purchases.reduce(
      (sum, purchase: any) =>
        sum + Number(purchase.total_amount || 0),
      0,
    )

    const customerPaymentTotal =
      customerPayments.reduce(
        (sum, payment: any) =>
          sum + Number(payment.amount || 0),
        0,
      )

    const supplierPaymentTotal =
      supplierPayments.reduce(
        (sum, payment: any) =>
          sum + Number(payment.amount || 0),
        0,
      )

    return NextResponse.json({
      range: {
        from,
        to,
      },

      settings:
        settingsResult.data || {
          shop_name: 'Perfect Traders',
          currency: 'PKR',
        },

      summary: {
        sales: salesTotal,
        profit: profitTotal,
        purchases: purchaseTotal,
        customer_payments: customerPaymentTotal,
        supplier_payments: supplierPaymentTotal,
        receivables,
        payables,

        stock_units: stockRows.reduce(
          (sum: number, row: any) =>
            sum + row.quantity,
          0,
        ),

        low_stock_count: lowStock.length,
      },

      sales: salesWithProfit,
      purchases,
      customer_payments: customerPayments,
      supplier_payments: supplierPayments,
      inventory: stockRows,
      low_stock: lowStock,
    })
  } catch (err: any) {
    console.error(
      '[API /api/pos/reports] Unexpected error:',
      err,
    )

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Internal server error',
      },
      { status: 500 },
    )
  }
}