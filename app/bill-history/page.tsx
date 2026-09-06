'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  ReceiptText,
  RefreshCw,
  Search,
} from 'lucide-react'

import { Sidebar } from '@/components/pos/sidebar'
import { generatePosReceiptPDF } from '@/lib/pos-receipt-pdf'
import { posFetch } from '@/lib/pos-fetch'

export default function BillHistoryPage() {
  const [sales, setSales] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await posFetch(
        '/api/pos/reports?from=2000-01-01&to=2999-12-31',
      )

      const json = await response.json()

      if (!response.ok || json.error) {
        throw new Error(
          json.error ||
            'Failed to load bill history',
        )
      }

      setSales(json.sales || [])
      setSettings(json.settings || null)
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load bill history',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    if (!q) return sales

    return sales.filter((sale) =>
      `${sale.receipt_number} ${
        sale.pos_customers?.name || ''
      } ${sale.payment_status}`
        .toLowerCase()
        .includes(q),
    )
  }, [sales, query])

  const download = (sale: any) => {
    generatePosReceiptPDF({
      shopName:
        settings?.shop_name ||
        'Perfect Traders',

      receiptNumber:
        sale.receipt_number,

      dateTime: new Date(
        sale.created_at,
      ).toLocaleString('en-PK'),

      customerName:
        sale.pos_customers?.name ||
        'Walk-in Customer',

      items: (
        sale.pos_sale_items || []
      ).map((item: any) => ({
        name:
          item.pos_products?.name ||
          'Product',

        quantity: Number(
          item.quantity,
        ),

        unit_price: Number(
          item.unit_price,
        ),

        line_total: Number(
          item.line_total,
        ),
      })),

      grandTotal: Number(
        sale.total_amount,
      ),

      paidAmount: Number(
        sale.amount_paid,
      ),

      remainingAmount: Number(
        sale.amount_due,
      ),

      paymentStatus:
        sale.payment_status,

      currency:
        settings?.currency ||
        'PKR',
    })
  }

  return (
    <main className="h-full w-full flex flex-col overflow-hidden bg-[var(--pos-panel-2)] text-foreground">
      <div className="flex-1 flex p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <Sidebar />

          <section className="flex-1 overflow-y-auto p-5 space-y-5">
            <header className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <ReceiptText className="w-5 h-5 text-[var(--pos-brand)]" />
                  Bill History
                </h1>

                <p className="text-sm text-muted-foreground mt-1">
                  Sales, actual profit and downloadable receipts.
                </p>
              </div>

              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--pos-stroke)] px-3 py-2 text-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loading
                      ? 'animate-spin'
                      : ''
                  }`}
                />

                Refresh
              </button>
            </header>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

              <input
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
                placeholder="Search bill number or customer"
                className="w-full rounded-lg border border-[var(--pos-stroke)] bg-foreground/5 pl-9 pr-3 py-2.5 text-sm"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="pos-panel rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-[var(--pos-stroke)]">
                      <th className="p-3">Receipt</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3 text-right">Sales</th>
                      <th className="p-3 text-right">Cost</th>
                      <th className="p-3 text-right">Profit</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Due</th>
                      <th className="p-3">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.map(
                      (sale) => (
                        <tr
                          key={sale.id}
                          className="border-b border-[var(--pos-stroke)] last:border-0"
                        >
                          <td className="p-3 font-semibold">
                            {sale.receipt_number}
                          </td>

                          <td className="p-3 whitespace-nowrap">
                            {sale.sale_date}
                          </td>

                          <td className="p-3">
                            {sale.pos_customers?.name ||
                              'Walk-in Customer'}
                          </td>

                          <td className="p-3 text-right">
                            {Number(
                              sale.total_amount,
                            ).toLocaleString(
                              'en-PK',
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </td>

                          <td className="p-3 text-right">
                            {Number(
                              sale.actual_cost,
                            ).toLocaleString(
                              'en-PK',
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </td>

                          <td className="p-3 text-right font-semibold text-emerald-500">
                            {Number(
                              sale.profit,
                            ).toLocaleString(
                              'en-PK',
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </td>

                          <td className="p-3 text-right">
                            {Number(
                              sale.amount_paid,
                            ).toLocaleString(
                              'en-PK',
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </td>

                          <td className="p-3 text-right">
                            {Number(
                              sale.amount_due,
                            ).toLocaleString(
                              'en-PK',
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </td>

                          <td className="p-3 capitalize">
                            {sale.payment_status}
                          </td>

                          <td className="p-3">
                            <button
                              onClick={() =>
                                download(sale)
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pos-stroke)] px-2.5 py-1.5 text-xs hover:bg-foreground/5"
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </button>
                          </td>
                        </tr>
                      ),
                    )}

                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No sales found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}