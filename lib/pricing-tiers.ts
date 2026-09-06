// ----------------------------------------------------------------------
// Feature 10 — Automatic quantity-based pricing tiers.
// Shared by the cart (auto-price on add/quantity change) and anywhere
// else in the UI that needs to preview or explain tier pricing. Mirrors
// the DB helper pos_resolve_tier_price() in
// supabase-pos-feature-10-pricing-tiers.sql: the HIGHEST-threshold tier
// whose min_quantity is <= the requested quantity wins. If nothing
// matches, there is no automatic price and the caller should fall back
// to manual entry.
// ----------------------------------------------------------------------

export interface PriceTier {
  min_quantity: number
  unit_price: number
}

/** Map of product id -> that product's tiers (any order; not required to be sorted). */
export type PricingTierMap = Record<string, PriceTier[]>

/**
 * Returns the automatic unit price for `quantity` units of a product,
 * given its tiers, or `null` if no tier's min_quantity is reached (or the
 * product has no tiers at all) — meaning the caller should fall back to
 * manual price entry.
 */
export function resolveTierPrice(
  tiers: PriceTier[] | undefined,
  quantity: number,
): number | null {
  if (!tiers || tiers.length === 0) return null
  if (!Number.isFinite(quantity) || quantity <= 0) return null

  let best: PriceTier | null = null

  for (const tier of tiers) {
    if (tier.min_quantity <= quantity) {
      if (!best || tier.min_quantity > best.min_quantity) {
        best = tier
      }
    }
  }

  return best ? best.unit_price : null
}

/** True if a product has at least one configured tier (i.e. automatic pricing is possible). */
export function hasPricingTiers(
  tiersByProduct: PricingTierMap,
  productId: string,
): boolean {
  return (tiersByProduct[productId]?.length ?? 0) > 0
}
