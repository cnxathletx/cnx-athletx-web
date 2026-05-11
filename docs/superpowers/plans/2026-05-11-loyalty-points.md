# Loyalty Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an account-based **AthletX Points** program where every paid purchase earns points and logged-in customers can optionally redeem points at checkout for at most 5% of the eligible subtotal.

**Architecture:** Store all balance changes in an append-only D1 ledger, then compute the available balance from that ledger. Checkout validates either a discount code or point redemption, never both, and stores point redemption separately from discount-code discount while keeping the existing `discount_thb` total discount compatible with existing order/email UI. Points are awarded when an order reaches a paid revenue state, including guest orders that become linked to a user after login.

**Tech Stack:** Cloudflare Worker, D1, TypeScript strict mode, Vue 3 + Pinia + Vite, Vitest unit/integration tests, existing auth/session checkout flow.

---

## Business Rules

- Earn on all paid purchases: logged-in purchases earn when marked paid; guest purchases earn after the guest email is linked to an account.
- Earn rate: `1 point` per `10 THB` of merchandise subtotal actually paid after all discounts.
- Redemption value: `1 point = 1 THB`, implemented as `1 point = 100 satang`.
- Redemption cap: the API caps redemption at `floor(subtotal_thb * 0.05 / 100) * 100` satang, then converts to points. For a `2,000 THB` subtotal, max redemption is `100 points`.
- No stacking: a checkout request with both `discount_code` and `redeem_points > 0` returns `400`.
- Redemption requires an authenticated account because points are account-owned.
- `discount_thb` remains the total discount shown to existing order/email code. New columns distinguish `discount_code_thb` and `points_discount_thb`.
- Points are reserved/spent when the order is created. If order creation fails, no ledger entry remains. If an unpaid order is cancelled, redeemed points are restored. If a paid/refunded order is refunded or cancelled, earned points are reversed and redeemed points are restored.
- V1 does not expire points. Expiry is intentionally outside this scope because it needs per-earn lots and consumption ordering.

## Visual Identity

- Program name: `AthletX Points`.
- Short label: `pts`.
- Icon direction: reuse the existing CNX AthletX `X` mark inside a compact token. Do not introduce a generic gold coin, cash icon, wallet icon, or playful rewards mascot.
- Token style: a small circular or softly squared sage token using `--primary` for the fill and `--background` for the `X` mark. Use `--surface-alt` for containing cards and `--sand`/`--card-ring` for quiet borders.
- Accent usage: reserve `--accent` for point-spend, warning, or special attention states. Do not make the normal points balance red.
- UI copy examples:
  - `120 pts`
  - `Use 44 pts`
  - `Earn 89 pts after payment`
  - `AthletX Points`
- Checkout/account tone: practical and performance-oriented. The system should feel like earned training/store credit, not a gamified prize program.

## Files

- Create `packages/api/sql/migrations/0011_loyalty_points.sql`: ledger table and order columns.
- Modify `packages/api/sql/schema.sql`: canonical schema for fresh databases.
- Modify `packages/api/src/lib/types.ts`: checkout, order, and loyalty row types.
- Modify `packages/api/src/lib/validation.ts`: accept `redeem_points` and reject invalid values.
- Create `packages/api/src/services/loyalty.ts`: balance, redemption validation, ledger statements, earn/reversal helpers.
- Create `packages/api/src/services/loyalty.test.ts`: formula and statement behavior unit tests.
- Modify `packages/api/src/routes/checkout.ts`: mutually exclusive discounts/points, redemption ledger insert, response fields.
- Modify `packages/api/src/routes/admin/orders.ts`: award/reverse points on status transitions.
- Modify `packages/api/src/routes/payments.ts`: award/reverse points on provider webhooks.
- Modify `packages/api/src/routes/auth.ts`: award missing points for already-paid guest orders after account linking.
- Modify `packages/api/src/routes/account.ts`: expose loyalty summary and recent ledger entries.
- Modify `packages/api/src/routes/checkout.integration.test.ts`: checkout redemption integration tests.
- Modify `packages/api/src/routes/account.integration.test.ts`: account loyalty summary and guest-link earn tests.
- Modify `packages/api/src/routes/admin-orders.integration.test.ts`: paid/cancel/refund loyalty transition tests.
- Modify `packages/api/src/routes/payments-webhook.integration.test.ts`: webhook loyalty transition tests.
- Modify `packages/web/src/types/checkout.ts` and `packages/web/src/types/auth.ts`: API shape updates.
- Modify `packages/web/src/api/checkout.ts` and `packages/web/src/api/auth.ts`: account loyalty API client.
- Modify `packages/web/src/pages/CheckoutPage.vue`: points redemption UI and discount mutual exclusion.
- Modify `packages/web/src/pages/AccountPage.vue`: compact loyalty balance and recent activity.
- Modify `packages/web/src/i18n/en.json` and `packages/web/src/i18n/th.json`: localized customer strings.
- Modify `docs/plan/01-executive-summary.md`, `docs/plan/02-backend-architecture.md`, `docs/plan/03-frontend-design.md`: document loyalty behavior.

