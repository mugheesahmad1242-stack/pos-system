"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LayoutDashboard, ShoppingCart, ArrowLeft, PackageX } from "lucide-react"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-[var(--pos-panel-2)] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--pos-brand)]/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--pos-accent-blue)]/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="pos-panel max-w-md w-full p-8 rounded-2xl flex flex-col items-center gap-6 text-center relative z-10">
        {/* Icon */}
        <div className="p-5 rounded-2xl bg-[var(--pos-brand)]/10 border border-[var(--pos-brand)]/20">
          <PackageX className="w-12 h-12 text-[var(--pos-brand-text)]" strokeWidth={1.5} />
        </div>

        {/* Error code */}
        <div>
          <p className="text-8xl font-black tracking-tighter text-[var(--pos-brand-text)] leading-none">
            404
          </p>
          <h1 className="text-xl font-bold text-foreground mt-2">Page Not Found</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Oops! The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-[var(--pos-stroke)]" />

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl border border-[var(--pos-stroke)] bg-[var(--pos-panel)] text-sm font-semibold text-foreground active:bg-muted/50 transition duration-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-xl bg-[var(--pos-brand)] text-black text-sm font-bold transition duration-200 hover:opacity-90 shadow-md shadow-[var(--pos-brand)]/10"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
        </div>

        <Link
          href="/orders"
          className="flex items-center gap-1.5 text-xs text-[var(--pos-brand-text)] hover:underline font-medium"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          Or go to New Order
        </Link>

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground">Made by Divyansh Baghel</p>
      </div>
    </div>
  )
}
