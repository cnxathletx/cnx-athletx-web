# Frontend Design And Structure

Last updated: 2026-05-07

## Scope

The frontend is a Vue 3 + Vite SPA under `packages/web`. It contains customer storefront pages, customer account pages, checkout/payment flows, and the admin interface.

## Structure

- `src/pages/`: route-level pages for storefront, account, checkout, order status, and admin workflows.
- `src/components/`: reusable UI, layout, brand, payment, review, and chat components.
- `src/stores/`: Pinia stores for cart, auth, and chat state.
- `src/api/`: transport-only modules. These files call API endpoints and adapt responses, but do not own domain type definitions.
- `src/types/`: frontend domain shapes such as products, checkout/order data, reviews, chat, payments, auth, and admin resources.
- `src/composables/`: shared page logic such as metadata, JSON-LD, theme, product reviews, Thai address selection, and admin resource loading.
- `src/utils/`: focused utility functions such as money formatting and pricing helpers.

## API Transport

All API modules route HTTP through `src/api/client.ts`:

- `apiUrl(path)` applies the optional `VITE_API_BASE_URL`.
- `apiFetch<T>(path, options)` defaults to `credentials: 'include'`, serializes plain object bodies as JSON, parses JSON responses, handles empty responses, and throws normalized `ApiClientError` instances unless a module provides a custom error mapper.
- Public API functions preserve existing export names so pages stay decoupled from transport details.

## Domain Types

Domain interfaces live in `src/types/` and are re-exported from existing API modules for compatibility. New page/component code should prefer importing types from `src/types/*` when it does not also need the API function.

## Checkout UX

Discount code inputs are label-addressable and intentionally avoid example-code placeholders. Showing a fake code can imply an active promotion exists when no customer-facing discount has been published.

Logged-in customers see AthletX Points redemption in checkout. The UI previews the 5% capped point discount and disables discount-code entry while points are selected; the API remains authoritative for the final redemption amount.

## Account UX

The account page includes a compact AthletX Points card using the existing `X` mark inside a sage token. It shows the current points balance and recent activity without making the loyalty system feel like a separate wallet.

## Admin Resource Pattern

`useAdminResource<T>()` centralizes the common admin pattern of loading data, tracking loading/error state, running a mutating action, and reloading after success. It is intentionally small and currently used by review moderation and the analytics report; larger products/discounts/product-line pages should only migrate when their workflows match the same shape cleanly.

## Admin Analytics

`AdminAnalyticsPage.vue` displays the current day, week, and month totals for visitors and orders. Orders come from D1 through `/api/admin/reports/analytics`. Visitor counts are also returned by that endpoint after the Worker is configured with Cloudflare analytics credentials; until then the page shows a clear "not configured" state instead of failing the report.