---

### Task 1: Data Model

**Files:**
- Create: `packages/api/sql/migrations/0011_loyalty_points.sql`
- Modify: `packages/api/sql/schema.sql`
- Modify: `packages/api/src/migrations.test.ts`

- [ ] **Step 1: Write the failing migration expectations**

Extend `packages/api/src/migrations.test.ts` with a test that asserts the loyalty migration exists after `0010_orders_locale.sql`:

```ts
it('includes the loyalty points migration after order locale', () => {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  expect(files).toContain('0010_orders_locale.sql')
  expect(files).toContain('0011_loyalty_points.sql')
  expect(files.indexOf('0011_loyalty_points.sql')).toBeGreaterThan(files.indexOf('0010_orders_locale.sql'))
})
```

Run: `npm test -w @cnx-athletx/api -- migrations.test.ts`

Expected: FAIL because `0011_loyalty_points.sql` does not exist.

- [ ] **Step 2: Add migration**

Create `packages/api/sql/migrations/0011_loyalty_points.sql`:

```sql
-- Account loyalty points ledger and order-level redemption accounting.

CREATE TABLE IF NOT EXISTS loyalty_point_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    order_id TEXT,
    points_delta INTEGER NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CHECK (points_delta != 0),
    CHECK (kind IN ('earn', 'redeem', 'restore', 'reverse_earn', 'manual_adjustment'))
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_created
  ON loyalty_point_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order
  ON loyalty_point_ledger(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_earn_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'earn';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_redeem_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'redeem';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_restore_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'restore';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_reverse_earn_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'reverse_earn';

ALTER TABLE orders ADD COLUMN discount_code_thb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_redeemed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_discount_thb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;

UPDATE orders
SET discount_code_thb = discount_thb
WHERE discount_thb > 0 AND (discount_code IS NOT NULL AND discount_code != '');
```

- [ ] **Step 3: Update canonical schema**

In `packages/api/sql/schema.sql`, add the same `orders` columns:

```sql
    discount_thb INTEGER NOT NULL DEFAULT 0,
    discount_code_thb INTEGER NOT NULL DEFAULT 0,
    points_redeemed INTEGER NOT NULL DEFAULT 0,
    points_discount_thb INTEGER NOT NULL DEFAULT 0,
    points_earned INTEGER NOT NULL DEFAULT 0,
    total_thb INTEGER NOT NULL,
```

Add the `loyalty_point_ledger` table after `discount_codes` and before `admin_audit_log` with the exact SQL from the migration.

- [ ] **Step 4: Verify migrations**

Run: `npm test -w @cnx-athletx/api -- migrations.test.ts`

Expected: PASS.

---

### Task 2: Loyalty Service

**Files:**
- Create: `packages/api/src/services/loyalty.ts`
- Create: `packages/api/src/services/loyalty.test.ts`
- Modify: `packages/api/src/lib/types.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/api/src/services/loyalty.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  calculateEarnedPoints,
  maxRedeemablePointsForSubtotal,
  normalizeRedeemPoints,
} from './loyalty'

describe('loyalty formulas', () => {
  it('earns 1 point per 10 THB from paid merchandise after discounts', () => {
    expect(calculateEarnedPoints({ subtotalThb: 89900, discountThb: 0 })).toBe(89)
    expect(calculateEarnedPoints({ subtotalThb: 89900, discountThb: 5000 })).toBe(84)
    expect(calculateEarnedPoints({ subtotalThb: 900, discountThb: 0 })).toBe(0)
  })

  it('caps redemption at 5 percent of subtotal and available balance', () => {
    expect(maxRedeemablePointsForSubtotal(200000)).toBe(100)
    expect(maxRedeemablePointsForSubtotal(89900)).toBe(44)
    expect(normalizeRedeemPoints({ requestedPoints: 999, availablePoints: 80, subtotalThb: 200000 })).toEqual({
      points: 80,
      discountThb: 8000,
    })
  })

  it('rejects negative or fractional point redemption', () => {
    expect(() => normalizeRedeemPoints({ requestedPoints: -1, availablePoints: 100, subtotalThb: 100000 })).toThrow('redeem_points must be a non-negative integer')
    expect(() => normalizeRedeemPoints({ requestedPoints: 1.5, availablePoints: 100, subtotalThb: 100000 })).toThrow('redeem_points must be a non-negative integer')
  })
})
```

Run: `npm test -w @cnx-athletx/api -- loyalty.test.ts`

Expected: FAIL because `services/loyalty.ts` does not exist.

- [ ] **Step 2: Add loyalty types**

Add to `packages/api/src/lib/types.ts`:

```ts
export interface LoyaltyBalanceRow {
  balance: number | null
}

export interface LoyaltyLedgerRow {
  id: number
  order_id: string | null
  points_delta: number
  kind: 'earn' | 'redeem' | 'restore' | 'reverse_earn' | 'manual_adjustment'
  reason: string
  created_at: string
}

export interface LoyaltyOrderRow {
  id: string
  user_id: string | null
  subtotal_thb: number
  discount_thb: number
  points_redeemed: number
  points_earned: number
  status: OrderStatus
}
```

