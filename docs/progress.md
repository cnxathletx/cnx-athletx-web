# CNX AthletX Implementation Progress

Last updated: 2026-02-27

## Summary

- Phase 0 infrastructure now includes Cloudflare Pages project creation and a deployed web build on the Athletx account.
- D1 databases for both development and production are provisioned and bound to the Worker configuration.
- Workers local development now validates both API health and D1 connectivity through `/api/health` and `/api/health/db`.
- Worker deployment is now live on `workers.dev` and both health endpoints are reachable in production.
- GitHub Actions CI/CD workflow is configured for lint, build, Pages deploy, and Workers deploy on `main`.
- GitHub Actions deployment was verified on `main` with successful Pages and Worker jobs.
- `RESEND_API_KEY` has been uploaded to Cloudflare Worker secrets (top-level and production environments).
- Cloudflare Access policy setup for path-specific admin protection is pending manual Zero Trust setup plus a custom domain/active zone.
- Product scope is updated so discount codes are now included in v1 and tracked in Phase 3.
- Phase 1 UI scaffolds are complete: Navbar (sticky, responsive, mobile drawer, theme toggle), Footer (always-dark, 3-column), Home page (6 sections), Shop page, Product Detail page (with tabs), and shared UI components (PrimaryButton, SecondaryButton, GhostButton, AppBadge, ProductCard).
- Vue Router installed and configured with routes for `/`, `/shop`, `/product/:slug`.
- `useTheme` composable handles dark/light toggle with localStorage persistence.
- Status pill and warning CSS variables added to tailwind.css for both themes.
- Dev server port updated to 5171.
- Phase 2 complete: D1 schema applied (all tables with indexes), seed data loaded (2 products, inventory, site settings).
- Product API endpoints live: `GET /api/products` (list with stock), `GET /api/products/:slug` (detail with 404/400 handling).
- CORS middleware added to Workers (preflight + response headers).
- Frontend now fetches real API data: Shop and Product Detail pages have loading skeletons and error states.
- Vite dev proxy configured to forward `/api` requests to Workers on port 8787.
- `discount_codes` table added to schema for Phase 3 discount code support.
- Phase 3 complete: Pinia cart store with localStorage persistence, full checkout flow implemented.
- `POST /api/checkout` endpoint with atomic stock reservation (D1 batch), idempotency keys, discount code validation, shipping calculation, and PromptPay QR URL generation.
- `GET /api/orders/:id` endpoint returns order details, items, shipment, and payment proof status.
- Cart page with quantity controls, item removal, and order summary sidebar.
- Checkout page with contact info, Thai address, discount code input, client-side validation, and API error mapping.
- Payment instructions page showing PromptPay QR, bank transfer details, copy-to-clipboard, and order summary.
- Order confirmation page with success state, order details, and "What's Next" steps.
- Order status page with visual timeline tracker, shipment details, and item breakdown.
- Order lookup page for tracking by order ID.
- Vue Router updated with routes for `/cart`, `/checkout`, `/order/status`, `/order/:id/payment`, `/order/:id/confirmation`, `/order/:id`.
- Phase 4 complete: `POST /api/orders/:id/payment-proof` accepts transfer references and stores rows in `payment_proofs`.
- Payment instructions page now includes a payment proof submission form with validation, submission feedback, and latest submitted reference display.
- Public order status now shows payment proof submission details (status indicator + latest reference/timestamp).
- Admin order detail endpoint and view added: `GET /api/admin/orders/:id` powers `/admin/orders/:id` (legacy `/admin/order/:id` redirects) and includes payment proof details.
- Theme primary palette updated from green to product-label gold tones for CTA and highlight consistency.
- Phase 6 scope expanded to include admin product catalog management (`GET/POST/PATCH /api/admin/products` + admin product list/edit UI).
- Phase 5 complete: magic-link authentication endpoints (`/api/auth/request-link`, `/api/auth/verify`, `/api/auth/logout`, `/api/auth/me`) and account endpoints (`/api/account/orders`, `/api/account/last-address`, `/api/account/profile`) are implemented.
- Frontend auth flow is live: `/login`, `/auth/verify`, `/account`, navbar auth state, checkout prefill for logged-in users, and post-checkout account-link prompt for guests.
- D1 schema migration was re-run remotely for both `cnx-athletx-dev` and `cnx-athletx-prod`, and `RESEND_API_KEY` was re-synced to Worker secrets for default and production environments.
- Phase 6 implementation is now in place:
  - Admin orders list page (`/admin/orders`) with filtering, search, and pagination.
  - Admin order detail page (`/admin/orders/:id`) with fulfillment actions (mark paid, pack, ship, cancel), payment proofs, shipment details, and audit log.
  - Admin inventory page (`/admin/inventory`) with stock adjustments wired to `PATCH /api/admin/inventory/:productId`.
  - Admin products page (`/admin/products`) with create/edit/archive workflows.
  - Admin product APIs implemented: `GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`.
  - Legacy route `/admin/order/:id` now redirects to `/admin/orders/:id`.

