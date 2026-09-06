'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

import { Sidebar } from '@/components/pos/sidebar'
import { posFetch } from '@/lib/pos-fetch'

const isoToday = () =>
  new Date().toISOString().slice(0, 10)

const isoMonthStart = () => {
  const date = new Date()

  date.setDate(1)

  return date.toISOString().slice(0, 10)
}

export default function FinancialsPage() {
  const [from, setFrom] = useState(isoMonthStart())
  const [to, setTo] = useState(isoToday())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await posFetch(
        `/api/pos/reports?from=${from}&to=${to}`,
      )

      const json = await response.json()

      if (!response.ok || json.error) {
        throw new Error(
          json.error ||
            'Failed to load financials',
        )
      }

      setData(json)
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load financials',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const money = (value: number) =>
    `${data?.settings?.currency || 'PKR'} ${Number(
      value || 0,
    ).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const transactions = useMemo(() => {
    const rows = [
      ...(data?.sales || []).map((x: any) => ({
        id: `sale-${x.id}`,
        date: x.sale_date,
        type: 'Sale',
        party:
          x.pos_customers?.name ||
          'Walk-in Customer',
        ref: x.receipt_number,
        amount: Number(x.total_amount),
        detail: `Profit ${money(x.profit)}`,
      })),

      ...(data?.customer_payments || []).map(
        (x: any) => ({
          id: `cp-${x.id}`,
          date: x.payment_date,
          type: 'Customer Payment',
          party:
            x.pos_customers?.name ||
            'Customer',
          ref:
            x.pos_sales?.receipt_number ||
            'Unlinked',
          amount: Number(x.amount),
          detail:
            x.payment_method || 'Payment',
        }),
      ),

      ...(data?.purchases || []).map(
        (x: any) => ({
          id: `purchase-${x.id}`,
          date: x.purchase_date,
          type: 'Supplier Purchase',
          party:
            x.pos_suppliers?.name ||
            'Supplier',
          ref:
            x.reference_number ||
            x.id.slice(0, 8),
          amount: Number(x.total_amount),
          detail: `Outstanding ${money(
            x.amount_due,
          )}`,
        }),
      ),

      ...(data?.supplier_payments || []).map(
        (x: any) => ({
          id: `sp-${x.id}`,
          date: x.payment_date,
          type: 'Supplier Payment',
          party:
            x.pos_suppliers?.name ||
            'Supplier',
          ref:
            x.pos_purchases
              ?.reference_number ||
            'Purchase',
          amount: Number(x.amount),
          detail:
            x.payment_method || 'Payment',
        }),
      ),
    ]

    return rows.sort((a, b) =>
      b.date.localeCompare(a.date),
    )
  }, [data])

  return (
    <main className="h-full w-full flex flex-col overflow-hidden bg-[var(--pos-panel-2)] text-foreground">
      <div className="flex-1 flex p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <Sidebar />

          <section className="flex-1 overflow-y-auto p-5 space-y-5">
            <header>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-[var(--pos-brand)]" />
                Financials
              </h1>

              <p className="text-sm text-muted-foreground mt-1">
                Historical transactions plus current
                outstanding balances.
              </p>
            </header>

            <div className="pos-panel rounded-xl p-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  From
                </label>

                <input
                  type="date"
                  value={from}
                  onChange={(e) =>
                    setFrom(e.target.value)
                  }
                  className="block mt-1 rounded-lg border border-[var(--pos-stroke)] bg-foreground/5 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  To
                </label>

                <input
                  type="date"
                  value={to}
                  onChange={(e) =>
                    setTo(e.target.value)
                  }
                  className="block mt-1 rounded-lg border border-[var(--pos-stroke)] bg-foreground/5 px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    loading
                      ? 'animate-spin'
                      : ''
                  }`}
                />

                Apply
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Metric
                icon={ArrowUpRight}
                label="Sales"
                value={money(
                  data?.summary.sales,
                )}
              />

              <Metric
                icon={TrendingUp}
                label="Profit"
                value={money(
                  data?.summary.profit,
                )}
              />

              <Metric
                icon={ArrowDownLeft}
                label="Supplier Purchases"
                value={money(
                  data?.summary.purchases,
                )}
              />

              <Metric
                icon={CircleDollarSign}
                label="Customer Payments"
                value={money(
                  data?.summary
                    .customer_payments,
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Balance
                title="Current Customer Receivables"
                value={money(
                  data?.summary
                    .receivables,
                )}
                href="/receivables"
              />

              <Balance
                title="Current Supplier Payables"
                value={money(
                  data?.summary.payables,
                )}
                href="/payables"
              />
            </div>

            <div className="pos-panel rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[var(--pos-stroke)]">
                <h2 className="font-semibold">
                  Transaction Activity
                </h2>

                <p className="text-xs text-muted-foreground mt-1">
                  Sales, payments and purchases
                  in the selected period.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-[var(--pos-stroke)]">
                      <th className="p-3">
                        Date
                      </th>

                      <th className="p-3">
                        Type
                      </th>

                      <th className="p-3">
                        Party
                      </th>

                      <th className="p-3">
                        Reference
                      </th>

                      <th className="p-3 text-right">
                        Amount
                      </th>

                      <th className="p-3">
                        Details
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {transactions.map(
                      (row: any) => (
                        <tr
                          key={row.id}
                          className="border-b border-[var(--pos-stroke)] last:border-0"
                        >
                          <td className="p-3 whitespace-nowrap">
                            {row.date}
                          </td>

                          <td className="p-3 font-medium">
                            {row.type}
                          </td>

                          <td className="p-3">
                            {row.party}
                          </td>

                          <td className="p-3">
                            {row.ref}
                          </td>

                          <td className="p-3 text-right font-semibold">
                            {money(row.amount)}
                          </td>

                          <td className="p-3 text-muted-foreground">
                            {row.detail}
                          </td>
                        </tr>
                      ),
                    )}

                    {transactions.length ===
                      0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-6 text-center text-muted-foreground"
                        >
                          No transactions in this
                          period.
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

function Metric({
  icon: Icon,
  label,
  value,
}: any) {
  return (
    <div className="pos-panel rounded-xl p-4">
      <Icon className="w-5 h-5 text-[var(--pos-brand)]" />

      <p className="text-xs text-muted-foreground mt-3">
        {label}
      </p>

      <p className="text-xl font-bold mt-1">
        {value || 'PKR 0.00'}
      </p>
    </div>
  )
}

function Balance({
  title,
  value,
  href,
}: any) {
  return (
    <a
      href={href}
      className="pos-panel rounded-xl p-4 hover:bg-foreground/5 transition"
    >
      <p className="text-sm text-muted-foreground">
        {title}
      </p>

      <p className="text-2xl font-bold mt-2">
        {value || 'PKR 0.00'}
      </p>

      <p className="text-xs text-[var(--pos-brand)] mt-2">
        View details →
      </p>
    </a>
  )
}