- [ ] **Step 3: Implement the service**

Create `packages/api/src/services/loyalty.ts`:

```ts
import type { Env, LoyaltyBalanceRow, LoyaltyLedgerRow, LoyaltyOrderRow } from '../lib/types'
import { ORDER_STATUS, REVENUE_ORDER_STATUSES } from '../lib/orderStatus'

export const POINT_VALUE_SATANG = 100
export const EARN_SATANG_PER_POINT = 1000
export const MAX_REDEMPTION_BPS = 500

export function calculateEarnedPoints(input: { subtotalThb: number; discountThb: number }): number {
  const eligibleSatang = Math.max(0, input.subtotalThb - input.discountThb)
  return Math.floor(eligibleSatang / EARN_SATANG_PER_POINT)
}

export function maxRedeemablePointsForSubtotal(subtotalThb: number): number {
  const maxDiscountSatang = Math.floor((subtotalThb * MAX_REDEMPTION_BPS) / 10_000)
  return Math.floor(maxDiscountSatang / POINT_VALUE_SATANG)
}

export function normalizeRedeemPoints(input: {
  requestedPoints: number
  availablePoints: number
  subtotalThb: number
}): { points: number; discountThb: number } {
  if (!Number.isInteger(input.requestedPoints) || input.requestedPoints < 0) {
    throw new Error('redeem_points must be a non-negative integer')
  }

  const points = Math.min(
    input.requestedPoints,
    Math.max(0, input.availablePoints),
    maxRedeemablePointsForSubtotal(input.subtotalThb),
  )

  return { points, discountThb: points * POINT_VALUE_SATANG }
}

export async function getLoyaltyBalance(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(points_delta), 0) AS balance
     FROM loyalty_point_ledger
     WHERE user_id = ?`,
  ).bind(userId).first<LoyaltyBalanceRow>()

  return Math.max(0, row?.balance ?? 0)
}

export async function listLoyaltyEntries(env: Env, userId: string, limit = 10): Promise<LoyaltyLedgerRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, order_id, points_delta, kind, reason, created_at
     FROM loyalty_point_ledger
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  ).bind(userId, limit).all<LoyaltyLedgerRow>()

  return results
}

export function redeemPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'redeem', 'Redeemed points at checkout', ?)`,
  ).bind(input.userId, input.orderId, -input.points, input.now)
}

export function restoreRedeemedPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'restore', 'Restored points after order cancellation or refund', ?)`,
  ).bind(input.userId, input.orderId, input.points, input.now)
}

export function earnPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'earn', 'Earned points from paid order', ?)`,
  ).bind(input.userId, input.orderId, input.points, input.now)
}

export function reverseEarnedPointsStatement(env: Env, input: {
  userId: string
  orderId: string
  points: number
  now: string
}): D1PreparedStatement | null {
  if (input.points <= 0) return null
  return env.DB.prepare(
    `INSERT OR IGNORE INTO loyalty_point_ledger (user_id, order_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, 'reverse_earn', 'Reversed earned points after cancellation or refund', ?)`,
  ).bind(input.userId, input.orderId, -input.points, input.now)
}

export async function loyaltyStatementsForPaidOrder(env: Env, orderId: string, now: string): Promise<D1PreparedStatement[]> {
  const order = await env.DB.prepare(
    `SELECT id, user_id, subtotal_thb, discount_thb, points_redeemed, points_earned, status
     FROM orders WHERE id = ? LIMIT 1`,
  ).bind(orderId).first<LoyaltyOrderRow>()

  if (!order?.user_id) return []

  const points = calculateEarnedPoints({ subtotalThb: order.subtotal_thb, discountThb: order.discount_thb })
  const earn = earnPointsStatement(env, { userId: order.user_id, orderId, points, now })
  const update = env.DB.prepare(`UPDATE orders SET points_earned = ? WHERE id = ? AND points_earned = 0`).bind(points, orderId)
  return earn ? [earn, update] : [update]
}

export async function loyaltyStatementsForTerminalReversal(env: Env, orderId: string, now: string): Promise<D1PreparedStatement[]> {
  const order = await env.DB.prepare(
    `SELECT id, user_id, subtotal_thb, discount_thb, points_redeemed, points_earned, status
     FROM orders WHERE id = ? LIMIT 1`,
  ).bind(orderId).first<LoyaltyOrderRow>()

  if (!order?.user_id) return []

  const statements: D1PreparedStatement[] = []
  const restore = restoreRedeemedPointsStatement(env, { userId: order.user_id, orderId, points: order.points_redeemed, now })
  const reverse = reverseEarnedPointsStatement(env, { userId: order.user_id, orderId, points: order.points_earned, now })
  if (restore) statements.push(restore)
  if (reverse) statements.push(reverse)
  return statements
}

export async function loyaltyStatementsForLinkedPaidOrders(env: Env, userId: string, now: string): Promise<D1PreparedStatement[]> {
  const statuses = REVENUE_ORDER_STATUSES.map((status) => `'${status}'`).join(',')
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.user_id, o.subtotal_thb, o.discount_thb, o.points_redeemed, o.points_earned, o.status
     FROM orders o
     LEFT JOIN loyalty_point_ledger l ON l.order_id = o.id AND l.kind = 'earn'
     WHERE o.user_id = ?
       AND o.status IN (${statuses})
       AND l.id IS NULL`,
  ).bind(userId).all<LoyaltyOrderRow>()

  const statements: D1PreparedStatement[] = []
  for (const order of results) {
    const points = calculateEarnedPoints({ subtotalThb: order.subtotal_thb, discountThb: order.discount_thb })
    const earn = earnPointsStatement(env, { userId, orderId: order.id, points, now })
    if (earn) statements.push(earn)
    statements.push(env.DB.prepare(`UPDATE orders SET points_earned = ? WHERE id = ? AND points_earned = 0`).bind(points, order.id))
  }
  return statements
}
```

- [ ] **Step 4: Verify service tests**

Run: `npm test -w @cnx-athletx/api -- loyalty.test.ts`

Expected: PASS.

---

### Task 3: Checkout Redemption API

**Files:**
- Modify: `packages/api/src/lib/types.ts`
- Modify: `packages/api/src/lib/validation.ts`
- Modify: `packages/api/src/routes/checkout.ts`
- Modify: `packages/api/src/routes/checkout.integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

Add to `packages/api/src/routes/checkout.integration.test.ts`:

```ts
it('rejects points redemption for guests', async () => {
  const res = await workerFetch('/api/checkout', { body: checkoutBody({ redeem_points: 10 }) })
  expect(res.status).toBe(400)
  const data = await res.json() as { details: Array<{ field: string; message: string }> }
  expect(data.details).toContainEqual(expect.objectContaining({ field: 'redeem_points' }))
})

it('rejects using discount code and points together', async () => {
  const cookie = await loginAs('stacking@example.com')
  const res = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({
      customer: { name: 'Stacking User', email: 'stacking@example.com', phone: '+66812345678', address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } },
      discount_code: 'WELCOME',
      redeem_points: 10,
    }),
  })
  expect(res.status).toBe(400)
  const data = await res.json() as { details: Array<{ field: string }> }
  expect(data.details).toContainEqual(expect.objectContaining({ field: 'redeem_points' }))
})

it('redeems points up to 5 percent of subtotal', async () => {
  const cookie = await loginAs('redeem@example.com')
  await workerFetch('/api/__test-loyalty-ledger', {
    method: 'POST',
    admin: true,
    body: { email: 'redeem@example.com', points_delta: 200, kind: 'manual_adjustment', reason: 'test seed' },
  })

  const res = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({
      customer: { name: 'Redeem User', email: 'redeem@example.com', phone: '+66812345678', address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } },
      redeem_points: 999,
    }),
  })

  expect(res.status).toBe(201)
  const data = await res.json() as { discount_thb: number; points_redeemed: number; points_discount_thb: number; total_thb: number }
  expect(data.points_redeemed).toBe(44)
  expect(data.points_discount_thb).toBe(4400)
  expect(data.discount_thb).toBe(4400)
  expect(data.total_thb).toBe(89900 + 10000 - 4400)
})
```

Also update the import to include `loginAs`.

- [ ] **Step 2: Run failing checkout tests**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts`

Expected: FAIL because `redeem_points` is not supported and the test helper endpoint does not exist.

- [ ] **Step 3: Add checkout request/response types**

In `packages/api/src/lib/types.ts`, extend `CheckoutBody`:

```ts
redeem_points?: number
```

Extend `ExistingOrderRow`:

```ts
points_redeemed: number
points_discount_thb: number
```

- [ ] **Step 4: Validate redemption input**

In `validateCheckoutBody`, after `discount_code` validation:

```ts
if (b.redeem_points !== undefined && b.redeem_points !== null) {
  if (!Number.isInteger(b.redeem_points) || b.redeem_points < 0) {
    errors.push({ field: 'redeem_points', message: 'redeem_points must be a non-negative integer' })
  }
}

