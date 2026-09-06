"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function OrdersLoadingSkeleton() {
  return (
    <main className="h-full w-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col p-3 gap-3 overflow-hidden">
        <div className="pos-panel flex-1 flex overflow-hidden">
          <div className="flex gap-3 flex-1 overflow-hidden">
            {/* Sidebar skeleton */}
            <aside className="pos-panel w-64 shrink-0 p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 px-1">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="grid gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </aside>

            {/* Main content skeleton */}
            <section className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Search bar and price mode skeleton */}
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-64" />
                <div className="flex items-center gap-2 pos-panel p-1">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>

              {/* Filter/toolbar skeleton */}
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>

              {/* Products skeleton */}
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-4 gap-2 pb-2 pr-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              </div>
            </section>

            {/* Order summary skeleton */}
            <aside className="pos-panel w-80 shrink-0 p-4 flex flex-col gap-4">
              <Skeleton className="h-8 w-32" />
              <div className="flex-1 flex flex-col gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}

