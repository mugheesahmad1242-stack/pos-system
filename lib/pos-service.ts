import type {
  PosPurchase,
  PosPurchaseItem,
  PosInventory,
  PosSupplierPayment,
  PosSale,
  PosSaleItem,
  PosCustomerPayment,
  PosProductPriceTier,
} from "./supabase"
import { posFetch } from "./pos-fetch"

// ----------------------------------------------------------------------
// Feature 3 — Products, Suppliers & Purchase Entry
// Client-side fetch wrappers, mirroring the existing ProductService /
// CategoryService pattern (fetch -> internal /api route -> Supabase).
// ----------------------------------------------------------------------

export interface PosAutocompleteOption {
  id: string
  name: string
}

async function searchByName(
  endpoint: string,
  query: string,
): Promise<PosAutocompleteOption[]> {
  try {
    const res = await posFetch(`${endpoint}?q=${encodeURIComponent(query)}`)
    const json = await res.json()

    if (!res.ok || json.error) {
      console.error(`Error searching ${endpoint}:`, json.error)
      return []
    }

    return json.data || []
  } catch (error) {
    console.error(`Error in searchByName(${endpoint}):`, error)
    return []
  }
}

async function createByName(
  endpoint: string,
  name: string,
): Promise<PosAutocompleteOption | null> {
  try {
    const res = await posFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })

    const json = await res.json()

    if (!res.ok || json.error) {
      console.error(`Error creating via ${endpoint}:`, json.error)
      return null
    }

    return json.data
  } catch (error) {
    console.error(`Error in createByName(${endpoint}):`, error)
    return null
  }
}

export interface PosProductRow {
  id: string
  name: string
  unit: string
  low_stock_threshold: number
  is_active: boolean
  created_at?: string
}

export interface PosProductCreateInput {
  name: string
  unit?: string
  low_stock_threshold?: number
}

export interface PosProductUpdateInput {
  name?: string
  unit?: string
  low_stock_threshold?: number
  is_active?: boolean
}

export class PosProductService {
  static search(query: string): Promise<PosAutocompleteOption[]> {
    return searchByName("/api/pos/products", query)
  }

  static create(name: string): Promise<PosAutocompleteOption | null> {
    return createByName("/api/pos/products", name)
  }

  // Full product catalog (active + inactive), used by the Inventory page.
  static async listAll(): Promise<PosProductRow[]> {
    try {
      const res = await posFetch("/api/pos/products?all=1")
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error listing products:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error("Error in PosProductService.listAll:", error)
      return []
    }
  }

  // Create a product with full details (name + unit + threshold), used by
  // the Inventory page's "Add product" form.
  static async createFull(
    input: PosProductCreateInput,
  ): Promise<PosProductRow | null> {
    try {
      const res = await posFetch("/api/pos/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to create product")
      }

      return json.data
    } catch (error) {
      console.error("Error in PosProductService.createFull:", error)
      throw error instanceof Error ? error : new Error("Failed to create product")
    }
  }

  static async update(
    id: string,
    input: PosProductUpdateInput,
  ): Promise<PosProductRow | null> {
    try {
      const res = await posFetch(`/api/pos/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to update product")
      }

      return json.data
    } catch (error) {
      console.error("Error in PosProductService.update:", error)
      throw error instanceof Error ? error : new Error("Failed to update product")
    }
  }
}

// ----------------------------------------------------------------------
// Feature 10 — Automatic quantity-based pricing tiers
// ----------------------------------------------------------------------

export interface PosPricingTierInput {
  min_quantity: number
  unit_price: number
}

export class PosPricingTierService {
  // No product_id -> every tier for every product (used by the Orders/POS
  // page to resolve automatic prices client-side in one request).
  static async list(productId?: string): Promise<PosProductPriceTier[]> {
    try {
      const qs = productId ? `?product_id=${encodeURIComponent(productId)}` : ""
      const res = await posFetch(`/api/pos/pricing-tiers${qs}`)
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching pricing tiers:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error("Error in PosPricingTierService.list:", error)
      return []
    }
  }

  static async create(
    productId: string,
    input: PosPricingTierInput,
  ): Promise<PosProductPriceTier> {
    try {
      const res = await posFetch("/api/pos/pricing-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, ...input }),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to create pricing tier")
      }

      return json.data
    } catch (error) {
      console.error("Error in PosPricingTierService.create:", error)
      throw error instanceof Error ? error : new Error("Failed to create pricing tier")
    }
  }

  static async update(
    id: string,
    input: Partial<PosPricingTierInput>,
  ): Promise<PosProductPriceTier> {
    try {
      const res = await posFetch(`/api/pos/pricing-tiers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to update pricing tier")
      }

      return json.data
    } catch (error) {
      console.error("Error in PosPricingTierService.update:", error)
      throw error instanceof Error ? error : new Error("Failed to update pricing tier")
    }
  }

  static async remove(id: string): Promise<void> {
    try {
      const res = await posFetch(`/api/pos/pricing-tiers/${id}`, {
        method: "DELETE",
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to delete pricing tier")
      }
    } catch (error) {
      console.error("Error in PosPricingTierService.remove:", error)
      throw error instanceof Error ? error : new Error("Failed to delete pricing tier")
    }
  }
}

