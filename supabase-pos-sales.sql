-- Feature 6 — POS sales transaction
-- Run after supabase-pos-foundation-schema.sql.
-- FIFO cost allocation is recorded separately so purchases remain immutable.

CREATE TABLE IF NOT EXISTS pos_sale_cost_allocations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_item_id     UUID NOT NULL REFERENCES pos_sale_items(id) ON DELETE CASCADE,
  purchase_item_id UUID NOT NULL REFERENCES pos_purchase_items(id) ON DELETE RESTRICT,
  quantity         NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_cost        NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_cost_allocations_sale_item
  ON pos_sale_cost_allocations (sale_item_id);

CREATE INDEX IF NOT EXISTS idx_pos_sale_cost_allocations_purchase_item
  ON pos_sale_cost_allocations (purchase_item_id);

CREATE OR REPLACE FUNCTION pos_create_sale(
  p_customer_id UUID,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_sale_item_id UUID;
  v_product_id UUID;
  v_qty NUMERIC(12,2);
  v_unit_price NUMERIC(12,2);
  v_stock NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_take NUMERIC(12,2);
  v_cost_total NUMERIC(18,4);
  v_qty_total NUMERIC(18,4);
  v_item JSONB;
  v_purchase RECORD;
BEGIN
  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Sale must contain at least one item';
  END IF;

  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pos_customers
       WHERE id = p_customer_id
     ) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  -- Validate every item before changing anything.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    IF NULLIF(v_item->>'product_id', '') IS NULL THEN
      RAISE EXCEPTION 'Each sale item requires a product';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pos_products
      WHERE id = (v_item->>'product_id')::UUID
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'Product not found or inactive: %',
        v_item->>'product_id';
    END IF;

    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'Selling price must be greater than zero';
    END IF;
  END LOOP;

  -- Lock each product inventory row so concurrent sales cannot oversell.
  FOR v_product_id, v_qty IN
    SELECT
      (x->>'product_id')::UUID,
      SUM((x->>'quantity')::NUMERIC)
    FROM jsonb_array_elements(p_items) x
    GROUP BY (x->>'product_id')::UUID
  LOOP
    INSERT INTO pos_inventory (product_id, quantity)
    VALUES (v_product_id, 0)
    ON CONFLICT (product_id) DO NOTHING;

    SELECT quantity
    INTO v_stock
    FROM pos_inventory
    WHERE product_id = v_product_id
    FOR UPDATE;

    IF v_stock < v_qty THEN
      RAISE EXCEPTION
        'Insufficient stock for product %. Available: %, requested: %',
        v_product_id,
        v_stock,
        v_qty;
    END IF;
  END LOOP;

  INSERT INTO pos_sales (
    customer_id,
    sale_date,
    total_amount,
    amount_paid,
    payment_status
  )
  VALUES (
    p_customer_id,
    CURRENT_DATE,
    0,
    0,
    'credit'
  )
  RETURNING id INTO v_sale_id;

  -- One sale item per product. Cost is determined internally using FIFO.
  FOR v_product_id, v_qty, v_unit_price IN
    SELECT
      (x->>'product_id')::UUID,
      SUM((x->>'quantity')::NUMERIC),
      MAX((x->>'unit_price')::NUMERIC)
    FROM jsonb_array_elements(p_items) x
    GROUP BY (x->>'product_id')::UUID
  LOOP
    v_remaining := v_qty;
    v_cost_total := 0;
    v_qty_total := 0;

    -- Oldest purchase stock first.
    FOR v_purchase IN
      SELECT
        pi.id,
        pi.quantity,
        pi.unit_cost,
        COALESCE(
          (
            SELECT SUM(a.quantity)
            FROM pos_sale_cost_allocations a
            WHERE a.purchase_item_id = pi.id
          ),
          0
        ) AS allocated_quantity
      FROM pos_purchase_items pi
      JOIN pos_purchases p
        ON p.id = pi.purchase_id
      WHERE pi.product_id = v_product_id
      ORDER BY
        p.purchase_date ASC,
        p.created_at ASC,
        pi.created_at ASC,
        pi.id ASC
    LOOP
      EXIT WHEN v_remaining <= 0;

      IF v_purchase.quantity > v_purchase.allocated_quantity THEN
        v_take := LEAST(
          v_remaining,
          v_purchase.quantity - v_purchase.allocated_quantity
        );

        v_cost_total :=
          v_cost_total + (v_take * v_purchase.unit_cost);

        v_qty_total := v_qty_total + v_take;
        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;

    -- Stock introduced through manual adjustment has no purchase cost.
    INSERT INTO pos_sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      unit_cost
    )
    VALUES (
      v_sale_id,
      v_product_id,
      v_qty,
      v_unit_price,
      CASE
        WHEN v_qty_total > 0
          THEN v_cost_total / v_qty_total
        ELSE 0
      END
    )
    RETURNING id INTO v_sale_item_id;

    -- Persist the exact purchase lots used by this sale.
    v_remaining := v_qty;

    FOR v_purchase IN
      SELECT
        pi.id,
        pi.quantity,
        pi.unit_cost,
        COALESCE(
          (
            SELECT SUM(a.quantity)
            FROM pos_sale_cost_allocations a
            WHERE a.purchase_item_id = pi.id
          ),
          0
        ) AS allocated_quantity
      FROM pos_purchase_items pi
      JOIN pos_purchases p
        ON p.id = pi.purchase_id
      WHERE pi.product_id = v_product_id
      ORDER BY
        p.purchase_date ASC,
        p.created_at ASC,
        pi.created_at ASC,
        pi.id ASC
    LOOP
      EXIT WHEN v_remaining <= 0;

      IF v_purchase.quantity > v_purchase.allocated_quantity THEN
        v_take := LEAST(
          v_remaining,
          v_purchase.quantity - v_purchase.allocated_quantity
        );

        INSERT INTO pos_sale_cost_allocations (
          sale_item_id,
          purchase_item_id,
          quantity,
          unit_cost
        )
        VALUES (
          v_sale_item_id,
          v_purchase.id,
          v_take,
          v_purchase.unit_cost
        );

        v_remaining := v_remaining - v_take;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql;