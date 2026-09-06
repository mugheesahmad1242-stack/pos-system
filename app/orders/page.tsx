"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/pos/sidebar"
import { SearchBar } from "@/components/pos/search-bar"
import { ProductCard } from "@/components/pos/product-card"
import { OrderSummary } from "@/components/pos/order-summary"
import { CartProvider } from "@/components/pos/cart-context"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { posFetch } from "@/lib/pos-fetch"
import { OrdersLoadingSkeleton } from "@/components/pos/loading-skeleton"
import { PageTransition } from "@/components/ui/page-transition"
import { Clock, ShoppingBag } from "lucide-react"
import Link from "next/link"
import type { PricingTierMap } from "@/lib/pricing-tiers"

type PosProduct = {
  id: string
  name: string
  unit: string
  stock: number
}

export default function OrdersPage() {
  const [products, setProducts] = useState<PosProduct[]>([])
  const [pricingTiers, setPricingTiers] = useState<PricingTierMap>({})
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [time, setTime] = useState<Date | null>(null)

  useEffect(() => {
    setTime(new Date())

    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300)

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true)

      const [productsResponse, inventoryResponse, pricingTiersResponse] = await Promise.all([
        posFetch("/api/pos/products"),
        posFetch("/api/pos/inventory"),
        posFetch("/api/pos/pricing-tiers"),
      ])

      const productsJson = await productsResponse.json()
      const inventoryJson = await inventoryResponse.json()
      const pricingTiersJson = await pricingTiersResponse.json()

      if (!productsResponse.ok || productsJson.error) {
        throw new Error(productsJson.error || "Failed to load products")
      }

      if (!inventoryResponse.ok || inventoryJson.error) {
        throw new Error(inventoryJson.error || "Failed to load inventory")
      }

      // Pricing tiers are a Feature 10 enhancement, not core to the POS
      // screen loading — if this call fails for any reason, fall back to
      // an empty map (every product just has no automatic price) instead
      // of blocking the whole page.
      const tiersMap: PricingTierMap = {}
      if (pricingTiersResponse.ok && !pricingTiersJson.error) {
        for (const tier of pricingTiersJson.data || []) {
          const list = tiersMap[tier.product_id] || (tiersMap[tier.product_id] = [])
          list.push({ min_quantity: Number(tier.min_quantity), unit_price: Number(tier.unit_price) })
        }
      }
      setPricingTiers(tiersMap)

      const inventoryMap = new Map<
        string,
        {
          quantity: number
          unit: string
        }
      >()

      for (const row of inventoryJson.data || []) {
        inventoryMap.set(row.product_id, {
          quantity: Number(row.quantity) || 0,
          unit: row.pos_products?.unit || "unit",
        })
      }

      const mappedProducts: PosProduct[] = (productsJson.data || []).map(
        (product: { id: string; name: string }) => {
          const inventory = inventoryMap.get(product.id)

          return {
            id: product.id,
            name: product.name,
            unit: inventory?.unit || "unit",
            stock: inventory?.quantity || 0,
          }
        },
      )

      setProducts(mappedProducts)
    } catch (error) {
      console.error("Failed to load POS products:", error)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const filteredProducts = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return products
    }

    const query = debouncedSearchQuery.toLowerCase().trim()

    return products.filter((product) =>
      product.name.toLowerCase().includes(query),
    )
  }, [products, debouncedSearchQuery])

  if (loading) {
    return <OrdersLoadingSkeleton />
  }

  return (
    <PageTransition>
      <CartProvider pricingTiers={pricingTiers}>
        <main className="h-full w-full flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col p-3 pt-16 md:pt-3 gap-3 overflow-hidden">
            <div className="pos-panel flex-1 flex overflow-hidden">
              <div className="flex gap-3 flex-1 overflow-hidden">
                <Sidebar />

                <section className="flex-1 flex flex-col gap-3 overflow-hidden">
                  <h1 className="sr-only">Point of Sale</h1>

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <SearchBar onSearch={setSearchQuery} />

                      {time && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground bg-[var(--pos-panel)] border border-[var(--pos-stroke)] rounded-lg font-medium shadow-sm">
                          <Clock className="w-3.5 h-3.5 text-[var(--pos-brand)]" />

                          <span>
                            {time.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>

                          <span className="text-muted-foreground/30">
                            •
                          </span>

                          <span>
                            {time.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-600 dark:scrollbar-thumb-gray-400">
                    {filteredProducts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[var(--pos-panel)] border border-[var(--pos-stroke)] rounded-xl my-2 mr-2">
                        <div className="p-4 rounded-full bg-muted/50 mb-4">
                          <ShoppingBag className="w-12 h-12 text-muted-foreground" />
                        </div>

                        <h3 className="text-lg font-medium text-foreground">
                          No products found
                        </h3>

                        <p className="text-sm text-muted-foreground/75 mt-1 max-w-sm">
                          There are no active products matching your search.
                          Add products from the inventory section.
                        </p>

                        <Link
                          href="/inventory"
                          className="mt-5 px-4 py-2 text-sm font-semibold bg-pos-brand text-black rounded-lg hover:opacity-90 transition"
                        >
                          Manage Inventory
                        </Link>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pb-2 pr-2">
                        {filteredProducts.map((product) => (
                          <ProductCard
                            key={product.id}
                            id={product.id}
                            name={product.name}
                            stock={product.stock}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <OrderSummary refetchData={loadProducts} />
              </div>
            </div>
          </div>
        </main>
      </CartProvider>
    </PageTransition>
  )
}