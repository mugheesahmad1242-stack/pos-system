"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

export function usePrefetch() {
  const router = useRouter()

  const prefetchRoute = (route: string) => {
    // Prefetch the route's code/data via Next.js router prefetching.
    router.prefetch(route)
  }

  // Prefetch common routes on mount
  useEffect(() => {
    const routes = ['/orders', '/inventory', '/dashboard', '/bill-history', '/settings']
    routes.forEach(route => {
      router.prefetch(route)
    })
  }, [router])

  return { prefetchRoute }
}
