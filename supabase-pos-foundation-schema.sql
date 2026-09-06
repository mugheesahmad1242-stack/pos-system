-- ============================================================================
-- POS FOUNDATION SCHEMA — Feature 2: Database Foundation
-- Beverage Shop rebuild (products/suppliers/purchases/sales/payments)
-- ============================================================================
--
-- IMPORTANT — NAMING NOTE
-- The existing project already has a `products` table (and `categories`,
-- `bill_history`) from the old cleaning-supplies POS — retail/wholesale
-- pricing, category_id, VARCHAR ids. That table is still driving the
-- current UI (inventory page, orders page, dashboard) and MUST NOT be
-- touched in this feature.
--
-- The new beverage-shop rules need a `products` table with a completely
-- different, incompatible shape (no categories, no fixed price, UUID ids).
-- Reusing the name `products` for it would either collide with the old
-- table or silently corrupt it. So every new table in this migration is
-- prefixed `pos_` (pos_products, pos_suppliers, pos_sales, ...). This is
-- a deliberate deviation from the literal table names requested, chosen so:
--   1. Nothing about the legacy schema/UI is touched (per project rules).
--   2. Everything still lives in the `public` schema, so it's usable via
--      supabase-js immediately, with no Supabase Dashboard config changes.
-- A later "cutover" feature (once the new UI replaces the old one) can
-- drop the legacy tables and rename pos_products -> products, etc.
--
-- SAFE TO RE-RUN: every statement is idempotent (IF NOT EXISTS / OR
-- REPLACE / DROP ... IF EXISTS before CREATE). Nothing here drops or
-- alters an existing table.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive unique names
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fast ILIKE / autocomplete search


-- ----------------------------------------------------------------------------
-- SHARED TRIGGER FUNCTION: keep updated_at current
-- (Same function the legacy schema already defines; CREATE OR REPLACE
-- keeps the definition identical either way, so this is safe even if it
-- already exists.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 1. PRODUCTS — master records, never duplicated per supplier
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 CITEXT NOT NULL,
  unit                 TEXT NOT NULL DEFAULT 'pcs',
  low_stock_threshold  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_products_name_not_blank CHECK (btrim(name::text) <> ''),
  CONSTRAINT pos_products_name_key UNIQUE (name)
);

DROP TRIGGER IF EXISTS pos_products_updated_at ON pos_products;
CREATE TRIGGER pos_products_updated_at
  BEFORE UPDATE ON pos_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. SUPPLIERS — master records
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        CITEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_suppliers_name_not_blank CHECK (btrim(name::text) <> ''),
  CONSTRAINT pos_suppliers_name_key UNIQUE (name)
);

DROP TRIGGER IF EXISTS pos_suppliers_updated_at ON pos_suppliers;
CREATE TRIGGER pos_suppliers_updated_at
  BEFORE UPDATE ON pos_suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 3. CUSTOMERS — name only required
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_customers_name_not_blank CHECK (btrim(name) <> '')
);

DROP TRIGGER IF EXISTS pos_customers_updated_at ON pos_customers;
CREATE TRIGGER pos_customers_updated_at
  BEFORE UPDATE ON pos_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 4. PURCHASES (header) — supplier + date; line items carry product+cost+qty
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID NOT NULL REFERENCES pos_suppliers(id) ON DELETE RESTRICT,
  purchase_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number  TEXT,
  notes             TEXT,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due        NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_status    TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS pos_purchases_updated_at ON pos_purchases;
