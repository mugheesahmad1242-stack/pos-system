"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, PackageCheck, Plus, Trash2, Truck, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Sidebar } from "@/components/pos/sidebar"
import { AutocompleteField, type AutocompleteOption } from "@/components/purchases/autocomplete-field"
import {
  PosInventoryService,
  PosProductService,
  PosPurchaseService,
  PosSupplierService,
  type PosInventoryRow,
  type PosPurchaseWithRelations,
} from "@/lib/pos-service"
import { cn } from "@/lib/utils"

interface LineItem {
  key: string
  product: AutocompleteOption | null
  quantity: string
  unitCost: string
}

function emptyLineItem(): LineItem {
  return { key: crypto.randomUUID(), product: null, quantity: "", unitCost: "" }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(value: number) {
  return `Rs. ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

export default function PurchasesPage() {
  const [supplier, setSupplier] = useState<AutocompleteOption | null>(null)
  const [purchaseDate, setPurchaseDate] = useState(todayISO)
  const [referenceNumber, setReferenceNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()])
  const [amountPaid, setAmountPaid] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [purchases, setPurchases] = useState<PosPurchaseWithRelations[]>([])
  const [purchasesLoading, setPurchasesLoading] = useState(true)
  const [inventory, setInventory] = useState<PosInventoryRow[]>([])

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true)
    const data = await PosPurchaseService.list()
    setPurchases(data)
    setPurchasesLoading(false)
  }, [])

  const loadInventory = useCallback(async () => {
    const data = await PosInventoryService.list()
    setInventory(data)
  }, [])

  useEffect(() => {
    loadPurchases()
    loadInventory()
  }, [loadPurchases, loadInventory])

  const total = useMemo(
    () =>
      lineItems.reduce((sum, li) => {
        const qty = Number(li.quantity) || 0
        const cost = Number(li.unitCost) || 0
        return sum + qty * cost
      }, 0),
    [lineItems],
  )

  const supplierBalances = useMemo(() => {
    const map = new Map<string, { id: string; name: string; due: number }>()
    for (const p of purchases) {
      const existing = map.get(p.supplier_id) || {
        id: p.supplier_id,
        name: p.pos_suppliers?.name || "Unknown",
        due: 0,
      }
      existing.due += Number(p.amount_due) || 0
      map.set(p.supplier_id, existing)
    }
    return Array.from(map.values()).filter((s) => s.due > 0.009)
  }, [purchases])

  function updateLineItem(key: string, patch: Partial<LineItem>) {
    setLineItems((prev) => prev.map((li) => (li.key === key ? { ...li, ...patch } : li)))
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()])
  }

  function removeLineItem(key: string) {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((li) => li.key !== key) : prev))
  }

  function resetForm() {
    setSupplier(null)
    setPurchaseDate(todayISO())
    setReferenceNumber("")
    setNotes("")
    setLineItems([emptyLineItem()])
    setAmountPaid("")
    setPaymentMethod("")
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!supplier) {
      toast.error("Select a supplier from the list, or add a new one")
      return
    }

    const items = lineItems
      .filter((li) => li.product && Number(li.quantity) > 0)
      .map((li) => ({
        product_id: li.product!.id,
        quantity: Number(li.quantity),
        unit_cost: Number(li.unitCost) || 0,
      }))

    if (items.length === 0) {
      toast.error("Add at least one product with a quantity greater than 0")
      return
    }

    setSubmitting(true)
    try {
      const result = await PosPurchaseService.create({
        supplier_id: supplier.id,
        purchase_date: purchaseDate,
        reference_number: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        items,
        amount_paid: Number(amountPaid) || 0,
        payment_method: paymentMethod.trim() || undefined,
      })

      if (!result) {
        toast.error("Failed to save purchase. Please try again.")
        return
      }

      toast.success("Purchase saved")
      resetForm()
      loadPurchases()
      loadInventory()
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
              <div>
                <h1 className="text-2xl font-bold">Purchase Entry</h1>
                <p className="text-sm text-muted-foreground">Record stock purchases from suppliers</p>
              </div>

              <form onSubmit={handleSubmit} className="pos-panel p-4 rounded-lg flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <AutocompleteField
                    id="supplier"
                    label="Supplier"
                    placeholder="Type supplier name"
                    value={supplier}
                    onChange={setSupplier}
                    searchFn={PosSupplierService.search}
                    createFn={PosSupplierService.create}
                  />
                  <div>
                    <label
                      htmlFor="purchase-date"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                    >
                      Purchase Date
                    </label>
                    <input
                      id="purchase-date"
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      required
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ref-number"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                    >
                      Reference # (optional)
                    </label>
                    <input
                      id="ref-number"
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="e.g. Invoice #"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="notes"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                    >
                      Notes (optional)
                    </label>
                    <input
                      id="notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional note"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Products
                    </span>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="text-xs font-semibold text-[var(--pos-brand-text)] flex items-center gap-1 hover:opacity-80"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add product
                    </button>
                  </div>

                  {lineItems.map((li, idx) => {
                    const qty = Number(li.quantity) || 0
                    const cost = Number(li.unitCost) || 0
                    return (
                      <div
                        key={li.key}
                        className="grid gap-3 sm:grid-cols-[1fr_100px_120px_110px_auto] items-end p-3 rounded-xl bg-foreground/[0.02] border border-[var(--pos-stroke)]"
                      >
                        <AutocompleteField
                          label={idx === 0 ? "Product" : undefined}
                          placeholder="Type product name"
                          value={li.product}
                          onChange={(option) => updateLineItem(li.key, { product: option })}
                          searchFn={PosProductService.search}
                          createFn={PosProductService.create}
                        />
                        <div>
                          {idx === 0 && (
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                              Qty
                            </label>
                          )}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={li.quantity}
                            onChange={(e) => updateLineItem(li.key, { quantity: e.target.value })}
                            placeholder="0"
                            className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                          />
                        </div>
                        <div>
                          {idx === 0 && (
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                              Cost/unit
                            </label>
                          )}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={li.unitCost}
                            onChange={(e) => updateLineItem(li.key, { unitCost: e.target.value })}
                            placeholder="0.00"
                            className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                          />
                        </div>
                        <div>
                          {idx === 0 && (
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                              Line total
                            </label>
                          )}
                          <div className="px-3 py-2.5 text-sm font-semibold text-foreground/80 truncate">
                            {formatMoney(qty * cost)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLineItem(li.key)}
                          disabled={lineItems.length === 1}
                          className="p-2.5 text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-xl transition disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove product"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>

                <div className="grid gap-4 sm:grid-cols-3 items-end">
                  <div>
                    <label
                      htmlFor="amount-paid"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                    >
                      Amount Paid (Rs)
                    </label>
                    <input
                      id="amount-paid"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="payment-method"
                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
                    >
                      Payment Method (optional)
                    </label>
                    <input
                      id="payment-method"
                      type="text"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      placeholder="e.g. Cash, Bank transfer"
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                    />
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Purchase Total
                    </p>
                    <p className="text-xl font-bold">{formatMoney(total)}</p>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--pos-stroke)]">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 rounded-xl bg-pos-brand text-black text-sm font-bold transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[var(--pos-brand)]/10 flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Purchase
                  </button>
                </div>
              </form>

              <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <div className="pos-panel rounded-lg p-4 flex flex-col gap-3 min-w-0">
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Recent Purchases
                  </h2>
                  {purchasesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : purchases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No purchases yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-[var(--pos-stroke)]">
                            <th className="py-2 pr-3">Date</th>
                            <th className="py-2 pr-3">Supplier</th>
                            <th className="py-2 pr-3">Items</th>
                            <th className="py-2 pr-3 text-right">Total</th>
                            <th className="py-2 pr-3 text-right">Paid</th>
                            <th className="py-2 pr-3 text-right">Due</th>
                            <th className="py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchases.map((p) => (
                            <tr key={p.id} className="border-b border-[var(--pos-stroke)]/50 align-top">
                              <td className="py-2 pr-3 whitespace-nowrap">{p.purchase_date}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">{p.pos_suppliers?.name || "—"}</td>
                              <td className="py-2 pr-3">
                                <ul className="space-y-0.5">
                                  {p.pos_purchase_items.map((it) => (
                                    <li key={it.id} className="text-xs text-muted-foreground whitespace-nowrap">
                                      {it.pos_products?.name || "—"} × {it.quantity} @ Rs.{it.unit_cost}
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="py-2 pr-3 text-right whitespace-nowrap">
                                {formatMoney(Number(p.total_amount) || 0)}
                              </td>
                              <td className="py-2 pr-3 text-right whitespace-nowrap">
                                {formatMoney(Number(p.amount_paid) || 0)}
                              </td>
                              <td className="py-2 pr-3 text-right whitespace-nowrap">
                                {formatMoney(Number(p.amount_due) || 0)}
                              </td>
                              <td className="py-2 text-right whitespace-nowrap">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                                    p.payment_status === "paid" && "bg-emerald-500/10 text-emerald-500",
                                    p.payment_status === "partial" && "bg-amber-500/10 text-amber-500",
                                    p.payment_status === "unpaid" && "bg-red-500/10 text-red-500",
                                  )}
                                >
                                  {p.payment_status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4 min-w-0">
                  <div className="pos-panel rounded-lg p-4 flex flex-col gap-3">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                      <PackageCheck className="w-4 h-4" /> Current Stock
                    </h2>
                    {inventory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No stock yet.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                        {inventory.map((inv) => (
                          <li key={inv.product_id} className="flex justify-between gap-3 text-sm">
                            <span className="text-foreground/80 truncate">{inv.pos_products?.name || "—"}</span>
                            <span className="font-semibold whitespace-nowrap">
                              {inv.quantity} {inv.pos_products?.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="pos-panel rounded-lg p-4 flex flex-col gap-3">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                      <Wallet className="w-4 h-4" /> Supplier Balances
                    </h2>
                    {supplierBalances.length === 0 ? (
                      <p className="text-sm text-muted-foreground">All suppliers settled.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {supplierBalances.map((s) => (
                          <li key={s.id} className="flex justify-between gap-3 text-sm">
                            <span className="text-foreground/80 truncate">{s.name}</span>
                            <span className="font-semibold text-amber-500 whitespace-nowrap">
                              {formatMoney(s.due)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
