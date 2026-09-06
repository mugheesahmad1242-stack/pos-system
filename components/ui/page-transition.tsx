"use client"

import { usePathname } from "next/navigation"
import { ReactNode, useEffect, useState } from "react"

interface PageTransitionProps {
  children: ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    setIsTransitioning(true)
    const timer = setTimeout(() => {
      setIsTransitioning(false)
    }, 150)

    return () => clearTimeout(timer)
  }, [pathname])

  return (
    <div 
      className={`h-full w-full transition-all duration-300 ease-in-out ${
        isTransitioning 
          ? 'opacity-0 translate-x-2 scale-[0.98]' 
          : 'opacity-100 translate-x-0 scale-100'
      }`}
    >
      {children}
    </div>
  )
}