## Milestones Checklist

### Phase 0 — Repo Scaffolding + Cloudflare + CI

- [x] Initialize npm workspace monorepo with `packages/web` and `packages/api`
- [x] Scaffold Vue 3 + Vite + TypeScript in `packages/web`
- [x] Scaffold Cloudflare Workers + `itty-router` in `packages/api`
- [x] Configure Tailwind CSS v4 with brand design tokens and dark/light theme variables
- [x] Add flash prevention script in `packages/web/index.html` to prevent theme FOUC
- [x] Create Cloudflare Pages project linked to `packages/web`
- [x] Create Cloudflare Workers project config with `wrangler.toml`
- [x] Provision D1 database (dev + production)
- [ ] Configure Cloudflare Access policy for `/admin/*` and `/api/admin/*` (Blocked: path-specific policy for public storefront/API requires custom domain with active zone and manual Zero Trust setup; current OAuth flow cannot manage Access apps/policies via API)
- [x] Set up GitHub Actions: lint + build + deploy (Pages and Workers)
- [x] Store `RESEND_API_KEY` as Workers secret

### Phase 1 — Tailwind Theme + Home/Shop UI Scaffolds

- [x] Implement Navbar, Footer, and Theme Toggle UI components
- [x] Build Home, Shop, and Product Detail page scaffolds
- [x] Add shared UI components (buttons, badges, product cards)
- [x] Set up Vue Router storefront routes and responsive behavior

### Phase 2 — D1 Schema + Product APIs + Seeded Products

- [x] Create and apply D1 schema SQL and seed SQL for initial products
- [x] Implement `GET /api/products` and `GET /api/products/:slug`
- [x] Add CORS middleware for local development
- [x] Connect frontend product pages to API with loading and error states

### Phase 3 — Cart + Checkout + Payment Instructions UI

- [x] Implement Pinia cart store with localStorage persistence
- [x] Build Cart and Checkout pages with validation and summary
- [x] Implement `POST /api/checkout` with atomic stock reservation and idempotency
- [x] Implement discount code validation and adjusted totals in checkout API + UI
- [x] Build payment instructions, order confirmation, and order status pages

### Phase 4 — Payment Proof Submission

- [x] Implement `POST /api/orders/:id/payment-proof`
- [x] Build payment proof form on payment instructions page
- [x] Persist payment proof records and expose proof status in order status
- [x] Show payment proof details in admin order detail view

### Phase 5 — Customer Accounts (Magic Link Auth)

- [x] Add `users`, `magic_links`, and `sessions` tables and `orders.user_id`
- [x] Implement auth/session endpoints for request-link, verify, logout, and me
- [x] Build login, verify, and account dashboard pages
- [x] Add authenticated checkout prefill and account-linked order history APIs

### Phase 6 — Admin Dashboard + Fulfillment Workflow

- [x] Build admin orders list with filtering, search, and pagination
- [x] Build admin order detail actions and status transition UI
- [x] Implement admin order management and inventory APIs
- [x] Add audit logging and inventory adjustment flows
- [x] Build admin products page (list, create/edit, active/inactive toggle)
- [x] Implement admin product catalog APIs (`GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`)
