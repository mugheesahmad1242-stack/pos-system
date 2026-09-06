"use client"

import type React from "react"
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  resolveTierPrice,
  hasPricingTiers,
  type PricingTierMap,
} from "@/lib/pricing-tiers"

export type PriceMode = "auto" | "manual"

export type CartItem = {
  id: string
  name: string
  price: number
  qty: number
  // "auto": price is recalculated from this product's pricing tiers every
  // time quantity changes (Feature 10). "manual": the cashier has typed a
  // price directly, and it stays put until they hit "Use automatic" again.
  priceMode: PriceMode
}

type CartCtx = {
  items: CartItem[]
  add: (item: { id: string; name: string }) => void
  inc: (id: string) => void
  dec: (id: string) => void
  setQty: (id: string, qty: number) => void
  setPrice: (id: string, price: number) => void
  resetToAutomaticPrice: (id: string) => void
  hasTiers: (id: string) => boolean
  remove: (id: string) => void
  subtotal: number
  clear: () => void
}

const Ctx = createContext<CartCtx | null>(null)

export function CartProvider({
  children,
  pricingTiers,
}: {
  children: React.ReactNode
  // Product id -> that product's quantity-price tiers. Optional so the
  // provider works unchanged for callers that don't have tiers loaded yet
  // (or at all) — in that case every product simply has no automatic
  // price, exactly matching the pre-Feature-10 manual-only behavior.
  pricingTiers?: PricingTierMap
}) {
  const [items, setItems] = useState<CartItem[]>([])

  // Kept in a ref so add/inc/dec/setQty (defined once per render, same as
  // before) always read the latest tiers without needing to be redeclared
  // as useCallback with a dependency array — avoids touching the existing
  // function shapes/behavior beyond what Feature 10 requires.
  const tiersRef = useRef<PricingTierMap>(pricingTiers || {})
  useEffect(() => {
    tiersRef.current = pricingTiers || {}
  }, [pricingTiers])

  // When tiers finish loading (or change) after items are already in the
  // cart, refresh the price of any line that's still in "auto" mode so it
  // reflects the correct tier instead of staying at 0 / stale.
  useEffect(() => {
    if (!pricingTiers) return

    setItems((prev) =>
      prev.map((item) => {
        if (item.priceMode !== "auto") return item

        const autoPrice = resolveTierPrice(pricingTiers[item.id], item.qty)
        if (autoPrice === null) return item
        if (autoPrice === item.price) return item

        return { ...item, price: autoPrice }
      }),
    )
    // Only re-run when the tiers object itself changes, not on every
    // item/qty edit (those are handled inline by the mutators below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingTiers])

  const autoPriceFor = (id: string, qty: number): number => {
    const resolved = resolveTierPrice(tiersRef.current[id], qty)
    return resolved === null ? 0 : resolved
  }

  const add = (item: { id: string; name: string }) =>
    setItems((prev) => {
      const found = prev.find((p) => p.id === item.id)

      if (found) {
        const qty = found.qty + 1
        const price =
          found.priceMode === "auto" ? autoPriceFor(item.id, qty) : found.price

        return prev.map((p) =>
          p.id === item.id ? { ...p, qty, price } : p,
        )
      }

      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          qty: 1,
          price: autoPriceFor(item.id, 1),
          priceMode: "auto",
        },
      ]
    })

  const inc = (id: string) =>
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const qty = p.qty + 1
        const price = p.priceMode === "auto" ? autoPriceFor(id, qty) : p.price
        return { ...p, qty, price }
      }),
    )

  const dec = (id: string) =>
    setItems((prev) =>
      prev
        .map((p) => {
          if (p.id !== id) return p
          const qty = Math.max(0, p.qty - 1)
          const price = p.priceMode === "auto" ? autoPriceFor(id, qty) : p.price
          return { ...p, qty, price }
        })
        .filter((p) => p.qty > 0),
    )

  const setQty = (id: string, qty: number) => {
    if (!Number.isFinite(qty) || qty <= 0) {
      setItems((prev) => prev.filter((p) => p.id !== id))
      return
    }

    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const price = p.priceMode === "auto" ? autoPriceFor(id, qty) : p.price
        return { ...p, qty, price }
      }),
    )
  }

  const setPrice = (id: string, price: number) => {
    if (!Number.isFinite(price) || price < 0) {
      return
    }

    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              price,
              // Typing a price is an explicit manual override — it must
              // stick even if quantity changes afterwards, until the
              // cashier explicitly resets it back to automatic.
              priceMode: "manual",
            }
          : p,
      ),
    )
  }

  const resetToAutomaticPrice = (id: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, price: autoPriceFor(id, p.qty), priceMode: "auto" }
          : p,
      ),
    )
  }

  const hasTiers = (id: string) => hasPricingTiers(tiersRef.current, id)

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }

  const clear = () => setItems([])

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + item.price * item.qty,
        0,
      ),
    [items],
  )

  const value = {
    items,
    add,
    inc,
    dec,
    setQty,
    setPrice,
    resetToAutomaticPrice,
    hasTiers,
    remove,
    subtotal,
    clear,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCart = () => {
  const ctx = useContext(Ctx)

  if (!ctx) {
    throw new Error(
      "useCart must be used within CartProvider",
    )
  }

  return ctx
}
