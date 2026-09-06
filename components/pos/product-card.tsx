"use client"

import { useCart } from "./cart-context"
import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProductCard({
  id,
  name,
  stock = 0,
  highlight,
}: {
  id: string
  name: string
  stock?: number
  highlight?: "tile-pink" | "tile-blue" | "tile-purple"
}) {
  const { items, inc, dec, add } = useCart()

  const item = items.find((i) => i.id === id)
  const qty = item?.qty ?? 0

  const isOutOfStock = stock <= 0
  const isStockLimitReached = qty >= stock

  const handleCardClick = () => {
    if (isOutOfStock || isStockLimitReached) return

    if (qty > 0) {
      inc(id)
    } else {
      add({ id, name })
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        "tile p-4 bg-[var(--pos-panel)] text-foreground transition-all duration-300 relative cursor-pointer hover:bg-muted/10",
        highlight,
        isOutOfStock &&
          "opacity-60 saturate-50 border-red-500/20 dark:border-red-900/50 cursor-not-allowed",
      )}
    >
      {isOutOfStock && (
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-750 dark:text-red-300 border border-red-200 dark:border-red-900/40 uppercase tracking-wider">
          Out of Stock
        </span>
      )}

      <div className="font-medium pr-16">{name}</div>

      <div className="text-sm text-muted-foreground mt-1">
        Enter selling price in cart
      </div>

      <div className="text-[10px] text-muted-foreground/80 mt-1">
        Stock: {stock}
      </div>

      <div className="mt-6 flex items-center justify-center gap-1">
        <button
          className="pos-panel rounded-md w-8 h-8 flex items-center justify-center disabled:opacity-50 transition-opacity cursor-pointer"
          aria-label={`Decrease ${name}`}
          onClick={(e) => {
            e.stopPropagation()

            if (qty > 0) {
              dec(id)
            }
          }}
          disabled={qty === 0}
        >
          <Minus className="h-3 w-3" />
        </button>

        <div
          onClick={(e) => e.stopPropagation()}
          className="pos-panel rounded-md w-8 h-8 flex items-center justify-center text-sm font-medium"
        >
          {qty}
        </div>

        <button
          className="pos-panel rounded-md w-8 h-8 flex items-center justify-center transition-opacity disabled:opacity-30 cursor-pointer"
          aria-label={`Increase ${name}`}
          onClick={(e) => {
            e.stopPropagation()

            if (isStockLimitReached) return

            if (qty > 0) {
              inc(id)
            } else {
              add({ id, name })
            }
          }}
          disabled={isOutOfStock || isStockLimitReached}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}