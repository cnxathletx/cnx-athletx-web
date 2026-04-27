# Technical Debt & Abstraction Roadmap

Prioritized list of abstractions to introduce so the product can evolve without large rewrites. Scope: critical and high items only.

Last updated: 2026-04-27

---

## Critical

### 1. Email templates hardcode brand, domain, locale
- **Where:** `packages/api/src/services/email.ts` (~607 lines), strings like `CNX AthletX`, `orders@cnxnature.com`, EN-only copy, inline styles.
- **Problem:** TH localization, white-label, theming all require touching every template.
- **Fix:**
  - Extract a `brand` config (name, domain, contact email, logo URL, palette) consumed by `emailLayout`.
  - Template registry keyed by `(event, locale)`, simple string interpolation (no Handlebars per project decision).
  - Move `formatThb` to a shared money helper (see High #7).

### 2. Order state machine is implicit
- **Where:** Status strings (`pending_payment`, `paid`, `shipped`, `cancelled`, `delivered`) scattered across `routes/checkout.ts`, `routes/admin/orders.ts`, `services/email.ts`, frontend pages.
- **Problem:** v1.5 auto-expiry and 2C2P webhooks will add new transitions. No central rule for what's allowed or what side effects fire.
- **Fix:**
  - Single `lib/orderStatus.ts` exporting the `Status` union, a `transitions` map, and `canTransition(from, to)`.
  - Side-effect hooks (email send, inventory release, audit log) registered per transition.
  - Admin and webhook handlers go through the same dispatcher.

### 3. Inventory reserve/rollback hand-rolled in checkout
- **Where:** `packages/api/src/routes/checkout.ts:319-463`.
- **Problem:** Cascading rollback logic is inline and impossible to reuse for cart-side reservation, expiry release, or admin manual adjustments.
- **Fix:** `inventoryService.reserve(items, ctx)` and `release(items, ctx)` returning result + rollback statements. Checkout composes with discount apply, then commits in one batch.

---

## High

### 5. No HTTP client wrapper on the web side
- **Where:** `packages/web/src/api/client.ts` only builds the URL; every api module re-implements `fetch` + JSON + error shape + `credentials: 'include'`.
- **Fix:** Typed `apiFetch<T>(path, opts)` with default credentials, normalized error type, optional retry/hook.

### 6. Settings access is untyped
- **Where:** `SiteSettingsMap` is `Record<string, string>`; callers do `parseInt(map.shipping_flat_rate ?? '10000', 10)` everywhere.
- **Fix:** A single `loadSettings(env): TypedSettings` with per-key parsers + defaults registered once. Removes drift in defaults across files.

### 7. Money handling scattered
- **Where:** `formatThb` in email service, `formatPrice` in web, satang math sprinkled across validators and pricing.
- **Fix:** Shared `lib/money.ts` (`toSatang`, `fromSatang`, `format(amount, locale, currency)`). Sets up non-THB territory if ever needed.

### 8. Discount logic inline in checkout
- **Where:** `packages/api/src/routes/checkout.ts:240-336` (lookup, validation, apply, atomic increment, rollback).
- **Fix:** `discountService.apply(code, subtotal, ctx)` returning `{ discount, commit, rollback }`. Future discount types (BOGO, free-shipping, per-product) plug in without touching checkout.

### 9. Admin CRUD pages duplicate shape
- **Where:** `AdminProductsPage.vue` (~1075 lines), with similar shape across discounts, lab tests, reviews, price tiers.
- **Fix:** `useAdminResource<T>` composable (list / create / update / archive) once the patterns settle, plus shared table + form shell components. Don't extract prematurely — wait for the third near-identical page.

### 10. Rate-limit scopes are ad-hoc strings
- **Where:** Each route invents its scope (`'checkout'`, etc.) and limit constants inline.
- **Fix:** Central registry of scopes with limits driven by env or `site_settings` so we can tune without redeploys.

### 11. Webhooks have no shared envelope
- **Where:** `PaymentProvider.verifyWebhook` exists but route wiring isn't generic.
- **Fix:** Single `/api/payments/webhook/:providerId` dispatcher that calls the provider's `verifyWebhook` and expects `{ orderId, status, idempotencyKey }`. Adding a gateway = registering a provider.

### 12. Frontend domain types co-located with transport
- **Where:** `AdminOrderDetail`, `AdminProduct`, etc. defined in `packages/web/src/api/admin.ts`.
- **Fix:** Move domain types to `packages/web/src/types/` (or a shared package later). API files do transport only. Reduces churn when shapes change.

---

## Out of scope (already abstracted)
- i18n via `vue-i18n` and `t(...)` keys.
- Theme tokens via CSS variables (`--bg`, `--fg`, `:root.light`).
- ULID generation in `lib/ulid.ts`.
- itty-router routing layer.

---

## Done
- **2026-04-27 — Payment provider plumbing extracted (was Critical #1).** `PaymentProvider` interface gained `requiredSettingKeys` + `renderInstructions(order, settings) → InstructionsBlock | null`. Checkout no longer reads PromptPay/bank settings directly; email layer renders the provider's structured block via a generic `renderInstructionsHtml` helper. `PaymentInstructions` retired; `SiteSettings` slimmed to shipping fields. Adding a new gateway is now a self-contained provider file. Spec: `docs/superpowers/specs/2026-04-27-payment-provider-abstraction-design.md`. Plan: `docs/superpowers/plans/2026-04-27-payment-provider-abstraction.md`.
