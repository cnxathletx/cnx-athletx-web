# Back-In-Stock Waitlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers join a SKU-specific waitlist when a product is out of stock, notify them when admin stock restores availability, and let admins view/export captured emails and marketing consent.

**Architecture:** Add one D1 waitlist table and keep public signup, admin listing, and notification dispatch as small route/service additions. Public signup lives with product routes because it is product-slug scoped; admin listing lives in a new admin route file; back-in-stock email rendering/sending extends the existing email service. Vue changes are limited to product detail, admin nav/router/API/types, and one new admin page.

**Tech Stack:** Cloudflare Worker, D1 SQL migrations, TypeScript, itty-router, Resend email API, Vue 3, Vue I18n, Vite, Vitest, @vue/test-utils.

---

## File Structure

- Create `packages/api/sql/migrations/0012_product_waitlist_signups.sql`: production D1 migration.
- Modify `packages/api/sql/schema.sql`: canonical schema table/indexes.
- Modify `packages/api/src/routes/health.ts`: local test-reset schema/drop list.
- Modify `packages/api/src/lib/types.ts`: request/row/result types.
- Modify `packages/api/src/lib/validation.ts`: waitlist body validation.
- Modify `packages/api/src/routes/products.ts`: public `POST /api/products/:slug/waitlist`.
- Modify `packages/api/src/routes/products.integration.test.ts`: public signup tests.
- Modify `packages/api/src/services/email/templates.ts`: `backInStockTemplate`.
- Modify `packages/api/src/services/email/send.ts`: result-returning `sendBackInStockEmail`.
- Modify `packages/api/src/services/email/index.ts`: re-export new send/template types if needed.
- Modify `packages/api/src/services/email/templates.test.ts`: template escaping/render tests.
- Modify `packages/api/src/routes/admin/inventory.ts`: stock transition notification trigger.
- Modify `packages/api/src/routes/admin-inventory.integration.test.ts`: notification trigger tests.
- Create `packages/api/src/routes/admin/waitlist.ts`: admin waitlist API.
- Modify `packages/api/src/routes/admin.ts`: register admin waitlist routes.
- Create `packages/api/src/routes/admin-waitlist.integration.test.ts`: admin waitlist tests.
- Modify `packages/web/src/types/products.ts`: waitlist signup response type.
- Modify `packages/web/src/api/products.ts`: `joinProductWaitlist`.
- Modify `packages/web/src/pages/ProductDetailPage.vue`: out-of-stock form.
- Create `packages/web/src/pages/ProductDetailPage.test.ts`: product detail waitlist tests.
- Modify `packages/web/src/types/admin.ts`: waitlist row/status types.
- Modify `packages/web/src/api/admin.ts`: `fetchAdminWaitlist`.
- Modify `packages/web/src/router/index.ts`: `/admin/waitlist` route.
- Modify `packages/web/src/components/admin/AdminNav.vue`: Waitlist nav item.
- Create `packages/web/src/pages/AdminWaitlistPage.vue`: admin list/export page.
- Create `packages/web/src/pages/AdminWaitlistPage.test.ts`: admin page tests.
- Modify `packages/web/src/i18n/en.json` and `packages/web/src/i18n/th.json`: customer copy.
- Modify `docs/plan/02-backend-architecture.md`, `docs/plan/03-frontend-design.md`, and `docs/changelog.md`: documented behavior.

## Task 1: Database, Types, and Validation

**Files:**
- Create: `packages/api/sql/migrations/0012_product_waitlist_signups.sql`
- Modify: `packages/api/sql/schema.sql`
- Modify: `packages/api/src/routes/health.ts`
- Modify: `packages/api/src/lib/types.ts`
- Modify: `packages/api/src/lib/validation.ts`
- Test: `packages/api/src/migrations.test.ts`

- [ ] **Step 1: Write the migration**

Create `packages/api/sql/migrations/0012_product_waitlist_signups.sql`:

```sql
CREATE TABLE IF NOT EXISTS product_waitlist_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','th')),
    marketing_consent INTEGER NOT NULL DEFAULT 0,
    notified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_waitlist_product_status
    ON product_waitlist_signups(product_id, notified_at);

CREATE INDEX IF NOT EXISTS idx_product_waitlist_email
    ON product_waitlist_signups(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_waitlist_active_unique
    ON product_waitlist_signups(product_id, email)
    WHERE notified_at IS NULL;
```

- [ ] **Step 2: Add canonical schema**

Add same table and indexes to `packages/api/sql/schema.sql` after `inventory`.

- [ ] **Step 3: Update test reset schema**

In `packages/api/src/routes/health.ts`, add `product_waitlist_signups` to `DROP_TABLES` before `inventory`:

```ts
const DROP_TABLES = ['rate_limits','product_line_lab_tests','reviews','email_logs','admin_audit_log','loyalty_point_ledger','shipments','payment_proofs','payments','order_items','orders','sessions','magic_links','users','discount_codes','product_waitlist_signups','inventory','price_tiers','product_images','products','product_lines','site_settings']
```

Also append compact SQL to `TEST_SCHEMA` after the `inventory` table:

```sql
CREATE TABLE IF NOT EXISTS product_waitlist_signups (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,email TEXT NOT NULL,locale TEXT NOT NULL DEFAULT 'en',marketing_consent INTEGER NOT NULL DEFAULT 0,notified_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,CHECK (locale IN ('en','th')));CREATE INDEX IF NOT EXISTS idx_product_waitlist_product_status ON product_waitlist_signups(product_id, notified_at);CREATE INDEX IF NOT EXISTS idx_product_waitlist_email ON product_waitlist_signups(email);CREATE UNIQUE INDEX IF NOT EXISTS idx_product_waitlist_active_unique ON product_waitlist_signups(product_id, email) WHERE notified_at IS NULL;
```

- [ ] **Step 4: Add API types**

In `packages/api/src/lib/types.ts`, add:

```ts
export interface ProductWaitlistSignupBody {
  email: string
  marketing_consent: boolean
}

export interface ProductWaitlistProductRow {
  id: number
  slug: string
  name: string
  available_stock: number
}

export interface ProductWaitlistRow {
  id: number
  product_id: number
  email: string
  locale: 'en' | 'th'
  marketing_consent: number
  notified_at: string | null
  created_at: string
  updated_at: string
}

export interface AdminWaitlistRow {
  id: number
  product_id: number
  product_slug: string
  product_name: string
  email: string
  locale: 'en' | 'th'
  marketing_consent: number
  notified_at: string | null
  created_at: string
  updated_at: string
}
```

Add `ProductWaitlistSignupBody` to the validation import list in `validation.ts`.

- [ ] **Step 5: Add validator**

In `packages/api/src/lib/validation.ts`, after `validateRequestLinkBody`, add:

```ts
export function validateProductWaitlistSignupBody(body: unknown): {
  errors: ValidationError[]
  data: ProductWaitlistSignupBody | null
} {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'email must be a valid email address' })
  }

  if (b.marketing_consent !== undefined && typeof b.marketing_consent !== 'boolean') {
    errors.push({ field: 'marketing_consent', message: 'marketing_consent must be a boolean' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: {
      email,
      marketing_consent: b.marketing_consent === true,
    },
  }
}
```

- [ ] **Step 6: Run migration/validation checks**

Run:

```bash
npm run test -w @cnx-athletx/api -- src/migrations.test.ts src/lib/validation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api/sql/migrations/0012_product_waitlist_signups.sql packages/api/sql/schema.sql packages/api/src/routes/health.ts packages/api/src/lib/types.ts packages/api/src/lib/validation.ts
git commit -m "Add product waitlist schema"
```

## Task 2: Public Waitlist Signup API

**Files:**
- Modify: `packages/api/src/routes/products.ts`
- Modify: `packages/api/src/routes/products.integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

Append to `packages/api/src/routes/products.integration.test.ts`:

```ts
describe('POST /api/products/:slug/waitlist', () => {
  it('creates a waitlist signup for an out-of-stock product', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })

    const res = await workerFetch('/api/products/plant-protein-500g/waitlist?locale=th', {
      body: { email: ' Notify@Example.COM ', marketing_consent: true },
    })

    expect(res.status).toBe(201)
    const data = await res.json() as { success: true }
    expect(data.success).toBe(true)
  })

  it('rejects waitlist signup while product is in stock', async () => {
    const res = await workerFetch('/api/products/plant-protein-500g/waitlist', {
      body: { email: 'stock@example.com', marketing_consent: false },
    })

    expect(res.status).toBe(409)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('Product is in stock')
  })

  it('updates an existing active signup instead of duplicating it', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })

    const first = await workerFetch('/api/products/plant-protein-500g/waitlist', {
      body: { email: 'dup@example.com', marketing_consent: false },
    })
    expect(first.status).toBe(201)

    const second = await workerFetch('/api/products/plant-protein-500g/waitlist?locale=th', {
      body: { email: 'dup@example.com', marketing_consent: true },
    })
    expect(second.status).toBe(200)

    const adminRes = await workerFetch('/api/admin/waitlist?status=active', { admin: true })
    expect(adminRes.status).toBe(200)
    const data = await adminRes.json() as {
      waitlist: Array<{ email: string; marketing_consent: boolean; locale: string }>
    }
    const rows = data.waitlist.filter((row) => row.email === 'dup@example.com')
    expect(rows).toHaveLength(1)
    expect(rows[0].marketing_consent).toBe(true)
    expect(rows[0].locale).toBe('th')
  })
})
```

The third test will fully pass after Task 4 adds admin waitlist API. It is acceptable to write it now and run only first two tests in this task.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test:integration -w @cnx-athletx/api -- src/routes/products.integration.test.ts -t "POST /api/products"
```

Expected: FAIL with 404 for waitlist endpoint.

- [ ] **Step 3: Implement route**

At top of `packages/api/src/routes/products.ts`, add imports:

```ts
import { parseJsonBody } from '../middleware/auth'
import { validateProductWaitlistSignupBody } from '../lib/validation'
import type { ProductWaitlistProductRow } from '../lib/types'
```

Inside `registerProductRoutes`, before `router.get('/api/products/:slug'...)`, add:

```ts
  router.post('/api/products/:slug/waitlist', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const slug = parts[parts.length - 2] || ''

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateProductWaitlistSignupBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const locale = resolveQueryLocale(url.searchParams.get('locale'))

    try {
      const product = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, (i.stock_count - i.reserved_count) AS available_stock
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.slug = ? AND p.active = 1 AND p.archived = 0
         LIMIT 1`,
      ).bind(slug).first<ProductWaitlistProductRow>()

      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      if (product.available_stock > 0) {
        return Response.json({ error: 'Product is in stock' }, { status: 409 })
      }

      const now = new Date().toISOString()
      const existing = await env.DB.prepare(
        `SELECT id FROM product_waitlist_signups
         WHERE product_id = ? AND email = ? AND notified_at IS NULL
         LIMIT 1`,
      ).bind(product.id, data.email).first<{ id: number }>()

      if (existing) {
        await env.DB.prepare(
          `UPDATE product_waitlist_signups
           SET marketing_consent = ?, locale = ?, updated_at = ?
           WHERE id = ?`,
        ).bind(data.marketing_consent ? 1 : 0, locale, now, existing.id).run()
        return Response.json({ success: true })
      }

      await env.DB.prepare(
        `INSERT INTO product_waitlist_signups
           (product_id, email, locale, marketing_consent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(product.id, data.email, locale, data.marketing_consent ? 1 : 0, now, now).run()

      return Response.json({ success: true }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test:integration -w @cnx-athletx/api -- src/routes/products.integration.test.ts -t "creates a waitlist|rejects waitlist"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/products.ts packages/api/src/routes/products.integration.test.ts
git commit -m "Add public product waitlist signup"
```

## Task 3: Back-In-Stock Email and Inventory Trigger

**Files:**
- Modify: `packages/api/src/services/email/templates.ts`
- Modify: `packages/api/src/services/email/send.ts`
- Modify: `packages/api/src/services/email/index.ts`
- Modify: `packages/api/src/services/email/templates.test.ts`
- Modify: `packages/api/src/routes/admin/inventory.ts`
- Modify: `packages/api/src/routes/admin-inventory.integration.test.ts`

- [ ] **Step 1: Write template test**

In `packages/api/src/services/email/templates.test.ts`, add `backInStockTemplate` to imports and append:

```ts
describe('backInStockTemplate', () => {
  it('renders escaped product name and product URL', () => {
    const out = backInStockTemplate.en({
      product_name: '<Protein>',
      product_url: 'https://www.cnxnature.com/product/plant-protein-500g?x=<bad>',
    })

    expect(out.subject).toContain('<Protein>')
    expect(out.html).toContain('&lt;Protein&gt;')
    expect(out.html).not.toContain('<Protein>')
    expect(out.html).toContain('https://www.cnxnature.com/product/plant-protein-500g?x=&lt;bad&gt;')
  })
})
```

- [ ] **Step 2: Run template test to verify failure**

```bash
npm run test -w @cnx-athletx/api -- src/services/email/templates.test.ts -t backInStockTemplate
```

Expected: FAIL because `backInStockTemplate` is not exported.

- [ ] **Step 3: Add template**

In `packages/api/src/services/email/templates.ts`, add:

```ts
export interface BackInStockTemplateInput {
  product_name: string
  product_url: string
}

type BackInStockRenderer = (input: BackInStockTemplateInput) => RenderedEmail

const backInStockEn: BackInStockRenderer = ({ product_name, product_url }) => {
  const safeName = escapeHtml(product_name)
  const safeUrl = escapeHtml(product_url)
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Back in Stock</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">${safeName} is available again.</p>
    <div style="margin: 24px 0;">
      <a href="${safeUrl}" style="display: inline-block; background: ${brand.palette.primary}; color: #ffffff; text-decoration: none; border-radius: 8px; padding: 12px 18px; font-weight: 700;">View Product</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 13px; color: ${brand.palette.muted};">You are receiving this because you asked us to notify you when this product returned.</p>`

  return {
    subject: `${product_name} is back in stock`,
    html: emailLayout(`Back in Stock — ${brand.name}`, body),
  }
}

export const backInStockTemplate: Record<Locale, BackInStockRenderer> = {
  en: backInStockEn,
  th: (input) => backInStockEn(input),
}
```

- [ ] **Step 4: Add result-returning email sender**

In `packages/api/src/services/email/send.ts`, import `backInStockTemplate` and add:

```ts
export interface BackInStockEmailInput {
  customer_email: string
  product_name: string
  product_url: string
  locale: Locale
}

export async function sendBackInStockEmail(env: Env, input: BackInStockEmailInput): Promise<boolean> {
  try {
    const { subject, html } = backInStockTemplate[input.locale]({
      product_name: input.product_name,
      product_url: input.product_url,
    })
    const ok = await sendResendEmail(env, input.customer_email, subject, html)
    await logEmail(env, null, 'back_in_stock', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    return ok
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, null, 'back_in_stock', input.customer_email, 'failed', message)
    return false
  }
}
```

In `packages/api/src/services/email/index.ts`, re-export `sendBackInStockEmail` if the file does not already export everything from `send.ts`.

- [ ] **Step 5: Write inventory trigger test**

In `packages/api/src/routes/admin-inventory.integration.test.ts`, add:

```ts
it('marks waitlist rows notified when stock transitions from out of stock to available', async () => {
  await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })
  await workerFetch('/api/products/plant-protein-500g/waitlist', {
    body: { email: 'notify@example.com', marketing_consent: true },
  })

  const restock = await workerFetch('/api/admin/inventory/1', {
    admin: true,
    method: 'PATCH',
    body: { adjustment: 5 },
  })

  expect(restock.status).toBe(200)

  const waitlistRes = await workerFetch('/api/admin/waitlist?status=notified', { admin: true })
  expect(waitlistRes.status).toBe(200)
  const waitlistData = await waitlistRes.json() as {
    waitlist: Array<{ email: string; notified_at: string | null }>
  }
  const row = waitlistData.waitlist.find((item) => item.email === 'notify@example.com')
  expect(row?.notified_at).toBeTruthy()
})
```

This depends on Task 4 admin waitlist API for final pass. To test this task before Task 4, inspect D1 through a temporary local helper or run after Task 4.

- [ ] **Step 6: Implement trigger**

In `packages/api/src/routes/admin/inventory.ts`, import:

```ts
import { sendBackInStockEmail } from '../../services/email'
import type { ProductWaitlistRow } from '../../lib/types'
```

Before the batch update, read previous inventory:

```ts
      const previousInventory = await env.DB.prepare(
        `SELECT stock_count, reserved_count
         FROM inventory
         WHERE product_id = ? LIMIT 1`
      ).bind(productId).first<AdminInventorySingleRow>()

      if (!previousInventory) {
        return Response.json({ error: 'Inventory row not found' }, { status: 404 })
      }
```

After loading new `inventory`, before returning JSON:

```ts
      const previousAvailable = previousInventory.stock_count - previousInventory.reserved_count
      const newAvailable = inventory.stock_count - inventory.reserved_count
      let waitlistNotifiedCount = 0

      if (previousAvailable <= 0 && newAvailable > 0) {
        const { results } = await env.DB.prepare(
          `SELECT id, product_id, email, locale, marketing_consent, notified_at, created_at, updated_at
           FROM product_waitlist_signups
           WHERE product_id = ? AND notified_at IS NULL
           ORDER BY created_at ASC`,
        ).bind(productId).all<ProductWaitlistRow>()

        for (const row of results) {
          const ok = await sendBackInStockEmail(env, {
            customer_email: row.email,
            product_name: product.name,
            product_url: `https://www.cnxnature.com/product/${productId}`,
            locale: row.locale,
          })
          if (!ok) continue

          await env.DB.prepare(
            `UPDATE product_waitlist_signups
             SET notified_at = ?, updated_at = ?
             WHERE id = ?`,
          ).bind(now, now, row.id).run()
          waitlistNotifiedCount++
        }
      }
```

Use slug in `product_url`, so update the earlier product query to `SELECT id, slug, name FROM products...` and type it as `{ id: number; slug: string; name: string }`. Then set:

```ts
product_url: `https://www.cnxnature.com/product/${product.slug}`,
```

Include `waitlist_notified_count: waitlistNotifiedCount` in response after `inventory`.

- [ ] **Step 7: Run focused tests**

```bash
npm run test -w @cnx-athletx/api -- src/services/email/templates.test.ts -t backInStockTemplate
```

Expected: PASS.

Run inventory integration after Task 4 registers admin waitlist API.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/email/templates.ts packages/api/src/services/email/send.ts packages/api/src/services/email/index.ts packages/api/src/services/email/templates.test.ts packages/api/src/routes/admin/inventory.ts packages/api/src/routes/admin-inventory.integration.test.ts
git commit -m "Notify waitlist on restock"
```

## Task 4: Admin Waitlist API

**Files:**
- Create: `packages/api/src/routes/admin/waitlist.ts`
- Modify: `packages/api/src/routes/admin.ts`
- Create: `packages/api/src/routes/admin-waitlist.integration.test.ts`
- Modify: `packages/api/src/routes/products.integration.test.ts`
- Modify: `packages/api/src/routes/admin-inventory.integration.test.ts`

- [ ] **Step 1: Write integration tests**

Create `packages/api/src/routes/admin-waitlist.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/admin/waitlist', () => {
  it('requires admin authentication', async () => {
    const res = await workerFetch('/api/admin/waitlist')
    expect(res.status).toBe(403)
  })

  it('lists active waitlist rows with product fields', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })
    await workerFetch('/api/products/plant-protein-500g/waitlist?locale=th', {
      body: { email: 'admin-list@example.com', marketing_consent: true },
    })

    const res = await workerFetch('/api/admin/waitlist?status=active', { admin: true })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      waitlist: Array<{
        product_slug: string
        product_name: string
        email: string
        locale: string
        marketing_consent: boolean
        notified_at: string | null
      }>
    }
    expect(data.waitlist).toHaveLength(1)
    expect(data.waitlist[0]).toMatchObject({
      product_slug: 'plant-protein-500g',
      product_name: 'CNX Plant Protein 500g',
      email: 'admin-list@example.com',
      locale: 'th',
      marketing_consent: true,
      notified_at: null,
    })
  })

  it('rejects invalid status', async () => {
    const res = await workerFetch('/api/admin/waitlist?status=bad', { admin: true })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:integration -w @cnx-athletx/api -- src/routes/admin-waitlist.integration.test.ts
```

Expected: FAIL because route file is missing.

- [ ] **Step 3: Implement admin route**

Create `packages/api/src/routes/admin/waitlist.ts`:

```ts
import type { RouterType } from 'itty-router'
import type { AdminWaitlistRow } from '../../lib/types'
import { requireAdmin } from '../../middleware/auth'

type WaitlistStatus = 'active' | 'notified' | 'all'

function parseStatus(raw: string | null): WaitlistStatus | null {
  if (!raw) return 'active'
  if (raw === 'active' || raw === 'notified' || raw === 'all') return raw
  return null
}

export function registerAdminWaitlistRoutes(router: RouterType) {
  router.get('/api/admin/waitlist', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const status = parseStatus(url.searchParams.get('status'))
    if (!status) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }

    const where = status === 'active'
      ? 'AND w.notified_at IS NULL'
      : status === 'notified'
        ? 'AND w.notified_at IS NOT NULL'
        : ''
    const order = status === 'notified'
      ? 'w.notified_at DESC, w.created_at DESC'
      : 'w.created_at DESC'

    try {
      const { results } = await env.DB.prepare(
        `SELECT w.id, w.product_id, p.slug AS product_slug, p.name AS product_name,
                w.email, w.locale, w.marketing_consent, w.notified_at, w.created_at, w.updated_at
         FROM product_waitlist_signups w
         JOIN products p ON p.id = w.product_id
         WHERE p.archived = 0 ${where}
         ORDER BY ${order}`,
      ).all<AdminWaitlistRow>()

      return Response.json({
        waitlist: results.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          product_slug: row.product_slug,
          product_name: row.product_name,
          email: row.email,
          locale: row.locale,
          marketing_consent: row.marketing_consent === 1,
          notified_at: row.notified_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
```

In `packages/api/src/routes/admin.ts`, import/register:

```ts
import { registerAdminWaitlistRoutes } from './admin/waitlist'
```

```ts
  registerAdminWaitlistRoutes(router)
```

- [ ] **Step 4: Run API integration tests**

```bash
npm run test:integration -w @cnx-athletx/api -- src/routes/products.integration.test.ts src/routes/admin-waitlist.integration.test.ts src/routes/admin-inventory.integration.test.ts
```

Expected: PASS for waitlist-related tests. If `sendBackInStockEmail` returns false in local test because `RESEND_API_KEY` is unset, update the sender for local/dev no-key mode to log and return true for this route, consistent with magic-link dev behavior:

```ts
if (!env.RESEND_API_KEY) {
  await logEmail(env, null, 'back_in_stock', input.customer_email, 'sent')
  return true
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/admin/waitlist.ts packages/api/src/routes/admin.ts packages/api/src/routes/admin-waitlist.integration.test.ts packages/api/src/routes/products.integration.test.ts packages/api/src/routes/admin-inventory.integration.test.ts
git commit -m "Add admin waitlist API"
```

## Task 5: Customer Product Detail UI

**Files:**
- Modify: `packages/web/src/types/products.ts`
- Modify: `packages/web/src/api/products.ts`
- Modify: `packages/web/src/pages/ProductDetailPage.vue`
- Create: `packages/web/src/pages/ProductDetailPage.test.ts`
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/th.json`

- [ ] **Step 1: Add API client**

In `packages/web/src/types/products.ts`, add:

```ts
export interface ProductWaitlistSignupResponse {
  success: true
}
```

In `packages/web/src/api/products.ts`, export:

```ts
export async function joinProductWaitlist(
  slug: string,
  payload: { email: string; marketing_consent: boolean },
): Promise<ProductWaitlistSignupResponse> {
  return apiFetch<ProductWaitlistSignupResponse>(
    `/api/products/${encodeURIComponent(slug)}/waitlist?locale=${encodeURIComponent(currentLocale())}`,
    {
      method: 'POST',
      body: payload,
      parseError: (_payload, response) =>
        response.status === 409 ? new Error('Product is in stock') : new Error('Failed to join waitlist'),
    },
  )
}
```

Import `ProductWaitlistSignupResponse` from types in this file.

- [ ] **Step 2: Add i18n keys**

Add to `packages/web/src/i18n/en.json` under `product`:

```json
"waitlistTitle": "Notify me when back in stock",
"waitlistEmailLabel": "Email",
"waitlistEmailPlaceholder": "you@example.com",
"waitlistMarketingConsent": "Send me product updates and offers by email",
"waitlistSubmit": "Notify when back in stock",
"waitlistSuccess": "We'll email you when this product is back in stock.",
"waitlistInvalidEmail": "Enter a valid email address.",
"waitlistError": "Could not save your request. Please try again."
```

Add Thai equivalents to `packages/web/src/i18n/th.json` under `product`. If final copy is not available, use clear Thai copy:

```json
"waitlistTitle": "แจ้งเตือนเมื่อสินค้ากลับมาพร้อมจำหน่าย",
"waitlistEmailLabel": "อีเมล",
"waitlistEmailPlaceholder": "you@example.com",
"waitlistMarketingConsent": "ส่งข่าวสารสินค้าและโปรโมชันทางอีเมลให้ฉัน",
"waitlistSubmit": "แจ้งเตือนเมื่อมีสินค้า",
"waitlistSuccess": "เราจะส่งอีเมลเมื่อสินค้านี้กลับมาพร้อมจำหน่าย",
"waitlistInvalidEmail": "กรุณากรอกอีเมลที่ถูกต้อง",
"waitlistError": "บันทึกคำขอไม่สำเร็จ กรุณาลองอีกครั้ง"
```

- [ ] **Step 3: Write page tests**

Create `packages/web/src/pages/ProductDetailPage.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import i18n from '../i18n'
import ProductDetailPage from './ProductDetailPage.vue'
import { fetchProductBySlug, joinProductWaitlist } from '../api/products'

vi.mock('../api/products', async () => {
  const actual = await vi.importActual<typeof import('../api/products')>('../api/products')
  return {
    ...actual,
    fetchProductBySlug: vi.fn(),
    joinProductWaitlist: vi.fn(),
  }
})

vi.mock('../composables/useProductReviews', () => ({
  useProductReviews: () => ({
    summary: { value: null },
    reviews: { value: [] },
    page: { value: 1 },
    pageSize: { value: 5 },
    total: { value: 0 },
    loading: { value: false },
    error: { value: '' },
    setPage: vi.fn(),
  }),
}))

const product = {
  id: 1,
  slug: 'plant-protein-500g',
  name: 'CNX Plant Protein 500g',
  description: 'Protein',
  price_thb: 89900,
  weight_g: 500,
  image_url: '/image.jpg',
  available_stock: 0,
  nutrition_json: null,
  ingredients: null,
  how_to_use: null,
  who_is_for: null,
  regulatory_info: null,
  product_line_name: null,
  screenshots: [],
  price_tiers: [],
  lab_test_files: [],
}

async function mountPage(stock = 0) {
  vi.mocked(fetchProductBySlug).mockResolvedValue({
    product: { ...product, available_stock: stock },
    related: null,
  })
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/product/:slug', component: ProductDetailPage },
      { path: '/shop', component: { template: '<div />' } },
    ],
  })
  router.push('/product/plant-protein-500g')
  await router.isReady()

  const wrapper = mount(ProductDetailPage, {
    global: {
      plugins: [router, i18n],
      stubs: {
        ReviewSummary: true,
        ReviewList: true,
        ProductCard: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('ProductDetailPage waitlist', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(joinProductWaitlist).mockResolvedValue({ success: true })
  })

  it('shows waitlist form when product is out of stock', async () => {
    const wrapper = await mountPage(0)
    expect(wrapper.text()).toContain('Notify me when back in stock')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
  })

  it('keeps add to cart when product is in stock', async () => {
    const wrapper = await mountPage(5)
    expect(wrapper.text()).toContain('Add to Cart')
    expect(wrapper.text()).not.toContain('Notify me when back in stock')
  })

  it('submits email and marketing consent', async () => {
    const wrapper = await mountPage(0)
    await wrapper.find('input[type="email"]').setValue('buyer@example.com')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(joinProductWaitlist).toHaveBeenCalledWith('plant-protein-500g', {
      email: 'buyer@example.com',
      marketing_consent: true,
    })
    expect(wrapper.text()).toContain("We'll email you when this product is back in stock.")
  })
})
```

- [ ] **Step 4: Run test to verify failure**

```bash
npm run test -w @cnx-athletx/web -- src/pages/ProductDetailPage.test.ts
```

Expected: FAIL because UI state is missing.

- [ ] **Step 5: Implement component state**

In `ProductDetailPage.vue`, import `joinProductWaitlist` and `ApiClientError`:

```ts
import { ApiClientError } from '../api/client'
```

Add state:

```ts
const waitlistEmail = ref('')
const waitlistMarketingConsent = ref(false)
const waitlistLoading = ref(false)
const waitlistError = ref('')
const waitlistSuccess = ref(false)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

Reset these in `loadProduct`:

```ts
  waitlistEmail.value = ''
  waitlistMarketingConsent.value = false
  waitlistError.value = ''
  waitlistSuccess.value = false
```

Add submit function:

```ts
async function submitWaitlist() {
  const email = waitlistEmail.value.trim().toLowerCase()
  waitlistError.value = ''
  waitlistSuccess.value = false

  if (!emailPattern.test(email)) {
    waitlistError.value = t('product.waitlistInvalidEmail')
    return
  }

  waitlistLoading.value = true
  try {
    await joinProductWaitlist(productSlug.value, {
      email,
      marketing_consent: waitlistMarketingConsent.value,
    })
    waitlistEmail.value = email
    waitlistSuccess.value = true
  } catch (err) {
    waitlistError.value = err instanceof ApiClientError || err instanceof Error
      ? t('product.waitlistError')
      : t('product.waitlistError')
  } finally {
    waitlistLoading.value = false
  }
}
```

- [ ] **Step 6: Replace out-of-stock purchase area**

In template, wrap the existing quantity selector and add-to-cart button with `v-if="product.available_stock > 0"`. Add this form in the `v-else` branch:

```vue
<form class="rounded-md border border-sand bg-surface-alt p-4 space-y-4" @submit.prevent="submitWaitlist">
  <div class="space-y-1">
    <h2 class="text-base font-semibold text-foreground">{{ t('product.waitlistTitle') }}</h2>
    <label class="block text-sm font-medium text-muted" for="waitlist-email">
      {{ t('product.waitlistEmailLabel') }}
    </label>
    <input
      id="waitlist-email"
      v-model="waitlistEmail"
      type="email"
      :placeholder="t('product.waitlistEmailPlaceholder')"
      class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      :disabled="waitlistLoading || waitlistSuccess"
    />
  </div>

  <label class="flex items-start gap-3 text-sm text-muted">
    <input
      v-model="waitlistMarketingConsent"
      type="checkbox"
      class="mt-1 h-4 w-4 rounded border-sand text-primary focus:ring-primary"
      :disabled="waitlistLoading || waitlistSuccess"
    />
    <span>{{ t('product.waitlistMarketingConsent') }}</span>
  </label>

  <PrimaryButton full-width :disabled="waitlistLoading || waitlistSuccess">
    {{ t('product.waitlistSubmit') }}
  </PrimaryButton>

  <p v-if="waitlistError" class="text-sm text-error">{{ waitlistError }}</p>
  <p v-if="waitlistSuccess" class="text-sm text-success">{{ t('product.waitlistSuccess') }}</p>
</form>
```

- [ ] **Step 7: Run web tests**

```bash
npm run test -w @cnx-athletx/web -- src/pages/ProductDetailPage.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/types/products.ts packages/web/src/api/products.ts packages/web/src/pages/ProductDetailPage.vue packages/web/src/pages/ProductDetailPage.test.ts packages/web/src/i18n/en.json packages/web/src/i18n/th.json
git commit -m "Add product waitlist form"
```

## Task 6: Admin Waitlist UI and CSV Export

**Files:**
- Modify: `packages/web/src/types/admin.ts`
- Modify: `packages/web/src/api/admin.ts`
- Modify: `packages/web/src/router/index.ts`
- Modify: `packages/web/src/components/admin/AdminNav.vue`
- Create: `packages/web/src/pages/AdminWaitlistPage.vue`
- Create: `packages/web/src/pages/AdminWaitlistPage.test.ts`

- [ ] **Step 1: Add admin types/API**

In `packages/web/src/types/admin.ts`, add:

```ts
export type AdminWaitlistStatus = 'active' | 'notified' | 'all'

export interface AdminWaitlistRow {
  id: number
  product_id: number
  product_slug: string
  product_name: string
  email: string
  locale: 'en' | 'th'
  marketing_consent: boolean
  notified_at: string | null
  created_at: string
  updated_at: string
}
```

In `packages/web/src/api/admin.ts`, import/export these types and add:

```ts
export async function fetchAdminWaitlist(status: AdminWaitlistStatus = 'active'): Promise<AdminWaitlistRow[]> {
  const data = await apiFetch<{ waitlist: AdminWaitlistRow[] }>(
    `/api/admin/waitlist?status=${encodeURIComponent(status)}`,
    { parseError: adminError },
  )
  return data.waitlist
}
```

- [ ] **Step 2: Add route and nav**

In `packages/web/src/router/index.ts`, add route near other admin pages:

```ts
{
  path: '/admin/waitlist',
  name: 'admin-waitlist',
  component: () => import('../pages/AdminWaitlistPage.vue'),
},
```

In `AdminNav.vue`, add:

```ts
{ to: '/admin/waitlist', label: 'Waitlist' },
```

- [ ] **Step 3: Write admin page test**

Create `packages/web/src/pages/AdminWaitlistPage.test.ts`:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'
import AdminWaitlistPage from './AdminWaitlistPage.vue'
import { fetchAdminWaitlist } from '../api/admin'

vi.mock('../api/admin', async () => {
  const actual = await vi.importActual<typeof import('../api/admin')>('../api/admin')
  return {
    ...actual,
    fetchAdminWaitlist: vi.fn(),
  }
})

async function mountPage() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/admin/waitlist', component: AdminWaitlistPage }],
  })
  router.push('/admin/waitlist')
  await router.isReady()
  const wrapper = mount(AdminWaitlistPage, {
    global: { plugins: [router], stubs: { AdminNav: true } },
  })
  await flushPromises()
  return wrapper
}