export class PosSupplierService {
  static search(query: string): Promise<PosAutocompleteOption[]> {
    return searchByName("/api/pos/suppliers", query)
  }

  static create(name: string): Promise<PosAutocompleteOption | null> {
    return createByName("/api/pos/suppliers", name)
  }
}

export class PosCustomerService {
  static search(query: string): Promise<PosAutocompleteOption[]> {
    return searchByName("/api/pos/customers", query)
  }

  static create(name: string): Promise<PosAutocompleteOption | null> {
    return createByName("/api/pos/customers", name)
  }
}

export interface PosPurchaseItemInput {
  product_id: string
  quantity: number
  unit_cost: number
}

export interface PosCreatePurchaseInput {
  supplier_id: string
  purchase_date: string
  reference_number?: string
  notes?: string
  items: PosPurchaseItemInput[]
  amount_paid: number
  payment_method?: string
}

export interface PosPurchaseItemWithProduct extends PosPurchaseItem {
  pos_products: { name: string } | null
}

export interface PosPurchaseWithRelations extends PosPurchase {
  pos_suppliers: { name: string } | null
  pos_purchase_items: PosPurchaseItemWithProduct[]
}

export class PosPurchaseService {
  static async list(): Promise<PosPurchaseWithRelations[]> {
    try {
      const res = await posFetch("/api/pos/purchases")
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching purchases:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error("Error in PosPurchaseService.list:", error)
      return []
    }
  }

  static async create(
    input: PosCreatePurchaseInput,
  ): Promise<PosPurchaseWithRelations | null> {
    try {
      const res = await posFetch("/api/pos/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error creating purchase:", json.error)
        return null
      }

      return json.data
    } catch (error) {
      console.error("Error in PosPurchaseService.create:", error)
      return null
    }
  }
}

export interface PosInventoryRow extends PosInventory {
  pos_products: { name: string; unit: string } | null
}

export class PosInventoryService {
  static async list(): Promise<PosInventoryRow[]> {
    try {
      const res = await posFetch("/api/pos/inventory")
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching inventory:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error("Error in PosInventoryService.list:", error)
      return []
    }
  }
}

// ----------------------------------------------------------------------
// Feature 9 — Business settings (backs the Settings page's Business &
// Invoice tab, and the same row the dashboard/financials/receipt PDF read).
// ----------------------------------------------------------------------

export interface PosBusinessSettingsRow {
  id: boolean
  shop_name: string
  currency: string
  address: string | null
  phone: string | null
  invoice_prefix: string
  default_low_stock_threshold: number
  tax_rate: number
  updated_at: string
}

export type PosBusinessSettingsInput = Partial<
  Omit<PosBusinessSettingsRow, "id" | "updated_at">
>

export class PosSettingsService {
  static async get(): Promise<PosBusinessSettingsRow | null> {
    try {
      const res = await posFetch("/api/pos/settings")
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching settings:", json.error)
        return null
      }

      return json.data || null
    } catch (error) {
      console.error("Error in PosSettingsService.get:", error)
      return null
    }
  }

  static async update(
    input: PosBusinessSettingsInput,
  ): Promise<PosBusinessSettingsRow | null> {
    try {
      const res = await posFetch("/api/pos/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to update settings")
      }

      return json.data
    } catch (error) {
      console.error("Error in PosSettingsService.update:", error)
      throw error instanceof Error ? error : new Error("Failed to update settings")
    }
  }
}

