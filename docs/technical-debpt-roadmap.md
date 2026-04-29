# Technical Debt & Abstraction Roadmap

Prioritized list of abstractions to introduce so the product can evolve without large rewrites. Scope: critical and high items only.

Last updated: 2026-04-29

---

## Critical

All critical items in this roadmap are complete.

---

## High

All high-priority items in this roadmap are complete.

---

## Out of scope (already abstracted)
- i18n via `vue-i18n` and `t(...)` keys.
- Theme tokens via CSS variables (`--bg`, `--fg`, `:root.light`).
- ULID generation in `lib/ulid.ts`.
- itty-router routing layer.

---

## Done
- **2026-04-29 — High-priority abstraction sweep completed.** Checkout inventory reservation now goes through `services/inventory.ts`; discount lookup/application/use-count commit/rollback now goes through `services/discounts.ts`; web transport modules now use `apiFetch<T>()` with normalized errors; frontend domain shapes live in `packages/web/src/types/`; API settings parsing/defaults live in `services/settings.ts`; money helpers live in API/web money modules; public write route rate-limit scopes use `middleware/rate-limit-registry.ts`; payment webhooks now have canonical `/api/payments/webhook/:providerId` dispatch with the legacy path kept as an alias; admin review moderation uses `useAdminResource<T>`. Spec: `docs/superpowers/specs/2026-04-29-high-roadmap-refactors-design.md`. Plan: `docs/superpowers/plans/2026-04-29-high-roadmap-refactors.md`.
- **2026-04-29 — Order status rules centralized (was Critical #1).** `packages/api/src/lib/orderStatus.ts` now exports the canonical order status union, named constants, transition map, `canTransition(from, to)`, parser helpers, and reusable status groups for revenue, reviews, payment proof, and webhooks. Admin and webhook transition checks now go through the central rules while side effects remain in their existing route handlers. Spec: `docs/superpowers/specs/2026-04-29-order-state-machine-design.md`. Plan: `docs/superpowers/plans/2026-04-29-order-state-machine.md`.
- **2026-04-29 — Email templates moved to brand config + locale registry (was Critical #1).** `packages/api/src/services/email.ts` was replaced by `services/email/` modules for brand identity, shared layout helpers, template registry, and Resend dispatch. Transactional templates are keyed by `(event, locale)`, Thai stubs fall back to English where copy is not ready, Thai review-prompt copy is preserved, customer locale is persisted on `orders.locale`, checkout sends the current web locale, and magic-link email selection follows `Accept-Language`. Spec: `docs/superpowers/specs/2026-04-27-email-templates-i18n-design.md`. Plan: `docs/superpowers/plans/2026-04-27-email-templates-i18n.md`.
- **2026-04-27 — Payment provider plumbing extracted (was Critical #1).** `PaymentProvider` interface gained `requiredSettingKeys` + `renderInstructions(order, settings) → InstructionsBlock | null`. Checkout no longer reads PromptPay/bank settings directly; email layer renders the provider's structured block via a generic `renderInstructionsHtml` helper. `PaymentInstructions` retired; `SiteSettings` slimmed to shipping fields. Adding a new gateway is now a self-contained provider file. Spec: `docs/superpowers/specs/2026-04-27-payment-provider-abstraction-design.md`. Plan: `docs/superpowers/plans/2026-04-27-payment-provider-abstraction.md`.
