"use client"

import type React from "react"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clock, Loader2, UserPlus, Users, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Sidebar } from "@/components/pos/sidebar"
import { AutocompleteField, type AutocompleteOption } from "@/components/purchases/autocomplete-field"
import {
  PosCustomerService,
  PosSaleService,
  PosCustomerPaymentService,
  type PosSaleWithRelations,
  type PosCustomerPaymentWithSale,
} from "@/lib/pos-service"
import { cn } from "@/lib/utils"

interface CustomerSummary {
  id: string
  name: string
  totalSold: number
  totalPaid: number
  outstanding: number
  saleCount: number
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(value: number) {
  return `Rs. ${(Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function ReceivablesPage() {
  const [sales, setSales] = useState<PosSaleWithRelations[]>([])
  const [salesLoading, setSalesLoading] = useState(true)

  // Customer create/select — a customer only needs a name, and can be
  // created right here rather than on a separate setup page. Selecting an
  // existing (case-insensitive) match always reuses that customer; there is
  // no path that silently creates a duplicate.
  const [customerField, setCustomerField] = useState<AutocompleteOption | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<AutocompleteOption | null>(null)

  const [payments, setPayments] = useState<PosCustomerPaymentWithSale[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

  const [payingSaleId, setPayingSaleId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState("")
  const [payDate, setPayDate] = useState(todayISO)
  const [payMethod, setPayMethod] = useState("")
  const [payNotes, setPayNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const loadSales = useCallback(async () => {
    setSalesLoading(true)
    const data = await PosSaleService.list()
    setSales(data)
    setSalesLoading(false)
  }, [])

  const loadPayments = useCallback(async (customerId: string) => {
    setPaymentsLoading(true)
    const data = await PosCustomerPaymentService.listForCustomer(customerId)
    setPayments(data)
    setPaymentsLoading(false)
  }, [])

  useEffect(() => {
    loadSales()
  }, [loadSales])

  useEffect(() => {
    if (selectedCustomer) loadPayments(selectedCustomer.id)
    else setPayments([])
  }, [selectedCustomer, loadPayments])

  // Balances are always derived from pos_sales + pos_customer_payments, never
  // stored/edited directly — this is what keeps the original credit amount
  // untouched no matter how many partial payments come in later.
  const customerSummaries = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>()
    for (const s of sales) {
      if (!s.customer_id) continue
      const existing = map.get(s.customer_id) || {
        id: s.customer_id,
        name: s.pos_customers?.name || "Unknown customer",
        totalSold: 0,
        totalPaid: 0,
        outstanding: 0,
        saleCount: 0,
      }
      existing.totalSold += Number(s.total_amount) || 0
      existing.totalPaid += Number(s.amount_paid) || 0
      existing.outstanding += Number(s.amount_due) || 0
      existing.saleCount += 1
      map.set(s.customer_id, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding)
  }, [sales])

  const totalOutstanding = useMemo(
    () => customerSummaries.reduce((sum, c) => sum + c.outstanding, 0),
    [customerSummaries],
  )

  // The selected customer may not have any sales yet (e.g. just created),
  // so fall back to a zeroed summary instead of requiring list membership.
  const selectedSummary: CustomerSummary | null = selectedCustomer
    ? customerSummaries.find((c) => c.id === selectedCustomer.id) || {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        totalSold: 0,
        totalPaid: 0,
        outstanding: 0,
        saleCount: 0,
      }
    : null

  const customerSales = useMemo(
    () =>
      sales
        .filter((s) => s.customer_id === selectedCustomer?.id)
        .sort((a, b) => (a.sale_date < b.sale_date ? 1 : -1)),
    [sales, selectedCustomer],
  )

  function selectCustomer(option: AutocompleteOption) {
    setSelectedCustomer(option)
    setCustomerField(option)
    setPayingSaleId(null)
  }

  function openPaymentForm(sale: PosSaleWithRelations) {
    setPayingSaleId(sale.id)
    setPayAmount(String(Number(sale.amount_due) || ""))
    setPayDate(todayISO())
    setPayMethod("")
    setPayNotes("")
  }

  function closePaymentForm() {
    setPayingSaleId(null)
  }

  async function handleRecordPayment(e: React.FormEvent<HTMLFormElement>, sale: PosSaleWithRelations) {
    e.preventDefault()
    if (!selectedCustomer) return

    const amount = Number(payAmount)
    if (!(amount > 0)) {
      toast.error("Enter a payment amount greater than 0")
      return
    }

    setSubmitting(true)
    try {
      await PosCustomerPaymentService.create({
        customer_id: selectedCustomer.id,
        sale_id: sale.id,
        amount,
        payment_date: payDate,
        payment_method: payMethod.trim() || undefined,
        notes: payNotes.trim() || undefined,
      })

      toast.success("Payment recorded")
      closePaymentForm()
      await loadSales()
      await loadPayments(selectedCustomer.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record payment")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <div className="flex gap-3 flex-1 overflow-hidden">
            <Sidebar />
            <section className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="text-2xl font-bold">Customer Receivables</h1>
                  <p className="text-sm text-muted-foreground">
                    Track what customers owe and record payments against their sales
                  </p>
                </div>
                <div className="pos-panel rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Total Outstanding
                    </p>
                    <p className="text-lg font-bold text-amber-500">{formatMoney(totalOutstanding)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_2fr] min-h-0 flex-1">
                {/* Customer list + create/select */}
                <div className="pos-panel rounded-lg p-4 flex flex-col gap-3 min-w-0">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Users className="w-4 h-4" /> Customers
                  </h2>

                  <AutocompleteField
                    id="customer-picker"
                    placeholder="Find or add a customer by name..."
                    value={customerField}
                    onChange={(option) => {
                      setCustomerField(option)
                      if (option) selectCustomer(option)
                    }}
                    searchFn={PosCustomerService.search}
                    createFn={PosCustomerService.create}
                  />

                  {salesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : customerSummaries.length === 0 ? (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" /> No sales recorded yet — search above to add a customer.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5 overflow-y-auto">
                      {customerSummaries.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => selectCustomer({ id: c.id, name: c.name })}
                            className={cn(
                              "w-full text-left rounded-xl px-3 py-2.5 transition flex items-center justify-between gap-3",
                              c.id === selectedCustomer?.id
                                ? "bg-pos-brand text-black"
                                : "bg-foreground/5 hover:bg-foreground/10",
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold truncate">{c.name}</span>
                              <span
                                className={cn(
                                  "block text-[11px]",
                                  c.id === selectedCustomer?.id ? "text-black/70" : "text-muted-foreground",
                                )}
                              >
                                {c.saleCount} sale{c.saleCount === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "text-sm font-bold whitespace-nowrap",
                                c.outstanding > 0.009
                                  ? c.id === selectedCustomer?.id
                                    ? "text-black"
                                    : "text-amber-500"
                                  : c.id === selectedCustomer?.id
                                    ? "text-black/70"
                                    : "text-emerald-500",
                              )}
                            >
                              {c.outstanding > 0.009 ? formatMoney(c.outstanding) : "Settled"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Detail: sales + payment history for the selected customer */}
                <div className="flex flex-col gap-4 min-w-0 overflow-y-auto">
                  {!selectedSummary ? (
                    <div className="pos-panel rounded-lg p-8 flex items-center justify-center text-sm text-muted-foreground">
                      Search or select a customer to view sales and record payments
                    </div>
                  ) : (
                    <>
                      <div className="pos-panel rounded-lg p-4 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Total Sold
                          </p>
                          <p className="text-base font-bold">{formatMoney(selectedSummary.totalSold)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Total Paid
                          </p>
                          <p className="text-base font-bold text-emerald-500">
                            {formatMoney(selectedSummary.totalPaid)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Outstanding
                          </p>
                          <p
                            className={cn(
                              "text-base font-bold",
                              selectedSummary.outstanding > 0.009 ? "text-amber-500" : "text-emerald-500",
                            )}
                          >
                            {formatMoney(selectedSummary.outstanding)}
                          </p>
                        </div>
                      </div>

                      <div className="pos-panel rounded-lg p-4 flex flex-col gap-3">
                        <h2 className="text-sm font-bold">Sales</h2>
                        {customerSales.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No sales recorded for this customer yet. Sales are created from the POS.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-[var(--pos-stroke)]">
                                  <th className="py-2 pr-3">Date</th>
                                  <th className="py-2 pr-3">Notes</th>
                                  <th className="py-2 pr-3 text-right">Sale Amount</th>
                                  <th className="py-2 pr-3 text-right">Paid</th>
                                  <th className="py-2 pr-3 text-right">Remaining</th>
                                  <th className="py-2 pr-3 text-right">Status</th>
                                  <th className="py-2 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {customerSales.map((s) => {
                                  const due = Number(s.amount_due) || 0
                                  const isPaying = payingSaleId === s.id
                                  return (
                                    <Fragment key={s.id}>
                                      <tr className="border-b border-[var(--pos-stroke)]/50 align-top">
                                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(s.sale_date)}</td>
                                        <td className="py-2 pr-3 whitespace-nowrap">{s.notes || "—"}</td>
                                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                                          {formatMoney(Number(s.total_amount) || 0)}
                                        </td>
                                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                                          {formatMoney(Number(s.amount_paid) || 0)}
                                        </td>
                                        <td className="py-2 pr-3 text-right whitespace-nowrap font-semibold">
                                          {formatMoney(due)}
                                        </td>
                                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                                          <span
                                            className={cn(
                                              "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                                              s.payment_status === "paid" && "bg-emerald-500/10 text-emerald-500",
                                              s.payment_status === "partial" && "bg-amber-500/10 text-amber-500",
                                              s.payment_status === "credit" && "bg-red-500/10 text-red-500",
                                            )}
                                          >
                                            {s.payment_status}
                                          </span>
                                        </td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                          {due > 0.009 ? (
                                            <button
                                              type="button"
                                              onClick={() => (isPaying ? closePaymentForm() : openPaymentForm(s))}
                                              className="px-3 py-1.5 rounded-lg bg-pos-brand text-black text-xs font-bold transition active:scale-[0.98]"
                                            >
                                              {isPaying ? "Cancel" : "Record Payment"}
                                            </button>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-semibold">
                                              <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                      {isPaying && (
                                        <tr className="border-b border-[var(--pos-stroke)]/50">
                                          <td colSpan={7} className="py-3">
                                            <form
                                              onSubmit={(e) => handleRecordPayment(e, s)}
                                              className="bg-foreground/5 rounded-xl p-4 grid gap-3 sm:grid-cols-4 items-end"
                                            >
                                              <div>
                                                <label
                                                  htmlFor={`amount-${s.id}`}
                                                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                                                >
                                                  Amount (Rs)
                                                </label>
                                                <input
                                                  id={`amount-${s.id}`}
                                                  type="number"
                                                  min="0.01"
                                                  step="0.01"
                                                  max={due}
                                                  value={payAmount}
                                                  onChange={(e) => setPayAmount(e.target.value)}
                                                  className="w-full bg-background border border-foreground/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                                                />
                                                <p className="text-[10px] text-muted-foreground mt-1">
                                                  Remaining: {formatMoney(due)}
                                                </p>
                                              </div>
                                              <div>
                                                <label
                                                  htmlFor={`date-${s.id}`}
                                                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                                                >
                                                  Payment Date
                                                </label>
                                                <input
                                                  id={`date-${s.id}`}
                                                  type="date"
                                                  value={payDate}
                                                  onChange={(e) => setPayDate(e.target.value)}
                                                  className="w-full bg-background border border-foreground/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                                                />
                                              </div>
                                              <div>
                                                <label
                                                  htmlFor={`method-${s.id}`}
                                                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                                                >
                                                  Method (optional)
                                                </label>
                                                <input
                                                  id={`method-${s.id}`}
                                                  type="text"
                                                  value={payMethod}
                                                  onChange={(e) => setPayMethod(e.target.value)}
                                                  placeholder="e.g. Cash"
                                                  className="w-full bg-background border border-foreground/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                                                />
                                              </div>
                                              <div className="flex gap-2">
                                                <button
                                                  type="submit"
                                                  disabled={submitting}
                                                  className="flex-1 px-3 py-2 rounded-xl bg-pos-brand text-black text-xs font-bold transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                                >
                                                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                  Save
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={closePaymentForm}
                                                  className="px-3 py-2 rounded-xl bg-foreground/10 text-xs font-semibold transition active:scale-[0.98]"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                              <div className="sm:col-span-4">
                                                <label
                                                  htmlFor={`notes-${s.id}`}
                                                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                                                >
                                                  Notes (optional)
                                                </label>
                                                <input
                                                  id={`notes-${s.id}`}
                                                  type="text"
                                                  value={payNotes}
                                                  onChange={(e) => setPayNotes(e.target.value)}
                                                  placeholder="Reference, cheque #, etc."
                                                  className="w-full bg-background border border-foreground/10 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                                                />
                                              </div>
                                            </form>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="pos-panel rounded-lg p-4 flex flex-col gap-3">
                        <h2 className="text-sm font-bold flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Payment History
                        </h2>
                        {paymentsLoading ? (
                          <p className="text-sm text-muted-foreground">Loading...</p>
                        ) : payments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-[var(--pos-stroke)]">
                                  <th className="py-2 pr-3">Payment Date</th>
                                  <th className="py-2 pr-3">Against Sale</th>
                                  <th className="py-2 pr-3 text-right">Amount</th>
                                  <th className="py-2 pr-3">Method</th>
                                  <th className="py-2">Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map((pay) => (
                                  <tr key={pay.id} className="border-b border-[var(--pos-stroke)]/50">
                                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(pay.payment_date)}</td>
                                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                                      {pay.pos_sales ? formatDate(pay.pos_sales.sale_date) : "—"}
                                    </td>
                                    <td className="py-2 pr-3 text-right whitespace-nowrap font-semibold">
                                      {formatMoney(Number(pay.amount) || 0)}
                                    </td>
                                    <td className="py-2 pr-3 whitespace-nowrap">{pay.payment_method || "—"}</td>
                                    <td className="py-2 text-muted-foreground">{pay.notes || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}