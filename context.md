# Project Context: SSG Store POS System

Developer reference document. Describes the current architecture, file map, and the history of significant changes made to this codebase.

**Note on history:** an earlier version of this file described a different system entirely — a Zustand-backed, role-based (`owner`/`cashier`/`worker`), `products`/`categories`/`bill_history`-table app. That description no longer matches the code. The app was rebuilt around a single-user model and a `pos_*` table schema (purchases, FIFO-costed inventory, sales, payables/receivables). This rewrite reflects that current reality; the changelog below starts from that rebuild forward.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.25 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 (no `tailwind.config.*` — v4's CSS-based config) |
| Database | Supabase — PostgreSQL, GoTrue auth |
| PDF | jsPDF (client-side, no server) |
| Icons | Lucide React |
| Package manager | npm (verified); a `pnpm-lock.yaml` also exists from earlier tooling but is not what's used to build |

There is no client-side state store (no Zustand) in the current app — every page fetches directly from `/api/pos/*` via `lib/pos-service.ts`, and the cart is plain React state in `components/pos/cart-context.tsx`.

---

## Key File Map

| File | Role |
|---|---|
| `app/orders/page.tsx` | Main POS screen — product grid + cart, loads products/inventory/pricing tiers |
| `app/inventory/page.tsx` | Product management, low-stock thresholds, pricing-tier editor |
| `app/purchases/page.tsx` | Manual purchase entry (supplier, quantity, unit cost) |
| `app/payables/page.tsx` | Supplier ledger — paid/dues, payment history |
| `app/receivables/page.tsx` | Customer ledger — paid/dues, payment history |
| `app/bill-history/page.tsx` | Sales history with line items |
| `app/financials/page.tsx` | Daily/monthly profit (revenue − FIFO cost) over a date range |
| `app/dashboard/page.tsx` | At-a-glance stats |
| `app/settings/page.tsx` | Business config (invoice header/footer, etc.) |
| `app/login/page.tsx` | Single-user sign-in (no signup, no roles) |
| `app/api/pos/*` | All server routes; every handler calls `requireAuth()` first |
| `components/pos/sidebar.tsx` | Navigation — static column on desktop, slide-in drawer on mobile |
| `components/pos/order-summary.tsx` | Cart panel — static side panel on desktop, bottom sheet on mobile |
| `components/pos/cart-context.tsx` | Cart state: quantities, auto/manual pricing mode, subtotal |
| `components/pos/product-card.tsx` | Product tile, add-to-cart |
| `components/inventory/pricing-tiers-editor.tsx` | Add/edit/delete a product's quantity-price tiers |
| `lib/supabase.ts` | Browser Supabase client + `pos_*` row type definitions |
| `lib/supabase-admin.ts` | Service-role Supabase client, server-only |
| `lib/require-auth.ts` | Verifies the caller's session token; every API route depends on this |
| `lib/pos-fetch.ts` | Client `fetch` wrapper — attaches the session token to every request |
| `lib/pos-service.ts` | Typed CRUD service classes per `pos_*` table, used by every page |
| `lib/pricing-tiers.ts` | `resolveTierPrice()` — highest matching tier wins; shared by cart + docs |
| `lib/pos-receipt-pdf.ts` | jsPDF 80mm thermal receipt builder |
| `context/auth-context.tsx` | Supabase session state; redirects to `/login` with no session |

---

## Design System

### Color Tokens (`app/globals.css`)
- `--pos-brand` — mint green, primary CTA and active states
- `--pos-panel` — card/panel background (adapts light/dark)
- `--pos-panel-2` — deeper background layer
- `--pos-stroke` — border color

### Utility Classes
- `.pos-panel` — glass-card style panel (background + border + radius)

### Auth model
Single application user. No roles, no signup UI, no per-page access restriction beyond "is there a valid session at all" — every authenticated user sees every page, because there is only ever one user.

### Responsive breakpoints
Standard Tailwind `md` (768px), unmodified. Below `md`:
- Sidebar (`components/pos/sidebar.tsx`) becomes an off-canvas drawer, triggered by a fixed hamburger button, closed by a backdrop tap or by navigating.
- Cart (`components/pos/order-summary.tsx`) becomes a bottom sheet, triggered by a fixed "Cart" button showing a live item-count badge.
- Data tables are wrapped in `overflow-x-auto` rather than being redesigned per breakpoint.

---

## Changelog

### Security hardening — session-verified API routes
The app previously had no real access control: `/api/pos/*` routes could be called directly with no token and would happily read/write data.
- Added `lib/require-auth.ts` (verifies the caller's Supabase session token server-side against Supabase Auth) and `lib/pos-fetch.ts` (client wrapper that attaches the token to every request).
- Every `/api/pos/*` route handler (11 files, 19 handlers) now calls `requireAuth()` first and returns 401 on failure.
- Every frontend data-fetching call was switched from raw `fetch` to `posFetch`.
- `context/auth-context.tsx` no longer auto-logs-in a mock user; it redirects to `/login` when there's no real session.
- A dev-only bypass token (`dev-mock-token`) exists for local development, gated purely on the server process's own `NODE_ENV` (not on anything the request sends), so it's structurally inert in a production build.
- No `middleware.ts` was added: sessions live in `localStorage`, not cookies, so edge middleware can't see them without a `@supabase/ssr` migration (not done — noted as a future option, not a gap in the current protection, since every route enforces this at the API layer instead).

### Codebase cleanup
- Removed 3 dead legacy-schema SQL files, an old UI zip, and a stray diff file that had accumulated in the repo.
- Removed 5 unused npm dependencies (`@modelcontextprotocol/sdk`, `node-fetch`, `immer`, `use-sync-external-store`, `zustand`) and ~340 lines of dead performance-tooling code that was never imported anywhere.
- Removed npm scripts referencing packages that were never installed.
- Nothing here touched live Supabase data or dropped any table — cleanup was codebase-only. A cleanup migration was drafted, found to drop legacy tables, and deleted before use; the corresponding SQL file's legacy-table note was restored to its original non-destructive, commented-out form.

### Feature 10 — Automatic Quantity-Based Pricing Tiers
Closes the "flexible selling price by volume" requirement, which was previously manual-override-only.
- New table `pos_product_price_tiers` (`supabase-pos-feature-10-pricing-tiers.sql`) — additive only, doesn't alter `pos_create_sale()`, FIFO cost logic, inventory locking, or any payment trigger. A product with no tiers behaves exactly as before (manual price entry).
- A tier means "if quantity ≥ min_quantity, price = unit_price". At sale time, the **highest-threshold tier the quantity qualifies for** wins (`lib/pricing-tiers.ts::resolveTierPrice`, mirrored in SQL by the optional `pos_resolve_tier_price()` helper).
- Cart (`cart-context.tsx`) tracks a `priceMode: "auto" | "manual"` per line. Price recalculates automatically while in `auto` mode as quantity changes; typing a price switches to `manual` and it sticks until the cashier taps "Use automatic" (`resetToAutomaticPrice`).
- New API routes: `app/api/pos/pricing-tiers/route.ts` (list/create) and `.../[id]/route.ts` (update/delete), both behind `requireAuth`.
- New Inventory UI: `components/inventory/pricing-tiers-editor.tsx`, shown in the product edit drawer for existing products (a product must be saved once before tiers can be attached, since tiers reference `product_id`).

### Login fix — email addresses were blocked
The login form previously threw `"Username should not contain '@' symbol."` for any input containing `@`, which meant a real email address couldn't be typed at all — the form had assumed every input was a bare username and unconditionally appended `@pos.com` to it, so blocking `@` was a (broken) guard against that assumption breaking.
- Removed the blocking check.
- Made the email construction conditional instead: if the trimmed input already contains `@`, it's used as-is; otherwise it's mapped to `<input>@pos.com` as before. This preserves the plain-username login path while fixing real email addresses.
- Updated the label/placeholder to "Username or Email" and added `inputMode="email"` for a better mobile keyboard.

### Mobile responsiveness pass
The layout previously assumed a desktop-width viewport everywhere: the sidebar was a static `w-64` column with no toggle, and the cart was a static `w-96` panel — together wider than most phone screens, with no way to collapse either.
- `components/pos/sidebar.tsx` — now a static in-flow column at `md` and above (unchanged desktop behavior), and an off-canvas drawer below `md`, opened by a fixed hamburger button, closed by a backdrop tap or by selecting a nav item. Background scroll is locked while open.
- `components/pos/order-summary.tsx` (the cart) — same pattern in reverse: static side panel at `md` and above, off-canvas bottom sheet below `md`, opened by a fixed "Cart" button showing a live item-count badge.
- All 9 pages that render `<Sidebar />` got a small responsive top-padding adjustment (`pt-16 md:pt-3`) so page content doesn't sit under the fixed mobile hamburger button.
- `app/orders/page.tsx`'s product grid changed from a fixed `grid-cols-4` to `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- Data tables (bill history, purchases, payables, receivables, financials) were already wrapped in `overflow-x-auto` and needed no change.
- Login page was already fully responsive (`w-full max-w-md` card) and needed no change.

---

## Not Yet Done

- README/context refresh was completed as part of the mobile-responsiveness pass (this file), but a couple of items remain open:
  - `@supabase/ssr` + `middleware.ts` migration, if edge-level session enforcement is ever wanted.
  - Automated tests for FIFO cost allocation and pricing-tier resolution — the two most financially-sensitive pieces of logic in the app.
  - Upgrading `next@14.2.25` past its disclosed security advisory (deliberately deferred — would need a full re-test pass).
