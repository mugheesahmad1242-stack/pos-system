-- ============================================================================
-- Feature 9 — Final Integration, Cleanup & Testing
-- Run after all previous supabase-pos-*.sql files.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. REQUIRED: enforce non-negative inventory at the database level.
--
-- pos_create_sale() already prevents overselling with a row-locked stock
-- check before it ever writes a sale item, so this should be a no-op in
-- practice. This constraint is defense-in-depth: it guarantees the
-- invariant holds even if pos_inventory is ever touched by a path other
-- than pos_create_sale / pos_purchase_items (a manual adjustment query, a
-- future feature, etc).
--
-- If this fails with "check constraint is violated by some row", it means
-- pos_inventory already has a negative balance for some product — reconcile
-- that product's stock (a manual UPDATE against pos_inventory, followed by
-- a matching 'adjustment' row in pos_inventory_movements for the audit
-- trail) before re-running this block.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pos_inventory_quantity_non_negative'
  ) THEN
    ALTER TABLE pos_inventory
      ADD CONSTRAINT pos_inventory_quantity_non_negative CHECK (quantity >= 0);
  END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- 2. OPTIONAL / DESTRUCTIVE — legacy cleaning-supplies tables.
--
-- `products`, `categories`, and `bill_history` were the old cleaning-supplies
-- schema. As of this Feature 9 cleanup, no code in the app reads or writes
-- them anymore (the Inventory page, Orders/POS, and Bill History all run on
-- the pos_* tables). They are also currently world-readable/writable to any
-- role (`USING (true)` policies), which is a real exposure once nothing
-- legitimate is using them.
--
-- This block is commented out on purpose. Uncomment and run it ONLY after
-- confirming you don't need this data (back it up first if unsure — e.g.
-- `create table products_backup as table products;`). No database cleanup
-- is being performed as part of the current work — this note is left here
-- purely as a reference for if/when that decision is made separately.
-- ----------------------------------------------------------------------------

-- DROP TABLE IF EXISTS bill_history;
-- DROP TABLE IF EXISTS products;
-- DROP TABLE IF EXISTS categories;
