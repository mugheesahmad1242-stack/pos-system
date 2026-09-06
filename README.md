# SSG Store — POS System

> A Point of Sale + mini-ERP for a beverage shop: purchases, FIFO-costed inventory, sales, customer/supplier ledgers, and profit reporting — all in one app.

Built with **Next.js 14**, **Supabase**, and **Tailwind CSS v4**. Single-user by design (one shop, one login) and responsive from phone to desktop.

---

## Features

### Purchases & Inventory
- Manual purchase entry per beverage product (supplier, quantity, unit cost)
- Every purchase creates a FIFO cost "batch" — sales consume the oldest batch first, so profit reporting always reflects true cost of goods sold
- Inventory levels update automatically from purchases and sales; low-stock thresholds are configurable per product

### Orders & Checkout
- Product grid with live search
- **Automatic quantity-based pricing tiers** — set "buy N or more → price X" rules per product; the cart auto-fills the price as quantity changes, using the highest threshold the quantity qualifies for. The cashier can always type a different price manually per sale, with a one-tap "Use automatic" reset back to the tier price.
- FIFO cost is locked and inventory is decremented atomically at sale time (row-locked, no overselling) via a Postgres function
- Cash / credit / partial payment modes, with customer name + paid/dues tracking
- Custom 80mm-thermal PDF receipt (jsPDF, client-side, no server)

### Payables & Receivables
- Supplier ledger: name, amount paid, amount owed, payment history
- Customer ledger: name, amount paid, amount owed, payment history
- Both driven by the same purchase/sale records — no separate manual bookkeeping

### Reporting
- Daily / monthly profit: revenue minus FIFO cost, over any date range
- Bill history with full line items per sale

### Auth
- Single application user, no roles, no signup screen — the one account is provisioned directly in Supabase
- Every `/api/pos/*` route verifies the caller's Supabase session token server-side before touching the database (see `lib/require-auth.ts`); there is no unauthenticated path to any POS data
- Sign-in accepts either the account's plain username or its full email address

