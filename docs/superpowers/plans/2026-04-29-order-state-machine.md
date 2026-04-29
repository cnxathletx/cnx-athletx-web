# Order State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize backend order status names, transition rules, and status groupings without moving existing side effects.

**Architecture:** Add `lib/orderStatus.ts` as the source of truth. Route files import constants and helpers from that module while keeping inventory, email, audit, shipment, and webhook side effects in place.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-29-order-state-machine-design.md`

---

## File Structure

New:
- `packages/api/src/lib/orderStatus.ts`
- `packages/api/src/lib/orderStatus.test.ts`

Modified:
- `packages/api/src/lib/types.ts`
- `packages/api/src/routes/admin/orders.ts`
- `packages/api/src/routes/checkout.ts`
- `packages/api/src/routes/payments.ts`
- `packages/api/src/routes/payments-webhook.integration.test.ts`
- `packages/api/src/routes/admin/reports.ts`
- `packages/api/src/routes/account-reviews.ts`
- `docs/technical-debpt-roadmap.md`
- `docs/changelog.md`

---

## Task 1: Add Central Status Module

- [ ] Write `packages/api/src/lib/orderStatus.test.ts` first with tests for status parsing, transition rules, reusable groups, webhook helpers, and SQL list generation.
- [ ] Run `npm --workspace @cnx-athletx/api run test -- orderStatus` and confirm it fails because `./orderStatus` does not exist.
- [ ] Implement `packages/api/src/lib/orderStatus.ts` with `ORDER_STATUSES`, `OrderStatus`, `ORDER_STATUS`, `ORDER_STATUS_TRANSITIONS`, `canTransition`, `isOrderStatus`, `parseOrderStatus`, status groups, webhook helpers, and `orderStatusSqlList`.
- [ ] Run `npm --workspace @cnx-athletx/api run test -- orderStatus` and confirm it passes.

## Task 2: Type Rows With `OrderStatus`

- [ ] Update order-related row interfaces in `packages/api/src/lib/types.ts` from `status: string` to `status: OrderStatus`.
- [ ] Run `npm --workspace @cnx-athletx/api run typecheck` and fix imports/call sites exposed by stricter typing.

## Task 3: Route Admin Transitions Through `canTransition`

- [ ] Replace the inline admin order status filter set with `isOrderStatus`.
- [ ] Replace `order.status !== ...` checks for mark-paid, pack, ship, and cancel with `canTransition(order.status, targetStatus)`.
- [ ] Replace hardcoded target status literals in admin order updates/audit JSON with `ORDER_STATUS` constants.
- [ ] Run `npm --workspace @cnx-athletx/api run test:integration -- admin-orders` and confirm admin transition behavior stays green.

## Task 4: Route Webhook Status Helpers Through Central Module

- [ ] Update `packages/api/src/routes/payments.ts` so `mapWebhookToOrderStatus` and `allowedFromStates` delegate to the central module.
- [ ] Use `orderStatusSqlList` for the webhook transition `UPDATE ... status IN (...)` list.
- [ ] Run `npm --workspace @cnx-athletx/api run test -- payments-webhook` and confirm helper and route tests pass.

## Task 5: Replace Status Group Literals

- [ ] Update payment proof eligibility in `checkout.ts` to use `PAYMENT_PROOF_STATUSES`.
- [ ] Update income report SQL to use `REVENUE_ORDER_STATUSES`.
- [ ] Update account review eligibility SQL to use `REVIEW_ELIGIBLE_ORDER_STATUSES`.
- [ ] Run `npm --workspace @cnx-athletx/api run test:integration -- checkout orders reviews reports` and confirm behavior stays green.

## Task 6: Docs And Final Verification

- [ ] Update `docs/technical-debpt-roadmap.md` to move the order state-machine item to Done.
- [ ] Update `docs/changelog.md` under `[Unreleased]`.
- [ ] Run `npm test`.
- [ ] Run `npm --workspace @cnx-athletx/api run test:integration`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