if (
  typeof b.discount_code === 'string' &&
  b.discount_code.trim() !== '' &&
  typeof b.redeem_points === 'number' &&
  b.redeem_points > 0
) {
  errors.push({ field: 'redeem_points', message: 'Points cannot be used with a discount code' })
}
```

- [ ] **Step 5: Add test-only ledger helper**

In `packages/api/src/index.ts`, before the 404 route, add a route only for local test environments:

```ts
router.post('/api/__test-loyalty-ledger', async (request: Request, env: Env) => {
  if (env.ENVIRONMENT) return Response.json({ error: 'Not found' }, { status: 404 })
  const { getAdminUser, parseJsonBody } = await import('./middleware/auth')
  const admin = await getAdminUser(request, env)
  if (!admin) return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  const parsed = await parseJsonBody(request)
  if (!parsed.ok) return parsed.response
  const b = parsed.data as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
  const pointsDelta = typeof b.points_delta === 'number' ? b.points_delta : Number.NaN
  const kind = typeof b.kind === 'string' ? b.kind : 'manual_adjustment'
  const reason = typeof b.reason === 'string' ? b.reason : 'test adjustment'
  if (!email || !Number.isInteger(pointsDelta) || pointsDelta === 0) {
    return Response.json({ error: 'Validation failed' }, { status: 400 })
  }
  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`).bind(email).first<{ id: string }>()
  if (!user) return Response.json({ error: 'User not found' }, { status: 404 })
  await env.DB.prepare(
    `INSERT INTO loyalty_point_ledger (user_id, points_delta, kind, reason, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(user.id, pointsDelta, kind, reason, new Date().toISOString()).run()
  return Response.json({ success: true })
})
```

- [ ] **Step 6: Apply points in checkout**

In `packages/api/src/routes/checkout.ts`, import:

```ts
import { getLoyaltyBalance, normalizeRedeemPoints, redeemPointsStatement } from '../services/loyalty'
```

Change the idempotency select to include point fields:

```sql
SELECT id, subtotal_thb, shipping_thb, discount_thb, total_thb, points_redeemed, points_discount_thb
FROM orders WHERE idempotency_key = ? LIMIT 1
```

After discount-code application and before final total:

```ts
let pointsRedeemed = 0
let pointsDiscountThb = 0

if ((data.redeem_points ?? 0) > 0) {
  if (!sessionUser) {
    return Response.json(
      { error: 'Validation failed', details: [{ field: 'redeem_points', message: 'Log in to redeem points' }] },
      { status: 400 },
    )
  }

  const balance = await getLoyaltyBalance(env, sessionUser.id)
  const redemption = normalizeRedeemPoints({
    requestedPoints: data.redeem_points ?? 0,
    availablePoints: balance,
    subtotalThb: subtotal,
  })
  pointsRedeemed = redemption.points
  pointsDiscountThb = redemption.discountThb
}
```

Change final total:

```ts
const discountCodeThb = discount.discountThb
const discountThb = discountCodeThb + pointsDiscountThb
const total = subtotal + shipping - discountThb
```

Add the redemption ledger statement to `orderStatements`, not `reserveStatements`, immediately after the `orders` insert:

```ts
const redeemStatement = sessionUser
  ? redeemPointsStatement(env, { userId: sessionUser.id, orderId, points: pointsRedeemed, now })
  : null
if (redeemStatement) orderStatements.push(redeemStatement)
```

Change the `INSERT INTO orders` column list and bind values:

```sql
subtotal_thb, shipping_thb, discount_thb, discount_code_thb,
points_redeemed, points_discount_thb, total_thb,
```

Bind:

```ts
subtotal,
shipping,
discountThb,
discountCodeThb,
pointsRedeemed,
pointsDiscountThb,
total,
```

Add `points_redeemed` and `points_discount_thb` to both idempotent and success JSON responses.

- [ ] **Step 7: Verify checkout redemption tests**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts`

Expected: PASS.

---

### Task 4: Award And Reverse Points On Order Status Changes

**Files:**
- Modify: `packages/api/src/routes/admin/orders.ts`
- Modify: `packages/api/src/routes/payments.ts`
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/routes/admin-orders.integration.test.ts`
- Modify: `packages/api/src/routes/payments-webhook.integration.test.ts`
- Modify: `packages/api/src/routes/account.integration.test.ts`

- [ ] **Step 1: Write failing transition tests**

Add these cases:

```ts
it('awards points when an authenticated order is marked paid', async () => {
  const email = 'earn@example.com'
  const cookie = await loginAs(email)
  const checkout = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({ customer: { name: 'Earn User', email, phone: '+66812345678', address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } } }),
  })
  const { order_id } = await checkout.json() as { order_id: string }

  await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { method: 'POST', admin: true })

  const summary = await workerFetch('/api/account/loyalty', { cookie })
  const data = await summary.json() as { balance_points: number }
  expect(data.balance_points).toBe(89)
})

it('restores redeemed points when unpaid order is cancelled', async () => {
  const email = 'restore@example.com'
  const cookie = await loginAs(email)
  await workerFetch('/api/__test-loyalty-ledger', { method: 'POST', admin: true, body: { email, points_delta: 100, kind: 'manual_adjustment', reason: 'test seed' } })
  const checkout = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({ customer: { name: 'Restore User', email, phone: '+66812345678', address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } }, redeem_points: 44 }),
  })
  const { order_id } = await checkout.json() as { order_id: string }

  await workerFetch(`/api/admin/orders/${order_id}/cancel`, { method: 'POST', admin: true })

  const summary = await workerFetch('/api/account/loyalty', { cookie })
  const data = await summary.json() as { balance_points: number }
  expect(data.balance_points).toBe(100)
})
```

Add one webhook test that simulates a paid outcome and checks the account balance, using the existing provider webhook test helper shape already present in `payments-webhook.integration.test.ts`.

Add one auth-linking test:

```ts
it('awards missing points for paid guest orders when the customer logs in later', async () => {
  const email = 'latepoints@example.com'
  const checkout = await workerFetch('/api/checkout', {
    body: checkoutBody({ customer: { name: 'Late Points', email, phone: '+66812345678', address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } } }),
  })
  const { order_id } = await checkout.json() as { order_id: string }
  await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { method: 'POST', admin: true })

  const cookie = await loginAs(email)
  const summary = await workerFetch('/api/account/loyalty', { cookie })
  const data = await summary.json() as { balance_points: number }
  expect(data.balance_points).toBe(89)
})
```

- [ ] **Step 2: Run failing transition tests**

Run:

```bash
npm run test:integration -w @cnx-athletx/api -- admin-orders.integration.test.ts account.integration.test.ts payments-webhook.integration.test.ts
```

Expected: FAIL because loyalty summary and status hooks are missing.

- [ ] **Step 3: Hook admin status transitions**

In `packages/api/src/routes/admin/orders.ts`, import:

```ts
import { loyaltyStatementsForPaidOrder, loyaltyStatementsForTerminalReversal } from '../../services/loyalty'
```

In `mark-paid`, before `await env.DB.batch(statements)`, append:

```ts
statements.push(...await loyaltyStatementsForPaidOrder(env, orderId, now))
```

In `cancel`, after inventory statements and before audit log:

```ts
statements.push(...await loyaltyStatementsForTerminalReversal(env, orderId, now))
```

This restores redeemed points for unpaid cancellations and reverses earned points for paid cancellations. The unique partial indexes make repeated reversal attempts idempotent.

- [ ] **Step 4: Hook provider webhooks**

In `packages/api/src/routes/payments.ts`, import:

```ts
import { loyaltyStatementsForPaidOrder, loyaltyStatementsForTerminalReversal } from '../services/loyalty'
import { ORDER_STATUS } from '../lib/orderStatus'
```

Before `await env.DB.batch([...])`, create:

```ts
const loyaltyStatements = newStatus === ORDER_STATUS.paid
  ? await loyaltyStatementsForPaidOrder(env, envelope.orderId, now)
  : newStatus === ORDER_STATUS.refunded
    ? await loyaltyStatementsForTerminalReversal(env, envelope.orderId, now)
    : []
```

Then include `...loyaltyStatements` in the same batch after the order update.

- [ ] **Step 5: Hook guest-order linking**

In `packages/api/src/routes/auth.ts`, import:

```ts
import { loyaltyStatementsForLinkedPaidOrders } from '../services/loyalty'
```

After `UPDATE orders SET user_id = ? WHERE customer_email = ? AND user_id IS NULL`, add:

```ts
const loyaltyStatements = await loyaltyStatementsForLinkedPaidOrders(env, user.id, now)
if (loyaltyStatements.length > 0) {
  await env.DB.batch(loyaltyStatements)
}
```

- [ ] **Step 6: Verify transition behavior**

Run:

```bash
npm run test:integration -w @cnx-athletx/api -- admin-orders.integration.test.ts account.integration.test.ts payments-webhook.integration.test.ts
```

Expected: PASS.

---

### Task 5: Account Loyalty API

**Files:**
- Modify: `packages/api/src/routes/account.ts`
- Modify: `packages/api/src/routes/account.integration.test.ts`

- [ ] **Step 1: Write failing account API tests**

Add:

```ts
describe('GET /api/account/loyalty', () => {
  it('returns 401 without authentication', async () => {
    const res = await workerFetch('/api/account/loyalty')
    expect(res.status).toBe(401)
  })

  it('returns balance and recent ledger entries', async () => {
    const email = 'loyalty@example.com'
    const cookie = await loginAs(email)
    await workerFetch('/api/__test-loyalty-ledger', { method: 'POST', admin: true, body: { email, points_delta: 25, kind: 'manual_adjustment', reason: 'test seed' } })

    const res = await workerFetch('/api/account/loyalty', { cookie })
    expect(res.status).toBe(200)
    const data = await res.json() as { balance_points: number; entries: Array<{ points_delta: number; reason: string }> }
    expect(data.balance_points).toBe(25)
    expect(data.entries[0].points_delta).toBe(25)
    expect(data.entries[0].reason).toBe('test seed')
  })
})
```

Run: `npm run test:integration -w @cnx-athletx/api -- account.integration.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 2: Add account route**

In `packages/api/src/routes/account.ts`, import:

```ts
import { getLoyaltyBalance, listLoyaltyEntries, maxRedeemablePointsForSubtotal } from '../services/loyalty'
```

Add route near other account GET routes:

```ts
router.get('/api/account/loyalty', async (request: Request, env: Env) => {
  const user = await getSessionUser(request, env)
  if (!user) {
    return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
  }

  try {
    const [balance, entries] = await Promise.all([
      getLoyaltyBalance(env, user.id),
      listLoyaltyEntries(env, user.id, 10),
    ])

    return Response.json({
      balance_points: balance,
      point_value_satang: 100,
      earn_rate_label: '1 point per 10 THB',
      max_redemption_percent: 5,
      entries,
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})
```

Do not expose `maxRedeemablePointsForSubtotal` from this route unless a subtotal is provided; checkout will compute the authoritative cap.

- [ ] **Step 3: Verify account API**

Run: `npm run test:integration -w @cnx-athletx/api -- account.integration.test.ts`

Expected: PASS.

---

### Task 6: Frontend Checkout And Account UI

**Files:**
- Modify: `packages/web/src/types/checkout.ts`
- Modify: `packages/web/src/types/auth.ts`
- Modify: `packages/web/src/api/auth.ts`
- Modify: `packages/web/src/pages/CheckoutPage.vue`
- Modify: `packages/web/src/pages/AccountPage.vue`
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/th.json`

- [ ] **Step 1: Update frontend types and client**

In `packages/web/src/types/checkout.ts`, add:

```ts
redeem_points?: number
```

to `CheckoutPayload`, and add to `CheckoutResponse`:

```ts
points_redeemed: number
points_discount_thb: number
```

In `packages/web/src/types/auth.ts`, add:

```ts
export interface LoyaltyEntry {
  id: number
  order_id: string | null
  points_delta: number
  kind: 'earn' | 'redeem' | 'restore' | 'reverse_earn' | 'manual_adjustment'
  reason: string
  created_at: string
}

export interface LoyaltySummary {
  balance_points: number
  point_value_satang: number
  earn_rate_label: string
  max_redemption_percent: number
  entries: LoyaltyEntry[]
}
```

In `packages/web/src/api/auth.ts`, import/export `LoyaltySummary` and add:

```ts
export async function fetchLoyaltySummary(): Promise<LoyaltySummary> {
  return apiFetch('/api/account/loyalty', { parseError: authError })
}
```

- [ ] **Step 2: Add checkout UI state**

In `CheckoutPage.vue`, import `fetchLoyaltySummary` and add:

```ts
const loyaltyBalance = ref(0)
const redeemPoints = ref(0)
const loyaltyError = ref('')

const maxRedeemablePoints = computed(() => {
  const subtotalCap = Math.floor((cart.subtotalSatang * 0.05) / 100)
  return Math.min(loyaltyBalance.value, subtotalCap)
})

const pointsDiscountPreview = computed(() => redeemPoints.value * 100)
```

After auth initialization in `onMounted`, fetch loyalty only for logged-in users:

```ts
if (auth.user) {
  try {
    const loyalty = await fetchLoyaltySummary()
    loyaltyBalance.value = loyalty.balance_points
  } catch {
    loyaltyError.value = t('checkout.pointsLoadError')
  }
}
```

Add watchers:

```ts
watch(() => form.value.discount_code, (code) => {
  if (code.trim()) redeemPoints.value = 0
})

watch(redeemPoints, (points) => {
  if (points > 0) form.value.discount_code = ''
  if (points > maxRedeemablePoints.value) redeemPoints.value = maxRedeemablePoints.value
})
```

In `submitCheckout`, include:

```ts
redeem_points: redeemPoints.value > 0 ? redeemPoints.value : undefined,
```

- [ ] **Step 3: Add checkout markup**

Place this block after the discount-code block:

```vue
<div v-if="auth.user" class="space-y-2">
  <label for="redeem-points" class="block text-sm font-medium text-foreground">
    {{ t('checkout.redeemPoints') }}
  </label>
  <div class="max-w-sm rounded-md border border-sand bg-surface-alt p-3 space-y-3">
    <div class="flex items-center justify-between text-sm">
      <span class="text-muted">{{ t('checkout.pointsAvailable') }}</span>
      <span class="font-semibold text-foreground">{{ loyaltyBalance }}</span>
    </div>
    <input
      id="redeem-points"
      v-model.number="redeemPoints"
      type="number"
      min="0"
      :max="maxRedeemablePoints"
      :disabled="!!form.discount_code.trim() || maxRedeemablePoints === 0"
      class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60"
    />
    <p class="text-xs text-muted">
      {{ t('checkout.pointsMax', { points: maxRedeemablePoints }) }}
    </p>
    <p v-if="pointsDiscountPreview > 0" class="text-xs text-primary">
      {{ t('checkout.pointsDiscountPreview', { amount: formatPrice(pointsDiscountPreview) }) }}
    </p>
    <p v-if="loyaltyError" class="text-xs text-error">{{ loyaltyError }}</p>
  </div>
</div>
```

Disable discount input when points are active:

```vue
:disabled="redeemPoints > 0"
```

In the order summary, add a preview row:

```vue
<div v-if="pointsDiscountPreview > 0" class="flex justify-between">
  <span class="text-muted">{{ t('checkout.pointsDiscount') }}</span>
  <span class="font-semibold text-primary">-{{ formatPrice(pointsDiscountPreview) }}</span>
</div>
```

- [ ] **Step 4: Add account loyalty card**

In `AccountPage.vue`, import `fetchLoyaltySummary` and `type LoyaltySummary`, add:

```ts
const loyalty = ref<LoyaltySummary | null>(null)