describe('AdminWaitlistPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(fetchAdminWaitlist).mockResolvedValue([
      {
        id: 1,
        product_id: 1,
        product_slug: 'plant-protein-500g',
        product_name: 'CNX Plant Protein 500g',
        email: 'buyer@example.com',
        locale: 'en',
        marketing_consent: true,
        notified_at: null,
        created_at: '2026-06-03T00:00:00.000Z',
        updated_at: '2026-06-03T00:00:00.000Z',
      },
    ])
  })

  it('loads active waitlist rows by default', async () => {
    const wrapper = await mountPage()
    expect(fetchAdminWaitlist).toHaveBeenCalledWith('active')
    expect(wrapper.text()).toContain('buyer@example.com')
    expect(wrapper.text()).toContain('CNX Plant Protein 500g')
  })

  it('switches to notified filter', async () => {
    const wrapper = await mountPage()
    await wrapper.get('button[data-status="notified"]').trigger('click')
    await flushPromises()
    expect(fetchAdminWaitlist).toHaveBeenLastCalledWith('notified')
  })
})
```

- [ ] **Step 4: Run test to verify failure**

```bash
npm run test -w @cnx-athletx/web -- src/pages/AdminWaitlistPage.test.ts
```

Expected: FAIL because page is missing.

- [ ] **Step 5: Implement admin page**

Create `packages/web/src/pages/AdminWaitlistPage.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminNav from '../components/admin/AdminNav.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import { fetchAdminWaitlist, AdminApiErrorResponse, type AdminWaitlistRow, type AdminWaitlistStatus } from '../api/admin'

