-- ============================================================================
-- Feature 7 — Paid / Credit / Partial POS Sale Payments
-- Run after:
--   1. supabase-pos-foundation-schema.sql
--   2. supabase-pos-sales.sql
--
-- Reuses:
--   - pos_sales
--   - pos_customer_payments
--   - existing pos_create_sale(UUID, JSONB)
--   - existing payment/status recalculation triggers
--
-- No duplicate payment table/system is created.
-- ============================================================================

DROP FUNCTION IF EXISTS pos_create_sale(UUID, JSONB, NUMERIC);

CREATE OR REPLACE FUNCTION pos_create_sale(
  p_customer_id UUID,
  p_items JSONB,
  p_paid_amount NUMERIC
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_total NUMERIC(12,2);
  v_paid NUMERIC(12,2);
BEGIN
  v_paid := COALESCE(p_paid_amount, 0);

  -- Basic payment validation before creating the sale.
  IF NOT isfinite(v_paid) OR v_paid < 0 THEN
    RAISE EXCEPTION 'Paid amount must be zero or greater';
  END IF;

  -- Reuse the existing atomic sale creation logic.
  -- This preserves the existing product validation, inventory locking,
  -- FIFO cost allocation and sale-item creation.
  v_sale_id := pos_create_sale(
    p_customer_id,
    p_items
  );

  -- Read the authoritative total calculated by the existing sale logic.
  SELECT total_amount
  INTO v_total
  FROM pos_sales
  WHERE id = v_sale_id
  FOR UPDATE;

  IF v_total IS NULL THEN
    RAISE EXCEPTION 'Created sale could not be found';
  END IF;

  -- Never allow overpayment.
  IF v_paid > v_total THEN
    RAISE EXCEPTION
      'Paid amount of Rs. % exceeds sale total of Rs. %',
      v_paid,
      v_total;
  END IF;

  -- Credit/partial sales must have a customer because the outstanding
  -- receivable belongs to that customer.
  IF v_paid < v_total AND p_customer_id IS NULL THEN
    RAISE EXCEPTION
      'Customer is required for credit or partial payment sales';
  END IF;

  -- For customer sales, every initial payment is stored as its own
  -- pos_customer_payments transaction. The existing trigger recalculates
  -- pos_sales.amount_paid / amount_due / payment_status.
  IF p_customer_id IS NOT NULL AND v_paid > 0 THEN
    INSERT INTO pos_customer_payments (
      customer_id,
      sale_id,
      amount,
      payment_date
    )
    VALUES (
      p_customer_id,
      v_sale_id,
      v_paid,
      CURRENT_DATE
    );

  -- A fully paid walk-in sale has no customer payment ledger to attach to.
  -- Store its paid amount directly on the sale.
  ELSIF p_customer_id IS NULL AND v_paid = v_total THEN
    UPDATE pos_sales
    SET
      amount_paid = v_paid,
      payment_status = 'paid'
    WHERE id = v_sale_id;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql;