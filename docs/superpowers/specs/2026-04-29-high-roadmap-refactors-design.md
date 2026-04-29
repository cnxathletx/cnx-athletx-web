# High Roadmap Refactors Design

## Purpose

Complete the remaining Critical inventory rollback item and High roadmap items 5-12 as behavior-preserving refactors. The goal is to move duplicated policy and transport code into named modules without changing public API responses, checkout behavior, payment provider behavior, or admin workflows.

## Scope

This branch covers:

- Web API client wrapper and normalized client error type.
- Frontend domain type extraction from transport modules.
- Backend typed settings loader and payment settings map loader.
- Shared money helpers in API and web code.
- Checkout inventory reservation service and discount application service.
- Rate-limit registry for checkout, magic-link, and chat-create scopes.
- Canonical payment webhook dispatcher at `/api/payments/webhook/:providerId`, with the existing `/api/payments/:provider/webhook` path kept as a compatibility alias.
- A focused `useAdminResource<T>` composable used for an admin review moderation flow.

This branch does not redesign the full admin products page or introduce a new shared package across workspaces. The current monorepo has no cross-package source-sharing setup, so API and web get local `money` modules with the same public API.

## Architecture

Checkout remains the orchestrator for parsing, user checks, idempotency, pricing, order creation, email dispatch, and intent creation. Inventory reservation and discount use-count reservation move into services that return prepared D1 statements and rollback statements, letting checkout compose the batch and keep existing response semantics.

Settings move to `packages/api/src/services/settings.ts`, which owns defaults, parsing, raw map loading, and validation of admin-editable values. Payment providers keep consuming a raw settings map because they need provider-specific keys, while route-level shipping settings use typed values.

The web API layer gets `apiFetch<T>()` in `packages/web/src/api/client.ts`. Transport modules become thin wrappers around endpoints, and domain shapes move to `packages/web/src/types/` so pages and composables do not import business types from transport files.

## Compatibility

- Existing web API function exports are preserved.
- Existing error class export names are preserved as aliases/subclasses where pages already catch them.
- Existing webhook path `/api/payments/:provider/webhook` remains supported.
- Public response bodies stay unchanged.

## Testing

Add focused unit tests for each new abstraction and keep existing integration tests as route-level regression coverage. Final regression on the branch will run:

- `npm test`
- `npm run test:integration -w @cnx-athletx/api`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:e2e`
