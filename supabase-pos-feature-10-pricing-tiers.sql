-- ============================================================================
-- Feature 10 — Automatic Quantity-Based Pricing Tiers
-- Run after:
--   1. supabase-pos-foundation-schema.sql
--   2. supabase-pos-sales.sql
--   3. supabase-pos-feature-7-payments.sql
--
-- PURELY ADDITIVE. This migration only creates one new table, its indexes,
-- trigger, and RLS policy. It does not ALTER, DROP, or otherwise touch any
-- existing table, function, or trigger — pos_create_sale(), FIFO cost
-- allocation, inventory locking/deduction, and the payment/receivable/
-- payable triggers are completely untouched. A sale is still recorded with
-- whatever unit_price the client sends per line item; this table only
-- supplies the price the client pre-fills into that field (automatically,
-- by quantity), and the app still allows a manual override per line.
--
-- SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS / OR
-- REPLACE / DROP ... IF EXISTS before CREATE).
-- ============================================================================


-- ============================================================================
-- 1. PRICE TIERS — product-specific, quantity-based selling price rules.
--
-- A tier means: "if the quantity sold is >= min_quantity, the unit price is
-- unit_price". A product can have any number of tiers. At sale time the app
-- selects the HIGHEST-threshold tier whose min_quantity is <= the quantity
-- being sold (i.e. the best/deepest tier the quantity qualifies for) and
-- uses its unit_price as the automatic selling price. If a quantity doesn't
-- reach any tier's min_quantity (or the product has no tiers at all), no
-- automatic price is available and the existing manual price-entry flow
-- applies unchanged — this is why the migration is safe for every product
-- that doesn't opt into tiered pricing.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_product_price_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  min_quantity  NUMERIC(12,2) NOT NULL CHECK (min_quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One rule per threshold per product — prevents ambiguous ties where two
  -- tiers on the same product would both match the same quantity exactly.
  CONSTRAINT pos_product_price_tiers_product_min_qty_key UNIQUE (product_id, min_quantity)
);

DROP TRIGGER IF EXISTS pos_product_price_tiers_updated_at ON pos_product_price_tiers;
CREATE TRIGGER pos_product_price_tiers_updated_at
  BEFORE UPDATE ON pos_product_price_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pos_price_tiers_product_id
  ON pos_product_price_tiers (product_id);

-- Supports "highest matching tier for this quantity" lookups efficiently.
CREATE INDEX IF NOT EXISTS idx_pos_price_tiers_product_min_qty
  ON pos_product_price_tiers (product_id, min_quantity DESC);


-- ============================================================================
-- 2. HELPER — resolve the automatic price for a product + quantity.
--
-- Not called by pos_create_sale() (which still just persists whatever
-- unit_price the client sends, unchanged). This is exposed so the price
-- can optionally be resolved/verified from the database too (e.g. for a
-- future server-side check), while today the Next.js app resolves it
-- client-side against the same rule for instant UI feedback. Returns NULL
-- when no tier matches, meaning: fall back to manual entry.
-- ============================================================================
CREATE OR REPLACE FUNCTION pos_resolve_tier_price(
  p_product_id UUID,
  p_quantity   NUMERIC
) RETURNS NUMERIC AS $$
  SELECT unit_price
  FROM pos_product_price_tiers
  WHERE product_id = p_product_id
    AND min_quantity <= p_quantity
  ORDER BY min_quantity DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================================
-- ROW LEVEL SECURITY — same permissive-per-authenticated-user model as
-- every other pos_ table (see supabase-pos-foundation-schema.sql).
-- ============================================================================
ALTER TABLE pos_product_price_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_product_price_tiers_auth_all ON pos_product_price_tiers;
CREATE POLICY pos_product_price_tiers_auth_all
  ON pos_product_price_tiers FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'pos_product_price_tiers';
