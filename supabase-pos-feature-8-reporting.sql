-- ============================================================================
-- Feature 8 — Receipts, Profit, Dashboard & Financials
-- Corrected receipt sequence migration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SAFE UNIQUE RECEIPT NUMBERS
-- ----------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS pos_receipt_number_seq;


ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;


-- ----------------------------------------------------------------------------
-- 2. BACKFILL EXISTING SALES
-- ----------------------------------------------------------------------------

UPDATE pos_sales
SET receipt_number =
  'INV-' ||
  LPAD(
    nextval('pos_receipt_number_seq')::TEXT,
    8,
    '0'
  )
WHERE receipt_number IS NULL;


-- ----------------------------------------------------------------------------
-- 3. SYNCHRONIZE THE SEQUENCE SAFELY
--
-- If there are existing numeric receipt numbers:
--   nextval() will continue after the largest one.
--
-- If there are no receipt numbers:
--   the sequence is reset so its first generated value is 1.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  max_receipt_number BIGINT;
BEGIN
  SELECT MAX(
    (
      regexp_replace(
        receipt_number,
        '^INV-',
        ''
      )
    )::BIGINT
  )
  INTO max_receipt_number
  FROM pos_sales
  WHERE receipt_number ~ '^INV-[0-9]+$';

  IF max_receipt_number IS NULL THEN
    PERFORM setval(
      'pos_receipt_number_seq',
      1,
      false
    );
  ELSE
    PERFORM setval(
      'pos_receipt_number_seq',
      max_receipt_number,
      true
    );
  END IF;
END
$$;


-- ----------------------------------------------------------------------------
-- 4. DATABASE-GENERATED RECEIPT NUMBER
-- ----------------------------------------------------------------------------

ALTER TABLE pos_sales
  ALTER COLUMN receipt_number
  SET DEFAULT (
    'INV-' ||
    LPAD(
      nextval('pos_receipt_number_seq')::TEXT,
      8,
      '0'
    )
  );


-- Existing rows must already have a receipt number
-- before enforcing NOT NULL.

ALTER TABLE pos_sales
  ALTER COLUMN receipt_number
  SET NOT NULL;


-- ----------------------------------------------------------------------------
-- 5. UNIQUE RECEIPT NUMBER
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_pos_sales_receipt_number_unique
ON pos_sales (receipt_number);


CREATE INDEX IF NOT EXISTS
  idx_pos_sales_created_at
ON pos_sales (created_at);


-- ----------------------------------------------------------------------------
-- 6. DEFAULT BUSINESS NAME
-- ----------------------------------------------------------------------------

UPDATE pos_business_settings
SET shop_name = 'Perfect Traders'
WHERE
  id = TRUE
  AND (
    shop_name IS NULL
    OR btrim(shop_name) = ''
    OR shop_name = 'My Shop'
  );


ALTER TABLE pos_business_settings
  ALTER COLUMN shop_name
  SET DEFAULT 'Perfect Traders';
