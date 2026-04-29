# Order State Machine Design

## Purpose

Centralize order status names, transition rules, and status groupings used by admin routes, payment webhooks, reports, and review eligibility. This pass is behavior-preserving: side effects stay in their existing route handlers and services.

## Scope

This change covers backend status constants and transition checks only. It does not introduce the full transition dispatcher, hook registry, auto-expiry, or new webhook provider behavior. Those can build on this module later.

## Architecture

Add `packages/api/src/lib/orderStatus.ts` as the single source of truth for:

- `ORDER_STATUSES` and the `OrderStatus` union.
- `ORDER_STATUS` named constants for readable call sites.
- `ORDER_STATUS_TRANSITIONS` and `canTransition(from, to)`.
- Reusable groups such as revenue-counting statuses, review-eligible statuses, payment-proof statuses, and webhook source statuses.
- Helpers for parsing untrusted status strings and generating static SQL `IN (...)` lists from trusted constants.

Admin order routes will replace inline status sets and direct transition comparisons with this module. Payment webhook helper functions will delegate to the same module while preserving their current exported names for existing tests/imports. Reports and account review eligibility will consume exported status groups instead of duplicating literal SQL lists.

## Transition Model

The initial graph reflects current operational behavior plus statuses already present in the DB enum:

- `pending_payment` can move to `awaiting_gateway`, `paid`, `failed`, or `cancelled`.
- `awaiting_gateway` can move to `paid`, `failed`, or `cancelled`.
- `paid` can move to `packed`, `refunded`, or `cancelled`.
- `packed` can move to `shipped`, `refunded`, or `cancelled`.
- `shipped` can move to `delivered` or `refunded`.
- `delivered` can move to `refunded`.
- `failed`, `refunded`, and `cancelled` are terminal.

Admin routes currently exercise `pending_payment -> paid`, `paid -> packed`, `packed -> shipped`, and cancellation from `pending_payment`, `paid`, or `packed`. Webhooks currently exercise `pending_payment/awaiting_gateway -> paid/failed` and post-paid statuses to `refunded`.

## Error Handling

Invalid admin status filters continue returning `400`. Invalid transitions continue returning `409` with `current_status`. The module treats unrecognized strings as invalid and never coerces them.

## Testing

Add a focused unit test for the status module that proves:

- The exported status list includes the DB enum statuses in order.
- `isOrderStatus` and `parseOrderStatus` distinguish valid/invalid input.
- Valid and invalid transitions match the transition graph.
- Reusable groups match existing route behavior.
- SQL list generation produces static quoted lists from trusted constants.

Existing admin order, payment webhook, report, review, checkout, and order integration tests provide route-level regression coverage.
