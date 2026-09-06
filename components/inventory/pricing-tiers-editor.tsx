"use client"

// ----------------------------------------------------------------------
// Feature 10 — Automatic quantity-based pricing tiers.
// Lets the shop owner define, per product, "buy N or more of this and the
// unit price becomes X" rules. These are what the POS/Orders screen uses
// to automatically fill the selling price when quantity changes; the
// cashier can still always override the price manually per sale.
// ----------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react"
import { Plus, Tags, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PosPricingTierService } from "@/lib/pos-service"
import type { PosProductPriceTier } from "@/lib/supabase"

export function PricingTiersEditor({
  productId,
  unit,
}: {
  productId: string
  unit: string
}) {
  const [tiers, setTiers] = useState<PosProductPriceTier[]>([])
  const [loading, setLoading] = useState(true)
  const [newMinQty, setNewMinQty] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await PosPricingTierService.list(productId)
    setTiers(
      [...data].sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity)),
    )
    setLoading(false)
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  async function handleAdd() {
    const minQuantity = Number(newMinQty)
    const unitPrice = Number(newPrice)

    if (!Number.isFinite(minQuantity) || minQuantity <= 0) {
      toast.error("Quantity threshold must be greater than zero")
      return
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Price must be zero or greater")
      return
    }

    setAdding(true)
    try {
      await PosPricingTierService.create(productId, {
        min_quantity: minQuantity,
        unit_price: unitPrice,
      })
      toast.success("Pricing tier added")
      setNewMinQty("")
      setNewPrice("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add tier")
    } finally {
      setAdding(false)
    }
  }

  async function handleUpdate(
    tier: PosProductPriceTier,
    updates: { min_quantity?: number; unit_price?: number },
  ) {
    setSavingId(tier.id)
    try {
      await PosPricingTierService.update(tier.id, updates)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update tier")
      await load()
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(tier: PosProductPriceTier) {
    setSavingId(tier.id)
    try {
      await PosPricingTierService.remove(tier.id)
      toast.success("Pricing tier removed")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove tier")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tags className="w-3.5 h-3.5 text-muted-foreground" />
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Automatic Pricing Tiers
        </label>
      </div>

      <p className="text-xs text-muted-foreground bg-foreground/5 rounded-lg p-3">
        When a sale quantity reaches a tier's threshold, the selling price fills
        in automatically. The highest threshold the quantity qualifies for
        wins. The cashier can always type a different price in the cart —
        it will only reset to automatic if they choose to.
      </p>

      {loading ? (
        <p className="text-xs text-muted-foreground py-2">Loading tiers...</p>
      ) : (
        <div className="space-y-2">
          {tiers.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic py-1">
              No tiers yet — selling price will be entered manually at sale time.
            </p>
          )}

          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="flex items-center gap-2 bg-foreground/5 border border-foreground/10 rounded-lg p-2"
            >
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-muted-foreground shrink-0">≥</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  defaultValue={tier.min_quantity}
                  onBlur={(e) => {
                    const value = Number(e.target.value)
                    if (Number.isFinite(value) && value > 0 && value !== Number(tier.min_quantity)) {
                      handleUpdate(tier, { min_quantity: value })
                    } else {
                      e.target.value = String(tier.min_quantity)
                    }
                  }}
                  disabled={savingId === tier.id}
                  className="w-16 bg-transparent border border-foreground/10 rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-pos-brand disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground shrink-0 truncate">
                  {unit || "unit"}(s) → Rs.
                </span>
              </div>

              <input
                type="number"
                min="0"
                step="0.01"
                defaultValue={tier.unit_price}
                onBlur={(e) => {
                  const value = Number(e.target.value)
                  if (Number.isFinite(value) && value >= 0 && value !== Number(tier.unit_price)) {
                    handleUpdate(tier, { unit_price: value })
                  } else {
                    e.target.value = String(tier.unit_price)
                  }
                }}
                disabled={savingId === tier.id}
                className="w-20 bg-transparent border border-foreground/10 rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-pos-brand disabled:opacity-50"
              />

              <button
                type="button"
                onClick={() => handleDelete(tier)}
                disabled={savingId === tier.id}
                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50 shrink-0"
                title="Remove tier"
                aria-label="Remove pricing tier"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">≥</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="qty"
            value={newMinQty}
            onChange={(e) => setNewMinQty(e.target.value)}
            className="w-16 bg-foreground/5 border border-foreground/10 rounded px-1.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-pos-brand"
          />
          <span className="text-[10px] text-muted-foreground shrink-0">
            {unit || "unit"}(s)
          </span>
        </div>

        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Rs. price"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="w-24 bg-foreground/5 border border-foreground/10 rounded px-1.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-pos-brand"
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          className="p-1.5 bg-pos-brand text-black rounded-lg hover:opacity-90 transition disabled:opacity-50 shrink-0"
          title="Add tier"
          aria-label="Add pricing tier"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
