# Changelog

All notable changes to this project are recorded here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Update this file with every release-worthy change. Group entries under one of: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Keep an `[Unreleased]` section at the top for in-flight work; promote it to a versioned heading on release.

## [Unreleased]

### Fixed
- Roll back inventory reservations and discount usage counter when order insert batch fails, preventing inflated `reserved_count` / `used_count` after concurrent idempotency-key collisions (`62c5f01`).
- SEO worker regex now uses ` ` / ` ` escapes in literals so Workers' regex parser accepts them (`3684c9a`).

## [1.0.0] — 2026-04-25

First production release. Full storefront, admin dashboard, customer accounts, and supporting infrastructure on a Cloudflare-only stack (Pages + Workers + D1 + R2).

### Added
- **Storefront**: product catalog, product detail with image lightbox, cart, checkout, order tracking pages.
- **Customer accounts**: passwordless magic-link auth, hashed sessions, persistent shipping address with Thai address cascaded dropdowns, order history, "My Reviews" section.
- **Admin dashboard**: orders, products, inventory, discount codes, price tiers, lab tests, reviews moderation, income report, chat inbox, site settings (shipping, payment details). Cloudflare Access PIN auth + session cookies.
- **Reviews system**: customer submission with eligibility check, admin moderation queue, public summary + list on PDP, ship → review-prompt email with idempotency.
- **Live chat widget**: customer ↔ admin messaging with incremental sync, unread tracking, email notifications, dashboard card.
- **Discount codes**: percentage and fixed types, min-order, max-uses, expiry, archive flag.
- **Volume price tiers** per product.
- **Product lines** centralizing nutrition, ingredients, usage; lab test PDF/image uploads with storefront overlay.
- **Internationalization**: full English + Thai locales for customer surfaces, lazy-loaded Thai bundle, persisted in `localStorage`. Admin remains English.
- **Transactional email** via Resend: order_created, paid, shipped, cancelled, review-prompt, magic-link, admin-new-order. Shared HTML templates.
- **SEO**: dynamic meta-tag injection Worker, JSON-LD product structured data, robots.txt, sitemap, Open Graph image.
- **Theming**: dark mode default (warm brown), light toggle, CSS-variable theme switching, flash-prevention head script.
- **CI/CD**: preview deployments for Pages + Workers; vitest unit + integration + Playwright e2e suites.
- **Rate limiting**: per-IP and global limits on public write endpoints (checkout, payment-proof, magic-link, chat, reviews).

### Security
- Hashed session tokens (no plaintext storage).
- Atomic inventory reservation via conditional D1 updates.
- CORS origin validation + SameSite cookie hardening; HTTPS-only cookies in prod, relaxed for localhost.
- Magic-link generation tied to request origin.
- Spoofable CF headers removed from admin auth path; local-dev fallback disabled in production.
- CF Access JWT verified across subdomains for `/admin/*` and `/api/admin/*`.

### Infrastructure
- npm workspaces monorepo (`packages/web`, `packages/api`).
- D1 schema with money-as-integer (satang), ULID order IDs, idempotency keys.
- Domain migrated to `cnxnature.com` (web at `www.`, API at `api.`).

## Pre-1.0 milestones

Reconstructed from git history, grouped by theme. Earlier development was iterative without semver tagging; entries below summarize what shipped each phase.

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
- Per-IP + global rate limits on public write endpoints. **Released as 1.0.0.**
