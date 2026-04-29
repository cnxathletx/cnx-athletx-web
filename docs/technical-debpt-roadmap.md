# Technical Debt & Abstraction Roadmap

Prioritized list of abstractions to introduce so the product can evolve without large rewrites. Scope: critical and high items only.

Last updated: 2026-04-29

---

## Critical

### 2. Inventory reserve/rollback hand-rolled in checkout
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
- **2026-04-29 — Order status rules centralized (was Critical #1).** `packages/api/src/lib/orderStatus.ts` now exports the canonical order status union, named constants, transition map, `canTransition(from, to)`, parser helpers, and reusable status groups for revenue, reviews, payment proof, and webhooks. Admin and webhook transition checks now go through the central rules while side effects remain in their existing route handlers. Spec: `docs/superpowers/specs/2026-04-29-order-state-machine-design.md`. Plan: `docs/superpowers/plans/2026-04-29-order-state-machine.md`.
- **2026-04-29 — Email templates moved to brand config + locale registry (was Critical #1).** `packages/api/src/services/email.ts` was replaced by `services/email/` modules for brand identity, shared layout helpers, template registry, and Resend dispatch. Transactional templates are keyed by `(event, locale)`, Thai stubs fall back to English where copy is not ready, Thai review-prompt copy is preserved, customer locale is persisted on `orders.locale`, checkout sends the current web locale, and magic-link email selection follows `Accept-Language`. Spec: `docs/superpowers/specs/2026-04-27-email-templates-i18n-design.md`. Plan: `docs/superpowers/plans/2026-04-27-email-templates-i18n.md`.
- **2026-04-27 — Payment provider plumbing extracted (was Critical #1).** `PaymentProvider` interface gained `requiredSettingKeys` + `renderInstructions(order, settings) → InstructionsBlock | null`. Checkout no longer reads PromptPay/bank settings directly; email layer renders the provider's structured block via a generic `renderInstructionsHtml` helper. `PaymentInstructions` retired; `SiteSettings` slimmed to shipping fields. Adding a new gateway is now a self-contained provider file. Spec: `docs/superpowers/specs/2026-04-27-payment-provider-abstraction-design.md`. Plan: `docs/superpowers/plans/2026-04-27-payment-provider-abstraction.md`.
