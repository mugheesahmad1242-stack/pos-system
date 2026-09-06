"use client"

import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Trash2,
  User,
  X,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCart } from "./cart-context"
import {
  PosCustomerService,
  PosSaleService,
} from "@/lib/pos-service"
import {
  AutocompleteField,
  type AutocompleteOption,
} from "@/components/purchases/autocomplete-field"
import { cn } from "@/lib/utils"

type PaymentMode = "paid" | "credit" | "partial"

export function OrderSummary({
  refetchData,
}: {
  refetchData?: () => void | Promise<void>
}) {
  const {
    items,
    subtotal,
    clear,
    inc,
    dec,
    remove,
    setQty,
    setPrice,
    resetToAutomaticPrice,
    hasTiers,
  } = useCart()

  // Below md (phone), the cart lives off-screen as a bottom sheet — the
  // w-96 static panel would otherwise take up more than the whole screen
  // width. A floating "Cart" button opens it; it stays open through the
  // checkout flow so the cashier can see confirmation state.
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0)

  const [customer, setCustomer] =
    useState<AutocompleteOption | null>(null)

  const [paymentMode, setPaymentMode] =
    useState<PaymentMode>("paid")

  const [paidAmount, setPaidAmount] =
    useState("")

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (paymentMode === "paid") {
      setPaidAmount(subtotal > 0 ? subtotal.toFixed(2) : "")
      return
    }

    if (paymentMode === "credit") {
      setPaidAmount("0")
      return
    }

    const current = Number(paidAmount)

    if (
      !Number.isFinite(current) ||
      current <= 0 ||
      current >= subtotal
    ) {
      setPaidAmount("")
    }
  }, [subtotal, paymentMode])

  const numericPaidAmount = Number(paidAmount)
  const remaining =
    subtotal - (Number.isFinite(numericPaidAmount) ? numericPaidAmount : 0)

  const selectPaymentMode = (mode: PaymentMode) => {
    setPaymentMode(mode)

    if (mode === "paid") {
      setPaidAmount(subtotal > 0 ? subtotal.toFixed(2) : "")
    } else if (mode === "credit") {
      setPaidAmount("0")
    } else {
      setPaidAmount("")
    }
  }

  const handlePaidAmountChange = (
    value: string,
  ) => {
    setPaidAmount(value)

    const amount = Number(value)

    if (!Number.isFinite(amount)) {
      return
    }

    if (amount === 0) {
      setPaymentMode("credit")
    } else if (amount >= subtotal) {
      setPaymentMode("paid")
    } else {
      setPaymentMode("partial")
    }
  }

  const handleSaveSale = async () => {
    if (items.length === 0) {
      toast.error("Please add at least one product")
      return
    }

    for (const item of items) {
      if (!Number.isFinite(item.qty) || item.qty <= 0) {
        toast.error(`Invalid quantity for ${item.name}`)
        return
      }

      if (!Number.isFinite(item.price) || item.price <= 0) {
        toast.error(`Enter a selling price for ${item.name}`)
        return
      }
    }

    const amount = Number(paidAmount)

    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Paid amount must be zero or greater")
      return
    }

    if (amount > subtotal + 0.009) {
      toast.error("Paid amount cannot be greater than the sale total")
      return
    }

    const normalizedAmount =
      Math.abs(amount - subtotal) <= 0.009
        ? subtotal
        : amount

    const isOutstanding =
      subtotal - normalizedAmount > 0.009

    if (isOutstanding && !customer) {
      toast.error(
        "Select a customer for credit or partial payment",
      )
      return
    }

    setSaving(true)

    try {
      await PosSaleService.create({
        customer_id: customer?.id ?? null,
        paid_amount: normalizedAmount,
        items: items.map((item) => ({
          product_id: item.id,
          quantity: item.qty,
          unit_price: item.price,
        })),
      })

      clear()
      setCustomer(null)
      setPaymentMode("paid")
      setPaidAmount("")

      await refetchData?.()

      setSuccess(true)
      toast.success("Sale saved successfully")

      window.setTimeout(
        () => setSuccess(false),
        1500,
      )
    } catch (error) {
      console.error("Failed to save sale:", error)

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save sale",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Mobile "View Cart" trigger — floats above the product grid,
          only below md. Shows a live item-count badge. */}
      <button
        type="button"
        onClick={() => setMobileCartOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 pl-4 pr-3 py-3 rounded-full bg-pos-brand text-black font-semibold shadow-lg shadow-black/20 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--pos-brand)] focus-visible:outline-none focus-visible:ring-offset-background"
        aria-label={`View cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      >
        <ShoppingBag className="w-4 h-4" />
        <span className="text-sm">Cart</span>
        {itemCount > 0 && (
          <span className="min-w-[20px] h-5 px-1 rounded-full bg-black/80 text-white text-[11px] font-bold flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </button>

      {/* Mobile backdrop for the cart sheet */}
      {mobileCartOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileCartOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "pos-panel w-96 shrink-0 p-4 flex flex-col gap-4 h-full",
          // Mobile: off-canvas bottom sheet instead of a static side column.
          "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-16 max-md:z-50 max-md:w-full max-md:rounded-t-2xl max-md:transition-transform max-md:duration-300 max-md:ease-in-out",
          mobileCartOpen ? "max-md:translate-y-0" : "max-md:translate-y-full",
        )}
        role={mobileCartOpen ? "dialog" : undefined}
        aria-modal={mobileCartOpen ? true : undefined}
        aria-label="Cart"
      >
        <div className="md:hidden flex justify-center -mt-1 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-foreground/20" />
        </div>

        <header className="flex items-center gap-2 shrink-0 pb-2 border-b border-[var(--pos-stroke)]">
          <ShoppingBag className="w-4 h-4 text-[var(--pos-brand-text)]" />
          <span className="text-sm font-semibold flex-1">
            New Sale
          </span>
          <button
            type="button"
            onClick={() => setMobileCartOpen(false)}
            className="md:hidden p-1 -mr-1 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--pos-brand)] focus-visible:outline-none focus-visible:ring-offset-background"
            aria-label="Close cart"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

      <div className="shrink-0">
        <AutocompleteField
          id="pos-customer"
          label="Customer"
          placeholder="Search or create customer"
          value={customer}
          onChange={setCustomer}
          searchFn={PosCustomerService.search}
          createFn={PosCustomerService.create}
        />
      </div>

      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-12">
          <div className="p-4 rounded-full bg-muted/50">
            <ShoppingBag className="w-12 h-12 text-muted-foreground" />
          </div>

          <div>
            <p className="text-lg font-medium text-muted-foreground">
              Cart is empty
            </p>

            <p className="text-sm text-muted-foreground mt-1">
              Add products to start a sale
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 min-h-0">
            <div className="grid gap-3">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="pos-panel rounded-xl p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="pos-panel h-6 w-6 shrink-0 rounded-full grid place-items-center text-xs font-medium">
                        {index + 1}
                      </span>

                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {item.name}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="text-muted-foreground hover:text-red-500 transition"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <label className="text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Selling price</span>

                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                            item.priceMode === "auto"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {item.priceMode === "auto" ? "Auto" : "Manual"}
                        </span>
                      </div>

                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">
                          Rs.
                        </span>

                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.price || ""}
                          onChange={(event) => {
                            const value = Number(
                              event.target.value,
                            )

                            setPrice(
                              item.id,
                              Number.isFinite(value)
                                ? value
                                : 0,
                            )
                          }}
                          className={`w-full bg-foreground/5 border border-foreground/10 rounded-lg pl-9 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand ${
                            item.priceMode === "manual" && hasTiers(item.id)
                              ? "pr-9"
                              : "pr-2"
                          }`}
                        />

                        {item.priceMode === "manual" && hasTiers(item.id) && (
                          <button
                            type="button"
                            onClick={() => resetToAutomaticPrice(item.id)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-pos-brand transition"
                            title="Use automatic (tier) price"
                            aria-label={`Use automatic price for ${item.name}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </label>

                    <label className="text-xs text-muted-foreground">
                      Quantity

                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => dec(item.id)}
                          className="pos-panel rounded-lg w-9 h-9 flex items-center justify-center"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.qty}
                          onChange={(event) => {
                            const value = Number(
                              event.target.value,
                            )

                            if (Number.isFinite(value)) {
                              setQty(item.id, value)
                            }
                          }}
                          className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-2 py-2 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand"
                        />

                        <button
                          type="button"
                          onClick={() => inc(item.id)}
                          className="pos-panel rounded-lg w-9 h-9 flex items-center justify-center"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--pos-stroke)]">
                    <span className="text-xs text-muted-foreground">
                      Line total
                    </span>

                    <span className="font-semibold">
                      Rs.
                      {(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="shrink-0 space-y-4">
            <div className="pos-panel rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  Grand Total
                </span>

                <span className="text-xl font-bold">
                  Rs.{subtotal.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  Payment
                </label>

                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() =>
                      selectPaymentMode("paid")
                    }
                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                      paymentMode === "paid"
                        ? "bg-pos-brand text-black"
                        : "bg-foreground/5 hover:bg-foreground/10"
                    }`}
                  >
                    Paid
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      selectPaymentMode("partial")
                    }
                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                      paymentMode === "partial"
                        ? "bg-pos-brand text-black"
                        : "bg-foreground/5 hover:bg-foreground/10"
                    }`}
                  >
                    Partial
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      selectPaymentMode("credit")
                    }
                    className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                      paymentMode === "credit"
                        ? "bg-pos-brand text-black"
                        : "bg-foreground/5 hover:bg-foreground/10"
                    }`}
                  >
                    Credit
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="pos-paid-amount"
                  className="text-xs text-muted-foreground"
                >
                  Paid amount
                </label>

                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs">
                    Rs.
                  </span>

                  <input
                    id="pos-paid-amount"
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={paidAmount}
                    onChange={(event) =>
                      handlePaidAmountChange(
                        event.target.value,
                      )
                    }
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand"
                    aria-label="Paid amount"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Remaining
                </span>

                <span
                  className={
                    remaining > 0.009
                      ? "font-semibold text-amber-500"
                      : "font-semibold text-emerald-500"
                  }
                >
                  Rs.
                  {Math.max(remaining, 0).toFixed(2)}
                </span>
              </div>

              {remaining > 0.009 && !customer && (
                <p className="text-xs text-amber-500">
                  Select a customer to save a credit or
                  partial payment.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveSale}
              disabled={saving || success}
              className={`w-full rounded-full py-3 font-medium transition flex items-center justify-center gap-2 ${
                success
                  ? "bg-emerald-600 text-white"
                  : "bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              }`}
            >
              {success ? (
                <>
                  <Check size={18} />
                  Sale Saved
                </>
              ) : (
                <>
                  <User size={18} />
                  {saving
                    ? "Saving..."
                    : "Complete Sale"}
                </>
              )}
            </button>
          </div>
        </>
      )}
      </aside>
    </>
  )
}