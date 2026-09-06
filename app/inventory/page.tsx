"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/pos/sidebar"
import { PricingTiersEditor } from "@/components/inventory/pricing-tiers-editor"
import {
  PosInventoryService,
  PosProductService,
  type PosInventoryRow,
  type PosProductRow,
} from "@/lib/pos-service"
import { AlertTriangle, Package, Pencil, Plus, Power, PowerOff, Search, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ProductRowView {
  id: string
  name: string
  unit: string
  lowStockThreshold: number
  isActive: boolean
  stock: number
}

export default function InventoryPage() {
  const [products, setProducts] = useState<PosProductRow[]>([])
  const [inventory, setInventory] = useState<PosInventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRowView | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [productsData, inventoryData] = await Promise.all([
      PosProductService.listAll(),
      PosInventoryService.list(),
    ])
    setProducts(productsData)
    setInventory(inventoryData)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows: ProductRowView[] = useMemo(() => {
    const stockMap = new Map<string, number>()
    for (const inv of inventory) {
      stockMap.set(inv.product_id, Number(inv.quantity) || 0)
    }

    return products
      .map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit || "unit",
        lowStockThreshold: Number(p.low_stock_threshold) || 0,
        isActive: p.is_active,
        stock: stockMap.get(p.id) || 0,
      }))
      .filter((p) => !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, inventory, searchQuery])

  const lowStockCount = useMemo(
    () => rows.filter((r) => r.isActive && r.stock <= r.lowStockThreshold).length,
    [rows],
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const name = String(formData.get("name") || "").trim()
    const unit = String(formData.get("unit") || "").trim() || "unit"
    const lowStockThreshold = Number(formData.get("lowStockThreshold"))

    if (!name) {
      toast.error("Product name is required")
      return
    }

    if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
      toast.error("Low stock alert must be zero or greater")
      return
    }

    setSubmitting(true)
    try {
      if (editingProduct) {
        await PosProductService.update(editingProduct.id, {
          name,
          unit,
          low_stock_threshold: lowStockThreshold,
        })
        toast.success("Product updated")
      } else {
        await PosProductService.createFull({ name, unit, low_stock_threshold: lowStockThreshold })
        toast.success("Product added")
      }

      setShowForm(false)
      setEditingProduct(null)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save product")
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(product: ProductRowView) {
    try {
      await PosProductService.update(product.id, { is_active: !product.isActive })
      toast.success(product.isActive ? "Product deactivated" : "Product reactivated")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update product")
    }
  }

  function openEdit(product: ProductRowView) {
    setEditingProduct(product)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingProduct(null)
  }

  return (
    <main className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <div className="flex gap-3 flex-1 overflow-hidden">
            <Sidebar />

            <section className="flex-1 flex flex-col gap-4 overflow-y-auto p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold">Inventory Management</h1>
                  <p className="text-sm text-muted-foreground">
                    Products and current stock. Stock changes automatically from purchases and sales.
                  </p>
                </div>

                {lowStockCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {lowStockCount} product{lowStockCount === 1 ? "" : "s"} low on stock
                  </span>
                )}
              </div>

              <div className="pos-panel p-4 rounded-lg">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-8 py-2 rounded-xl border border-[var(--pos-stroke)] bg-[var(--pos-panel-2)] focus:outline-none focus:ring-2 focus:ring-pos-brand text-sm w-64 transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-foreground/5 rounded-full text-muted-foreground hover:text-foreground transition"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setEditingProduct(null)
                      setShowForm(true)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-pos-brand text-black font-bold rounded-xl active:scale-[0.98] transition cursor-pointer shadow-sm hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Product</span>
                  </button>
                </div>
              </div>

              <div className="pos-panel rounded-lg flex-1 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <p className="text-sm text-muted-foreground text-center py-8">Loading products...</p>
                  ) : rows.length === 0 ? (
                    <div className="p-8 rounded-xl text-center bg-[var(--pos-panel-2)]/30 border border-dashed border-[var(--pos-stroke)]">
                      <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-base font-semibold text-foreground">No products found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {searchQuery
                          ? "Try refining your search query"
                          : "Add a product here, or add one on the fly from Purchase Entry"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rows.map((product) => {
                        const isLowStock = product.isActive && product.stock <= product.lowStockThreshold
                        return (
                          <div
                            key={product.id}
                            className={cn(
                              "p-4 rounded-xl flex items-center justify-between gap-3 border transition-all duration-200",
                              !product.isActive
                                ? "opacity-50 pos-panel"
                                : isLowStock
                                  ? "bg-red-500/5 border-red-500/20"
                                  : "pos-panel hover:bg-foreground/[0.01]",
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                  isLowStock
                                    ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                )}
                              >
                                {isLowStock ? (
                                  <AlertTriangle className="w-5 h-5" />
                                ) : (
                                  <Package className="w-5 h-5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-sm text-foreground truncate">{product.name}</p>
                                  {!product.isActive && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-foreground/10 text-muted-foreground uppercase tracking-wide">
                                      Inactive
                                    </span>
                                  )}
                                  {product.isActive && isLowStock && (
                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 uppercase tracking-wide">
                                      Low Stock
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Stock:{" "}
                                  <span
                                    className={cn(
                                      "font-bold",
                                      isLowStock ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400",
                                    )}
                                  >
                                    {product.stock} {product.unit}
                                  </span>
                                  <span className="text-muted-foreground/30 mx-1.5">•</span>
                                  <span>Unit: {product.unit}</span>
                                  <span className="text-muted-foreground/30 mx-1.5">•</span>
                                  <span>Min: {product.lowStockThreshold}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => openEdit(product)}
                                className="p-2 text-blue-600 dark:text-blue-400 bg-blue-500/5 hover:bg-blue-500/10 active:scale-[0.9] border border-blue-500/10 rounded-xl transition duration-150 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                                title="Edit Product"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleActive(product)}
                                className={cn(
                                  "p-2 active:scale-[0.9] border rounded-xl transition duration-150 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center",
                                  product.isActive
                                    ? "text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 border-red-500/10"
                                    : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/10",
                                )}
                                title={product.isActive ? "Deactivate Product" : "Reactivate Product"}
                              >
                                {product.isActive ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Slide-over Side Drawer for Add/Edit Product */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-end z-50 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={closeForm} />

          <div className="relative w-full max-w-md bg-[var(--pos-panel)] border-l border-[var(--pos-stroke)] h-full p-6 flex flex-col gap-6 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--pos-stroke)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-[var(--pos-brand)]/10 text-[var(--pos-brand)] flex items-center justify-center">
                  <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">
                    {editingProduct ? "Edit Product Details" : "Add New Product"}
                  </h3>
                  <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                    {editingProduct ? "Stock and price are managed elsewhere" : "New products start with zero stock"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="p-1.5 hover:bg-muted active:bg-muted rounded-xl transition text-muted-foreground hover:text-foreground active:scale-95 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-5 overflow-y-auto px-1.5 py-1">
              <div className="space-y-2">
                <label htmlFor="prod-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Product Name
                </label>
                <input
                  id="prod-name"
                  name="name"
                  placeholder="e.g. Cold Brew Coffee"
                  defaultValue={editingProduct?.name}
                  required
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="prod-unit" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Unit
                  </label>
                  <input
                    id="prod-unit"
                    name="unit"
                    placeholder="e.g. bottle, crate, kg"
                    defaultValue={editingProduct?.unit || "unit"}
                    required
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="prod-threshold" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                    Low Stock Alert
                  </label>
                  <input
                    id="prod-threshold"
                    name="lowStockThreshold"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 10"
                    defaultValue={editingProduct?.lowStockThreshold ?? 5}
                    required
                    className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition"
                  />
                </div>
              </div>

              {!editingProduct && (
                <p className="text-xs text-muted-foreground bg-foreground/5 rounded-lg p-3">
                  Stock is added automatically when you record a purchase for this product in{" "}
                  <span className="font-semibold">Purchases</span>.
                </p>
              )}

              {editingProduct ? (
                <div className="pt-2 border-t border-[var(--pos-stroke)]">
                  <PricingTiersEditor
                    key={editingProduct.id}
                    productId={editingProduct.id}
                    unit={editingProduct.unit}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground bg-foreground/5 rounded-lg p-3">
                  Save the product first, then open <span className="font-semibold">Edit</span>{" "}
                  to set up automatic quantity-based pricing tiers.
                </p>
              )}

              <div className="mt-auto pt-6 border-t border-[var(--pos-stroke)] flex gap-3">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 py-3 text-center rounded-xl pos-panel border border-[var(--pos-stroke)] bg-foreground/[0.02] dark:bg-foreground/[0.04] text-foreground hover:bg-muted text-sm font-semibold transition active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 text-center rounded-xl bg-pos-brand text-black text-sm font-bold transition active:scale-[0.98] cursor-pointer shadow-md shadow-[var(--pos-brand)]/10 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Saving..." : editingProduct ? "Save Changes" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