async function loadLoyalty() {
  try {
    loyalty.value = await fetchLoyaltySummary()
  } catch {
    loyalty.value = null
  }
}
```

Call `await loadLoyalty()` in `onMounted` before `loading.value = false`.

Place a compact card after the page header:

```vue
<div v-if="loyalty" class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
  <div class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-background font-bold">
        X
      </div>
      <div>
        <h2 class="text-xl font-bold text-foreground">{{ t('account.loyalty.title') }}</h2>
        <p class="text-sm text-muted">{{ t('account.loyalty.subtitle') }}</p>
      </div>
    </div>
    <div class="text-right">
      <p class="text-3xl font-bold text-foreground">{{ loyalty.balance_points }}</p>
      <p class="text-xs text-muted">{{ t('account.loyalty.points') }}</p>
    </div>
  </div>
  <div v-if="loyalty.entries.length" class="space-y-2">
    <div v-for="entry in loyalty.entries.slice(0, 3)" :key="entry.id" class="flex justify-between text-sm">
      <span class="text-muted">{{ entry.reason }}</span>
      <span :class="entry.points_delta > 0 ? 'text-primary' : 'text-error'">
        {{ entry.points_delta > 0 ? '+' : '' }}{{ entry.points_delta }}
      </span>
    </div>
  </div>
</div>
```

When converting the placeholder `X` to an icon, import the existing `packages/web/src/assets/brand/mark.svg` through the same asset pattern used elsewhere in the app, or create a tiny reusable `AthletXPointsToken.vue` component if checkout and account both need the token.

- [ ] **Step 5: Add translations**

Add to `packages/web/src/i18n/en.json`:

```json
"redeemPoints": "Use AthletX Points",
"pointsAvailable": "Available points",
"pointsMax": "You can use up to {points} pts on this order.",
"pointsDiscount": "AthletX Points",
"pointsDiscountPreview": "Points will reduce this order by {amount}.",
"pointsLoadError": "Unable to load AthletX Points right now."
```

under `checkout`, and:

```json
"loyalty": {
  "title": "AthletX Points",
  "subtitle": "Earn points on every paid order and use them at checkout.",
  "points": "pts"
}
```

under `account`.

Add equivalent Thai keys to `packages/web/src/i18n/th.json`:

```json
"redeemPoints": "ใช้คะแนน AthletX",
"pointsAvailable": "คะแนนที่มี",
"pointsMax": "ใช้ได้สูงสุด {points} คะแนนสำหรับคำสั่งซื้อนี้",
"pointsDiscount": "คะแนน AthletX",
"pointsDiscountPreview": "คะแนนจะลดราคาคำสั่งซื้อนี้ {amount}",
"pointsLoadError": "ไม่สามารถโหลดคะแนน AthletX ได้ในขณะนี้"
```

and:

```json
"loyalty": {
  "title": "คะแนน AthletX",
  "subtitle": "รับคะแนนจากทุกคำสั่งซื้อที่ชำระเงินแล้ว และใช้คะแนนได้ตอนชำระเงิน",
  "points": "คะแนน"
}
```

- [ ] **Step 6: Verify frontend typecheck**

Run: `npm run typecheck -w @cnx-athletx/web`

Expected: PASS.

---

### Task 7: Docs And Full Verification

**Files:**
- Modify: `docs/plan/01-executive-summary.md`
- Modify: `docs/plan/02-backend-architecture.md`
- Modify: `docs/plan/03-frontend-design.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Update docs**

Add concise notes:

- `docs/plan/01-executive-summary.md`: customers can earn AthletX Points on paid purchases and optionally redeem them for up to 5% off checkout.
- `docs/plan/02-backend-architecture.md`: loyalty uses an append-only `loyalty_point_ledger`, computed balances, checkout mutual exclusion with discount codes, and status-transition award/reversal hooks.
- `docs/plan/03-frontend-design.md`: account shows a compact AthletX Points card with an `X` token; checkout shows points redemption only for logged-in users.
- `docs/changelog.md`: under `[Unreleased]` > `Added`, add `- Added account loyalty points planning for earn-on-paid-order and capped checkout redemption.`

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm test -w @cnx-athletx/api -- loyalty.test.ts migrations.test.ts
npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts account.integration.test.ts admin-orders.integration.test.ts payments-webhook.integration.test.ts
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 3: Run full gates**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api packages/web docs
git commit -m "feat: add loyalty points redemption"
```

---

## Implementation Notes

- Do not let frontend calculations decide the redemption amount. The checkout API is authoritative.
- Keep `discount_thb` as the total customer discount to avoid changing email templates and existing order totals everywhere at once.
- Store `points_redeemed` as points, and `points_discount_thb` as satang. Avoid deriving one from the other in reports.
- The unique partial ledger indexes prevent duplicate earning, redemption restoration, and earn reversal for the same order.
- V1 redemption is all-or-lower: if the user requests more points than allowed or available, the API applies the maximum valid amount instead of failing. The UI preview should already guide the user to the same cap.

## Self-Review

- Spec coverage: all stated rules are mapped to data model, checkout, account, paid-order transitions, guest-link earning, frontend, and docs tasks.
- Placeholder scan: no `TBD`, `TODO`, or open implementation gaps remain.
- Type consistency: `redeem_points`, `points_redeemed`, `points_discount_thb`, `discount_code_thb`, and `loyalty_point_ledger` are used consistently across API, DB, and frontend tasks.