const rows = ref<AdminWaitlistRow[]>([])
const status = ref<AdminWaitlistStatus>('active')
const loading = ref(true)
const error = ref('')

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function loadRows(nextStatus = status.value) {
  status.value = nextStatus
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchAdminWaitlist(nextStatus)
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load waitlist.'
  } finally {
    loading.value = false
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function exportCsv() {
  const header = ['product_name', 'product_slug', 'email', 'marketing_consent', 'locale', 'created_at', 'notified_at']
  const lines = [
    header.join(','),
    ...rows.value.map((row) => [
      row.product_name,
      row.product_slug,
      row.email,
      row.marketing_consent ? 'yes' : 'no',
      row.locale,
      row.created_at,
      row.notified_at ?? '',
    ].map(csvEscape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `waitlist-${status.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  void loadRows('active')
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Waitlist</h1>
          <p class="text-sm text-muted mt-1">View back-in-stock requests and marketing consent.</p>
        </div>
        <AdminNav />
      </div>

      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex gap-2 flex-wrap">
          <button
            v-for="item in ['active', 'notified', 'all']"
            :key="item"
            type="button"
            :data-status="item"
            :class="[
              'px-4 py-2 rounded-md text-sm font-semibold border transition-colors',
              status === item ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-foreground border-sand hover:border-foreground',
            ]"
            @click="loadRows(item as AdminWaitlistStatus)"
          >
            {{ item[0].toUpperCase() + item.slice(1) }}
          </button>
        </div>
        <SecondaryButton :disabled="rows.length === 0" @click="exportCsv">Export CSV</SecondaryButton>
      </div>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
      </div>

      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">
        {{ error }}
      </div>

      <div v-else-if="rows.length === 0" class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 text-sm text-muted">
        No waitlist signups found.
      </div>

      <div v-else class="overflow-x-auto bg-surface rounded-lg ring-1 ring-[var(--card-ring)]">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-alt text-muted">
            <tr>
              <th class="px-4 py-3 text-left font-semibold">Product</th>
              <th class="px-4 py-3 text-left font-semibold">Email</th>
              <th class="px-4 py-3 text-left font-semibold">Marketing</th>
              <th class="px-4 py-3 text-left font-semibold">Locale</th>
              <th class="px-4 py-3 text-left font-semibold">Created</th>
              <th class="px-4 py-3 text-left font-semibold">Notified</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-t border-sand">
              <td class="px-4 py-3">
                <p class="font-semibold text-foreground">{{ row.product_name }}</p>
                <p class="text-xs text-muted font-mono">{{ row.product_slug }}</p>
              </td>
              <td class="px-4 py-3 text-foreground">{{ row.email }}</td>
              <td class="px-4 py-3 text-foreground">{{ row.marketing_consent ? 'Yes' : 'No' }}</td>
              <td class="px-4 py-3 text-foreground">{{ row.locale }}</td>
              <td class="px-4 py-3 text-muted">{{ formatDate(row.created_at) }}</td>
              <td class="px-4 py-3 text-muted">{{ formatDate(row.notified_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 6: Run web tests**

```bash
npm run test -w @cnx-athletx/web -- src/pages/AdminWaitlistPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/types/admin.ts packages/web/src/api/admin.ts packages/web/src/router/index.ts packages/web/src/components/admin/AdminNav.vue packages/web/src/pages/AdminWaitlistPage.vue packages/web/src/pages/AdminWaitlistPage.test.ts
git commit -m "Add admin waitlist page"
```

## Task 7: Docs, Full Verification, and UI Smoke Test

**Files:**
- Modify: `docs/plan/02-backend-architecture.md`
- Modify: `docs/plan/03-frontend-design.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Update docs**

Add concise backend note to `docs/plan/02-backend-architecture.md`:

```md
Back-in-stock waitlist uses `product_waitlist_signups` for SKU-level requests with optional marketing consent. Public signup is `POST /api/products/:slug/waitlist`; admin listing is `GET /api/admin/waitlist`. Admin inventory adjustment sends `back_in_stock` emails when available stock transitions from zero or below to positive.
```

Add concise frontend note to `docs/plan/03-frontend-design.md`:

```md
Out-of-stock product detail pages show a localized back-in-stock waitlist form instead of the purchase controls. Product cards remain compact and link customers to the detail page. Admin includes a Waitlist page with active/notified/all filters and client-side CSV export.
```

Add to `docs/changelog.md` under `[Unreleased]` / `Added`:

```md
- Added SKU-level back-in-stock waitlist signup, automatic restock notifications, and admin waitlist CSV export.
```

- [ ] **Step 2: Run full checks**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Browser smoke test**

Run dev servers:

```bash
npm run dev:api
npm run dev:web
```

Open `http://localhost:5171/product/plant-protein-500g`. Use admin inventory or local DB seed to make product out of stock, then verify:

- waitlist form appears
- invalid email shows localized error
- valid email signup shows success
- `/admin/waitlist` lists signup
- CSV export downloads a file

- [ ] **Step 4: Commit**

```bash
git add docs/plan/02-backend-architecture.md docs/plan/03-frontend-design.md docs/changelog.md
git commit -m "Document waitlist feature"
```

## Self-Review

- Spec coverage: data model is Task 1; public signup is Task 2; email and inventory trigger are Task 3; admin API is Task 4; customer UI is Task 5; admin UI/export is Task 6; docs and verification are Task 7.
- Placeholder scan: no placeholder or vague “write tests” steps remain; each task names files, commands, and expected results.
- Type consistency: API body uses `marketing_consent`; admin status uses `active | notified | all`; waitlist rows use `notified_at`; web/admin API types match route payloads.