// ----------------------------------------------------------------------
// Feature 4 — Supplier Payments & Payables
// ----------------------------------------------------------------------

export interface PosSupplierPaymentInput {
  supplier_id: string
  purchase_id: string
  amount: number
  payment_date?: string
  payment_method?: string
  notes?: string
}

export interface PosSupplierPaymentWithPurchase
  extends PosSupplierPayment {
  pos_purchases: {
    purchase_date: string
    reference_number: string | null
    total_amount: number
  } | null
}

export class PosSupplierPaymentService {
  static async listForSupplier(
    supplierId: string,
  ): Promise<PosSupplierPaymentWithPurchase[]> {
    try {
      const res = await posFetch(
        `/api/pos/supplier-payments?supplier_id=${encodeURIComponent(
          supplierId,
        )}`,
      )

      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching supplier payments:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error(
        "Error in PosSupplierPaymentService.listForSupplier:",
        error,
      )
      return []
    }
  }

  static async create(
    input: PosSupplierPaymentInput,
  ): Promise<PosSupplierPaymentWithPurchase | null> {
    try {
      const res = await posFetch("/api/pos/supplier-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(
          json.error || "Failed to record payment",
        )
      }

      return json.data
    } catch (error) {
      console.error(
        "Error in PosSupplierPaymentService.create:",
        error,
      )

      throw error instanceof Error
        ? error
        : new Error("Failed to record payment")
    }
  }
}

// ----------------------------------------------------------------------
// Feature 5/6/7 — Customers, Receivables & POS Sale Payments
// ----------------------------------------------------------------------

export interface PosSaleItemWithProduct extends PosSaleItem {
  pos_products: { name: string } | null
}

export interface PosSaleWithRelations extends PosSale {
  pos_customers: { name: string } | null
  pos_sale_items: PosSaleItemWithProduct[]
}

export interface PosCreateSaleItemInput {
  product_id: string
  quantity: number
  unit_price: number
}

export interface PosCreateSaleInput {
  customer_id: string | null
  items: PosCreateSaleItemInput[]
  paid_amount: number
}

export class PosSaleService {
  static async list(): Promise<PosSaleWithRelations[]> {
    try {
      const res = await posFetch("/api/pos/sales")
      const json = await res.json()

      if (!res.ok || json.error) {
        console.error("Error fetching sales:", json.error)
        return []
      }

      return json.data || []
    } catch (error) {
      console.error("Error in PosSaleService.list:", error)
      return []
    }
  }

  static async create(
    input: PosCreateSaleInput,
  ): Promise<PosSaleWithRelations | null> {
    try {
      const res = await posFetch("/api/pos/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(
          json.error || "Failed to create sale",
        )
      }

      return json.data
    } catch (error) {
      console.error("Error in PosSaleService.create:", error)

      throw error instanceof Error
        ? error
        : new Error("Failed to create sale")
    }
  }
}

export interface PosCustomerPaymentInput {
  customer_id: string
  sale_id: string
  amount: number
  payment_date?: string
  payment_method?: string
  notes?: string
}

export interface PosCustomerPaymentWithSale
  extends PosCustomerPayment {
  pos_sales: {
    sale_date: string
    notes: string | null
    total_amount: number
  } | null
}

export class PosCustomerPaymentService {
  static async listForCustomer(
    customerId: string,
  ): Promise<PosCustomerPaymentWithSale[]> {
    try {
      const res = await posFetch(
        `/api/pos/customer-payments?customer_id=${encodeURIComponent(
          customerId,
        )}`,
      )

      const json = await res.json()

      if (!res.ok || json.error) {
        console.error(
          "Error fetching customer payments:",
          json.error,
        )
        return []
      }

      return json.data || []
    } catch (error) {
      console.error(
        "Error in PosCustomerPaymentService.listForCustomer:",
        error,
      )
      return []
    }
  }

  static async create(
    input: PosCustomerPaymentInput,
  ): Promise<PosCustomerPaymentWithSale | null> {
    try {
      const res = await posFetch("/api/pos/customer-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      })

      const json = await res.json()

      if (!res.ok || json.error) {
        throw new Error(
          json.error || "Failed to record payment",
        )
      }

      return json.data
    } catch (error) {
      console.error(
        "Error in PosCustomerPaymentService.create:",
        error,
      )

      throw error instanceof Error
        ? error
        : new Error("Failed to record payment")
    }
  }
}