CREATE TRIGGER pos_purchases_updated_at
  BEFORE UPDATE ON pos_purchases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 5. PURCHASE ITEMS — product + supplier(via purchase) + qty + cost + date(via purchase)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_purchase_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id   UUID NOT NULL REFERENCES pos_purchases(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT,
  quantity      NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  line_total    NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 6. INVENTORY — one running balance per product (POS sells product only,
--    no batch/supplier selection at sale time)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_inventory (
  product_id  UUID PRIMARY KEY REFERENCES pos_products(id) ON DELETE CASCADE,
  quantity    NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 7. INVENTORY MOVEMENTS — full audit trail behind the pos_inventory balance
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_inventory_movements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
  movement_type     TEXT NOT NULL CHECK (movement_type IN ('purchase_in', 'purchase_reversal', 'sale_out', 'sale_reversal', 'adjustment')),
  quantity_change   NUMERIC(12,2) NOT NULL,
  balance_after     NUMERIC(12,2) NOT NULL,
  reference_type    TEXT CHECK (reference_type IN ('purchase_item', 'sale_item', 'manual')),
  reference_id      UUID,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 8. SUPPLIER PAYMENTS — partial payments + full history
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES pos_suppliers(id) ON DELETE RESTRICT,
  purchase_id     UUID REFERENCES pos_purchases(id) ON DELETE SET NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 9. SALES (header) — Paid or Credit/partially paid
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_sales (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID REFERENCES pos_customers(id) ON DELETE RESTRICT,  -- nullable: walk-in sale
  sale_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  notes             TEXT,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due        NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  payment_status    TEXT NOT NULL DEFAULT 'credit' CHECK (payment_status IN ('credit', 'partial', 'paid')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS pos_sales_updated_at ON pos_sales;
CREATE TRIGGER pos_sales_updated_at
  BEFORE UPDATE ON pos_sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 10. SALE ITEMS — manually entered selling price + a frozen historical cost
--     snapshot, so profit can always be recomputed even if purchase costs
--     change later.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id           UUID NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT,
  quantity          NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price        NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),  -- manually entered at sale time
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),  -- historical cost snapshot
  line_total        NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_cost_total   NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 11. CUSTOMER PAYMENTS — partial payments + full history
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_customer_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES pos_customers(id) ON DELETE RESTRICT,
  sale_id         UUID REFERENCES pos_sales(id) ON DELETE SET NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- 12. BUSINESS SETTINGS — single row (one shop, one authenticated user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pos_business_settings (
  id                            BOOLEAN PRIMARY KEY DEFAULT TRUE,
  shop_name                     TEXT NOT NULL DEFAULT 'My Shop',
  currency                      TEXT NOT NULL DEFAULT 'PKR',
  address                       TEXT,
  phone                         TEXT,
  invoice_prefix                TEXT NOT NULL DEFAULT 'INV',
  default_low_stock_threshold   NUMERIC(12,2) NOT NULL DEFAULT 5,
  tax_rate                      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pos_business_settings_singleton CHECK (id)
);

DROP TRIGGER IF EXISTS pos_business_settings_updated_at ON pos_business_settings;
CREATE TRIGGER pos_business_settings_updated_at
  BEFORE UPDATE ON pos_business_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO pos_business_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_pos_products_is_active         ON pos_products (is_active);
CREATE INDEX IF NOT EXISTS idx_pos_products_name_trgm         ON pos_products USING gin ((name::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pos_suppliers_is_active        ON pos_suppliers (is_active);
CREATE INDEX IF NOT EXISTS idx_pos_suppliers_name_trgm        ON pos_suppliers USING gin ((name::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pos_customers_name_trgm        ON pos_customers USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pos_purchases_supplier_id      ON pos_purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pos_purchases_purchase_date    ON pos_purchases (purchase_date);
CREATE INDEX IF NOT EXISTS idx_pos_purchases_payment_status   ON pos_purchases (payment_status);

CREATE INDEX IF NOT EXISTS idx_pos_purchase_items_purchase_id ON pos_purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_pos_purchase_items_product_id  ON pos_purchase_items (product_id);

CREATE INDEX IF NOT EXISTS idx_pos_inv_mov_product_id         ON pos_inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_pos_inv_mov_created_at         ON pos_inventory_movements (created_at);
CREATE INDEX IF NOT EXISTS idx_pos_inv_mov_reference          ON pos_inventory_movements (reference_type, reference_id);

CREATE INDEX IF NOT EXISTS idx_pos_supplier_payments_supplier ON pos_supplier_payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_pos_supplier_payments_purchase ON pos_supplier_payments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_pos_supplier_payments_date     ON pos_supplier_payments (payment_date);

CREATE INDEX IF NOT EXISTS idx_pos_sales_customer_id          ON pos_sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_sale_date            ON pos_sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_pos_sales_payment_status       ON pos_sales (payment_status);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale_id         ON pos_sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product_id      ON pos_sale_items (product_id);

CREATE INDEX IF NOT EXISTS idx_pos_customer_payments_customer ON pos_customer_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_customer_payments_sale     ON pos_customer_payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_customer_payments_date     ON pos_customer_payments (payment_date);


-- ============================================================================
-- BUSINESS LOGIC TRIGGERS
-- Keep pos_inventory / pos_inventory_movements / totals / payment_status
-- consistent automatically, so every feature built on top of this
-- foundation gets correct stock and balances "for free" and can't corrupt
-- them by forgetting a step.
-- ============================================================================

-- Upsert the running balance for a product and log the movement.
CREATE OR REPLACE FUNCTION pos_adjust_inventory(
  p_product_id      UUID,
  p_delta           NUMERIC,
  p_movement_type   TEXT,
  p_reference_type  TEXT,
  p_reference_id    UUID,
  p_notes           TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_balance NUMERIC(12,2);
BEGIN
  INSERT INTO pos_inventory (product_id, quantity)
  VALUES (p_product_id, p_delta)
  ON CONFLICT (product_id) DO UPDATE
    SET quantity = pos_inventory.quantity + EXCLUDED.quantity,
        updated_at = NOW()
  RETURNING quantity INTO v_balance;

  INSERT INTO pos_inventory_movements
    (product_id, movement_type, quantity_change, balance_after, reference_type, reference_id, notes)
  VALUES
    (p_product_id, p_movement_type, p_delta, v_balance, p_reference_type, p_reference_id, p_notes);
END;
$$ LANGUAGE plpgsql;

-- Recompute a purchase header's total/paid/status from its items + payments.
CREATE OR REPLACE FUNCTION pos_recalc_purchase(p_purchase_id UUID) RETURNS VOID AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_paid  NUMERIC(12,2);
BEGIN
  IF p_purchase_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0) INTO v_total
  FROM pos_purchase_items WHERE purchase_id = p_purchase_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM pos_supplier_payments WHERE purchase_id = p_purchase_id;

  UPDATE pos_purchases
  SET total_amount = v_total,
      amount_paid = v_paid,
      payment_status = CASE
        WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        ELSE 'unpaid'
      END,
      updated_at = NOW()
  WHERE id = p_purchase_id;
END;
$$ LANGUAGE plpgsql;

-- Recompute a sale header's total/paid/status from its items + payments.
CREATE OR REPLACE FUNCTION pos_recalc_sale(p_sale_id UUID) RETURNS VOID AS $$
DECLARE
  v_total NUMERIC(12,2);
  v_paid  NUMERIC(12,2);
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0) INTO v_total
  FROM pos_sale_items WHERE sale_id = p_sale_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM pos_customer_payments WHERE sale_id = p_sale_id;

  UPDATE pos_sales
  SET total_amount = v_total,
      amount_paid = v_paid,
      payment_status = CASE
        WHEN v_total > 0 AND v_paid >= v_total THEN 'paid'
        WHEN v_paid > 0 THEN 'partial'
        ELSE 'credit'
      END,
      updated_at = NOW()
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql;

-- pos_purchase_items -> inventory + purchase totals
CREATE OR REPLACE FUNCTION pos_purchase_items_after_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pos_adjust_inventory(NEW.product_id, NEW.quantity, 'purchase_in', 'purchase_item', NEW.id, NULL);
    PERFORM pos_recalc_purchase(NEW.purchase_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.product_id <> OLD.product_id OR NEW.quantity <> OLD.quantity THEN
      PERFORM pos_adjust_inventory(OLD.product_id, -OLD.quantity, 'purchase_reversal', 'purchase_item', OLD.id, 'Reversed on edit');
      PERFORM pos_adjust_inventory(NEW.product_id, NEW.quantity, 'purchase_in', 'purchase_item', NEW.id, 'Re-applied on edit');
    END IF;
    PERFORM pos_recalc_purchase(NEW.purchase_id);
    IF NEW.purchase_id <> OLD.purchase_id THEN
      PERFORM pos_recalc_purchase(OLD.purchase_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pos_adjust_inventory(OLD.product_id, -OLD.quantity, 'purchase_reversal', 'purchase_item', OLD.id, 'Deleted');
    PERFORM pos_recalc_purchase(OLD.purchase_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_purchase_items_after_change_trg ON pos_purchase_items;
CREATE TRIGGER pos_purchase_items_after_change_trg
  AFTER INSERT OR UPDATE OR DELETE ON pos_purchase_items
  FOR EACH ROW EXECUTE FUNCTION pos_purchase_items_after_change();

-- pos_sale_items -> inventory + sale totals
CREATE OR REPLACE FUNCTION pos_sale_items_after_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pos_adjust_inventory(NEW.product_id, -NEW.quantity, 'sale_out', 'sale_item', NEW.id, NULL);
    PERFORM pos_recalc_sale(NEW.sale_id);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.product_id <> OLD.product_id OR NEW.quantity <> OLD.quantity THEN
      PERFORM pos_adjust_inventory(OLD.product_id, OLD.quantity, 'sale_reversal', 'sale_item', OLD.id, 'Reversed on edit');
      PERFORM pos_adjust_inventory(NEW.product_id, -NEW.quantity, 'sale_out', 'sale_item', NEW.id, 'Re-applied on edit');
    END IF;
    PERFORM pos_recalc_sale(NEW.sale_id);
    IF NEW.sale_id <> OLD.sale_id THEN
      PERFORM pos_recalc_sale(OLD.sale_id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pos_adjust_inventory(OLD.product_id, OLD.quantity, 'sale_reversal', 'sale_item', OLD.id, 'Deleted');
    PERFORM pos_recalc_sale(OLD.sale_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_sale_items_after_change_trg ON pos_sale_items;
CREATE TRIGGER pos_sale_items_after_change_trg
  AFTER INSERT OR UPDATE OR DELETE ON pos_sale_items
  FOR EACH ROW EXECUTE FUNCTION pos_sale_items_after_change();

-- pos_supplier_payments -> purchase totals
CREATE OR REPLACE FUNCTION pos_supplier_payments_after_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pos_recalc_purchase(OLD.purchase_id);
    RETURN OLD;
  ELSE
    PERFORM pos_recalc_purchase(NEW.purchase_id);
    IF TG_OP = 'UPDATE' AND NEW.purchase_id IS DISTINCT FROM OLD.purchase_id THEN
      PERFORM pos_recalc_purchase(OLD.purchase_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_supplier_payments_after_change_trg ON pos_supplier_payments;
CREATE TRIGGER pos_supplier_payments_after_change_trg
  AFTER INSERT OR UPDATE OR DELETE ON pos_supplier_payments
  FOR EACH ROW EXECUTE FUNCTION pos_supplier_payments_after_change();

-- pos_customer_payments -> sale totals
CREATE OR REPLACE FUNCTION pos_customer_payments_after_change() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pos_recalc_sale(OLD.sale_id);
    RETURN OLD;
  ELSE
    PERFORM pos_recalc_sale(NEW.sale_id);
    IF TG_OP = 'UPDATE' AND NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
      PERFORM pos_recalc_sale(OLD.sale_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pos_customer_payments_after_change_trg ON pos_customer_payments;
CREATE TRIGGER pos_customer_payments_after_change_trg
  AFTER INSERT OR UPDATE OR DELETE ON pos_customer_payments
  FOR EACH ROW EXECUTE FUNCTION pos_customer_payments_after_change();


-- ============================================================================
-- ROW LEVEL SECURITY
-- One authenticated application user, no roles: every table just needs to
-- require a logged-in session (blocks the public anon key from reading/
-- writing shop data directly), same permissive-per-authenticated-user model
-- the app already uses for auth.
-- ============================================================================
ALTER TABLE pos_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_purchases           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_purchase_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_inventory           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_supplier_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_customer_payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_business_settings   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_products_auth_all            ON pos_products;
DROP POLICY IF EXISTS pos_suppliers_auth_all           ON pos_suppliers;
DROP POLICY IF EXISTS pos_customers_auth_all           ON pos_customers;
DROP POLICY IF EXISTS pos_purchases_auth_all           ON pos_purchases;
DROP POLICY IF EXISTS pos_purchase_items_auth_all      ON pos_purchase_items;
DROP POLICY IF EXISTS pos_inventory_auth_all           ON pos_inventory;
DROP POLICY IF EXISTS pos_inventory_movements_auth_all ON pos_inventory_movements;
DROP POLICY IF EXISTS pos_supplier_payments_auth_all   ON pos_supplier_payments;
DROP POLICY IF EXISTS pos_sales_auth_all               ON pos_sales;
DROP POLICY IF EXISTS pos_sale_items_auth_all          ON pos_sale_items;
DROP POLICY IF EXISTS pos_customer_payments_auth_all   ON pos_customer_payments;
DROP POLICY IF EXISTS pos_business_settings_auth_all   ON pos_business_settings;

CREATE POLICY pos_products_auth_all            ON pos_products            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_suppliers_auth_all           ON pos_suppliers           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_customers_auth_all           ON pos_customers           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_purchases_auth_all           ON pos_purchases           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_purchase_items_auth_all      ON pos_purchase_items      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_inventory_auth_all           ON pos_inventory           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_inventory_movements_auth_all ON pos_inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_supplier_payments_auth_all   ON pos_supplier_payments   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_sales_auth_all               ON pos_sales               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_sale_items_auth_all          ON pos_sale_items          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_customer_payments_auth_all   ON pos_customer_payments   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pos_business_settings_auth_all   ON pos_business_settings   FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- VERIFY
-- ============================================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'pos_%'
ORDER BY table_name;
