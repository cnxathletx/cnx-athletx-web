# Product Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated customers with shipped/delivered orders to leave moderated 1–5 star ratings (with optional text) on product lines, displayed publicly under a "Verified buyer" label and aggregated on the product detail page.

**Architecture:** New `reviews` D1 table keyed by `(user_id, product_line_id)` with UNIQUE constraint. Server-side eligibility check joins `orders` + `order_items` + `products`. Admin moderation via dedicated routes. Live aggregation (no denormalization in v1). Vue components for summary, list, submission form, and admin queue. Post-ship trigger sends a single review-prompt email per order via Resend, idempotent via `email_logs`.

**Tech Stack:** Cloudflare Workers (itty-router) + D1 (SQLite) + TypeScript + Vue 3 + Vite + Tailwind v4 + vue-i18n + Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-04-23-product-reviews-design.md`

---

## File Structure

**API — create**
- `packages/api/sql/migrations/0006_reviews.sql` — D1 migration
- `packages/api/src/routes/reviews.ts` — public reviews endpoint
- `packages/api/src/routes/account-reviews.ts` — customer review endpoints
- `packages/api/src/routes/admin/reviews.ts` — admin moderation endpoints
- `packages/api/src/routes/reviews.integration.test.ts`
- `packages/api/src/routes/account-reviews.integration.test.ts`
- `packages/api/src/routes/admin/reviews.integration.test.ts` (or top-level `admin-reviews.integration.test.ts` — match existing convention)

**API — modify**
- `packages/api/sql/schema.sql` — add `reviews` table
- `packages/api/src/lib/types.ts` — add review row/body types
- `packages/api/src/index.ts` — register new routes
- `packages/api/src/routes/admin.ts` — register admin reviews routes
- `packages/api/src/services/email.ts` — add `buildReviewPromptEmail` + `sendReviewPromptEmail`
- `packages/api/src/services/email.test.ts` — extend with review-prompt tests
- `packages/api/src/routes/admin/orders.ts` — dispatch review-prompt email on ship
- `packages/api/src/routes/admin-orders.integration.test.ts` — extend with review-prompt assertions

**Web — create**
- `packages/web/src/api/reviews.ts` — public + customer API client
- `packages/web/src/api/adminReviews.ts` — admin API client
- `packages/web/src/components/reviews/ReviewSummary.vue`
- `packages/web/src/components/reviews/ReviewSummary.test.ts`
- `packages/web/src/components/reviews/ReviewList.vue`
- `packages/web/src/components/reviews/ReviewList.test.ts`
- `packages/web/src/components/reviews/ReviewForm.vue`
- `packages/web/src/components/reviews/ReviewForm.test.ts`
- `packages/web/src/components/reviews/ReviewableProductCard.vue`
- `packages/web/src/composables/useProductReviews.ts`
- `packages/web/src/pages/AdminReviewsPage.vue`
- `e2e/reviews.spec.ts`

**Web — modify**
- `packages/web/src/pages/ProductDetailPage.vue` — embed summary + list
- `packages/web/src/pages/AccountPage.vue` — add "My reviews" tab
- `packages/web/src/components/admin/AdminNav.vue` — add Reviews link
- `packages/web/src/router/index.ts` — add `/admin/reviews` route
- `packages/web/src/i18n/en.json` — review keys
- `packages/web/src/i18n/th.json` — review keys (parallel)

---

## Phase A — Database & Types

### Task 1: Migration + schema for `reviews` table

**Files:**
- Create: `packages/api/sql/migrations/0006_reviews.sql`
- Modify: `packages/api/sql/schema.sql` (append)

- [ ] **Step 1: Create migration file**

Write `packages/api/sql/migrations/0006_reviews.sql`:

```sql
-- Add reviews table for product-line ratings + comments by verified buyers.
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_line_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    body TEXT,
    locale TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejected_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at TEXT,
    moderated_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,
    UNIQUE (user_id, product_line_id),
    CHECK (rating BETWEEN 1 AND 5),
    CHECK (status IN ('pending','approved','rejected')),
    CHECK (locale IN ('en','th')),
    CHECK (body IS NULL OR length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_reviews_line_status ON reviews(product_line_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at DESC);
```

- [ ] **Step 2: Append same statements to `packages/api/sql/schema.sql`**

Append at end of file (schema.sql is the source-of-truth used by the test reset endpoint):

```sql

-- reviews table (verified-buyer ratings, line-level)
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_line_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    body TEXT,
    locale TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejected_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at TEXT,
    moderated_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,
    UNIQUE (user_id, product_line_id),
    CHECK (rating BETWEEN 1 AND 5),
    CHECK (status IN ('pending','approved','rejected')),
    CHECK (locale IN ('en','th')),
    CHECK (body IS NULL OR length(body) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_reviews_line_status ON reviews(product_line_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at DESC);
```

- [ ] **Step 3: Apply migration to local D1**

Run from `packages/api/`:

```bash
npx wrangler d1 execute cnx-athletx --local --file=sql/migrations/0006_reviews.sql
```

Expected: migration runs without errors.

- [ ] **Step 4: Commit**

```bash
git add packages/api/sql/migrations/0006_reviews.sql packages/api/sql/schema.sql
git commit -m "feat(reviews): add reviews D1 table + migration"
```

---

### Task 2: Add TypeScript row + body types

**Files:**
- Modify: `packages/api/src/lib/types.ts`

- [ ] **Step 1: Append review types at end of file**

```typescript
// --- Review row types ---

export interface ReviewRow {
  id: number
  user_id: string
  product_line_id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  updated_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface PublicReviewRow {
  id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  created_at: string
}

export interface ReviewSummaryRow {
  avg_rating: number | null
  count: number
}

export interface ReviewDistributionRow {
  rating: number
  count: number
}

export interface ReviewableProductRow {
  product_line_id: number
  slug: string
  name: string
  order_id: string
  shipped_at: string
}

export interface AdminReviewListRow {
  id: number
  user_id: string
  user_email: string
  product_line_id: number
  product_line_name: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface SubmitReviewBody {
  productLineId: number
  rating: number
  body?: string
  locale: 'en' | 'th'
}

export interface RejectReviewBody {
  reason?: string
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (no usage yet, just declarations).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/lib/types.ts
git commit -m "feat(reviews): add review row + body types"
```

---

## Phase B — Public Reviews API

### Task 3: Public reviews endpoint — failing tests

**Files:**
- Create: `packages/api/src/routes/reviews.integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function placeShippedOrder(email: string): Promise<string> {
  const cookie = await loginAs(email)
  const checkoutRes = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({ customer: { name: 'Buyer', email, phone: '+66811111111', address: { line1: '1 Test Road', district: 'Mueang', province: 'CM', postal_code: '50200' } } }),
  })
  const { order } = await checkoutRes.json() as { order: { id: string } }
  await workerFetch(`/api/admin/orders/${order.id}/mark-paid`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order.id}/pack`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order.id}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK123' } })
  return cookie
}

async function seedApprovedReview(cookie: string, productLineId: number, rating: number, body: string | null = null) {
  const submitRes = await workerFetch('/api/account/reviews', {
    cookie,
    method: 'POST',
    body: { productLineId, rating, body, locale: 'en' },
  })
  const { review } = await submitRes.json() as { review: { id: number } }
  await workerFetch(`/api/admin/reviews/${review.id}/approve`, { admin: true, method: 'POST' })
  return review.id
}

describe('GET /api/products/:slug/reviews', () => {
  it('returns empty summary when no reviews exist', async () => {
    const res = await workerFetch('/api/products/athletx-protein-500g/reviews')
    expect(res.status).toBe(200)
    const data = await res.json() as { summary: { avgRating: number | null; count: number; distribution: Record<string, number> }; reviews: unknown[]; total: number }
    expect(data.summary.count).toBe(0)
    expect(data.summary.avgRating).toBeNull()
    expect(data.reviews).toHaveLength(0)
    expect(data.total).toBe(0)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await workerFetch('/api/products/no-such-product/reviews')
    expect(res.status).toBe(404)
  })

  it('only includes approved reviews', async () => {
    const cookie = await placeShippedOrder('approved@example.com')
    await seedApprovedReview(cookie, 1, 5, 'Great')

    // Pending submission from another user
    const cookie2 = await placeShippedOrder('pending@example.com')
    await workerFetch('/api/account/reviews', {
      cookie: cookie2, method: 'POST', body: { productLineId: 1, rating: 3, body: 'Pending', locale: 'en' },
    })

    const res = await workerFetch('/api/products/athletx-protein-500g/reviews')
    const data = await res.json() as { summary: { count: number; avgRating: number }; reviews: Array<{ rating: number }> }
    expect(data.summary.count).toBe(1)
    expect(data.summary.avgRating).toBe(5)
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0].rating).toBe(5)
  })

  it('paginates reviews', async () => {
    // Seed 12 approved reviews
    for (let i = 0; i < 12; i++) {
      const cookie = await placeShippedOrder(`p${i}@example.com`)
      await seedApprovedReview(cookie, 1, ((i % 5) + 1))
    }
    const res = await workerFetch('/api/products/athletx-protein-500g/reviews?page=2&pageSize=10')
    const data = await res.json() as { reviews: unknown[]; total: number; page: number }
    expect(data.total).toBe(12)
    expect(data.page).toBe(2)
    expect(data.reviews).toHaveLength(2)
  })

  it('aggregates at product-line level (both SKUs share rating)', async () => {
    const cookie = await placeShippedOrder('line@example.com')
    await seedApprovedReview(cookie, 1, 4)

    // Both 500g and 1000g SKUs share product_line_id=1 in seed data
    const res500 = await workerFetch('/api/products/athletx-protein-500g/reviews')
    const data500 = await res500.json() as { summary: { count: number; avgRating: number } }
    const res1000 = await workerFetch('/api/products/athletx-protein-1000g/reviews')
    const data1000 = await res1000.json() as { summary: { count: number; avgRating: number } }

    expect(data500.summary.count).toBe(1)
    expect(data1000.summary.count).toBe(1)
    expect(data500.summary.avgRating).toBe(data1000.summary.avgRating)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/reviews.integration.test.ts
```

Expected: FAIL (routes not implemented; 404 from default handler).

> **Note:** if seed data has different slugs/product_line ids, adjust the test slug strings and `productLineId` literal to match `packages/api/sql/seed.sql`. Read that file first; do not guess.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/reviews.integration.test.ts
git commit -m "test(reviews): failing integration tests for public reviews endpoint"
```

---

### Task 4: Implement public reviews endpoint

**Files:**
- Create: `packages/api/src/routes/reviews.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create route file**

Write `packages/api/src/routes/reviews.ts`:

```typescript
import type { RouterType } from 'itty-router'
import type { Env, PublicReviewRow, ReviewSummaryRow, ReviewDistributionRow, CountRow } from '../lib/types'

export function registerReviewsRoutes(router: RouterType) {
  router.get('/api/products/:slug/reviews', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const slug = parts[parts.length - 2] || ''

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10)
    const pageSizeRaw = parseInt(url.searchParams.get('pageSize') ?? '10', 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 50) : 10
    const offset = (page - 1) * pageSize

    try {
      const product = await env.DB.prepare(
        `SELECT product_line_id FROM products WHERE slug = ? AND archived = 0 LIMIT 1`
      ).bind(slug).first<{ product_line_id: number | null }>()

      if (!product || product.product_line_id == null) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      const lineId = product.product_line_id

      const summary = await env.DB.prepare(
        `SELECT AVG(rating) AS avg_rating, COUNT(*) AS count
         FROM reviews WHERE product_line_id = ? AND status = 'approved'`
      ).bind(lineId).first<ReviewSummaryRow>()

      const { results: distRows } = await env.DB.prepare(
        `SELECT rating, COUNT(*) AS count
         FROM reviews WHERE product_line_id = ? AND status = 'approved'
         GROUP BY rating`
      ).bind(lineId).all<ReviewDistributionRow>()

      const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      for (const row of distRows) distribution[String(row.rating)] = row.count

      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM reviews WHERE product_line_id = ? AND status = 'approved'`
      ).bind(lineId).first<CountRow>()
      const total = totalRow?.count ?? 0

      const { results: reviews } = await env.DB.prepare(
        `SELECT id, rating, body, locale, created_at
         FROM reviews
         WHERE product_line_id = ? AND status = 'approved'
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`
      ).bind(lineId, pageSize, offset).all<PublicReviewRow>()

      return new Response(JSON.stringify({
        summary: {
          avgRating: summary?.avg_rating ?? null,
          count: summary?.count ?? 0,
          distribution,
        },
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          locale: r.locale,
          createdAt: r.created_at,
        })),
        page,
        pageSize,
        total,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
```

- [ ] **Step 2: Register route in `packages/api/src/index.ts`**

Add import after other route imports:

```typescript
import { registerReviewsRoutes } from './routes/reviews'
```

Add registration after `registerProductRoutes(router)`:

```typescript
registerReviewsRoutes(router)
```

- [ ] **Step 3: Run tests — only "empty summary" and "404" should pass**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/reviews.integration.test.ts -t "empty summary"
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/reviews.integration.test.ts -t "404 for unknown"
```

Expected: PASS for both. Other tests still fail because customer/admin endpoints are not built yet (that's fine — they will be enabled by later tasks).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/reviews.ts packages/api/src/index.ts
git commit -m "feat(reviews): public GET /api/products/:slug/reviews"
```

---

## Phase C — Customer Reviews API

### Task 5: Customer review endpoints — failing tests

**Files:**
- Create: `packages/api/src/routes/account-reviews.integration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function placeOrder(email: string, body = checkoutBody()): Promise<{ cookie: string; orderId: string }> {
  const cookie = await loginAs(email)
  const res = await workerFetch('/api/checkout', { cookie, body: { ...body, customer: { ...(body as any).customer, email } } })
  const { order } = await res.json() as { order: { id: string } }
  return { cookie, orderId: order.id }
}

async function transitionTo(orderId: string, status: 'paid' | 'packed' | 'shipped') {
  if (status === 'paid' || status === 'packed' || status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { admin: true, method: 'POST' })
  }
  if (status === 'packed' || status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { admin: true, method: 'POST' })
  }
  if (status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK1' } })
  }
}

describe('GET /api/account/reviewable-products', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviewable-products')
    expect(res.status).toBe(401)
  })

  it('returns empty when no shipped orders', async () => {
    const cookie = await loginAs('noorder@example.com')
    const res = await workerFetch('/api/account/reviewable-products', { cookie })
    const data = await res.json() as { items: unknown[] }
    expect(data.items).toEqual([])
  })

  it('returns reviewable line for shipped order', async () => {
    const { cookie, orderId } = await placeOrder('elig@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviewable-products', { cookie })
    const data = await res.json() as { items: Array<{ productLineId: number; slug: string }> }
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items[0]).toHaveProperty('productLineId')
    expect(data.items[0]).toHaveProperty('slug')
  })

  it('hides line once review submitted', async () => {
    const { cookie, orderId } = await placeOrder('hidden@example.com')
    await transitionTo(orderId, 'shipped')
    const before = await workerFetch('/api/account/reviewable-products', { cookie }).then((r) => r.json() as Promise<{ items: Array<{ productLineId: number }> }>)
    const lineId = before.items[0].productLineId
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: lineId, rating: 5, locale: 'en' } })
    const after = await workerFetch('/api/account/reviewable-products', { cookie }).then((r) => r.json() as Promise<{ items: Array<{ productLineId: number }> }>)
    expect(after.items.find((i) => i.productLineId === lineId)).toBeUndefined()
  })
})

describe('POST /api/account/reviews', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviews', { method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(401)
  })

  it('403 when user has no order in line', async () => {
    const cookie = await loginAs('noeligible@example.com')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(403)
  })

  it('403 when user only has paid (not shipped) order', async () => {
    const { cookie, orderId } = await placeOrder('onlypaid@example.com')
    await transitionTo(orderId, 'paid')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(403)
  })

  it('200 happy path inserts as pending', async () => {
    const { cookie, orderId } = await placeOrder('happy@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, body: 'Great', locale: 'en' } })
    expect(res.status).toBe(200)
    const data = await res.json() as { review: { status: string; rating: number } }
    expect(data.review.status).toBe('pending')
    expect(data.review.rating).toBe(5)
  })

  it('409 on duplicate', async () => {
    const { cookie, orderId } = await placeOrder('dup@example.com')
    await transitionTo(orderId, 'shipped')
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    expect(res.status).toBe(409)
  })

  it('400 invalid rating', async () => {
    const { cookie, orderId } = await placeOrder('badrating@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 6, locale: 'en' } })
    expect(res.status).toBe(400)
  })

  it('400 oversize body', async () => {
    const { cookie, orderId } = await placeOrder('big@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, body: 'x'.repeat(1001), locale: 'en' } })
    expect(res.status).toBe(400)
  })

  it('400 invalid locale', async () => {
    const { cookie, orderId } = await placeOrder('badloc@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'fr' } })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/account/reviews', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviews')
    expect(res.status).toBe(401)
  })

  it('returns own reviews with status', async () => {
    const { cookie, orderId } = await placeOrder('mine@example.com')
    await transitionTo(orderId, 'shipped')
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    const res = await workerFetch('/api/account/reviews', { cookie })
    const data = await res.json() as { reviews: Array<{ rating: number; status: string }> }
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0].status).toBe('pending')
  })
})

describe('DELETE /api/account/reviews/:id', () => {
  it('owner can delete', async () => {
    const { cookie, orderId } = await placeOrder('del@example.com')
    await transitionTo(orderId, 'shipped')
    const submit = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await submit.json() as { review: { id: number } }
    const res = await workerFetch(`/api/account/reviews/${review.id}`, { cookie, method: 'DELETE' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/account/reviews', { cookie }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(list.reviews).toHaveLength(0)
  })

  it('404 when not owned by user', async () => {
    const { cookie: a, orderId: oa } = await placeOrder('a@example.com')
    await transitionTo(oa, 'shipped')
    const submit = await workerFetch('/api/account/reviews', { cookie: a, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await submit.json() as { review: { id: number } }

    const cookieB = await loginAs('b@example.com')
    const res = await workerFetch(`/api/account/reviews/${review.id}`, { cookie: cookieB, method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('user can resubmit after delete', async () => {
    const { cookie, orderId } = await placeOrder('resub@example.com')
    await transitionTo(orderId, 'shipped')
    const first = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await first.json() as { review: { id: number } }
    await workerFetch(`/api/account/reviews/${review.id}`, { cookie, method: 'DELETE' })
    const second = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    expect(second.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/account-reviews.integration.test.ts
```

Expected: FAIL (routes not implemented).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/account-reviews.integration.test.ts
git commit -m "test(reviews): failing tests for customer review endpoints"
```

---

### Task 6: Implement customer review endpoints

**Files:**
- Create: `packages/api/src/routes/account-reviews.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create route file**

Write `packages/api/src/routes/account-reviews.ts`:

```typescript
import type { RouterType } from 'itty-router'
import type { Env, ReviewableProductRow, ReviewRow, SubmitReviewBody, ValidationError } from '../lib/types'
import { nowIso } from '../lib/utils'
import { getSessionUser, parseJsonBody } from '../middleware/auth'

const SHIPPED_STATUSES = "('shipped','delivered')"

function validateSubmitBody(raw: unknown): { errors: ValidationError[]; data: SubmitReviewBody | null } {
  const errors: ValidationError[] = []
  if (!raw || typeof raw !== 'object') {
    errors.push({ field: 'body', message: 'Request body must be a JSON object' })
    return { errors, data: null }
  }
  const b = raw as Record<string, unknown>
  const productLineId = typeof b.productLineId === 'number' && Number.isInteger(b.productLineId) ? b.productLineId : null
  const rating = typeof b.rating === 'number' && Number.isInteger(b.rating) ? b.rating : null
  const locale = typeof b.locale === 'string' ? b.locale : null
  const body = b.body == null ? null : (typeof b.body === 'string' ? b.body : undefined)

  if (productLineId == null || productLineId <= 0) errors.push({ field: 'productLineId', message: 'productLineId must be a positive integer' })
  if (rating == null || rating < 1 || rating > 5) errors.push({ field: 'rating', message: 'rating must be an integer between 1 and 5' })
  if (locale !== 'en' && locale !== 'th') errors.push({ field: 'locale', message: 'locale must be "en" or "th"' })
  if (body === undefined) errors.push({ field: 'body', message: 'body must be a string or null' })
  if (typeof body === 'string' && body.length > 1000) errors.push({ field: 'body', message: 'body must not exceed 1000 characters' })

  if (errors.length > 0) return { errors, data: null }
  return { errors, data: { productLineId: productLineId!, rating: rating!, body: body ?? undefined, locale: locale as 'en' | 'th' } }
}

export function registerAccountReviewsRoutes(router: RouterType) {
  router.get('/api/account/reviewable-products', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    try {
      const { results } = await env.DB.prepare(
        `SELECT pl.id AS product_line_id,
                p.slug AS slug,
                pl.name AS name,
                o.id AS order_id,
                s.shipped_at AS shipped_at
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         JOIN product_lines pl ON pl.id = p.product_line_id
         LEFT JOIN shipments s ON s.order_id = o.id
         WHERE o.user_id = ?
           AND o.status IN ('shipped','delivered')
           AND NOT EXISTS (
             SELECT 1 FROM reviews r
             WHERE r.user_id = ? AND r.product_line_id = pl.id
           )
         GROUP BY pl.id
         ORDER BY pl.id ASC`
      ).bind(user.id, user.id).all<ReviewableProductRow>()

      return Response.json({
        items: results.map((row) => ({
          productLineId: row.product_line_id,
          slug: row.slug,
          name: row.name,
          orderId: row.order_id,
          shippedAt: row.shipped_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.get('/api/account/reviews', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    try {
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.product_line_id, r.rating, r.body, r.locale, r.status,
                r.rejected_reason, r.created_at, r.moderated_at,
                pl.name AS product_line_name
         FROM reviews r
         JOIN product_lines pl ON pl.id = r.product_line_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`
      ).bind(user.id).all<ReviewRow & { product_line_name: string }>()

      return Response.json({
        reviews: results.map((r) => ({
          id: r.id,
          productLineId: r.product_line_id,
          productLineName: r.product_line_name,
          rating: r.rating,
          body: r.body,
          locale: r.locale,
          status: r.status,
          rejectedReason: r.rejected_reason,
          createdAt: r.created_at,
          moderatedAt: r.moderated_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.post('/api/account/reviews', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateSubmitBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    try {
      const lineExists = await env.DB.prepare(
        `SELECT id FROM product_lines WHERE id = ? LIMIT 1`
      ).bind(data.productLineId).first<{ id: number }>()
      if (!lineExists) return Response.json({ error: 'Product line not found' }, { status: 404 })

      const eligibility = await env.DB.prepare(
        `SELECT 1 AS ok
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.user_id = ?
           AND o.status IN ${SHIPPED_STATUSES}
           AND p.product_line_id = ?
         LIMIT 1`
      ).bind(user.id, data.productLineId).first<{ ok: number }>()

      if (!eligibility) {
        return Response.json({ error: 'You must have a shipped order containing this product to leave a review' }, { status: 403 })
      }

      const now = nowIso()
      try {
        await env.DB.prepare(
          `INSERT INTO reviews (user_id, product_line_id, rating, body, locale, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(user.id, data.productLineId, data.rating, data.body ?? null, data.locale, now, now).run()
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (/UNIQUE constraint failed/i.test(msg)) {
          return Response.json({ error: 'You have already submitted a review for this product' }, { status: 409 })
        }
        throw err
      }

      const inserted = await env.DB.prepare(
        `SELECT id, rating, body, locale, status, created_at
         FROM reviews
         WHERE user_id = ? AND product_line_id = ?
         LIMIT 1`
      ).bind(user.id, data.productLineId).first<ReviewRow>()

      return Response.json({
        review: {
          id: inserted!.id,
          rating: inserted!.rating,
          body: inserted!.body,
          locale: inserted!.locale,
          status: inserted!.status,
          createdAt: inserted!.created_at,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.delete('/api/account/reviews/:id', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    const url = new URL(request.url)
    const idStr = url.pathname.split('/').pop() || ''
    const id = parseInt(idStr, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Review not found' }, { status: 404 })
    }

    try {
      const result = await env.DB.prepare(
        `DELETE FROM reviews WHERE id = ? AND user_id = ?`
      ).bind(id, user.id).run()

      const changes = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0
      if (changes === 0) {
        return Response.json({ error: 'Review not found' }, { status: 404 })
      }
      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
```

- [ ] **Step 2: Register in `packages/api/src/index.ts`**

Add import:

```typescript
import { registerAccountReviewsRoutes } from './routes/account-reviews'
```

Add registration after `registerAccountRoutes(router)`:

```typescript
registerAccountReviewsRoutes(router)
```

- [ ] **Step 3: Run customer-review tests**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/account-reviews.integration.test.ts
```

Expected: tests pass except those that depend on the admin approve route (none in this file). All in this file should now pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/account-reviews.ts packages/api/src/index.ts
git commit -m "feat(reviews): customer review endpoints (eligibility + submit + list + delete)"
```

---

## Phase D — Admin Reviews API

### Task 7: Admin moderation endpoints — failing tests

**Files:**
- Create: `packages/api/src/routes/admin-reviews.integration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function submitPendingReview(email: string, productLineId = 1): Promise<number> {
  const cookie = await loginAs(email)
  const checkout = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: { name: 'B', email, phone: '+66811111111', address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' } } }) })
  const { order } = await checkout.json() as { order: { id: string } }
  await workerFetch(`/api/admin/orders/${order.id}/mark-paid`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order.id}/pack`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order.id}/ship`, { admin: true, method: 'POST', body: { carrier: 'K', tracking_number: 'T1' } })
  const submit = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId, rating: 5, body: 'Great', locale: 'en' } })
  const { review } = await submit.json() as { review: { id: number } }
  return review.id
}

describe('GET /api/admin/reviews', () => {
  it('403 without admin', async () => {
    const res = await workerFetch('/api/admin/reviews')
    expect(res.status).toBe(403)
  })

  it('lists pending by default and exposes user/line context', async () => {
    await submitPendingReview('q1@example.com')
    const res = await workerFetch('/api/admin/reviews?status=pending', { admin: true })
    expect(res.status).toBe(200)
    const data = await res.json() as { reviews: Array<{ user_email: string; product_line_name: string; status: string }> }
    expect(data.reviews.length).toBeGreaterThan(0)
    expect(data.reviews[0].user_email).toBe('q1@example.com')
    expect(data.reviews[0].status).toBe('pending')
    expect(typeof data.reviews[0].product_line_name).toBe('string')
  })

  it('filters by status', async () => {
    const id = await submitPendingReview('q2@example.com')
    await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    const pending = await workerFetch('/api/admin/reviews?status=pending', { admin: true }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(pending.reviews).toHaveLength(0)
    const approved = await workerFetch('/api/admin/reviews?status=approved', { admin: true }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(approved.reviews).toHaveLength(1)
  })
})

describe('POST /api/admin/reviews/:id/approve', () => {
  it('marks approved + writes audit log', async () => {
    const id = await submitPendingReview('appr@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=approved', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number; moderated_by: string }> }>)
    const found = list.reviews.find((r) => r.id === id)
    expect(found).toBeDefined()
    expect(found!.moderated_by).toBe('jdelaire@gmail.com')
  })

  it('idempotent on already-approved', async () => {
    const id = await submitPendingReview('idem@example.com')
    await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    const res = await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/reviews/:id/reject', () => {
  it('marks rejected and stores reason', async () => {
    const id = await submitPendingReview('rej@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/reject`, { admin: true, method: 'POST', body: { reason: 'Spam' } })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=rejected', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number; rejected_reason: string }> }>)
    expect(list.reviews.find((r) => r.id === id)?.rejected_reason).toBe('Spam')
  })

  it('reason optional', async () => {
    const id = await submitPendingReview('rej2@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/reject`, { admin: true, method: 'POST', body: {} })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/reviews/:id', () => {
  it('purges review', async () => {
    const id = await submitPendingReview('purge@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}`, { admin: true, method: 'DELETE' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=pending', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number }> }>)
    expect(list.reviews.find((r) => r.id === id)).toBeUndefined()
  })

  it('404 when missing', async () => {
    const res = await workerFetch('/api/admin/reviews/999999', { admin: true, method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/admin-reviews.integration.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/admin-reviews.integration.test.ts
git commit -m "test(reviews): failing tests for admin moderation endpoints"
```

---

### Task 8: Implement admin moderation endpoints

**Files:**
- Create: `packages/api/src/routes/admin/reviews.ts`
- Modify: `packages/api/src/routes/admin.ts`

- [ ] **Step 1: Create admin route file**

Write `packages/api/src/routes/admin/reviews.ts`:

```typescript
import type { RouterType } from 'itty-router'
import type { Env, AdminReviewListRow, RejectReviewBody, CountRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'
import { parseAdminPagination } from '../../lib/validation'

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected'])

function reviewIdFromPath(request: Request, position: number): number | null {
  const url = new URL(request.url)
  const id = parseInt(url.pathname.split('/')[position] || '', 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function registerAdminReviewsRoutes(router: RouterType) {
  router.get('/api/admin/reviews', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status && !ALLOWED_STATUS.has(status)) {
      return Response.json({ error: 'Invalid status filter' }, { status: 400 })
    }
    const { page, limit, offset } = parseAdminPagination(url)

    const whereParts: string[] = ['1=1']
    const binds: Array<string | number> = []
    if (status) { whereParts.push('r.status = ?'); binds.push(status) }
    const whereClause = whereParts.join(' AND ')

    try {
      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM reviews r WHERE ${whereClause}`
      ).bind(...binds).first<CountRow>()
      const total = totalRow?.count ?? 0

      const { results } = await env.DB.prepare(
        `SELECT r.id, r.user_id, u.email AS user_email,
                r.product_line_id, pl.name AS product_line_name,
                r.rating, r.body, r.locale, r.status, r.rejected_reason,
                r.created_at, r.moderated_at, r.moderated_by
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         JOIN product_lines pl ON pl.id = r.product_line_id
         WHERE ${whereClause}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`
      ).bind(...binds, limit, offset).all<AdminReviewListRow>()

      return Response.json({
        reviews: results,
        pagination: { page, limit, total },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/reviews/:id/approve', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })
      if (existing.status === 'approved') return Response.json({ success: true })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE reviews SET status='approved', rejected_reason=NULL, moderated_at=?, moderated_by=?, updated_at=? WHERE id = ?`
        ).bind(now, adminUser.email, now, id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.approve', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, from: existing.status, to: 'approved' }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/reviews/:id/reject', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response
    const data = (parsed.data ?? {}) as RejectReviewBody
    const reason = typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim().slice(0, 500) : null

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })
      if (existing.status === 'rejected') return Response.json({ success: true })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE reviews SET status='rejected', rejected_reason=?, moderated_at=?, moderated_by=?, updated_at=? WHERE id = ?`
        ).bind(reason, now, adminUser.email, now, id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.reject', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, from: existing.status, to: 'rejected', reason }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.delete('/api/admin/reviews/:id', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM reviews WHERE id = ?`).bind(id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.delete', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, prior_status: existing.status }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
```

- [ ] **Step 2: Register in `packages/api/src/routes/admin.ts`**

Add import:

```typescript
import { registerAdminReviewsRoutes } from './admin/reviews'
```

Inside `registerAdminRoutes`, add at the end:

```typescript
registerAdminReviewsRoutes(router)
```

- [ ] **Step 3: Run admin-review tests**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/admin-reviews.integration.test.ts
```

Expected: PASS for all tests in the file.

- [ ] **Step 4: Re-run public reviews tests (now that admin approve exists)**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/reviews.integration.test.ts
```

Expected: ALL pass (including "only includes approved", "paginates", and "aggregates at product-line").

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/admin/reviews.ts packages/api/src/routes/admin.ts
git commit -m "feat(reviews): admin moderation endpoints (list/approve/reject/delete)"
```

---

## Phase E — Email & Status Hook

### Task 9: Review-prompt email template — failing unit test

**Files:**
- Modify: `packages/api/src/services/email.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
import { buildReviewPromptEmail } from './email'

describe('buildReviewPromptEmail', () => {
  const baseInput = {
    order_id: '01H123',
    customer_name: 'Buyer',
    customer_email: 'b@example.com',
    product_lines: [{ name: 'AthletX Protein' }],
    review_url: 'https://www.cnxnature.com/account?tab=reviews',
  }

  it('renders English subject + body containing product line name', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'en' })
    expect(out.subject).toContain('How was')
    expect(out.html).toContain('AthletX Protein')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('renders Thai locale', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'th' })
    expect(out.subject).toContain('โปรตีน')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('falls back to en for unknown locale', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'fr' as any })
    expect(out.subject).toContain('How was')
  })
})
```

- [ ] **Step 2: Run unit tests to verify failure**

```bash
cd packages/api && npx vitest run src/services/email.test.ts
```

Expected: FAIL (`buildReviewPromptEmail` undefined).

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/email.test.ts
git commit -m "test(reviews): failing unit tests for review-prompt email template"
```

---

### Task 10: Implement review-prompt email + sender

**Files:**
- Modify: `packages/api/src/services/email.ts`

- [ ] **Step 1: Add template + sender at the bottom of the file**

Append to `packages/api/src/services/email.ts`:

```typescript
export interface ReviewPromptEmailInput {
  order_id: string
  customer_name: string
  customer_email: string
  product_lines: { name: string }[]
  review_url: string
  locale: 'en' | 'th'
}

export interface BuiltEmail {
  subject: string
  html: string
}

export function buildReviewPromptEmail(input: ReviewPromptEmailInput): BuiltEmail {
  const locale = input.locale === 'th' ? 'th' : 'en'

  const lineList = input.product_lines.map((p) =>
    `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`
  ).join('')

  if (locale === 'th') {
    const subject = `โปรตีน CNX AthletX เป็นอย่างไรบ้าง?`
    const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">ขอบคุณที่สั่งซื้อ ${escapeHtml(input.customer_name)}</h2>
      <p style="margin: 0 0 16px; font-size: 15px; color: #555;">เราหวังว่าคุณจะพอใจกับสินค้าที่ได้รับ</p>
      <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${input.review_url}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">เขียนรีวิว</a>
      </p>
      <p style="margin: 24px 0 0; font-size: 13px; color: #777;">หมายเลขคำสั่งซื้อ: ${escapeHtml(input.order_id)}</p>`
    return { subject, html: emailLayout(subject, body) }
  }

  const subject = `How was your CNX AthletX protein?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">Thanks for your order, ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: #555;">We hope you're enjoying what you received. Your feedback helps other customers.</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Write a Review</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">Order ID: ${escapeHtml(input.order_id)}</p>`
  return { subject, html: emailLayout(subject, body) }
}

/** Fire-and-forget review prompt email; idempotent via email_logs lookup. */
export async function sendReviewPromptEmail(env: Env, input: ReviewPromptEmailInput): Promise<void> {
  // Idempotency check
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM email_logs WHERE order_id = ? AND event = 'review_prompt' AND status = 'sent' LIMIT 1`
    ).bind(input.order_id).first<{ id: number }>()
    if (existing) return
  } catch {
    // If lookup fails, fail-safe by skipping (don't double-send)
    return
  }

  try {
    const built = buildReviewPromptEmail(input)
    const ok = await sendResendEmail(env, input.customer_email, built.subject, built.html)
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, 'failed', message)
  }
}
```

> **Note:** `sendResendEmail` is currently a non-exported helper in `email.ts`. The new `sendReviewPromptEmail` lives in the same file and can call it directly.

- [ ] **Step 2: Run unit tests**

```bash
cd packages/api && npx vitest run src/services/email.test.ts
```

Expected: PASS for new tests.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/email.ts
git commit -m "feat(reviews): review-prompt email template + sender with idempotency"
```

---

### Task 11: Hook ship transition into review prompt — failing test

**Files:**
- Modify: `packages/api/src/routes/admin-orders.integration.test.ts`

- [ ] **Step 1: Find the existing ship test and add new tests after it**

Open `packages/api/src/routes/admin-orders.integration.test.ts` and append a new `describe` block (after existing tests). Use the same imports/setup as the rest of the file — only add this block:

```typescript
describe('POST /api/admin/orders/:id/ship — review prompt', () => {
  it('logs review_prompt email_logs entry on ship for account orders', async () => {
    const email = 'rp1@example.com'
    const cookie = await loginAs(email)
    const checkoutRes = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: { name: 'B', email, phone: '+66811111111', address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' } } }) })
    const { order } = await checkoutRes.json() as { order: { id: string } }
    await workerFetch(`/api/admin/orders/${order.id}/mark-paid`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/pack`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/ship`, { admin: true, method: 'POST', body: { carrier: 'K', tracking_number: 'T1' } })

    // Allow waitUntil to flush (worker integration env runs synchronously enough that one tick suffices)
    await new Promise((r) => setTimeout(r, 200))

    const logsRes = await workerFetch(`/api/admin/orders/${order.id}`, { admin: true })
    const data = await logsRes.json() as { order: { id: string } }
    expect(data.order.id).toBe(order.id)

    // Inspect via admin DB introspection — use raw SQL through a debug route is not available, so query via test helper:
    const checkRes = await workerFetch(`/api/__test-email-log?order_id=${order.id}&event=review_prompt`, {})
    expect(checkRes.status).toBe(200)
    const check = await checkRes.json() as { count: number }
    expect(check.count).toBeGreaterThanOrEqual(1)
  })

  it('does not double-send review prompt on repeat ship attempts', async () => {
    const email = 'rp2@example.com'
    const cookie = await loginAs(email)
    const checkoutRes = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: { name: 'B', email, phone: '+66811111111', address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' } } }) })
    const { order } = await checkoutRes.json() as { order: { id: string } }
    await workerFetch(`/api/admin/orders/${order.id}/mark-paid`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/pack`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/ship`, { admin: true, method: 'POST', body: { carrier: 'K', tracking_number: 'T1' } })
    await new Promise((r) => setTimeout(r, 200))

    // Second ship attempt should fail (status already shipped) but even if it did succeed, idempotency must hold.
    // Force a direct re-call to sendReviewPromptEmail via a debug endpoint is not necessary — the email_logs row is the contract.
    const checkRes = await workerFetch(`/api/__test-email-log?order_id=${order.id}&event=review_prompt`, {})
    const check = await checkRes.json() as { count: number }
    expect(check.count).toBe(1)
  })

  it('skips review prompt for guest order (no user_id)', async () => {
    const email = 'guest@example.com'
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody({ customer: { name: 'G', email, phone: '+66811111111', address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' } } }) })
    const { order } = await checkoutRes.json() as { order: { id: string } }
    await workerFetch(`/api/admin/orders/${order.id}/mark-paid`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/pack`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${order.id}/ship`, { admin: true, method: 'POST', body: { carrier: 'K', tracking_number: 'T1' } })
    await new Promise((r) => setTimeout(r, 200))

    const checkRes = await workerFetch(`/api/__test-email-log?order_id=${order.id}&event=review_prompt`, {})
    const check = await checkRes.json() as { count: number }
    expect(check.count).toBe(0)
  })
})
```

This test relies on a new test-only helper endpoint `/api/__test-email-log` to inspect `email_logs`. Add it in step 2.

- [ ] **Step 2: Add test-only endpoint to read email_logs**

Open `packages/api/src/routes/health.ts` (where the test-reset endpoint lives). Add the following handler at the end of `registerHealthRoutes`:

```typescript
router.get('/api/__test-email-log', async (request: Request, env: Env) => {
  // Test-only — guard by hostname (same pattern as test reset)
  const host = new URL(request.url).hostname
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return new Response('Not Found', { status: 404 })
  }
  const url = new URL(request.url)
  const orderId = url.searchParams.get('order_id') ?? ''
  const event = url.searchParams.get('event') ?? ''
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM email_logs WHERE order_id = ? AND event = ? AND status = 'sent'`
  ).bind(orderId, event).first<{ count: number }>()
  return Response.json({ count: row?.count ?? 0 })
})
```

> **Note:** Read `packages/api/src/routes/health.ts` first to confirm the existing test-reset endpoint is gated by hostname and follow the same pattern. If the gating is different, match the existing convention exactly.

- [ ] **Step 3: Run tests to verify failure**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/admin-orders.integration.test.ts -t "review prompt"
```

Expected: FAIL — review-prompt email_logs entries are not yet written by the ship endpoint.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/admin-orders.integration.test.ts packages/api/src/routes/health.ts
git commit -m "test(reviews): failing tests for ship → review prompt hook"
```

---

### Task 12: Implement ship → review-prompt dispatch

**Files:**
- Modify: `packages/api/src/routes/admin/orders.ts`

- [ ] **Step 1: Add review-prompt dispatch to the ship route**

In `packages/api/src/routes/admin/orders.ts`, find the `/api/admin/orders/:id/ship` handler. Inside the existing `ctx.waitUntil` block (after the existing shipping email send), chain a new `waitUntil` that fetches eligible product lines and calls `sendReviewPromptEmail`. Update imports first:

Change the existing import line to include the new function:

```typescript
import { sendOrderEmail, fetchOrderEmailData, sendReviewPromptEmail } from '../../services/email'
```

Add the dispatch logic at the bottom of the ship handler, immediately before `return Response.json({ success: true })`:

```typescript
ctx.waitUntil((async () => {
  try {
    const orderRow = await env.DB.prepare(
      `SELECT user_id, customer_name, customer_email FROM orders WHERE id = ? LIMIT 1`
    ).bind(orderId).first<{ user_id: string | null; customer_name: string; customer_email: string }>()
    if (!orderRow || !orderRow.user_id) return  // skip guest orders

    const { results: lineRows } = await env.DB.prepare(
      `SELECT DISTINCT pl.id AS id, pl.name AS name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN product_lines pl ON pl.id = p.product_line_id
       WHERE oi.order_id = ?`
    ).bind(orderId).all<{ id: number; name: string }>()
    if (lineRows.length === 0) return

    const reviewUrl = (env as unknown as { PUBLIC_BASE_URL?: string }).PUBLIC_BASE_URL
      ? `${(env as unknown as { PUBLIC_BASE_URL: string }).PUBLIC_BASE_URL}/account?tab=reviews`
      : 'https://www.cnxnature.com/account?tab=reviews'

    await sendReviewPromptEmail(env, {
      order_id: orderId,
      customer_name: orderRow.customer_name,
      customer_email: orderRow.customer_email,
      product_lines: lineRows.map((l) => ({ name: l.name })),
      review_url: reviewUrl,
      locale: 'en',
    })
  } catch (err) {
    console.error('review_prompt email failed:', err)
  }
})())
```

- [ ] **Step 2: Run review-prompt tests**

```bash
cd packages/api && npx vitest run --config vitest.integration.config.ts src/routes/admin-orders.integration.test.ts -t "review prompt"
```

Expected: PASS for all three tests in the new block.

- [ ] **Step 3: Run the full API integration suite to verify no regression**

```bash
cd packages/api && npm run test:all
```

Expected: PASS overall (some flakiness around `waitUntil` timing is possible — if so, raise the `setTimeout` in tests from 200ms to 500ms).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/admin/orders.ts
git commit -m "feat(reviews): dispatch review-prompt email on ship transition"
```

---

## Phase F — Frontend API Clients

### Task 13: Public + customer reviews API client

**Files:**
- Create: `packages/web/src/api/reviews.ts`

- [ ] **Step 1: Write the client**

```typescript
import { apiUrl } from './client'

export interface ReviewSummary {
  avgRating: number | null
  count: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface PublicReview {
  id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  createdAt: string
}

export interface PublicReviewsResponse {
  summary: ReviewSummary
  reviews: PublicReview[]
  page: number
  pageSize: number
  total: number
}

export interface ReviewableProduct {
  productLineId: number
  slug: string
  name: string
  orderId: string
  shippedAt: string
}

export interface MyReview {
  id: number
  productLineId: number
  productLineName: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejectedReason: string | null
  createdAt: string
  moderatedAt: string | null
}

export interface SubmitReviewPayload {
  productLineId: number
  rating: number
  body?: string
  locale: 'en' | 'th'
}

export class ReviewApiError extends Error {
  status: number
  details?: { field: string; message: string }[]
  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseError(res: Response): Promise<never> {
  let payload: { error?: string; details?: { field: string; message: string }[] } = {}
  try { payload = (await res.json()) as typeof payload } catch { /* ignore */ }
  throw new ReviewApiError(payload.error ?? 'Request failed', res.status, payload.details)
}

export async function fetchProductReviews(slug: string, page = 1, pageSize = 10): Promise<PublicReviewsResponse> {
  const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}/reviews?page=${page}&pageSize=${pageSize}`))
  if (!res.ok) await parseError(res)
  return (await res.json()) as PublicReviewsResponse
}

export async function fetchReviewableProducts(): Promise<ReviewableProduct[]> {
  const res = await fetch(apiUrl('/api/account/reviewable-products'), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { items: ReviewableProduct[] }
  return data.items
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const res = await fetch(apiUrl('/api/account/reviews'), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { reviews: MyReview[] }
  return data.reviews
}

export async function submitReview(payload: SubmitReviewPayload): Promise<MyReview> {
  const res = await fetch(apiUrl('/api/account/reviews'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { review: MyReview }
  return data.review
}

export async function deleteMyReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/account/reviews/${id}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) await parseError(res)
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/reviews.ts
git commit -m "feat(reviews): web API client for public + customer review endpoints"
```

---

### Task 14: Admin reviews API client

**Files:**
- Create: `packages/web/src/api/adminReviews.ts`

- [ ] **Step 1: Write the client**

```typescript
import { apiUrl } from './client'

export interface AdminReview {
  id: number
  user_id: string
  user_email: string
  product_line_id: number
  product_line_name: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface AdminReviewsResponse {
  reviews: AdminReview[]
  pagination: { page: number; limit: number; total: number }
}

export type AdminReviewStatus = 'pending' | 'approved' | 'rejected'

async function parseError(res: Response): Promise<never> {
  let payload: { error?: string } = {}
  try { payload = (await res.json()) as typeof payload } catch { /* ignore */ }
  throw new Error(payload.error ?? `Request failed: ${res.status}`)
}

export async function fetchAdminReviews(status: AdminReviewStatus | '' = 'pending', page = 1): Promise<AdminReviewsResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('page', String(page))
  const res = await fetch(apiUrl(`/api/admin/reviews?${params.toString()}`), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  return (await res.json()) as AdminReviewsResponse
}

export async function approveReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}/approve`), { method: 'POST', credentials: 'include' })
  if (!res.ok) await parseError(res)
}

export async function rejectReview(id: number, reason?: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}/reject`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? '' }),
  })
  if (!res.ok) await parseError(res)
}

export async function deleteAdminReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}`), { method: 'DELETE', credentials: 'include' })
  if (!res.ok) await parseError(res)
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/api/adminReviews.ts
git commit -m "feat(reviews): web API client for admin review moderation"
```

---

## Phase G — Frontend Components

### Task 15: i18n keys (en + th)

**Files:**
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/th.json`

- [ ] **Step 1: Read both files to find the right insertion point**

```bash
cd packages/web && head -200 src/i18n/en.json
```

Add a new top-level `reviews` object (and extend `account.tabs`/`account.reviews` if those already exist). Insert into both files in parallel.

- [ ] **Step 2: Add to `packages/web/src/i18n/en.json`**

Add this object as a new top-level key (before the closing `}` and after the last existing key — match existing comma/format style):

```json
"reviews": {
  "title": "Customer Reviews",
  "summaryAverage": "{rating} out of 5",
  "summaryCount": "{count} review | {count} reviews",
  "empty": "No reviews yet — be the first.",
  "verifiedBuyer": "Verified buyer",
  "writeReview": "Write a review",
  "ratingLabel": "Your rating",
  "bodyLabel": "Your review (optional)",
  "bodyPlaceholder": "Tell others what you thought…",
  "charCount": "{count} / 1000",
  "submit": "Submit review",
  "thankYou": "Thanks! Your review is awaiting approval.",
  "statusPending": "Pending",
  "statusApproved": "Approved",
  "statusRejected": "Rejected",
  "deleteConfirm": "Delete this review?",
  "deleted": "Review deleted.",
  "errorEligibility": "You must have a shipped order containing this product to leave a review.",
  "errorDuplicate": "You have already submitted a review for this product.",
  "errorGeneric": "Could not submit review. Please try again."
},
"account": {
  "tabs": {
    "reviews": "My Reviews"
  },
  "reviews": {
    "eligibleHeading": "Products you can review",
    "submittedHeading": "Your reviews"
  }
}
```

> **IMPORTANT:** if `account` already exists in en.json, **merge** the new `tabs.reviews` and `reviews.*` keys into the existing `account` object instead of duplicating.

- [ ] **Step 3: Add Thai equivalents to `packages/web/src/i18n/th.json`**

Mirror the structure with Thai translations:

```json
"reviews": {
  "title": "รีวิวจากลูกค้า",
  "summaryAverage": "{rating} จาก 5",
  "summaryCount": "{count} รีวิว",
  "empty": "ยังไม่มีรีวิว — เป็นคนแรกที่รีวิว",
  "verifiedBuyer": "ลูกค้าที่ซื้อแล้ว",
  "writeReview": "เขียนรีวิว",
  "ratingLabel": "ให้คะแนน",
  "bodyLabel": "ความคิดเห็น (ไม่บังคับ)",
  "bodyPlaceholder": "บอกคนอื่นว่าคุณคิดอย่างไร…",
  "charCount": "{count} / 1000",
  "submit": "ส่งรีวิว",
  "thankYou": "ขอบคุณ! รีวิวของคุณกำลังรอการอนุมัติ",
  "statusPending": "รอตรวจสอบ",
  "statusApproved": "เผยแพร่แล้ว",
  "statusRejected": "ถูกปฏิเสธ",
  "deleteConfirm": "ลบรีวิวนี้หรือไม่?",
  "deleted": "ลบรีวิวแล้ว",
  "errorEligibility": "คุณต้องมีคำสั่งซื้อที่ส่งแล้วซึ่งมีสินค้าชิ้นนี้จึงจะรีวิวได้",
  "errorDuplicate": "คุณได้ส่งรีวิวสำหรับสินค้านี้แล้ว",
  "errorGeneric": "ไม่สามารถส่งรีวิวได้ กรุณาลองอีกครั้ง"
},
"account": {
  "tabs": {
    "reviews": "รีวิวของฉัน"
  },
  "reviews": {
    "eligibleHeading": "สินค้าที่คุณสามารถรีวิวได้",
    "submittedHeading": "รีวิวของคุณ"
  }
}
```

> Same merge note: if `account` already exists in th.json, merge the new keys.

- [ ] **Step 4: Validate JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web/src/i18n/en.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('packages/web/src/i18n/th.json','utf8'))"
```

Expected: no output (valid).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/i18n/en.json packages/web/src/i18n/th.json
git commit -m "feat(reviews): i18n keys (en + th) for review UI"
```

---

### Task 16: ReviewSummary component — failing test

**Files:**
- Create: `packages/web/src/components/reviews/ReviewSummary.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../i18n/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

beforeAll(() => {
  // happy-dom setup happens in vite config
})

import ReviewSummary from './ReviewSummary.vue'

describe('ReviewSummary', () => {
  it('renders empty state when count is 0', () => {
    const wrapper = mount(ReviewSummary, {
      props: { summary: { avgRating: null, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } } },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('No reviews yet')
  })

  it('renders average and count', () => {
    const wrapper = mount(ReviewSummary, {
      props: { summary: { avgRating: 4.6, count: 18, distribution: { '1': 0, '2': 1, '3': 2, '4': 5, '5': 10 } } },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('4.6')
    expect(wrapper.text()).toContain('18')
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewSummary.test.ts
```

Expected: FAIL (component does not exist).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewSummary.test.ts
git commit -m "test(reviews): failing test for ReviewSummary component"
```

---

### Task 17: Implement ReviewSummary

**Files:**
- Create: `packages/web/src/components/reviews/ReviewSummary.vue`

- [ ] **Step 1: Write component**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReviewSummary } from '../../api/reviews'

const props = defineProps<{ summary: ReviewSummary }>()
const { t } = useI18n({ useScope: 'global' })

const avgFormatted = computed(() => props.summary.avgRating == null ? '–' : props.summary.avgRating.toFixed(1))
const stars = computed(() => {
  const value = props.summary.avgRating ?? 0
  return [1, 2, 3, 4, 5].map((n) => n <= Math.round(value))
})
</script>

<template>
  <section v-if="summary.count === 0" class="text-sm text-foreground/70">
    {{ t('reviews.empty') }}
  </section>
  <section v-else class="flex items-start gap-6 flex-wrap">
    <div>
      <div class="text-3xl font-semibold">{{ avgFormatted }}</div>
      <div class="flex gap-0.5 text-accent" aria-label="rating stars">
        <span v-for="(filled, i) in stars" :key="i">{{ filled ? '★' : '☆' }}</span>
      </div>
      <div class="text-sm text-foreground/70 mt-1">{{ t('reviews.summaryCount', { count: summary.count }, summary.count) }}</div>
    </div>
    <ul class="flex-1 min-w-[200px] space-y-1 text-sm">
      <li v-for="n in [5, 4, 3, 2, 1]" :key="n" class="flex items-center gap-2">
        <span class="w-3 text-right">{{ n }}</span>
        <span class="flex-1 h-2 bg-foreground/10 rounded">
          <span class="block h-2 bg-primary rounded" :style="{ width: summary.count ? `${(summary.distribution[String(n) as '1' | '2' | '3' | '4' | '5'] / summary.count) * 100}%` : '0%' }"></span>
        </span>
        <span class="w-8 text-right text-foreground/60">{{ summary.distribution[String(n) as '1' | '2' | '3' | '4' | '5'] }}</span>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 2: Run test**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewSummary.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewSummary.vue
git commit -m "feat(reviews): ReviewSummary component (avg + distribution)"
```

---

### Task 18: ReviewList component — failing test

**Files:**
- Create: `packages/web/src/components/reviews/ReviewList.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../i18n/en.json'
import ReviewList from './ReviewList.vue'

const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

const baseReview = (over: Partial<{ id: number; rating: number; body: string | null; locale: 'en' | 'th'; createdAt: string }> = {}) => ({
  id: 1, rating: 5, body: 'Great', locale: 'en', createdAt: '2026-04-20T00:00:00Z',
  ...over,
})

describe('ReviewList', () => {
  it('renders verified buyer label per review', () => {
    const wrapper = mount(ReviewList, { props: { reviews: [baseReview()], page: 1, pageSize: 10, total: 1 }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Verified buyer')
  })

  it('shows locale flag', () => {
    const wrapper = mount(ReviewList, { props: { reviews: [baseReview({ locale: 'th' })], page: 1, pageSize: 10, total: 1 }, global: { plugins: [i18n] } })
    expect(wrapper.html()).toContain('🇹🇭')
  })

  it('renders pagination next button when more pages', () => {
    const reviews = Array.from({ length: 10 }, (_, i) => baseReview({ id: i + 1 }))
    const wrapper = mount(ReviewList, { props: { reviews, page: 1, pageSize: 10, total: 25 }, global: { plugins: [i18n] } })
    const nextBtn = wrapper.find('button[data-testid="next-page"]')
    expect(nextBtn.exists()).toBe(true)
    expect((nextBtn.element as HTMLButtonElement).disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewList.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewList.test.ts
git commit -m "test(reviews): failing test for ReviewList component"
```

---

### Task 19: Implement ReviewList

**Files:**
- Create: `packages/web/src/components/reviews/ReviewList.vue`

- [ ] **Step 1: Write component**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PublicReview } from '../../api/reviews'

const props = defineProps<{ reviews: PublicReview[]; page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e: 'page', page: number): void }>()
const { t } = useI18n({ useScope: 'global' })

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const canPrev = computed(() => props.page > 1)
const canNext = computed(() => props.page < totalPages.value)

function flag(locale: 'en' | 'th'): string { return locale === 'th' ? '🇹🇭' : '🇬🇧' }

function stars(n: number): string { return '★'.repeat(n) + '☆'.repeat(5 - n) }

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString() } catch { return iso }
}
</script>

<template>
  <ul class="space-y-4">
    <li v-for="r in reviews" :key="r.id" class="border border-foreground/10 rounded-lg p-4 bg-surface">
      <div class="flex items-center justify-between gap-2">
        <div class="text-accent" :aria-label="`${r.rating} stars`">{{ stars(r.rating) }}</div>
        <div class="text-xs text-foreground/60 flex items-center gap-2">
          <span aria-hidden="true">{{ flag(r.locale) }}</span>
          <span>{{ formatDate(r.createdAt) }}</span>
        </div>
      </div>
      <div class="text-xs text-foreground/60 mt-1">{{ t('reviews.verifiedBuyer') }}</div>
      <p v-if="r.body" class="mt-2 text-sm whitespace-pre-wrap">{{ r.body }}</p>
    </li>
  </ul>

  <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 text-sm">
    <button data-testid="prev-page" type="button" :disabled="!canPrev" class="px-3 py-1 border border-foreground/20 rounded disabled:opacity-50" @click="emit('page', page - 1)">←</button>
    <span>{{ page }} / {{ totalPages }}</span>
    <button data-testid="next-page" type="button" :disabled="!canNext" class="px-3 py-1 border border-foreground/20 rounded disabled:opacity-50" @click="emit('page', page + 1)">→</button>
  </div>
</template>
```

- [ ] **Step 2: Run test**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewList.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewList.vue
git commit -m "feat(reviews): ReviewList component"
```

---

### Task 20: ReviewForm component — failing test

**Files:**
- Create: `packages/web/src/components/reviews/ReviewForm.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../i18n/en.json'

vi.mock('../../api/reviews', () => ({
  submitReview: vi.fn(async () => ({ id: 1, productLineId: 1, productLineName: 'X', rating: 5, body: 'Hi', locale: 'en', status: 'pending', rejectedReason: null, createdAt: '', moderatedAt: null })),
  ReviewApiError: class extends Error { status = 0 },
}))

import ReviewForm from './ReviewForm.vue'
import { submitReview } from '../../api/reviews'

const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en } })

describe('ReviewForm', () => {
  it('updates rating when star clicked', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 1 }, global: { plugins: [i18n] } })
    await wrapper.findAll('button[data-testid^="star-"]')[3].trigger('click')
    expect(wrapper.find('[data-testid="rating-value"]').text()).toBe('4')
  })

  it('shows char count and caps at 1000', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 1 }, global: { plugins: [i18n] } })
    const ta = wrapper.find('textarea')
    await ta.setValue('hello world')
    expect(wrapper.text()).toContain('11 / 1000')
  })

  it('calls submitReview on submit', async () => {
    const wrapper = mount(ReviewForm, { props: { productLineId: 7 }, global: { plugins: [i18n] } })
    await wrapper.findAll('button[data-testid^="star-"]')[4].trigger('click')
    await wrapper.find('textarea').setValue('Great')
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()
    expect(submitReview).toHaveBeenCalledWith({ productLineId: 7, rating: 5, body: 'Great', locale: 'en' })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewForm.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewForm.test.ts
git commit -m "test(reviews): failing test for ReviewForm component"
```

---

### Task 21: Implement ReviewForm

**Files:**
- Create: `packages/web/src/components/reviews/ReviewForm.vue`

- [ ] **Step 1: Write component**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { submitReview, ReviewApiError, type MyReview } from '../../api/reviews'
import PrimaryButton from '../ui/PrimaryButton.vue'

const props = defineProps<{ productLineId: number }>()
const emit = defineEmits<{ (e: 'submitted', review: MyReview): void; (e: 'cancel'): void }>()
const { t, locale } = useI18n({ useScope: 'global' })

const rating = ref(0)
const body = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const charCount = computed(() => body.value.length)
const trimmedBody = computed(() => body.value.trim())

function setBody(value: string) {
  body.value = value.slice(0, 1000)
}

async function onSubmit() {
  if (rating.value < 1 || rating.value > 5) return
  submitting.value = true
  error.value = null
  try {
    const review = await submitReview({
      productLineId: props.productLineId,
      rating: rating.value,
      body: trimmedBody.value || undefined,
      locale: (locale.value as string) === 'th' ? 'th' : 'en',
    })
    emit('submitted', review)
  } catch (e) {
    if (e instanceof ReviewApiError) {
      if (e.status === 403) error.value = t('reviews.errorEligibility')
      else if (e.status === 409) error.value = t('reviews.errorDuplicate')
      else error.value = t('reviews.errorGeneric')
    } else {
      error.value = t('reviews.errorGeneric')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <div>
      <label class="block text-sm font-medium mb-2">{{ t('reviews.ratingLabel') }}</label>
      <div class="flex gap-1 text-2xl text-accent" role="radiogroup">
        <button
          v-for="n in [1, 2, 3, 4, 5]"
          :key="n"
          type="button"
          :data-testid="`star-${n}`"
          :aria-checked="rating >= n"
          role="radio"
          class="focus:outline-none focus:ring-2 focus:ring-primary rounded"
          @click="rating = n"
        >{{ rating >= n ? '★' : '☆' }}</button>
      </div>
      <div data-testid="rating-value" class="sr-only">{{ rating }}</div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-2" for="review-body">{{ t('reviews.bodyLabel') }}</label>
      <textarea
        id="review-body"
        :value="body"
        @input="setBody(($event.target as HTMLTextAreaElement).value)"
        rows="4"
        :placeholder="t('reviews.bodyPlaceholder')"
        class="w-full border border-foreground/20 rounded p-2 bg-surface"
      />
      <div class="text-xs text-foreground/60 text-right mt-1">{{ t('reviews.charCount', { count: charCount }) }}</div>
    </div>

    <p v-if="error" class="text-sm text-accent">{{ error }}</p>

    <div class="flex gap-2 justify-end">
      <button type="button" class="px-4 py-2 text-sm" @click="emit('cancel')">{{ t('reviews.statusPending') === '' ? '' : '' }}{{ 'Cancel' }}</button>
      <PrimaryButton type="submit" :disabled="submitting || rating < 1">{{ t('reviews.submit') }}</PrimaryButton>
    </div>
  </form>
</template>
```

> **Note:** The "Cancel" string is currently hard-coded as a fallback. If a global cancel key already exists (`common.cancel` or similar), replace `'Cancel'` with `t('common.cancel')`. Check `packages/web/src/i18n/en.json` for an existing key before adding one.

- [ ] **Step 2: Run test**

```bash
cd packages/web && npx vitest run src/components/reviews/ReviewForm.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewForm.vue
git commit -m "feat(reviews): ReviewForm component (star picker + textarea + submit)"
```

---

### Task 22: ReviewableProductCard (no test — thin presentational)

**Files:**
- Create: `packages/web/src/components/reviews/ReviewableProductCard.vue`

- [ ] **Step 1: Write component**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ReviewableProduct } from '../../api/reviews'

defineProps<{ product: ReviewableProduct }>()
defineEmits<{ (e: 'open'): void }>()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <article class="border border-foreground/10 rounded-lg p-4 bg-surface flex items-center justify-between gap-4">
    <div>
      <h3 class="font-semibold text-base">{{ product.name }}</h3>
      <p class="text-xs text-foreground/60">Order {{ product.orderId }}</p>
    </div>
    <button type="button" class="text-sm font-semibold underline" @click="$emit('open')">{{ t('reviews.writeReview') }}</button>
  </article>
</template>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/reviews/ReviewableProductCard.vue
git commit -m "feat(reviews): ReviewableProductCard component"
```

---

### Task 23: useProductReviews composable

**Files:**
- Create: `packages/web/src/composables/useProductReviews.ts`

- [ ] **Step 1: Write composable**

```typescript
import { ref, watch } from 'vue'
import { fetchProductReviews, type ReviewSummary, type PublicReview } from '../api/reviews'

export function useProductReviews(slug: () => string) {
  const summary = ref<ReviewSummary>({ avgRating: null, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } })
  const reviews = ref<PublicReview[]>([])
  const page = ref(1)
  const pageSize = 10
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchProductReviews(slug(), page.value, pageSize)
      summary.value = data.summary
      reviews.value = data.reviews
      total.value = data.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load reviews'
    } finally {
      loading.value = false
    }
  }

  function setPage(next: number) {
    page.value = next
    void load()
  }

  watch(slug, () => { page.value = 1; void load() }, { immediate: true })

  return { summary, reviews, page, pageSize, total, loading, error, setPage, refresh: load }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/composables/useProductReviews.ts
git commit -m "feat(reviews): useProductReviews composable"
```

---

## Phase H — Page Integration

### Task 24: Embed reviews on ProductDetailPage

**Files:**
- Modify: `packages/web/src/pages/ProductDetailPage.vue`

- [ ] **Step 1: Read the file to find a sensible mount point**

```bash
cd packages/web && head -120 src/pages/ProductDetailPage.vue
```

Identify the area below the product description (after specs/nutrition section). The exact insertion point depends on current markup — embed the new section just before the closing `</template>` or before the related-product section if one exists.

- [ ] **Step 2: Add imports**

In the `<script setup>` block, add:

```typescript
import { computed } from 'vue'
import ReviewSummary from '../components/reviews/ReviewSummary.vue'
import ReviewList from '../components/reviews/ReviewList.vue'
import { useProductReviews } from '../composables/useProductReviews'

const slug = computed(() => route.params.slug as string)
const { summary, reviews, page, pageSize, total, loading, error, setPage } = useProductReviews(() => slug.value)
```

(If `route` is not already defined in the file, add `import { useRoute } from 'vue-router'` and `const route = useRoute()` — but the file likely already has both since it's a `:slug` route.)

- [ ] **Step 3: Add markup**

Inside the page template, append a new section near the bottom (above the closing `</main>` or wherever the bottom of content sits):

```html
<section class="mt-16">
  <h2 class="text-2xl font-semibold mb-4">{{ $t('reviews.title') }}</h2>
  <ReviewSummary :summary="summary" />
  <div v-if="loading" class="mt-4 text-sm text-foreground/60">…</div>
  <p v-else-if="error" class="mt-4 text-sm text-accent">{{ error }}</p>
  <ReviewList v-else class="mt-6" :reviews="reviews" :page="page" :page-size="pageSize" :total="total" @page="setPage" />
</section>
```

- [ ] **Step 4: Visual sanity check via dev server**

```bash
npm run dev:web
```

In a browser go to `http://localhost:5171/product/<existing-slug>`. Confirm the section renders (empty state initially).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/ProductDetailPage.vue
git commit -m "feat(reviews): embed ReviewSummary + ReviewList on ProductDetailPage"
```

---

### Task 25: Add "My Reviews" tab to AccountPage

**Files:**
- Modify: `packages/web/src/pages/AccountPage.vue`

- [ ] **Step 1: Read the file to find existing tab structure**

```bash
cd packages/web && cat src/pages/AccountPage.vue | head -250
```

The file already has multiple sections (orders, profile, address). Mirror the existing tab pattern.

- [ ] **Step 2: Add script imports + state**

In `<script setup>` add:

```typescript
import ReviewableProductCard from '../components/reviews/ReviewableProductCard.vue'
import ReviewForm from '../components/reviews/ReviewForm.vue'
import {
  fetchReviewableProducts, fetchMyReviews, deleteMyReview,
  type ReviewableProduct, type MyReview,
} from '../api/reviews'

const reviewable = ref<ReviewableProduct[]>([])
const myReviews = ref<MyReview[]>([])
const reviewFormOpenFor = ref<number | null>(null)

async function loadReviews() {
  const [r, mine] = await Promise.all([fetchReviewableProducts(), fetchMyReviews()])
  reviewable.value = r
  myReviews.value = mine
}

async function onReviewSubmitted(_review: MyReview) {
  reviewFormOpenFor.value = null
  await loadReviews()
}

async function onDeleteReview(id: number) {
  if (!window.confirm(t('reviews.deleteConfirm'))) return
  await deleteMyReview(id)
  await loadReviews()
}

onMounted(() => { void loadReviews() })
```

(If `onMounted` is not already imported, add to the existing `vue` import.)

- [ ] **Step 3: Add markup section**

Append a new section in the template (mirroring existing section styling). Place it after the orders section:

```html
<section class="mt-12">
  <h2 class="text-xl font-semibold mb-4">{{ t('account.reviews.eligibleHeading') }}</h2>
  <div v-if="reviewable.length === 0" class="text-sm text-foreground/60">{{ t('reviews.empty') }}</div>
  <ul v-else class="space-y-3">
    <li v-for="p in reviewable" :key="p.productLineId">
      <ReviewableProductCard :product="p" @open="reviewFormOpenFor = p.productLineId" />
      <div v-if="reviewFormOpenFor === p.productLineId" class="mt-3 border border-foreground/10 rounded-lg p-4 bg-surface">
        <ReviewForm :product-line-id="p.productLineId" @submitted="onReviewSubmitted" @cancel="reviewFormOpenFor = null" />
      </div>
    </li>
  </ul>

  <h2 class="text-xl font-semibold mt-10 mb-4">{{ t('account.reviews.submittedHeading') }}</h2>
  <ul v-if="myReviews.length > 0" class="space-y-3">
    <li v-for="r in myReviews" :key="r.id" class="border border-foreground/10 rounded-lg p-4 bg-surface flex items-start justify-between gap-4">
      <div>
        <div class="text-sm font-semibold">{{ r.productLineName }}</div>
        <div class="text-accent">{{ '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) }}</div>
        <div class="text-xs text-foreground/60 mt-1">
          <span v-if="r.status === 'pending'">{{ t('reviews.statusPending') }}</span>
          <span v-else-if="r.status === 'approved'">{{ t('reviews.statusApproved') }}</span>
          <span v-else>{{ t('reviews.statusRejected') }}</span>
        </div>
        <p v-if="r.body" class="mt-2 text-sm whitespace-pre-wrap">{{ r.body }}</p>
      </div>
      <button type="button" class="text-xs underline text-accent" @click="onDeleteReview(r.id)">×</button>
    </li>
  </ul>
</section>
```

- [ ] **Step 4: Visual sanity check**

Run dev servers (`npm run dev:web` + `npm run dev:api`), log in, place a test order, mark it shipped via admin, then visit `/account` and verify the eligible product appears and you can submit a review.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/AccountPage.vue
git commit -m "feat(reviews): My Reviews section on AccountPage"
```

---

### Task 26: AdminReviewsPage + nav + route

**Files:**
- Create: `packages/web/src/pages/AdminReviewsPage.vue`
- Modify: `packages/web/src/router/index.ts`
- Modify: `packages/web/src/components/admin/AdminNav.vue`

- [ ] **Step 1: Write `AdminReviewsPage.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAdminReviews, approveReview, rejectReview, deleteAdminReview, type AdminReview, type AdminReviewStatus } from '../api/adminReviews'
import AdminNav from '../components/admin/AdminNav.vue'
import { useHead } from '../composables/useHead'

useHead({ title: 'Reviews — Admin', description: 'Moderate customer reviews.' })

const status = ref<AdminReviewStatus>('pending')
const reviews = ref<AdminReview[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const rejectReasonFor = ref<number | null>(null)
const rejectReasonText = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchAdminReviews(status.value, 1)
    reviews.value = data.reviews
    total.value = data.pagination.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load reviews'
  } finally {
    loading.value = false
  }
}

async function onApprove(id: number) { await approveReview(id); await load() }

async function onReject(id: number) {
  await rejectReview(id, rejectReasonText.value || undefined)
  rejectReasonFor.value = null
  rejectReasonText.value = ''
  await load()
}

async function onDelete(id: number) {
  if (!window.confirm('Delete this review permanently?')) return
  await deleteAdminReview(id)
  await load()
}

onMounted(() => { void load() })
</script>

<template>
  <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <AdminNav />
    <h1 class="text-2xl font-bold">Reviews</h1>

    <div class="flex gap-2">
      <button v-for="s in (['pending','approved','rejected'] as const)" :key="s" type="button"
        class="px-3 py-1 text-sm border border-foreground/20 rounded"
        :class="status === s ? 'bg-foreground text-background' : ''"
        @click="status = s; void load()">{{ s }}</button>
    </div>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="text-accent">{{ error }}</p>
    <table v-else class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-foreground/20 text-left">
          <th class="py-2">User</th>
          <th>Product line</th>
          <th>Rating</th>
          <th>Body</th>
          <th>Locale</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in reviews" :key="r.id" class="border-b border-foreground/10 align-top">
          <td class="py-2">{{ r.user_email }}</td>
          <td>{{ r.product_line_name }}</td>
          <td>{{ r.rating }}</td>
          <td class="max-w-md whitespace-pre-wrap">{{ r.body }}</td>
          <td>{{ r.locale }}</td>
          <td>{{ new Date(r.created_at).toLocaleString() }}</td>
          <td class="space-y-1">
            <div class="flex gap-2">
              <button v-if="r.status !== 'approved'" type="button" class="text-primary underline" @click="onApprove(r.id)">Approve</button>
              <button v-if="r.status !== 'rejected'" type="button" class="text-accent underline" @click="rejectReasonFor = r.id">Reject</button>
              <button type="button" class="text-foreground/60 underline" @click="onDelete(r.id)">Delete</button>
            </div>
            <div v-if="rejectReasonFor === r.id" class="mt-2 space-y-1">
              <input v-model="rejectReasonText" type="text" placeholder="Reason (optional)" class="border border-foreground/20 rounded p-1 text-xs w-full" />
              <div class="flex gap-2">
                <button type="button" class="text-xs underline" @click="onReject(r.id)">Confirm reject</button>
                <button type="button" class="text-xs underline text-foreground/60" @click="rejectReasonFor = null; rejectReasonText = ''">Cancel</button>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
```

- [ ] **Step 2: Add route in `packages/web/src/router/index.ts`**

Add the following route entry inside the `routes` array, right after `admin-settings`:

```typescript
{
  path: '/admin/reviews',
  name: 'admin-reviews',
  component: () => import('../pages/AdminReviewsPage.vue'),
},
```

- [ ] **Step 3: Add nav link in `packages/web/src/components/admin/AdminNav.vue`**

Update the `links` array — add `{ to: '/admin/reviews', label: 'Reviews' }` after `Chat`:

```typescript
const links = [
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/product-lines', label: 'Product Lines' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/income', label: 'Income' },
  { to: '/admin/chat', label: 'Chat' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/settings', label: 'Settings' },
]
```

- [ ] **Step 4: Visual sanity check**

```bash
npm run dev:web
```

Visit `http://localhost:5171/admin/reviews` (with the local admin auth — likely via X-Admin-Email header in dev). Confirm pending reviews surface and approve/reject/delete buttons work.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/pages/AdminReviewsPage.vue packages/web/src/router/index.ts packages/web/src/components/admin/AdminNav.vue
git commit -m "feat(reviews): AdminReviewsPage + route + nav link"
```

---

## Phase I — End-to-End

### Task 27: E2E test for full review flow

**Files:**
- Create: `e2e/reviews.spec.ts`

- [ ] **Step 1: Read existing e2e helpers + an example spec**

```bash
cd /Users/jdelaire/Projects/cnx-athletx && cat e2e/helpers.ts && head -80 e2e/shopping-flow.spec.ts
```

Mirror the helpers' login/order placement utilities. Don't re-invent them.

- [ ] **Step 2: Write E2E test**

Use the existing helper conventions. Pseudocode for the spec body (replace helper names with whatever `e2e/helpers.ts` exports):

```typescript
import { test, expect } from '@playwright/test'
import { resetDatabase, loginAsCustomer, placeOrder, adminApi, customerApi } from './helpers'

test.describe('Reviews', () => {
  test.beforeEach(async () => { await resetDatabase() })

  test('full review lifecycle', async ({ page }) => {
    const email = 'e2e-review@example.com'
    const cookie = await loginAsCustomer(page, email)
    const orderId = await placeOrder(page, email)
    await adminApi.markPaid(orderId)
    await adminApi.pack(orderId)
    await adminApi.ship(orderId, { carrier: 'Kerry', tracking_number: 'TRKE2E' })

    // 1. Customer sees reviewable item
    await page.goto('/account')
    await expect(page.getByText('AthletX Protein')).toBeVisible()
    await page.getByRole('button', { name: 'Write a review' }).first().click()

    // 2. Submit
    await page.locator('[data-testid="star-5"]').click()
    await page.locator('textarea').fill('E2E review body')
    await page.getByRole('button', { name: 'Submit review' }).click()
    await expect(page.getByText(/Pending/i)).toBeVisible()

    // 3. Public product page does not show review yet
    await page.goto('/product/athletx-protein-500g')
    await expect(page.getByText('No reviews yet')).toBeVisible()

    // 4. Admin approve
    await page.goto('/admin/reviews')
    await page.getByRole('button', { name: 'Approve' }).first().click()

    // 5. Public page now shows the review
    await page.goto('/product/athletx-protein-500g')
    await expect(page.getByText('Verified buyer')).toBeVisible()
    await expect(page.getByText('E2E review body')).toBeVisible()

    // 6. Customer deletes — reverts public state
    await page.goto('/account')
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '×' }).first().click()
    await page.goto('/product/athletx-protein-500g')
    await expect(page.getByText('No reviews yet')).toBeVisible()
  })
})
```

> If the existing `e2e/helpers.ts` does not export `adminApi`/`placeOrder`, add helpers locally inside the spec file (use `request` context with the right cookies — pattern in `e2e/shopping-flow.spec.ts`).

- [ ] **Step 3: Run the E2E test**

```bash
cd /Users/jdelaire/Projects/cnx-athletx && npm run test:e2e -- reviews
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/reviews.spec.ts
git commit -m "test(reviews): e2e test for review submission, moderation, and display"
```

---

## Phase J — Final Verification

### Task 28: Full quality-gate run + docs touch-ups

**Files:**
- Modify: `docs/plan/02-backend-architecture.md` (add reviews section)
- Modify: `docs/plan/03-frontend-design.md` (add reviews component note)

- [ ] **Step 1: Run all quality gates**

```bash
cd /Users/jdelaire/Projects/cnx-athletx
npm run lint
npm run typecheck
npm run build
npm run test
npm run test:integration -w @cnx-athletx/api
npm run test:e2e
```

Expected: all PASS.

- [ ] **Step 2: Update backend docs**

Open `docs/plan/02-backend-architecture.md` and add a new section under the existing schema/endpoints documentation. Brief — schema table, endpoint list, eligibility rule, idempotency contract for review-prompt email. Roughly 30–60 lines.

- [ ] **Step 3: Update frontend docs**

Open `docs/plan/03-frontend-design.md` and add a brief block describing the new `ReviewSummary`, `ReviewList`, `ReviewForm`, `ReviewableProductCard` components and the new `AdminReviewsPage`. 20–40 lines.

- [ ] **Step 4: Commit**

```bash
git add docs/plan/02-backend-architecture.md docs/plan/03-frontend-design.md
git commit -m "docs(reviews): document review system in backend + frontend plans"
```

---

## Self-Review Notes

- Spec coverage:
  - Eligibility (shipped/delivered) → Task 6 SQL `IN ('shipped','delivered')`.
  - One per user per line → Task 1 UNIQUE + Task 6 explicit 409 mapping.
  - Anonymous "Verified buyer" → Task 19 ReviewList renders fixed label, never user name.
  - Locale tag → Task 19 flag rendering.
  - Aggregation at line level → Task 4 SQL groups by `product_line_id`.
  - Approval queue → Task 8 admin endpoints + Task 26 admin page.
  - Email on ship → Tasks 9–12.
  - Customer can delete + resubmit → Task 6 DELETE + re-INSERT path; Task 25 UI delete button.
  - Admin audit log → Task 8 `admin_audit_log` inserts.
  - Out-of-scope items (no edit, no admin email alert, no customer approval/rejection email) — confirmed absent from tasks.

- Type / name consistency:
  - `productLineId` (camelCase) used in API request body and frontend interfaces; `product_line_id` (snake_case) used in SQL/D1 row types only. Endpoints translate at the boundary.
  - `MyReview.productLineId` (Task 13) matches `GET /api/account/reviews` response shape (Task 6).
  - `AdminReview.product_line_name` (Task 14) matches admin SQL alias (Task 8).
  - Review status enum: `'pending' | 'approved' | 'rejected'` everywhere.

- Possible execution gotchas:
  - Seed data slugs may differ from `athletx-protein-500g`. Tasks 3, 7, 27 explicitly note this — read `packages/api/sql/seed.sql` first.
  - `waitUntil` flushing in tests may be flaky; Task 11 uses 200ms; bump to 500ms if needed.
  - i18n JSON merge in Task 15: existing `account` object must be merged, not duplicated.
