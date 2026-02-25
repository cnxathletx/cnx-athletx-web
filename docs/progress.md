# CNX AthletX Implementation Progress

Last updated: 2026-02-25

## Summary

- Phase 0 infrastructure now includes Cloudflare Pages project creation and a deployed web build on the Athletx account.
- D1 databases for both development and production are provisioned and bound to the Worker configuration.
- Workers local development now validates both API health and D1 connectivity through `/api/health` and `/api/health/db`.
- Worker deployment is now live on `workers.dev` and both health endpoints are reachable in production.
- GitHub Actions CI/CD workflow is configured for lint, build, Pages deploy, and Workers deploy on `main`.
- GitHub Actions deployment was verified on `main` with successful Pages and Worker jobs.
- `RESEND_API_KEY` has been uploaded to Cloudflare Worker secrets (top-level and production environments).
- Cloudflare Access policy setup for path-specific admin protection is pending manual Zero Trust setup plus a custom domain/active zone.

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

- [ ] Implement Navbar, Footer, and Theme Toggle UI components
- [ ] Build Home, Shop, and Product Detail page scaffolds
- [ ] Add shared UI components (buttons, badges, product cards)
- [ ] Set up Vue Router storefront routes and responsive behavior

### Phase 2 — D1 Schema + Product APIs + Seeded Products

- [ ] Create and apply D1 schema SQL and seed SQL for initial products
- [ ] Implement `GET /api/products` and `GET /api/products/:slug`
- [ ] Add CORS middleware for local development
- [ ] Connect frontend product pages to API with loading and error states

### Phase 3 — Cart + Checkout + Payment Instructions UI

- [ ] Implement Pinia cart store with localStorage persistence
- [ ] Build Cart and Checkout pages with validation and summary
- [ ] Implement `POST /api/checkout` with atomic stock reservation and idempotency
- [ ] Build payment instructions, order confirmation, and order status pages

### Phase 4 — Payment Proof Submission

- [ ] Implement `POST /api/orders/:id/payment-proof`
- [ ] Build payment proof form on payment instructions page
- [ ] Persist payment proof records and expose proof status in order status
- [ ] Show payment proof details in admin order detail view

### Phase 5 — Customer Accounts (Magic Link Auth)

- [ ] Add `users`, `magic_links`, and `sessions` tables and `orders.user_id`
- [ ] Implement auth/session endpoints for request-link, verify, logout, and me
- [ ] Build login, verify, and account dashboard pages
- [ ] Add authenticated checkout prefill and account-linked order history APIs

### Phase 6 — Admin Dashboard + Fulfillment Workflow

- [ ] Build admin orders list with filtering, search, and pagination
- [ ] Build admin order detail actions and status transition UI
- [ ] Implement admin order management and inventory APIs
- [ ] Add audit logging and inventory adjustment flows