### Mobile-Responsive Layout
- Below the `md` breakpoint, the navigation sidebar becomes a slide-in drawer (hamburger trigger, backdrop, tap-outside-to-close) instead of a fixed column
- The cart becomes a bottom sheet on phones, opened via a floating "Cart" button with a live item-count badge, instead of a fixed side panel
- Tables scroll horizontally on narrow screens rather than breaking layout; grids collapse to fewer columns

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase GoTrue, single user, session-token-verified on every API route |
| PDF | jsPDF (client-side) |
| Icons | Lucide React |
| Package manager | npm (an `pnpm-lock.yaml` also exists from earlier tooling; npm is what's verified to build) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project

### 1. Install

```bash
npm install --legacy-peer-deps
```

`--legacy-peer-deps` is required because of a known, pre-existing React 19 vs. Next 14's declared React 18 peer-dependency mismatch — unrelated to this app's own code.

### 2. Set environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

The service-role key is required — every `/api/pos/*` route uses it server-side to read/write `pos_*` tables (see `lib/supabase-admin.ts`). Never expose it to the client.

### 3. Set up the database

Run these SQL files, **in this order**, in the Supabase SQL editor:

1. `supabase-pos-foundation-schema.sql` — core `pos_products`, `pos_inventory`, `pos_customers`, `pos_suppliers`, etc.
2. `supabase-pos-purchase-entry.sql` — purchases + FIFO cost batches
3. `supabase-pos-sales.sql` — `pos_create_sale()`, the row-locked, FIFO-costed sale function
4. `supabase-pos-feature-7-payments.sql` — customer/supplier payment tracking
5. `supabase-pos-feature-8-reporting.sql` — profit reporting views/functions
6. `supabase-pos-feature-9-cleanup.sql` — housekeeping (non-destructive; legacy-table notes are commented out on purpose — nothing here drops data)
7. `supabase-pos-feature-10-pricing-tiers.sql` — automatic quantity-based pricing tiers (additive only; doesn't touch anything above)

There are also `products` / `categories` / `bill_history` — style SQL fragments left over from an earlier iteration of this project. They are **not used** by the current app; every page and API route reads/writes `pos_*` tables only. They're harmless to leave in Supabase but can be ignored (or dropped manually if you're certain nothing else depends on them — this project's own migrations never do that automatically).

### 4. Create the one user account

This is a single-user app with no signup flow. Create the one account directly in the Supabase dashboard (Authentication → Users → Add user), with any email and password. On the login screen you can sign in with that same email, **or** with just the local part of it as a "username" (e.g. `admin` for `admin@pos.com` — the app maps a plain username to `<username>@pos.com` internally to satisfy Supabase's email-shaped requirement, but a real full email typed in is used as-is).

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

---

## Database Schema (current, `pos_*`)

```
pos_products              id, name, unit, low_stock_threshold, is_active
pos_inventory             product_id, quantity_on_hand
pos_product_price_tiers   product_id, min_quantity, unit_price          (Feature 10)
pos_purchases             id, supplier_id, purchase_date, total
pos_purchase_items        purchase_id, product_id, quantity, unit_cost  (feeds FIFO cost batches)
pos_sales                 id, customer_id, sale_date, total, paid_amount
pos_sale_items            sale_id, product_id, quantity, unit_price, unit_cost (frozen FIFO cost snapshot)
pos_suppliers             id, name
pos_supplier_payments     supplier_id, amount, payment_date
pos_customers             id, name
pos_customer_payments     customer_id, amount, payment_date
```

Exact column lists and constraints live in the numbered `supabase-pos-*.sql` files — treat those as the source of truth, this is a summary.

---

## Project Structure

```
app/
  login/               Sign-in screen (single user, no signup)
  orders/              Main POS screen — product grid + cart
  inventory/           Product management + pricing tier editor
  purchases/           Manual purchase entry
  payables/            Supplier ledger
  receivables/         Customer ledger
  bill-history/        Sales history
  financials/          Daily/monthly profit reporting
  settings/            Business config
  api/pos/*            All server routes — every one calls requireAuth() first

components/
  pos/                 Sidebar (responsive drawer), ProductCard, OrderSummary
                        (responsive bottom sheet on mobile), SearchBar, CartProvider
  inventory/           PricingTiersEditor — add/edit/delete quantity-price rules
  purchases/           AutocompleteField (customer/supplier picker)
  ui/                  Shared primitives (PageTransition, LoadingSkeleton, etc.)

lib/
  supabase.ts          Client Supabase instance + pos_* row type definitions
  supabase-admin.ts     Service-role Supabase instance, server-only
  require-auth.ts       Session-token verification, called by every API route
  pos-fetch.ts           Client fetch wrapper that attaches the session token
  pos-service.ts         Typed CRUD wrappers per pos_* table (calls posFetch)
  pricing-tiers.ts        Shared tier-resolution logic (highest matching tier wins)
  pos-receipt-pdf.ts      jsPDF 80mm thermal receipt builder

context/
  auth-context.tsx      Supabase session state, redirects to /login if absent
```

---

## Known Limitations

- `next@14.2.25` has a disclosed security advisory; upgrading is a separate, deliberate task (not done here — it would need re-testing everything).
- No `middleware.ts` / edge-level session check — sessions live in `localStorage`, not cookies, so auth is enforced per-API-route (`requireAuth()`) instead. Functionally equivalent for this app's threat model, but migrating to `@supabase/ssr` would be needed for edge middleware.
- No automated test suite yet. FIFO cost allocation and pricing-tier resolution are the two most financially-sensitive pieces of logic in the app and would benefit most from unit tests.
- No offline mode — if connectivity drops, the app can't take sales.

---

## License

MIT — free to use, modify, and deploy.

---

*Built by Divyansh Baghel · 2026*
