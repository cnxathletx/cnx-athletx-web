# Changelog

All notable changes to this project are recorded here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); project will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once the first release is cut.

> **Status:** pre-release. No GitHub release or git tag exists yet. All entries live under `[Unreleased]` until the first version ships, at which point this section is renamed to that version with its release date and a fresh `[Unreleased]` is started.

Update this file with every user-visible or operationally-relevant change. Group entries under one of: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## [Unreleased]

Everything below is in-flight on `main` and has not been cut into a versioned release.

### Added
- **Admin Analytics page** added with visitor and order totals for today, this week, and this month. Orders come from D1; visitor totals use Cloudflare GraphQL Analytics when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` are configured.
- **CrossFit Chiang Mai partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset and the supplied logo's white outer layout removed.
- **Training Box Chiang Mai partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **The Green Athlete in Chiang Mai partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **PADEL.CNX partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **Bike Zone partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **Rx Cafe partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **CNX Sports Recovery partner logo** added to the site-wide partner section with a linked, fitted 3:2 web asset.
- **CNX partner logo skill** added for adapting supplied partner visuals into the storefront's 3:2 partner tile format with `$imagegen` and wiring generated assets into `PartnersSection.vue`.
- **Partners section** rendered site-wide above the footer (`PartnersSection.vue`) with placeholder logo tiles and EN/TH copy. Logos to be replaced once partner artwork lands.
- **Payment webhook dispatcher**: `/api/payments/webhook/:providerId` is now the canonical webhook URL, with the previous `/api/payments/:provider/webhook` path retained as a compatibility alias.
- **Email template i18n registry**: transactional emails now render through `services/email/` modules with shared brand config, layout helpers, and a `(event, locale)` registry. Customer locale is captured at checkout, persisted on `orders.locale`, and used for order/review/magic-link email selection. English copy is unchanged; Thai order templates intentionally fall back to English until content lands.
- **Payment provider abstraction**: `PaymentProvider` registry in `packages/api/src/services/payments/`. PromptPay and bank transfer become independent providers; future 2C2P / NowPayments slot in by adding a file and registering it. Discriminated `PaymentIntent` union (`instructions` | `redirect` | `sdk`) replaces the hard-coded `payment_instructions` shape.
- **Public `GET /api/payment-methods`** lists enabled providers with localized display names; powers the new checkout method picker.
- **`GET /api/orders/:id/intent`** rebuilds the payment intent from `payment_method` + current settings so `PaymentInstructionsPage` survives reloads and device switches.
- **Webhook scaffold `POST /api/payments/:provider/webhook`** with idempotency via `UNIQUE(provider, provider_txn_id)` and gated state transitions; returns 404 for manual providers (no `verifyWebhook`). Stub for future gateways.
- **Customer payment method picker** on the checkout page (radio list, defaults to first enabled).
- **Admin toggle for enabled payment methods** in site settings (`payment_methods_enabled` JSON array).
- **Email templates**: `payment_failed` and `payment_refunded` events wired into `sendOrderEmail`.

### Changed
- **Partners section** now randomizes partner tile display order on render and rotates overflow partners through the six visible slots using the Join the Community photo timing pattern.
- **Technical-debt refactors**: checkout inventory reservation, discount application, typed settings, money formatting, rate-limit policy selection, web API transport, frontend domain types, and admin resource loading now flow through dedicated shared modules instead of route/page-local implementations.
- **Order status rules**: API order statuses now flow through `lib/orderStatus.ts` with a canonical status union, transition map, `canTransition`, parser helpers, and shared status groups for admin routes, payment webhooks, reports, reviews, and payment-proof eligibility.
- **Order schema**: new `orders.payment_method` column. Status enum expanded with `awaiting_gateway`, `failed`, `refunded`.
- **Payments schema**: new `provider`, `provider_txn_id`, `status`, `payload_json` columns. `payments.method` CHECK constraint dropped (registry handles validation).
- **`POST /api/checkout`** now requires `payment_method` and returns a discriminated `intent` object instead of the fixed `payment_instructions` shape.
- **Migration `0009_payment_providers.sql`**: backfills `orders.payment_method` from existing `payments.method` rows; seeds `payment_methods_enabled = '["promptpay","bank_transfer"]'`.
- **API**: payment provider abstraction now owns email-instruction rendering. Each `PaymentProvider` declares `requiredSettingKeys` and a `renderInstructions(order, settings)` method; checkout no longer reads PromptPay/bank settings directly and the order-confirmed email no longer hardcodes payment HTML. Adding a new gateway no longer requires touching `routes/checkout.ts` or `services/email.ts`.

### Storefront
- **Storefront**: product catalog, product detail with image lightbox, cart, checkout, order tracking pages.
- **Customer accounts**: passwordless magic-link auth, hashed sessions, persistent shipping address with Thai cascaded dropdowns, order history, "My Reviews" section.
- **Admin dashboard**: orders, products, inventory, discount codes, price tiers, lab tests, reviews moderation, income report, chat inbox, site settings (shipping, payment details). Cloudflare Access PIN auth + session cookies.
- **Reviews system**: customer submission with eligibility check, admin moderation queue, public summary + list on PDP, ship → review-prompt email with idempotency, dedicated `AdminReviewsPage`.
- **Live chat widget**: customer ↔ admin messaging with incremental sync, unread tracking, email notifications, dashboard card.
- **Discount codes**: percentage and fixed types, min-order, max-uses, expiry, archive flag.
- **Volume price tiers** per product.
- **Product lines** centralizing nutrition, ingredients, usage; lab test PDF/image uploads with storefront overlay; R2 orphan cleanup endpoint with admin UI.
- **Internationalization**: full English + Thai locales for customer surfaces, lazy-loaded Thai bundle, persisted in `localStorage`. Admin remains English.
- **Transactional email** via Resend: order_created, paid, shipped, cancelled, review-prompt, magic-link, admin-new-order. Shared HTML templates.
- **SEO**: dynamic meta-tag injection Worker, JSON-LD product structured data, robots.txt, sitemap, Open Graph image, static-meta stripping.
- **Theming**: dark mode default (warm brown), light toggle, CSS-variable theme switching, flash-prevention head script.
- **CI/CD**: preview deployments for Pages + Workers; vitest unit + integration + Playwright e2e suites.
- **Rate limiting**: per-IP and global limits on public write endpoints (checkout, payment-proof, magic-link, chat, reviews) (`3482e70`).

### Fixed
- Partner logo rotation now fades within stable grid slots, matching the Join the Community photo transition instead of replacing entire tiles.
- Checkout discount code input no longer shows a sample code placeholder, avoiding the impression that a discount is already available.
- D1 migration chain no longer creates `product_lines.translations_json` before the dedicated translation migration, preventing duplicate-column failures when bootstrapping dev DBs missing `product_lines`.
- Cart link (and other lazy-route navigations) silently no-oped after a deploy on Safari: stale `index.html` from cache referenced removed chunk hashes, the auto-reload re-served the same cached HTML, and the one-shot session flag suppressed all further attempts. `_headers` now sends `Cache-Control: no-cache` for `/` and `/index.html`, the chunk-reload regex catches Firefox's wording too, the recovery uses a 10s timestamp throttle (instead of a one-shot flag) and appends `?_r=<ts>` to bypass the HTML cache.
- Roll back inventory reservations and discount usage counter when order insert batch fails, preventing inflated `reserved_count` / `used_count` after concurrent idempotency-key collisions (`62c5f01`).
- SEO worker regex now uses ` ` / ` ` escapes in literals so Workers' regex parser accepts them (`3684c9a`).
- Hide filename in lab tests overlay caption on product detail (`c80371e`).
- Cast workerFetch body to bypass undici BodyInit mismatch in test helpers (`cb77f98`).

### Changed
- Cookie security tightened for HTTPS / localhost (`5af3d62`).
- Public product endpoints (`/api/products`, `/api/products/:slug`) now send `Cache-Control` headers (300s list / 600s detail) so browsers and Cloudflare edge cache hits avoid hitting D1 on warm reloads.
- Cart persistence to `localStorage` is debounced (~300ms) with flush on `pagehide` / `beforeunload` / tab hide, removing main-thread `JSON.stringify` cost during rapid add/update.
- `App.vue` no longer awaits `auth.init()` on mount; the router guard already awaits it for routes that need auth, so anonymous landings render without a session-fetch round-trip blocking hydration.
- `ProductCard` prefetches `/api/products/:slug` on hover / focus / touchstart (deduped per `slug+locale`); combined with the new detail Cache-Control header, listing → detail navigation usually serves from the browser cache.
- Resend email sends now run with a 5s `AbortController` timeout (`sendResendEmail`, magic-link send) so a slow Resend response can no longer hold a Worker request beyond `ctx.waitUntil` budget.

### Security
- Hashed session tokens (no plaintext storage).
- Atomic inventory reservation via conditional D1 updates.
- CORS origin validation + SameSite cookie hardening.
- Magic-link generation tied to request origin.
- Spoofable CF headers removed from admin auth path; local-dev fallback disabled in production.
- CF Access JWT verified across subdomains for `/admin/*` and `/api/admin/*`.

### Infrastructure
- npm workspaces monorepo (`packages/web`, `packages/api`).
- D1 schema with money-as-integer (satang), ULID order IDs, idempotency keys.
- Domain migrated to `cnxnature.com` (web at `www.`, API at `api.`).

## Development history

Reconstructed from git log for context — these are not releases. Grouped by theme/period so reviewers can locate when capabilities landed on `main`.

### 2026-02-24 → 2026-02-28 — Scaffold + core storefront
- Repo scaffold (Pages + Workers + D1).
- Initial e-commerce storefront: browse, cart, checkout.
- First-pass admin pages for orders/products/inventory and customer auth.
- International phone input, privacy + terms pages, product image management with data-URL fallbacks.

### 2026-03 — Branding refresh
- Storefront redesign for CNX AthletX branding.
- Dark + light palette overhaul, Montserrat type, social-proof bar.
- Magic-link origin validation; preview-environment CI/CD wiring.

### 2026-04-01 → 2026-04-02 — Domain, security, email, modularization
- Migration from `cnxathletx.com` → `cnxnature.com` end-to-end.
- Session-based admin auth + dashboard.
- Persistent customer shipping address API.
- Resend-backed transactional email service + HTML templates.
- Worker `index.ts` split into routes/middleware/services; admin routes modularized.
- Vitest unit + integration test suites; Playwright e2e; admin new-order notification.
- SEO composables, robots/sitemap, dynamic meta-tag Worker, JSON-LD.

### 2026-04-03 → 2026-04-15 — Admin completion + i18n + Thai market polish
- Discount-code CRUD + archiving.
- Thai address selector + cascaded dropdowns; THB currency display.
- vue-i18n with English + Thai; locale persistence.
- Admin settings page (shipping, payment details), product archiving, sub-district field.
- Flash Express label links, dashboard breadcrumbs, AdminNav.
- Product lines schema; product-images management; image lightbox.
- Order cancellation email, About page, redesigned social-proof badges.

### 2026-04-15 → 2026-04-23 — Engagement + reporting
- Live chat widget end-to-end (customer + admin), with email alerts and dashboard card.
- Admin income report with revenue charts.
- Brand-story carousel + community image rotation on home.
- Email-template polish, OG image redesign, font-loading + preconnect perf.
- Volume price tiers; static-meta stripping in SEO worker.

### 2026-04-21 → 2026-04-24 — Reviews system
- D1 schema + migration, types, public + customer + admin endpoints (TDD).
- Components: `ReviewSummary`, `ReviewList`, `ReviewForm`, `ReviewableProductCard`; `useProductReviews` composable.
- Embedded summary + list on PDP, "My Reviews" on AccountPage, `AdminReviewsPage`.
- Ship → review-prompt email with idempotency.
- E2E coverage for submission → moderation → display.

### 2026-04-24 → 2026-04-25 — Lab tests + final hardening
- Product-line lab-test file uploads + storefront overlay.
- R2 orphan cleanup endpoint + admin settings UI.
- Cookie security tightened for HTTPS / localhost.
- Per-IP + global rate limits on public write endpoints.
