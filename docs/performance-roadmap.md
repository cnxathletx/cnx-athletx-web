# Performance Roadmap

Updated: 2026-04-17

## Scope

This review is based on:

- Static code review of the Vue app and Cloudflare Worker API.
- A production frontend build from `npm run build:web`.
- Asset-size inspection of bundled media under `packages/web/src/assets/photos`.

This is a code-and-build review, not a full lab benchmark. The priorities below focus on the bottlenecks that are already visible in the codebase and build output.

## Snapshot

- `dist/assets/index-*.js`: `261.89 kB` raw / `89.14 kB` gzip.
- `dist/assets/useThaiAddress-*.js`: `211.10 kB` raw / `52.42 kB` gzip.
- `dist/assets/PaymentInstructionsPage-*.js`: `82.02 kB` raw / `28.72 kB` gzip.
- Largest homepage image emitted in the current build: `251.64 kB`.

## Implemented Since Review

- Homepage media delivery was optimized with resized responsive variants, deferred community loading, and removal of the old oversized root photo set.
- Chat no longer initializes on storefront page mount; the widget now stays idle until the user opens it.

## What Is Already Good

- Most routes are code-split with dynamic imports in `packages/web/src/router/index.ts`.
- Product-card images already use `loading="lazy"` in `packages/web/src/components/ui/ProductCard.vue`.
- The D1 schema has reasonable baseline indexes for orders, sessions, and chat tables.

## Prioritized Findings

### 1. Chat transport scales linearly with transcript size

Priority: P1

Evidence:

- `packages/web/src/stores/chat.ts:14` polls every `4000` ms.
- `packages/web/src/stores/chat.ts:132-143` refetches the conversation on every poll.
- `packages/api/src/routes/chat.ts:81-90` always loads the full message list for a conversation.
- `packages/api/src/routes/chat.ts:170-187` and `packages/api/src/routes/chat.ts:220-247` return the full transcript again for fetch and send flows.

Why it matters:

- Once a conversation exists, every poll re-reads and re-sends the entire transcript.
- The current cap is `200` messages, so the worst-case cost grows exactly when a conversation becomes most active.
- The frontend also recomputes unread state from the full message array on each refresh.

Recommendation:

- Replace full-transcript polling with incremental sync: `since_message_id`, `updated_since`, or cursor-based pagination.
- Return unread counts and conversation metadata separately from message history.
- If chat becomes a bigger product surface, move from short-interval polling to SSE or WebSocket transport.

### 2. Checkout ships a large Thai-address chunk up front

Priority: P1

Evidence:

- `packages/web/src/composables/useThaiAddress.ts:1-28` statically imports `th-address.json` and builds lookup maps at module load time.
- `packages/web/src/pages/CheckoutPage.vue:12` imports the composable directly.
- `packages/web/src/pages/CheckoutPage.vue:60` instantiates it on page entry.
- The production build emits `dist/assets/useThaiAddress-*.js` at `211.10 kB` raw / `52.43 kB` gzip.

Why it matters:

- Every checkout navigation pays for the full address dataset before the user interacts with the address form.
- The module also sorts filtered results inside computed properties, which adds avoidable CPU work on top of the network cost.

Recommendation:

- Lazy-load the address dataset only when the user focuses the address fields.
- Consider moving province/district/subdistrict lookup to a small API endpoint or a separate worker KV-backed asset if the dataset grows.
- Pre-sort lookup arrays once during data preparation rather than sorting on every computed evaluation.

### 3. Product detail pages make a redundant full-catalog request

Priority: P1

Evidence:

- `packages/web/src/pages/ProductDetailPage.vue:197-211` fetches the product by slug, then immediately fetches the full product list just to pick one related product.

Why it matters:

- Every product-detail visit pays for two API requests instead of one.
- The second request duplicates data that is already fetched elsewhere in the storefront and can grow with catalog size.
- Locale changes retrigger the same pattern because `loadProduct()` runs again on locale watch.

Recommendation:

- Include a related-product summary in `/api/products/:slug`, or provide a dedicated lightweight related-products endpoint.
- Alternatively, cache the catalog in a Pinia store and reuse it across Home, Shop, and Product Detail.

### 4. Admin product listing has an N+1 screenshot query pattern

Priority: P2

Evidence:

- `packages/api/src/routes/admin/products.ts:12-25` loads screenshots one product at a time.
- `packages/api/src/routes/admin/products.ts:47-59` fetches the product list, then calls `serializeAdminProduct()` for every row.

Why it matters:

- Query count grows linearly with product count.
- The public product route already shows the better pattern: batch screenshot loading by product ids.
- This will become noticeable in admin once the catalog and screenshot counts increase.

Recommendation:

- Batch-load screenshots for all returned product ids in one query, then group them in memory.
- Keep `/api/admin/products` at a constant query count regardless of catalog size.

## Roadmap

### Phase 1: Remove avoidable network and CPU work

Target: 2-3 days

- Change chat APIs to incremental message sync.
- Lazy-load Thai address data.
- Stop refetching the entire catalog from product-detail pages.

Expected outcome:

- Lower steady-state API traffic.
- Faster checkout route activation.
- Fewer redundant storefront fetches.

### Phase 2: Improve scaling paths and guardrails

Target: 1-2 days

- Eliminate the admin product N+1 query pattern.
- Add simple bundle-size budget checks in CI for the main entry and route chunks.
- Add lightweight timing instrumentation around the busiest API routes (`/api/products`, `/api/products/:slug`, chat endpoints, admin product listing).

Expected outcome:

- Better admin responsiveness as data grows.
- Earlier detection of performance regressions before deploys.

## Success Metrics

- Checkout address chunk below `30 kB` gzip before interaction.
- Product detail view loads related-product data without a second full-catalog request.
- Chat steady-state refreshes return only deltas, not the full transcript.
- `/api/admin/products` executes in a constant number of queries.

## Recommended Implementation Order

1. Incremental chat sync.
2. Lazy-loaded Thai address data.
3. Product-detail related-product API cleanup.
4. Admin product batching and CI budgets.
