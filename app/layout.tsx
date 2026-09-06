import type { Metadata, Viewport } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "SSG Store - Modern POS System",
  description: "Advanced Point of Sale system with inventory management, bill history, and mobile-first design",
  generator: "SSG Store",
  keywords: ["POS", "Point of Sale", "Inventory", "Restaurant", "Billing"],
  authors: [{ name: "SSG Store" }],
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2980b9",
}

import { AuthProvider } from "@/context/auth-context"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "sonner"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="antialiased h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://api.supabase.co" />


        {/* Performance hints */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={`font-sans h-full ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense fallback={
          <div className="h-full w-full flex items-center justify-center bg-background">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        }>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <AuthProvider>
              {children}
              <Toaster richColors position="top-right" closeButton />
            </AuthProvider>
          </ThemeProvider>
        </Suspense>

        <Analytics />
        
        {/* Service Worker Unregistration & Cache Clearing (Ensures hot-reloads apply immediately in dev) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then((registrations) => {
                  for (let registration of registrations) {
                    registration.unregister()
                      .then(() => console.log('SW unregistered successfully'));
                  }
                });
              }
              if ('caches' in window) {
                caches.keys().then((names) => {
                  for (let name of names) {
                    caches.delete(name)
                      .then(() => console.log('Cache cleared: ' + name));
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
