# High Roadmap Refactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining Critical inventory refactor plus High roadmap refactors 5-12 without changing user-visible checkout, payment, admin, or storefront behavior.

**Architecture:** Add narrow shared modules, then route existing code through them. Checkout keeps orchestration while inventory and discount reservation move to services; frontend transport moves through `apiFetch<T>()`; domain types move to `packages/web/src/types/`; settings, money, rate limits, and webhook dispatch get central registries.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, Vue 3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-29-high-roadmap-refactors-design.md`

---

## File Structure

New:
- `packages/api/src/lib/money.ts`
- `packages/api/src/lib/money.test.ts`
- `packages/api/src/services/settings.ts`
- `packages/api/src/services/settings.test.ts`
- `packages/api/src/services/inventory.ts`
- `packages/api/src/services/inventory.test.ts`
- `packages/api/src/services/discounts.ts`
- `packages/api/src/services/discounts.test.ts`
- `packages/api/src/middleware/rate-limit-registry.ts`
- `packages/api/src/middleware/rate-limit-registry.test.ts`
- `packages/web/src/api/client.test.ts`
- `packages/web/src/types/admin.ts`
- `packages/web/src/types/auth.ts`
- `packages/web/src/types/checkout.ts`
- `packages/web/src/types/products.ts`
- `packages/web/src/types/reviews.ts`
- `packages/web/src/types/chat.ts`
- `packages/web/src/types/payment.ts`
- `packages/web/src/composables/useAdminResource.ts`
- `packages/web/src/composables/useAdminResource.test.ts`

Modified:
- `packages/api/src/lib/types.ts`
- `packages/api/src/routes/auth.ts`
- `packages/api/src/routes/chat.ts`
- `packages/api/src/routes/checkout.ts`
- `packages/api/src/routes/settings.ts`
- `packages/api/src/routes/payment-methods.ts`
- `packages/api/src/routes/orders.ts`
- `packages/api/src/routes/payments.ts`
- `packages/api/src/routes/admin/settings.ts`
- `packages/api/src/services/email/layout.ts`
- `packages/api/src/services/email/index.ts`
- `packages/api/src/services/payments/bank-transfer.ts`
- `packages/api/src/services/payments/promptpay.ts`
- `packages/api/src/services/payments/registry.ts`
- `packages/api/src/routes/payments-webhook.integration.test.ts`
- `packages/web/src/api/*.ts`
- `packages/web/src/utils/money.ts`
- `packages/web/src/utils/money.test.ts`
- `packages/web/src/pages/AdminReviewsPage.vue`
- `docs/technical-debpt-roadmap.md`
- `docs/plan/01-executive-summary.md`
- `docs/plan/02-backend-architecture.md`
- `docs/plan/03-frontend-design.md`

---

## Task 1: Web Client And Domain Types

- [ ] Write `packages/web/src/api/client.test.ts` for `apiFetch<T>()`: default `credentials: 'include'`, JSON body serialization, query path resolution through `apiUrl`, normalized `ApiClientError`, 204/null handling, and an optional `parseError` callback.
- [ ] Run `npm run test -w @cnx-athletx/web -- client` and confirm the test fails because `apiFetch` does not exist.
- [ ] Implement `apiFetch<T>()`, `ApiClientError`, and `ApiErrorDetails` in `packages/web/src/api/client.ts`.
- [ ] Add type files under `packages/web/src/types/` and move exported interfaces from transport modules into those files.
- [ ] Refactor web API modules to call `apiFetch<T>()` while preserving existing exported function names and error class names.
- [ ] Run `npm run test -w @cnx-athletx/web -- client` and `npm run typecheck -w @cnx-athletx/web`.

## Task 2: Money Helpers

- [ ] Extend `packages/web/src/utils/money.test.ts` for `toSatang`, `fromSatang`, and locale/currency formatting.
- [ ] Add `packages/api/src/lib/money.test.ts` for the same API-side helpers.
- [ ] Run `npm run test -w @cnx-athletx/web -- money` and `npm run test -w @cnx-athletx/api -- money` and confirm failures for missing helpers.
- [ ] Implement `toSatang`, `fromSatang`, and `formatMoney` in web, and `toSatang`, `fromSatang`, `formatMoney`, `formatThb` in API.
- [ ] Replace local API payment/email formatters and web page-local money formatters with the shared helpers.
- [ ] Run both money test commands again.

## Task 3: Typed Settings Loader

- [ ] Write `packages/api/src/services/settings.test.ts` covering defaults, invalid numeric fallbacks, payment method parsing, raw map loading, allowed key validation, and JSON-array validation.
- [ ] Run `npm run test -w @cnx-athletx/api -- settings` and confirm it fails because the service does not exist.
- [ ] Implement `loadSettingsMap`, `parseSettings`, `loadSettings`, `parseEnabledPaymentMethods`, `validateSettingUpdate`, and `ALLOWED_SETTING_KEYS`.
- [ ] Refactor settings, payment-methods, orders intent, checkout, admin settings, and payment registry to use the service.
- [ ] Run `npm run test -w @cnx-athletx/api -- settings payment`.

## Task 4: Rate Limit Registry

- [ ] Add `packages/api/src/middleware/rate-limit-registry.test.ts` for checkout, magic-link, and chat-create per-IP/global scope specs and optional override parsing.
- [ ] Run `npm run test -w @cnx-athletx/api -- rate-limit` and confirm missing registry behavior fails.
- [ ] Implement `RATE_LIMITS`, `getRateLimitPolicy`, `enforcePolicyLimit`, and `enforcePolicyGlobalLimit`.
- [ ] Refactor auth, checkout, and chat routes to use named registry policies instead of inline scope strings and constants.
- [ ] Run `npm run test -w @cnx-athletx/api -- rate-limit auth chat checkout`.

## Task 5: Inventory And Discount Services

- [ ] Write `packages/api/src/services/inventory.test.ts` for reserve statement count, rollback statement generation, and failed reservation response metadata mapping.
- [ ] Write `packages/api/src/services/discounts.test.ts` for not-found, inactive, expired, maxed, min-order, fixed, percent, capping, commit statement, and rollback statement behavior.
- [ ] Run `npm run test -w @cnx-athletx/api -- inventory discounts` and confirm both service tests fail because modules do not exist.
- [ ] Implement `reserveInventory`, `releaseInventory`, `reservationFailure`, and `applyDiscountCode`.
- [ ] Refactor checkout to call the services and keep existing HTTP responses.
- [ ] Run `npm run test:integration -w @cnx-athletx/api -- checkout discount`.

## Task 6: Webhook Envelope

- [ ] Extend `packages/api/src/routes/payments-webhook.integration.test.ts` for the canonical `/api/payments/webhook/:providerId` path and the compatibility alias path.
- [ ] Run `npm run test:integration -w @cnx-athletx/api -- payments-webhook` and confirm the canonical path fails before implementation.
- [ ] Refactor `packages/api/src/routes/payments.ts` to share one dispatcher for both paths and normalize successful provider output to `{ orderId, status, idempotencyKey }` internally while preserving existing provider interfaces.
- [ ] Run the payments webhook integration command again.

## Task 7: Admin Resource Composable

- [ ] Write `packages/web/src/composables/useAdminResource.test.ts` for load, action success reload, loading state, and captured error behavior.
- [ ] Run `npm run test -w @cnx-athletx/web -- useAdminResource` and confirm it fails because the composable does not exist.
- [ ] Implement `useAdminResource<T>()`.
- [ ] Refactor `packages/web/src/pages/AdminReviewsPage.vue` to use the composable for review loading and moderation reloads.
- [ ] Run `npm run test -w @cnx-athletx/web -- useAdminResource` and `npm run typecheck -w @cnx-athletx/web`.

## Task 8: Docs And Regression

- [ ] Update `docs/technical-debpt-roadmap.md` to move Critical item 2 and High items 5-12 to Done.
- [ ] Update `docs/plan/01-executive-summary.md`, `docs/plan/02-backend-architecture.md`, and `docs/plan/03-frontend-design.md` for the new abstractions.
- [ ] Run `npm test`.
- [ ] Run `npm run test:integration -w @cnx-athletx/api`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:e2e`.
