"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react"

import { Sidebar } from "@/components/pos/sidebar"
import { posFetch } from "@/lib/pos-fetch"

type DashboardData = {
  settings: {
    shop_name?: string
    currency?: string
  }
  summary: {
    sales: number
    profit: number
    purchases: number
    customer_payments: number
    supplier_payments: number
    receivables: number
    payables: number
    stock_units: number
    low_stock_count: number
  }
  sales: any[]
  low_stock: any[]
}

function getLocalDate() {
  const date = new Date()

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function getMonthStart() {
  const date = new Date()

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")

  return `${year}-${month}-01`
}

function money(
  value: number,
  currency = "PKR",
) {
  return `${currency} ${Number(value || 0).toLocaleString(
    "en-PK",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`
}

export default function DashboardPage() {
  const [todayData, setTodayData] =
    useState<DashboardData | null>(null)

  const [monthData, setMonthData] =
    useState<DashboardData | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [currentTime, setCurrentTime] =
    useState(new Date())

  const loadDashboard = async () => {
    try {
      setLoading(true)
      setError("")

      const today = getLocalDate()
      const monthStart = getMonthStart()

      const [todayResponse, monthResponse] =
        await Promise.all([
          posFetch(
            `/api/pos/reports?from=${today}&to=${today}`,
          ),
          posFetch(
            `/api/pos/reports?from=${monthStart}&to=${today}`,
          ),
        ])

      const [todayJson, monthJson] =
        await Promise.all([
          todayResponse.json(),
          monthResponse.json(),
        ])

      if (!todayResponse.ok || todayJson.error) {
        throw new Error(
          todayJson.error ||
            "Failed to load today's dashboard",
        )
      }

      if (!monthResponse.ok || monthJson.error) {
        throw new Error(
          monthJson.error ||
            "Failed to load monthly dashboard",
        )
      }

      setTodayData(todayJson)
      setMonthData(monthJson)
    } catch (err) {
      console.error(
        "Failed to load dashboard:",
        err,
      )

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load dashboard",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()

    const timer = window.setInterval(() => {
      setCurrentTime(new Date())
    }, 60_000)

    return () => window.clearInterval(timer)
  }, [])

  const currency =
    todayData?.settings?.currency ||
    monthData?.settings?.currency ||
    "PKR"

  const shopName =
    todayData?.settings?.shop_name ||
    monthData?.settings?.shop_name ||
    "Perfect Traders"

  const todaySales =
    todayData?.summary.sales || 0

  const todayProfit =
    todayData?.summary.profit || 0

  const monthlySales =
    monthData?.summary.sales || 0

  const monthlyProfit =
    monthData?.summary.profit || 0

  const receivables =
    todayData?.summary.receivables || 0

  const payables =
    todayData?.summary.payables || 0

  const stockUnits =
    todayData?.summary.stock_units || 0

  const lowStock =
    todayData?.low_stock || []

  const recentSales = useMemo(() => {
    return (todayData?.sales || []).slice(0, 8)
  }, [todayData])

  return (
    <main className="h-full w-full flex flex-col overflow-hidden bg-[var(--pos-panel-2)] text-foreground">
      <div className="flex-1 flex p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <Sidebar />

          <section className="flex-1 overflow-y-auto p-5 space-y-5">
            <header className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {shopName}
                </p>

                <h1 className="text-2xl font-bold mt-1">
                  Dashboard
                </h1>

                <p className="text-sm text-muted-foreground mt-1">
                  Real-time business performance and
                  financial overview.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="pos-panel rounded-xl px-3 py-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-[var(--pos-brand)]" />
                    {currentTime.toLocaleDateString(
                      "en-PK",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      },
                    )}
                  </span>

                  <span className="text-muted-foreground/30">
                    •
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[var(--pos-brand)]" />
                    {currentTime.toLocaleTimeString(
                      "en-PK",
                      {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      },
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={loadDashboard}
                  disabled={loading}
                  className="pos-panel rounded-xl p-2.5 hover:bg-foreground/5 transition disabled:opacity-50"
                  title="Refresh dashboard"
                  aria-label="Refresh dashboard"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${
                      loading
                        ? "animate-spin"
                        : ""
                    }`}
                  />
                </button>
              </div>
            </header>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            {/* Today's performance */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">
                    Today
                  </h2>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sales and actual profit generated today.
                  </p>
                </div>

                <Link
                  href="/financials"
                  className="text-xs text-[var(--pos-brand)] hover:underline"
                >
                  View financials →
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard
                  icon={ShoppingCart}
                  label="Today's Sales"
                  value={money(
                    todaySales,
                    currency,
                  )}
                  description="Total sale revenue"
                />

                <StatCard
                  icon={TrendingUp}
                  label="Today's Profit"
                  value={money(
                    todayProfit,
                    currency,
                  )}
                  description="Revenue minus actual cost"
                />

                <StatCard
                  icon={Users}
                  label="Customer Receivables"
                  value={money(
                    receivables,
                    currency,
                  )}
                  description="Current outstanding balance"
                  href="/receivables"
                />

                <StatCard
                  icon={Wallet}
                  label="Supplier Payables"
                  value={money(
                    payables,
                    currency,
                  )}
                  description="Current outstanding balance"
                  href="/payables"
                />
              </div>
            </section>

            {/* Monthly + inventory */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-semibold">
                    Business Overview
                  </h2>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    Current month and inventory position.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <StatCard
                  icon={ArrowUpRight}
                  label="Monthly Sales"
                  value={money(
                    monthlySales,
                    currency,
                  )}
                  description="From the start of this month"
                />

                <StatCard
                  icon={TrendingUp}
                  label="Monthly Profit"
                  value={money(
                    monthlyProfit,
                    currency,
                  )}
                  description="Based on actual sale costs"
                />

                <StatCard
                  icon={Package}
                  label="Current Stock"
                  value={stockUnits.toLocaleString(
                    "en-PK",
                  )}
                  description="Total units currently in inventory"
                  href="/inventory"
                />

                <StatCard
                  icon={AlertTriangle}
                  label="Low Stock"
                  value={String(
                    lowStock.length,
                  )}
                  description="Products at or below threshold"
                  href="/inventory"
                  danger={lowStock.length > 0}
                />
              </div>
            </section>

            {/* Main activity */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Recent sales */}
              <section className="xl:col-span-2 pos-panel rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[var(--pos-stroke)] flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-[var(--pos-brand)]" />
                      Recent Sales
                    </h2>

                    <p className="text-xs text-muted-foreground mt-1">
                      Today's latest completed sales.
                    </p>
                  </div>

                  <Link
                    href="/bill-history"
                    className="text-xs text-[var(--pos-brand)] hover:underline"
                  >
                    Bill history →
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b border-[var(--pos-stroke)]">
                        <th className="p-3">
                          Receipt
                        </th>

                        <th className="p-3">
                          Customer
                        </th>

                        <th className="p-3 text-right">
                          Sale
                        </th>

                        <th className="p-3 text-right">
                          Profit
                        </th>

                        <th className="p-3">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {recentSales.map(
                        (sale: any) => (
                          <tr
                            key={sale.id}
                            className="border-b border-[var(--pos-stroke)] last:border-0"
                          >
                            <td className="p-3 font-medium">
                              {sale.receipt_number}
                            </td>

                            <td className="p-3">
                              {sale.pos_customers
                                ?.name ||
                                "Walk-in Customer"}
                            </td>

                            <td className="p-3 text-right">
                              {money(
                                Number(
                                  sale.total_amount,
                                ),
                                currency,
                              )}
                            </td>

                            <td className="p-3 text-right font-semibold text-emerald-500">
                              {money(
                                Number(
                                  sale.profit,
                                ),
                                currency,
                              )}
                            </td>

                            <td className="p-3">
                              <span className="capitalize">
                                {
                                  sale.payment_status
                                }
                              </span>
                            </td>
                          </tr>
                        ),
                      )}

                      {recentSales.length ===
                        0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-muted-foreground"
                          >
                            No sales recorded today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Low stock */}
              <section className="pos-panel rounded-xl overflow-hidden">
                <div className="p-4 border-b border-[var(--pos-stroke)] flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Low Stock
                    </h2>

                    <p className="text-xs text-muted-foreground mt-1">
                      Products needing attention.
                    </p>
                  </div>

                  <Link
                    href="/inventory"
                    className="text-xs text-[var(--pos-brand)] hover:underline"
                  >
                    Inventory →
                  </Link>
                </div>

                <div className="p-3 space-y-2">
                  {lowStock
                    .slice(0, 8)
                    .map((row: any) => (
                      <div
                        key={row.product_id}
                        className="rounded-lg border border-[var(--pos-stroke)] p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {
                                row.pos_products
                                  ?.name
                              }
                            </p>

                            <p className="text-xs text-muted-foreground mt-0.5">
                              Threshold:{" "}
                              {
                                row.low_stock_threshold
                              }
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-bold text-amber-500">
                              {row.quantity}
                            </p>

                            <p className="text-[10px] text-muted-foreground">
                              units
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                  {lowStock.length === 0 && (
                    <div className="py-10 text-center">
                      <Package className="w-8 h-8 mx-auto text-emerald-500 mb-2" />

                      <p className="text-sm font-medium">
                        Stock looks good
                      </p>

                      <p className="text-xs text-muted-foreground mt-1">
                        No products are currently below their threshold.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Quick actions */}
            <section className="pos-panel rounded-xl p-4">
              <h2 className="font-semibold">
                Quick Actions
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <QuickAction
                  href="/orders"
                  icon={ShoppingCart}
                  label="New Sale"
                />

                <QuickAction
                  href="/inventory"
                  icon={Package}
                  label="Inventory"
                />

                <QuickAction
                  href="/receivables"
                  icon={Users}
                  label="Receivables"
                />

                <QuickAction
                  href="/payables"
                  icon={Wallet}
                  label="Payables"
                />
              </div>
            </section>
          </section>
        </div>
      </div>
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
  href,
  danger = false,
}: {
  icon: any
  label: string
  value: string
  description: string
  href?: string
  danger?: boolean
}) {
  const content = (
    <div
      className={`pos-panel rounded-xl p-4 h-full transition ${
        href
          ? "hover:bg-foreground/5 cursor-pointer"
          : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon
            className={`w-5 h-5 ${
              danger
                ? "text-amber-500"
                : "text-[var(--pos-brand)]"
            }`}
          />

          <span className="text-xs font-semibold text-muted-foreground">
            {label}
          </span>
        </div>

        {href && (
          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      <p className="text-2xl font-bold tracking-tight mt-3">
        {value}
      </p>

      <p className="text-xs text-muted-foreground mt-1">
        {description}
      </p>
    </div>
  )

  if (href) {
    return (
      <Link href={href}>
        {content}
      </Link>
    )
  }

  return content
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: any
  label: string
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--pos-stroke)] bg-foreground/[0.02] px-3 py-3 flex items-center gap-2 text-sm font-medium hover:bg-foreground/5 transition"
    >
      <Icon className="w-4 h-4 text-[var(--pos-brand)]" />
      {label}
    </Link>
  )
}
