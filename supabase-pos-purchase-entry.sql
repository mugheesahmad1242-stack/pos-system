-- ============================================================================
-- FEATURE 3 — Products, Suppliers & Purchase Entry
-- Adds ONE function on top of the Feature 2 foundation
-- (supabase-pos-foundation-schema.sql). Nothing here alters an existing
-- table, column, trigger, or policy — it is purely additive and safe to
-- re-run (CREATE OR REPLACE).
-- ============================================================================
--
-- WHY THIS FUNCTION EXISTS
-- A purchase is a header row (pos_purchases) + one or more line items
-- (pos_purchase_items) + an optional initial payment (pos_supplier_payments).
-- The Feature 2 triggers already keep inventory and purchase totals correct
-- whenever those tables are written to individually. This function's only
-- job is to make "write the header, write every line item, write the
-- payment" a single atomic unit — one RPC call is one Postgres transaction,
-- so a purchase can never be left half-saved (e.g. header + 1 of 2 items)
-- if something fails partway through.
--
-- Run this once in the Supabase SQL editor, the same way
-- supabase-pos-foundation-schema.sql was applied.
-- ============================================================================

CREATE OR REPLACE FUNCTION pos_create_purchase(
  p_supplier_id       UUID,
  p_purchase_date     DATE,
  p_reference_number  TEXT,
  p_notes             TEXT,
  p_items             JSONB,            -- [{ "product_id": "...", "quantity": 100, "unit_cost": 500 }, ...]
  p_amount_paid       NUMERIC DEFAULT 0,
  p_payment_method    TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_id UUID;
  v_item        JSONB;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'supplier_id is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'At least one purchase item is required';
  END IF;

  INSERT INTO pos_purchases (supplier_id, purchase_date, reference_number, notes)
  VALUES (
    p_supplier_id,
    COALESCE(p_purchase_date, CURRENT_DATE),
    NULLIF(BTRIM(p_reference_number), ''),
    NULLIF(BTRIM(p_notes), '')
  )
  RETURNING id INTO v_purchase_id;

  -- Each insert fires pos_purchase_items_after_change_trg, which adjusts
  -- pos_inventory, logs a pos_inventory_movements row, and recalculates the
  -- purchase's total_amount via pos_recalc_purchase — all existing Feature 2
  -- behavior, unchanged.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item ->> 'product_id') IS NULL THEN
      RAISE EXCEPTION 'Each purchase item requires a product_id';
    END IF;

    INSERT INTO pos_purchase_items (purchase_id, product_id, quantity, unit_cost)
    VALUES (
      v_purchase_id,
      (v_item ->> 'product_id')::UUID,
      (v_item ->> 'quantity')::NUMERIC,
      (v_item ->> 'unit_cost')::NUMERIC
    );
  END LOOP;

  -- Optional "amount paid at purchase time". pos_supplier_payments requires
  -- amount > 0, so a zero/blank payment is simply skipped — the purchase is
  -- left fully unpaid and the existing trigger already reflects that.
  IF p_amount_paid IS NOT NULL AND p_amount_paid > 0 THEN
    INSERT INTO pos_supplier_payments (supplier_id, purchase_id, amount, payment_date, payment_method)
    VALUES (
      p_supplier_id,
      v_purchase_id,
      p_amount_paid,
      COALESCE(p_purchase_date, CURRENT_DATE),
      NULLIF(BTRIM(p_payment_method), '')
    );
  END IF;

  RETURN v_purchase_id;
END;
$$;
