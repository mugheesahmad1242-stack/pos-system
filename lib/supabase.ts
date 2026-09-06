import { createClient } from '@supabase/supabase-js'

const getCleanEnv = (value: string | undefined): string | null => {
  if (!value) return null
  const cleaned = value.trim()
  if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') return null
  return cleaned
}

const defaultUrl = 'https://zrjbmaesmbqqgxknidea.supabase.co'
const defaultKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyamJtYWVzbWJxcWd4a25pZGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjI2NTMsImV4cCI6MjA5MDY5ODY1M30.RT5zmprjWA5Y5NG4VSVpODU9X4llY1_8tfY-9bXQuGg'

const urlEnv = getCleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)
const keyEnv = getCleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const supabaseUrl = (urlEnv && urlEnv.startsWith('http')) ? urlEnv : defaultUrl
const supabaseAnonKey = keyEnv ? keyEnv : defaultKey

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ----------------------------------------------------------------------
// Beverage-shop schema (Feature 2 — Database Foundation)
// Mirrors supabase-pos-foundation-schema.sql. Every table/type here is
// prefixed `pos_` / `Pos` because earlier features shared this database
// with a legacy cleaning-supplies schema (`products`, `categories`,
// `bill_history`) that has since been removed in Feature 9 cleanup.
// ----------------------------------------------------------------------

export type PosPaymentStatus = 'paid' | 'partial' | 'credit'
export type PosPurchasePaymentStatus = 'paid' | 'partial' | 'unpaid'

export interface PosProduct {
  id: string
  name: string
  unit: string
  low_stock_threshold: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PosSupplier {
  id: string
  name: string
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PosCustomer {
  id: string
  name: string
  phone: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PosPurchase {
  id: string
  supplier_id: string
  purchase_date: string
  reference_number: string | null
  notes: string | null
  total_amount: number
  amount_paid: number
  amount_due: number
  payment_status: PosPurchasePaymentStatus
  created_at: string
  updated_at: string
}

export interface PosPurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  quantity: number
  unit_cost: number
  line_total: number
  created_at: string
}

export interface PosInventory {
  product_id: string
  quantity: number
  updated_at: string
}

export type PosInventoryMovementType =
  | 'purchase_in'
  | 'purchase_reversal'
  | 'sale_out'
  | 'sale_reversal'
  | 'adjustment'

export interface PosInventoryMovement {
  id: string
  product_id: string
  movement_type: PosInventoryMovementType
  quantity_change: number
  balance_after: number
  reference_type: 'purchase_item' | 'sale_item' | 'manual' | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

export interface PosSupplierPayment {
  id: string
  supplier_id: string
  purchase_id: string | null
  amount: number
  payment_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
}

export interface PosSale {
  id: string
  customer_id: string | null
  sale_date: string
  notes: string | null
  total_amount: number
  amount_paid: number
  amount_due: number
  payment_status: PosPaymentStatus
  created_at: string
  updated_at: string
}

export interface PosSaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  unit_cost: number
  line_total: number
  line_cost_total: number
  created_at: string
}

export interface PosCustomerPayment {
  id: string
  customer_id: string
  sale_id: string | null
  amount: number
  payment_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
}

// ----------------------------------------------------------------------
// Feature 10 — Automatic quantity-based pricing tiers (supabase-pos-
// feature-10-pricing-tiers.sql). Purely additive: products with no tiers
// behave exactly as before (manual price entry only).
// ----------------------------------------------------------------------
export interface PosProductPriceTier {
  id: string
  product_id: string
  min_quantity: number
  unit_price: number
  created_at: string
  updated_at: string
}

export interface PosBusinessSettings {
  id: true
  shop_name: string
  currency: string
  address: string | null
  phone: string | null
  invoice_prefix: string
  default_low_stock_threshold: number
  tax_rate: number
  updated_at: string
}