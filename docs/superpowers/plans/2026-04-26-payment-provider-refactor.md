# Payment Provider Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardwired PromptPay + bank-transfer payment logic with a `PaymentProvider` registry, future-proofing the codebase for 2C2P (v2) and NowPayments (later) without changing user-visible behavior for manual flows.

**Architecture:** Functional registry of `PaymentProvider` objects in `packages/api/src/services/payments/`. Each provider implements `isEnabled` + `createIntent` + optional `verifyWebhook`. Checkout dispatches via the registry. Frontend switches on a discriminated `PaymentIntent` union (`instructions` | `redirect` | `sdk`). Customer picks payment method at checkout (new step before "Place order"). Schema gains a `payment_method` column on `orders` plus `provider`, `provider_txn_id`, `status`, `payload_json` on `payments`. Order status enum expands with `awaiting_gateway`, `failed`, `refunded`. New webhook route `/api/payments/:provider/webhook` is idempotent via `UNIQUE(provider, provider_txn_id)`.

**Tech Stack:** TypeScript, Cloudflare Workers, itty-router, D1 (SQLite), Vue 3 + Vite, Tailwind v4, vue-i18n. Tests via vitest (unit + integration), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-04-26-payment-provider-refactor-design.md`

---

## File Plan

**New backend files (6):**
- `packages/api/sql/migrations/0009_payment_providers.sql` — schema migration
- `packages/api/src/services/payments/types.ts` — provider interface + intent union
- `packages/api/src/services/payments/registry.ts` — provider list + lookup helpers
- `packages/api/src/services/payments/promptpay.ts` — PromptPay provider
- `packages/api/src/services/payments/bank-transfer.ts` — bank-transfer provider
- `packages/api/src/routes/payments.ts` — webhook route + status helpers

**Modified backend files (8):**
- `packages/api/sql/schema.sql` — keep canonical schema in sync with migration
- `packages/api/src/routes/health.ts` — TEST_SCHEMA mirrors migration
- `packages/api/src/lib/types.ts` — extend `SiteSettings`, add payment-method types
- `packages/api/src/lib/validation.ts` — `payment_method` validation in `validateCheckoutBody`
- `packages/api/src/routes/checkout.ts` — call registry, return `intent`
- `packages/api/src/routes/orders.ts` — add `GET /api/orders/:id/intent`
- `packages/api/src/routes/admin/settings.ts` — allow new keys, add `GET /api/payment-methods`
- `packages/api/src/services/email.ts` — add `payment_failed` and `payment_refunded` templates

**New frontend files (4):**
- `packages/web/src/api/paymentMethods.ts` — `fetchPaymentMethods`, `fetchOrderIntent`
- `packages/web/src/components/payment/PromptPayInstructions.vue`
- `packages/web/src/components/payment/BankTransferInstructions.vue`
- `packages/web/src/components/payment/PaymentMethodPicker.vue`

**Modified frontend files (5):**
- `packages/web/src/api/checkout.ts` — replace `payment_instructions` with `intent` discriminated union
- `packages/web/src/pages/CheckoutPage.vue` — add picker, dispatch by intent kind
- `packages/web/src/pages/PaymentInstructionsPage.vue` — render based on intent
- `packages/web/src/pages/AdminSettingsPage.vue` — enabled-methods checkbox section
- `packages/web/src/i18n/en.json` + `th.json` — display labels

**Test files (6):**
- `packages/api/src/services/payments/promptpay.test.ts`
- `packages/api/src/services/payments/bank-transfer.test.ts`
- `packages/api/src/services/payments/registry.test.ts`
- `packages/api/src/routes/payments-webhook.integration.test.ts`
- `packages/api/src/routes/checkout.integration.test.ts` (extend existing)
- `e2e/shopping-flow.spec.ts` (extend existing)

**Other:**
- `docs/changelog.md` — add to `[Unreleased]`

---

## Conventions

- Run `npm test --workspace=@cnx/api` for backend tests; `npm test` from repo root for full sweep.
- Each task ends with a commit. Use Conventional Commits (`feat`, `fix`, `refactor`, `test`, `chore`, `docs`).
- The repo has a hook that may run lint/types — never bypass it.
- All money is satang (THB × 100).
- TDD: write failing test first, run to confirm fail, write minimal impl, run to confirm pass, commit.

---

## Task 1: Migration `0009_payment_providers.sql`

**Files:**
- Create: `packages/api/sql/migrations/0009_payment_providers.sql`
- Modify: `packages/api/sql/schema.sql` (lines 145-203 for orders + payments)

**Background:** SQLite cannot ALTER a CHECK constraint. To change `orders.status` enum and `payments.method` enum, we use the table-rebuild pattern: create new table with new constraints, copy rows, drop old, rename new, recreate indexes.

- [ ] **Step 1: Create the migration file**

Create `packages/api/sql/migrations/0009_payment_providers.sql`:

```sql
-- 0009_payment_providers.sql
-- Payment provider abstraction: payment_method on orders, expanded statuses,
-- provider/txn columns on payments, webhook idempotency index, enabled-methods setting.

-- 1. Add payment_method to orders
ALTER TABLE orders ADD COLUMN payment_method TEXT;

-- 2. Backfill payment_method from existing payments rows
UPDATE orders SET payment_method = (
  SELECT method FROM payments WHERE payments.order_id = orders.id LIMIT 1
);

-- 3. Rebuild orders to expand status CHECK constraint.
CREATE TABLE orders_new (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address_line1 TEXT NOT NULL,
    shipping_address_line2 TEXT,
    district TEXT NOT NULL,
    province TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    subtotal_thb INTEGER NOT NULL,
    shipping_thb INTEGER NOT NULL,
    discount_thb INTEGER NOT NULL DEFAULT 0,
    total_thb INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    idempotency_key TEXT NOT NULL UNIQUE,
    discount_code TEXT,
    payment_method TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN (
      'pending_payment', 'awaiting_gateway', 'paid', 'failed',
      'packed', 'shipped', 'delivered', 'refunded', 'cancelled'
    ))
);

INSERT INTO orders_new (
    id, user_id, customer_name, customer_email, customer_phone,
    shipping_address_line1, shipping_address_line2, district, province, postal_code,
    subtotal_thb, shipping_thb, discount_thb, total_thb,
    status, idempotency_key, discount_code, payment_method,
    created_at, updated_at
)
SELECT
    id, user_id, customer_name, customer_email, customer_phone,
    shipping_address_line1, shipping_address_line2, district, province, postal_code,
    subtotal_thb, shipping_thb, discount_thb, total_thb,
    status, idempotency_key, discount_code, payment_method,
    created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- 4. Rebuild payments to drop method CHECK and add provider columns
CREATE TABLE payments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL,
    provider TEXT,
    provider_txn_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT,
    reference TEXT,
    amount_thb INTEGER NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

INSERT INTO payments_new (
    id, order_id, method, provider, provider_txn_id, status, payload_json,
    reference, amount_thb, verified_at, verified_by, created_at
)
SELECT
    id, order_id, method,
    method,                                                  -- backfill provider := method
    NULL,
    CASE WHEN verified_at IS NOT NULL THEN 'verified' ELSE 'pending' END,
    NULL,
    reference, amount_thb, verified_at, verified_by, created_at
FROM payments;

DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_at ON payments(verified_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn
  ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;

-- 5. Default payment_methods_enabled setting
INSERT INTO site_settings (key, value)
VALUES ('payment_methods_enabled', '["promptpay","bank_transfer"]')
ON CONFLICT(key) DO NOTHING;
```

- [ ] **Step 2: Update `packages/api/sql/schema.sql` to mirror final state**

Replace the `orders` table block (lines 146-174) with:

```sql
-- orders table
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address_line1 TEXT NOT NULL,
    shipping_address_line2 TEXT,
    district TEXT NOT NULL,
    province TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    subtotal_thb INTEGER NOT NULL,
    shipping_thb INTEGER NOT NULL,
    discount_thb INTEGER NOT NULL DEFAULT 0,
    total_thb INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    idempotency_key TEXT NOT NULL UNIQUE,
    discount_code TEXT,
    payment_method TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN (
      'pending_payment', 'awaiting_gateway', 'paid', 'failed',
      'packed', 'shipped', 'delivered', 'refunded', 'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
```

Replace the `payments` table block (lines 191-206) with:

```sql
-- payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL,
    provider TEXT,
    provider_txn_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT,
    reference TEXT,
    amount_thb INTEGER NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_at ON payments(verified_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn
  ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;
```

- [ ] **Step 3: Update `packages/api/sql/seed.sql` to add the enabled-methods setting**

Modify the `INSERT INTO site_settings ...` block (around line 44) to append one line. Replace:

```sql
INSERT INTO site_settings (key, value) VALUES
('shipping_flat_rate', '10000'),
('shipping_free_threshold', '0'),
('promptpay_number', '0812345678'),
('bank_name', 'Kasikorn Bank'),
('bank_account_name', 'CNX AthletX Co., Ltd.'),
('bank_account_number', '123-4-56789-0'),
('payment_deadline_hours', '24');
```

With:

```sql
INSERT INTO site_settings (key, value) VALUES
('shipping_flat_rate', '10000'),
('shipping_free_threshold', '0'),
('promptpay_number', '0812345678'),
('bank_name', 'Kasikorn Bank'),
('bank_account_name', 'CNX AthletX Co., Ltd.'),
('bank_account_number', '123-4-56789-0'),
('payment_deadline_hours', '24'),
('payment_methods_enabled', '["promptpay","bank_transfer"]');
```

- [ ] **Step 4: Commit**

```bash
git add packages/api/sql/migrations/0009_payment_providers.sql packages/api/sql/schema.sql packages/api/sql/seed.sql
git commit -m "feat(api): migration 0009 for payment provider abstraction

Add payment_method to orders. Expand orders.status enum (awaiting_gateway,
failed, refunded). Add provider/provider_txn_id/status/payload_json to
payments with UNIQUE(provider, provider_txn_id) for webhook idempotency.
Seed payment_methods_enabled site setting."
```

---

## Task 2: Update `health.ts` TEST_SCHEMA + TEST_SEED

**Files:**
- Modify: `packages/api/src/routes/health.ts:5-7`

The TEST_SCHEMA + TEST_SEED constants are concatenated SQL strings used by integration tests. They must mirror the new migrated schema exactly.

- [ ] **Step 1: Update the orders table CREATE in TEST_SCHEMA**

In `packages/api/src/routes/health.ts`, find the substring (inside the giant single-line `TEST_SCHEMA` constant):

```
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY,user_id TEXT,customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,customer_phone TEXT NOT NULL,shipping_address_line1 TEXT NOT NULL,shipping_address_line2 TEXT,district TEXT NOT NULL,province TEXT NOT NULL,postal_code TEXT NOT NULL,subtotal_thb INTEGER NOT NULL,shipping_thb INTEGER NOT NULL,discount_thb INTEGER NOT NULL DEFAULT 0,total_thb INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending_payment',idempotency_key TEXT NOT NULL UNIQUE,discount_code TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,CHECK (status IN ('pending_payment','paid','packed','shipped','delivered','cancelled')));
```

Replace with:

```
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY,user_id TEXT,customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,customer_phone TEXT NOT NULL,shipping_address_line1 TEXT NOT NULL,shipping_address_line2 TEXT,district TEXT NOT NULL,province TEXT NOT NULL,postal_code TEXT NOT NULL,subtotal_thb INTEGER NOT NULL,shipping_thb INTEGER NOT NULL,discount_thb INTEGER NOT NULL DEFAULT 0,total_thb INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending_payment',idempotency_key TEXT NOT NULL UNIQUE,discount_code TEXT,payment_method TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,CHECK (status IN ('pending_payment','awaiting_gateway','paid','failed','packed','shipped','delivered','refunded','cancelled')));
```

- [ ] **Step 2: Update the payments table CREATE in TEST_SCHEMA**

Find:

```
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,method TEXT NOT NULL,reference TEXT,amount_thb INTEGER NOT NULL,verified_at TEXT,verified_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,CHECK (method IN ('promptpay','bank_transfer')));
```

Replace with:

```
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,method TEXT NOT NULL,provider TEXT,provider_txn_id TEXT,status TEXT NOT NULL DEFAULT 'pending',payload_json TEXT,reference TEXT,amount_thb INTEGER NOT NULL,verified_at TEXT,verified_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;
```

- [ ] **Step 3: Update TEST_SEED in `health.ts:7` to include `payment_methods_enabled`**

Find inside the `TEST_SEED` constant:

```
INSERT INTO site_settings (key,value) VALUES ('shipping_flat_rate','10000'),('shipping_free_threshold','0'),('promptpay_number','0812345678'),('bank_name','Kasikorn Bank'),('bank_account_name','CNX AthletX Co., Ltd.'),('bank_account_number','123-4-56789-0'),('payment_deadline_hours','24');
```

Replace with:

```
INSERT INTO site_settings (key,value) VALUES ('shipping_flat_rate','10000'),('shipping_free_threshold','0'),('promptpay_number','0812345678'),('bank_name','Kasikorn Bank'),('bank_account_name','CNX AthletX Co., Ltd.'),('bank_account_number','123-4-56789-0'),('payment_deadline_hours','24'),('payment_methods_enabled','["promptpay","bank_transfer"]');
```

- [ ] **Step 4: Run existing tests to verify schema parses**

Run: `npm test --workspace=@cnx/api`
Expected: All existing tests still pass (no behavior changes yet, only schema additions). Some checkout tests may fail because they don't pass `payment_method` — that's OK, they'll be addressed in Task 8. Note any failures.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/health.ts
git commit -m "test(api): mirror migration 0009 in TEST_SCHEMA"
```

---

## Task 3: Extend `lib/types.ts` for payment providers

**Files:**
- Modify: `packages/api/src/lib/types.ts:124-131` (SiteSettings) and append new types

- [ ] **Step 1: Extend `SiteSettings` interface to include `payment_methods_enabled`**

In `packages/api/src/lib/types.ts`, replace the `SiteSettings` block:

```ts
export interface SiteSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
  promptpay_number: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
}
```

with:

```ts
export interface SiteSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
  promptpay_number: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  payment_methods_enabled: string[]
}
```

- [ ] **Step 2: Add `SiteSettingsMap` and payment-provider types at end of `types.ts`**

Append at the bottom of `packages/api/src/lib/types.ts`:

```ts
// --- Payment provider types ---

export type ProviderId = 'promptpay' | 'bank_transfer' | '2c2p' | 'nowpayments'

export type SiteSettingsMap = Record<string, string>

export type PaymentIntent =
  | { kind: 'instructions'; provider: ProviderId; instructions: Record<string, unknown> }
  | { kind: 'redirect'; provider: ProviderId; url: string; expires_at?: string }
  | { kind: 'sdk'; provider: ProviderId; client_token: string; provider_data: unknown }

export type WebhookOutcome = 'paid' | 'failed' | 'refunded'

export type WebhookResult =
  | { ok: true; order_id: string; provider_txn_id: string; status: WebhookOutcome; raw: unknown }
  | { ok: false; reason: string }

export interface CheckoutOrderForIntent {
  id: string
  total_thb: number
  customer_email: string
}
```

- [ ] **Step 3: Extend `CheckoutBody` to require `payment_method`**

Find in `types.ts:109-114`:

```ts
export interface CheckoutBody {
  items: CheckoutItem[]
  customer: CheckoutCustomer
  idempotency_key: string
  discount_code?: string
}
```

Replace with:

```ts
export interface CheckoutBody {
  items: CheckoutItem[]
  customer: CheckoutCustomer
  idempotency_key: string
  discount_code?: string
  payment_method: ProviderId
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm test --workspace=@cnx/api -- --run`
Expected: Compiles. Tests for checkout body fail because real callers don't pass `payment_method` yet — note as expected.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/types.ts
git commit -m "feat(api): add payment provider types

Extend SiteSettings with payment_methods_enabled. Introduce ProviderId,
PaymentIntent discriminated union, WebhookResult, and CheckoutBody.payment_method."
```

---

## Task 4: Create `services/payments/types.ts` (provider interface)

**Files:**
- Create: `packages/api/src/services/payments/types.ts`

This file exports the `PaymentProvider` interface used by all providers. Lives in services/ so providers can import from `./types` (avoids circular deps with lib/types).

- [ ] **Step 1: Create the file with the interface**

Create `packages/api/src/services/payments/types.ts`:

```ts
import type {
  Env,
  ProviderId,
  PaymentIntent,
  WebhookResult,
  CheckoutOrderForIntent,
  SiteSettingsMap,
} from '../../lib/types'

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
    env: Env
  }): Promise<PaymentIntent>
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/api/src/services/payments/types.ts
git commit -m "feat(api): add PaymentProvider interface"
```

---

## Task 5: Implement PromptPay provider (TDD)

**Files:**
- Create: `packages/api/src/services/payments/promptpay.test.ts`
- Create: `packages/api/src/services/payments/promptpay.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/api/src/services/payments/promptpay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { promptpayProvider } from './promptpay'
import type { Env } from '../../lib/types'

const fakeEnv = {} as Env

describe('promptpayProvider', () => {
  it('id is "promptpay"', () => {
    expect(promptpayProvider.id).toBe('promptpay')
  })

  it('displayName has en and th', () => {
    expect(promptpayProvider.displayName.en).toBe('PromptPay')
    expect(promptpayProvider.displayName.th).toBeTruthy()
  })

  it('isEnabled false when promptpay_number missing', () => {
    expect(promptpayProvider.isEnabled({})).toBe(false)
    expect(promptpayProvider.isEnabled({ promptpay_number: '' })).toBe(false)
  })

  it('isEnabled true when promptpay_number set', () => {
    expect(promptpayProvider.isEnabled({ promptpay_number: '0812345678' })).toBe(true)
  })

  it('createIntent returns instructions intent with QR url and amount', async () => {
    const intent = await promptpayProvider.createIntent({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: { promptpay_number: '0812345678' },
      env: fakeEnv,
    })
    expect(intent.kind).toBe('instructions')
    expect(intent.provider).toBe('promptpay')
    if (intent.kind !== 'instructions') throw new Error('expected instructions')
    expect(intent.instructions.promptpay_number).toBe('0812345678')
    expect(intent.instructions.amount_thb).toBe('1699.00')
    expect(intent.instructions.qr_url).toBe('https://promptpay.io/0812345678/1699.00.png')
  })

  it('createIntent throws when promptpay_number absent', async () => {
    await expect(
      promptpayProvider.createIntent({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
        env: fakeEnv,
      })
    ).rejects.toThrow(/promptpay_number/)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test --workspace=@cnx/api -- promptpay.test`
Expected: FAIL — `Cannot find module './promptpay'`.

- [ ] **Step 3: Implement the provider**

Create `packages/api/src/services/payments/promptpay.ts`:

```ts
import type { PaymentProvider } from './types'

export const promptpayProvider: PaymentProvider = {
  id: 'promptpay',
  displayName: { en: 'PromptPay', th: 'พร้อมเพย์' },

  isEnabled(settings) {
    const num = settings.promptpay_number
    return typeof num === 'string' && num.trim() !== ''
  },

  async createIntent({ order, settings }) {
    const num = settings.promptpay_number
    if (!num || num.trim() === '') {
      throw new Error('promptpay_number setting is required')
    }
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      kind: 'instructions',
      provider: 'promptpay',
      instructions: {
        promptpay_number: num,
        amount_thb: amountThb,
        qr_url: `https://promptpay.io/${num}/${amountThb}.png`,
      },
    }
  },
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test --workspace=@cnx/api -- promptpay.test`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/payments/promptpay.ts packages/api/src/services/payments/promptpay.test.ts
git commit -m "feat(api): add promptpay payment provider"
```

---

## Task 6: Implement bank-transfer provider (TDD)

**Files:**
- Create: `packages/api/src/services/payments/bank-transfer.test.ts`
- Create: `packages/api/src/services/payments/bank-transfer.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/api/src/services/payments/bank-transfer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bankTransferProvider } from './bank-transfer'
import type { Env } from '../../lib/types'

const fakeEnv = {} as Env

describe('bankTransferProvider', () => {
  it('id is "bank_transfer"', () => {
    expect(bankTransferProvider.id).toBe('bank_transfer')
  })

  it('isEnabled false when any bank field missing', () => {
    expect(bankTransferProvider.isEnabled({})).toBe(false)
    expect(bankTransferProvider.isEnabled({ bank_name: 'X' })).toBe(false)
    expect(bankTransferProvider.isEnabled({ bank_name: 'X', bank_account_name: 'Y' })).toBe(false)
  })

  it('isEnabled true when all 3 bank fields set', () => {
    expect(
      bankTransferProvider.isEnabled({
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX',
        bank_account_number: '123-4',
      })
    ).toBe(true)
  })

  it('createIntent returns instructions intent with bank fields', async () => {
    const intent = await bankTransferProvider.createIntent({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: {
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX AthletX Co., Ltd.',
        bank_account_number: '123-4-56789-0',
      },
      env: fakeEnv,
    })
    expect(intent.kind).toBe('instructions')
    if (intent.kind !== 'instructions') throw new Error('expected instructions')
    expect(intent.instructions.bank_name).toBe('Kasikorn')
    expect(intent.instructions.account_name).toBe('CNX AthletX Co., Ltd.')
    expect(intent.instructions.account_number).toBe('123-4-56789-0')
    expect(intent.instructions.amount_thb).toBe('1699.00')
  })

  it('createIntent throws when bank fields missing', async () => {
    await expect(
      bankTransferProvider.createIntent({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
        env: fakeEnv,
      })
    ).rejects.toThrow(/bank/i)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test --workspace=@cnx/api -- bank-transfer.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider**

Create `packages/api/src/services/payments/bank-transfer.ts`:

```ts
import type { PaymentProvider } from './types'

const REQUIRED_KEYS = ['bank_name', 'bank_account_name', 'bank_account_number'] as const

export const bankTransferProvider: PaymentProvider = {
  id: 'bank_transfer',
  displayName: { en: 'Bank transfer', th: 'โอนเงินผ่านธนาคาร' },

  isEnabled(settings) {
    return REQUIRED_KEYS.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
  },

  async createIntent({ order, settings }) {
    for (const k of REQUIRED_KEYS) {
      if (!settings[k] || settings[k].trim() === '') {
        throw new Error(`bank-transfer setting "${k}" is required`)
      }
    }
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      kind: 'instructions',
      provider: 'bank_transfer',
      instructions: {
        bank_name: settings.bank_name,
        account_name: settings.bank_account_name,
        account_number: settings.bank_account_number,
        amount_thb: amountThb,
      },
    }
  },
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test --workspace=@cnx/api -- bank-transfer.test`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/payments/bank-transfer.ts packages/api/src/services/payments/bank-transfer.test.ts
git commit -m "feat(api): add bank-transfer payment provider"
```

---

## Task 7: Implement registry + helpers (TDD)

**Files:**
- Create: `packages/api/src/services/payments/registry.test.ts`
- Create: `packages/api/src/services/payments/registry.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/api/src/services/payments/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getProvider, listEnabledProviders, parseEnabledMethods } from './registry'

describe('payments registry', () => {
  it('getProvider resolves promptpay', () => {
    const p = getProvider('promptpay')
    expect(p?.id).toBe('promptpay')
  })

  it('getProvider resolves bank_transfer', () => {
    const p = getProvider('bank_transfer')
    expect(p?.id).toBe('bank_transfer')
  })

  it('getProvider returns null for unknown id', () => {
    expect(getProvider('unknown')).toBeNull()
    expect(getProvider('2c2p')).toBeNull()  // not registered yet
  })

  it('parseEnabledMethods parses JSON array', () => {
    expect(parseEnabledMethods('["promptpay","bank_transfer"]')).toEqual(['promptpay', 'bank_transfer'])
  })

  it('parseEnabledMethods returns empty array for invalid JSON', () => {
    expect(parseEnabledMethods('not json')).toEqual([])
    expect(parseEnabledMethods(undefined)).toEqual([])
    expect(parseEnabledMethods('{"x":1}')).toEqual([])
  })

  it('listEnabledProviders filters to enabled + isEnabled', () => {
    const enabled = listEnabledProviders({
      payment_methods_enabled: '["promptpay","bank_transfer"]',
      promptpay_number: '0812345678',
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
    })
    expect(enabled.map((p) => p.id)).toEqual(['promptpay'])
  })

  it('listEnabledProviders empty when payment_methods_enabled missing', () => {
    expect(listEnabledProviders({ promptpay_number: '0812345678' })).toEqual([])
  })

  it('listEnabledProviders empty when method id not in registry', () => {
    expect(listEnabledProviders({ payment_methods_enabled: '["nonexistent"]' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test --workspace=@cnx/api -- registry.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement registry**

Create `packages/api/src/services/payments/registry.ts`:

```ts
import type { SiteSettingsMap } from '../../lib/types'
import type { PaymentProvider } from './types'
import { promptpayProvider } from './promptpay'
import { bankTransferProvider } from './bank-transfer'

const ALL: PaymentProvider[] = [promptpayProvider, bankTransferProvider]

export function getProvider(id: string): PaymentProvider | null {
  return ALL.find((p) => p.id === id) ?? null
}

export function parseEnabledMethods(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function listEnabledProviders(settings: SiteSettingsMap): PaymentProvider[] {
  const enabledIds = new Set(parseEnabledMethods(settings.payment_methods_enabled))
  return ALL.filter((p) => enabledIds.has(p.id) && p.isEnabled(settings))
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test --workspace=@cnx/api -- registry.test`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/payments/registry.ts packages/api/src/services/payments/registry.test.ts
git commit -m "feat(api): add payment provider registry"
```

---

## Task 8: Add `payment_method` validation in `validateCheckoutBody`

**Files:**
- Modify: `packages/api/src/lib/validation.ts:135-227`

- [ ] **Step 1: Write failing test in `validation.test.ts`**

Open `packages/api/src/lib/validation.test.ts` (existing). Add new tests:

```ts
import { describe, it, expect } from 'vitest'
import { validateCheckoutBody } from './validation'

const validBody = {
  items: [{ product_id: 1, quantity: 1 }],
  customer: {
    name: 'Alice Test',
    email: 'alice@example.com',
    phone: '+66812345678',
    address: {
      line1: '123 Main Street',
      district: 'Mueang',
      province: 'Chiang Mai',
      postal_code: '50000',
    },
  },
  idempotency_key: 'idem-1',
  payment_method: 'promptpay',
}

describe('validateCheckoutBody payment_method', () => {
  it('accepts promptpay', () => {
    const { errors, data } = validateCheckoutBody({ ...validBody, payment_method: 'promptpay' })
    expect(errors).toEqual([])
    expect(data?.payment_method).toBe('promptpay')
  })

  it('accepts bank_transfer', () => {
    const { errors } = validateCheckoutBody({ ...validBody, payment_method: 'bank_transfer' })
    expect(errors).toEqual([])
  })

  it('rejects when payment_method missing', () => {
    const { payment_method, ...withoutMethod } = validBody
    const { errors } = validateCheckoutBody(withoutMethod)
    expect(errors.find((e) => e.field === 'payment_method')).toBeDefined()
  })

  it('rejects when payment_method not in registry', () => {
    const { errors } = validateCheckoutBody({ ...validBody, payment_method: 'bitcoin' })
    expect(errors.find((e) => e.field === 'payment_method')).toBeDefined()
  })

  it('rejects when payment_method is not a string', () => {
    const { errors } = validateCheckoutBody({ ...validBody, payment_method: 123 })
    expect(errors.find((e) => e.field === 'payment_method')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test --workspace=@cnx/api -- validation.test`
Expected: FAIL — these new tests don't pass because validator doesn't enforce `payment_method` yet.

- [ ] **Step 3: Add validation logic**

In `packages/api/src/lib/validation.ts`, add an import near the top (after existing imports):

```ts
import { getProvider } from '../services/payments/registry'
```

Then in `validateCheckoutBody`, add this block immediately before the final `if (errors.length > 0) {` (around line 222):

```ts
  if (typeof b.payment_method !== 'string' || b.payment_method.trim() === '') {
    errors.push({ field: 'payment_method', message: 'payment_method is required' })
  } else if (!getProvider(b.payment_method)) {
    errors.push({ field: 'payment_method', message: `payment_method "${b.payment_method}" is not supported` })
  }
```

Note: enabled-state filtering happens in the route (because that needs DB settings). Validator only checks the string is registered.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test --workspace=@cnx/api -- validation.test`
Expected: PASS, including the new payment_method tests.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/validation.ts packages/api/src/lib/validation.test.ts
git commit -m "feat(api): validate payment_method in checkout body"
```

---

## Task 9: Refactor `checkout.ts` to use the registry

**Files:**
- Modify: `packages/api/src/routes/checkout.ts` (multiple sections)

This is the biggest change. The route stops returning the fixed `payment_instructions` shape and instead returns a `intent` discriminated union built by the chosen provider. Also stores `payment_method` on the new order row.

- [ ] **Step 1: Update imports + settings fetch**

In `packages/api/src/routes/checkout.ts`, change the imports block (lines 1-20) to add the registry and PaymentIntent:

Replace:

```ts
import { sendOrderEmail, sendAdminNewOrderEmail } from '../services/email'
import type { EmailItem } from '../services/email'
import { generateULID } from '../lib/ulid'
import { pickUnitPrice, type PriceTier } from '../lib/pricing'
```

With:

```ts
import { sendOrderEmail, sendAdminNewOrderEmail } from '../services/email'
import type { EmailItem } from '../services/email'
import { generateULID } from '../lib/ulid'
import { pickUnitPrice, type PriceTier } from '../lib/pricing'
import { getProvider, listEnabledProviders } from '../services/payments/registry'
import type { PaymentIntent, SiteSettingsMap } from '../lib/types'
```

- [ ] **Step 2: Extend the settings fetch to include `payment_methods_enabled`**

Find the `// --- Fetch site settings ---` block (lines 149-174) and replace the SQL `IN` list and the settings object construction to include the new key. Replace:

```ts
    let settings: SiteSettings
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings WHERE key IN (
          'shipping_flat_rate', 'shipping_free_threshold',
          'promptpay_number', 'bank_name', 'bank_account_name', 'bank_account_number'
        )`
      ).all<{ key: string; value: string }>()

      const settingsMap = new Map<string, string>()
      for (const row of results) {
        settingsMap.set(row.key, row.value)
      }

      settings = {
        shipping_flat_rate: parseInt(settingsMap.get('shipping_flat_rate') ?? '10000', 10),
        shipping_free_threshold: parseInt(settingsMap.get('shipping_free_threshold') ?? '0', 10),
        promptpay_number: settingsMap.get('promptpay_number') ?? '',
        bank_name: settingsMap.get('bank_name') ?? '',
        bank_account_name: settingsMap.get('bank_account_name') ?? '',
        bank_account_number: settingsMap.get('bank_account_number') ?? '',
      }
    } catch {
      return Response.json({ error: 'Database error fetching site settings' }, { status: 500 })
    }
```

With:

```ts
    let settings: SiteSettings
    let settingsMap: SiteSettingsMap
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings WHERE key IN (
          'shipping_flat_rate', 'shipping_free_threshold',
          'promptpay_number', 'bank_name', 'bank_account_name', 'bank_account_number',
          'payment_methods_enabled'
        )`
      ).all<{ key: string; value: string }>()

      settingsMap = {}
      for (const row of results) {
        settingsMap[row.key] = row.value
      }

      settings = {
        shipping_flat_rate: parseInt(settingsMap.shipping_flat_rate ?? '10000', 10),
        shipping_free_threshold: parseInt(settingsMap.shipping_free_threshold ?? '0', 10),
        promptpay_number: settingsMap.promptpay_number ?? '',
        bank_name: settingsMap.bank_name ?? '',
        bank_account_name: settingsMap.bank_account_name ?? '',
        bank_account_number: settingsMap.bank_account_number ?? '',
        payment_methods_enabled: [], // not used here, use settingsMap for provider lookup
      }
    } catch {
      return Response.json({ error: 'Database error fetching site settings' }, { status: 500 })
    }
```

- [ ] **Step 3: Reject when method not in enabled set**

Immediately after the settings fetch block (before `// --- Fetch price tiers`), add:

```ts
    // --- Verify chosen payment method is enabled ---
    const provider = getProvider(data.payment_method)
    if (!provider) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [{ field: 'payment_method', message: `payment_method "${data.payment_method}" is not supported` }],
        },
        { status: 400 }
      )
    }
    const enabledIds = new Set(listEnabledProviders(settingsMap).map((p) => p.id))
    if (!enabledIds.has(provider.id)) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [{ field: 'payment_method', message: `payment_method "${provider.id}" is currently disabled` }],
        },
        { status: 400 }
      )
    }
```

- [ ] **Step 4: Add `payment_method` to the orders INSERT**

Find the INSERT statement (lines 364-394) and update both the column list and the bind values.

Replace:

```ts
      env.DB.prepare(
        `INSERT INTO orders (
          id, user_id, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_address_line2,
          district, province, postal_code,
          subtotal_thb, shipping_thb, discount_thb, total_thb,
          status, idempotency_key, discount_code,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`
      ).bind(
        orderId,
        sessionUser?.id ?? null,
        data.customer.name.trim(),
        data.customer.email.toLowerCase().trim(),
        data.customer.phone.trim(),
        data.customer.address.line1.trim(),
        data.customer.address.line2?.trim() ?? null,
        data.customer.address.district.trim(),
        data.customer.address.province.trim(),
        data.customer.address.postal_code,
        subtotal,
        shipping,
        discountThb,
        total,
        data.idempotency_key,
        discountCodeRow ? discountCodeRow.code : null,
        now,
        now
      )
```

With:

```ts
      env.DB.prepare(
        `INSERT INTO orders (
          id, user_id, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_address_line2,
          district, province, postal_code,
          subtotal_thb, shipping_thb, discount_thb, total_thb,
          status, idempotency_key, discount_code, payment_method,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        sessionUser?.id ?? null,
        data.customer.name.trim(),
        data.customer.email.toLowerCase().trim(),
        data.customer.phone.trim(),
        data.customer.address.line1.trim(),
        data.customer.address.line2?.trim() ?? null,
        data.customer.address.district.trim(),
        data.customer.address.province.trim(),
        data.customer.address.postal_code,
        subtotal,
        shipping,
        discountThb,
        total,
        data.idempotency_key,
        discountCodeRow ? discountCodeRow.code : null,
        provider.id,
        now,
        now
      )
```

- [ ] **Step 5: Replace `payment_instructions` response with `intent`**

Find the response block (lines 482-511) and replace:

```ts
    // --- Build payment instructions ---
    const totalTHB = (total / 100).toFixed(2)
    const promptpayUrl = settings.promptpay_number
      ? `https://promptpay.io/${settings.promptpay_number}/${totalTHB}.png`
      : null

    return Response.json(
      {
        order_id: orderId,
        subtotal_thb: subtotal,
        shipping_thb: shipping,
        discount_thb: discountThb,
        total_thb: total,
        payment_instructions: {
          promptpay: promptpayUrl
            ? {
                number: settings.promptpay_number,
                qr_url: promptpayUrl,
              }
            : null,
          bank_transfer: {
            bank_name: settings.bank_name,
            account_name: settings.bank_account_name,
            account_number: settings.bank_account_number,
          },
          amount_thb: totalTHB,
        },
      },
      { status: 201 }
    )
```

With:

```ts
    // --- Build payment intent via provider ---
    let intent: PaymentIntent
    try {
      intent = await provider.createIntent({
        order: { id: orderId, total_thb: total, customer_email: data.customer.email.toLowerCase().trim() },
        settings: settingsMap,
        env,
      })
    } catch (err) {
      console.error('createIntent failed:', err)
      return Response.json({ error: 'Failed to initialize payment' }, { status: 500 })
    }

    return Response.json(
      {
        order_id: orderId,
        subtotal_thb: subtotal,
        shipping_thb: shipping,
        discount_thb: discountThb,
        total_thb: total,
        intent,
      },
      { status: 201 }
    )
```

- [ ] **Step 6: Run integration tests**

Run: `npm test --workspace=@cnx/api -- checkout.integration`
Expected: Some tests fail because they don't send `payment_method`. We'll fix them in Task 10.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/checkout.ts
git commit -m "refactor(api): dispatch checkout payment via provider registry

POST /api/checkout now requires payment_method, persists it on the order,
and returns a discriminated intent built by the resolved provider."
```

---

## Task 10: Update existing checkout integration tests

**Files:**
- Modify: `packages/api/src/routes/checkout.integration.test.ts`

- [ ] **Step 1: Read the existing test file to find checkout payloads**

Run: `grep -n "idempotency_key" packages/api/src/routes/checkout.integration.test.ts | head -20`

Identify every test body that POSTs to `/api/checkout`. Each one needs `payment_method: 'promptpay'` (default for compatibility).

- [ ] **Step 2: Add `payment_method: 'promptpay'` to every checkout body**

For each request body literal that includes `idempotency_key`, add `payment_method: 'promptpay'`. The exact line counts depend on the file; use grep to enumerate.

Then update all assertions that read `body.payment_instructions` to read `body.intent.instructions` instead. The shape changes:
- old: `body.payment_instructions.promptpay.number` → new: `body.intent.instructions.promptpay_number`
- old: `body.payment_instructions.promptpay.qr_url` → new: `body.intent.instructions.qr_url`
- old: `body.payment_instructions.bank_transfer.bank_name` → new: (only when `payment_method: 'bank_transfer'`) `body.intent.instructions.bank_name`
- old: `body.payment_instructions.amount_thb` → new: `body.intent.instructions.amount_thb`

- [ ] **Step 3: Add new tests for payment_method handling**

At the bottom of the existing `describe('POST /api/checkout')` block (or in a new block), add:

```ts
  it('rejects when payment_method missing', async () => {
    const env = await makeTestEnv()
    const body = makeValidCheckoutBody()
    delete (body as Record<string, unknown>).payment_method
    const res = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.details.find((d: { field: string }) => d.field === 'payment_method')).toBeDefined()
  })

  it('rejects payment_method not in registry', async () => {
    const env = await makeTestEnv()
    const body = { ...makeValidCheckoutBody(), payment_method: 'bitcoin' }
    const res = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects payment_method not in enabled list', async () => {
    const env = await makeTestEnv()
    await env.DB.prepare(`UPDATE site_settings SET value = '["bank_transfer"]' WHERE key = 'payment_methods_enabled'`).run()
    const body = { ...makeValidCheckoutBody(), payment_method: 'promptpay' }
    const res = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.details.find((d: { field: string }) => d.message.includes('disabled'))).toBeDefined()
  })

  it('returns bank_transfer intent when chosen', async () => {
    const env = await makeTestEnv()
    const body = { ...makeValidCheckoutBody(), payment_method: 'bank_transfer', idempotency_key: 'bt-1' }
    const res = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.intent.kind).toBe('instructions')
    expect(json.intent.provider).toBe('bank_transfer')
    expect(json.intent.instructions.bank_name).toBe('Kasikorn Bank')
    expect(json.intent.instructions.account_number).toBe('123-4-56789-0')
  })

  it('persists payment_method on the order row', async () => {
    const env = await makeTestEnv()
    const body = { ...makeValidCheckoutBody(), payment_method: 'promptpay', idempotency_key: 'pm-1' }
    const res = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    const json = await res.json()
    const row = await env.DB.prepare(`SELECT payment_method FROM orders WHERE id = ?`).bind(json.order_id).first<{ payment_method: string }>()
    expect(row?.payment_method).toBe('promptpay')
  })
```

> Note: `makeTestEnv` and `makeValidCheckoutBody` are existing test helpers in this file. If their names differ, use the existing local equivalents. If a helper doesn't construct a valid body factory, lift the existing inline body into a top-of-file `function makeValidCheckoutBody()` first.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace=@cnx/api -- checkout.integration`
Expected: All checkout integration tests pass, including new ones.

- [ ] **Step 5: Run the full API test suite**

Run: `npm test --workspace=@cnx/api`
Expected: All pass. Auth, account, admin tests should be unaffected. If any other test creates an order without `payment_method` (e.g. an admin or order-status test), update those bodies too.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/checkout.integration.test.ts
git commit -m "test(api): add payment_method coverage to checkout"
```

---

## Task 11: Add `GET /api/payment-methods` and `GET /api/orders/:id/intent`

**Files:**
- Modify: `packages/api/src/routes/admin/settings.ts` (allow new keys)
- Modify: `packages/api/src/routes/orders.ts` (add intent endpoint)
- Create: `packages/api/src/routes/payment-methods.ts` (new public endpoint)
- Modify: `packages/api/src/index.ts` (register the new route)

- [ ] **Step 1: Allow `payment_methods_enabled` in admin settings**

In `packages/api/src/routes/admin/settings.ts`, change `ALLOWED_KEYS` (line 11):

```ts
const ALLOWED_KEYS = new Set([
  'shipping_flat_rate',
  'shipping_free_threshold',
  'promptpay_number',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'payment_deadline_hours',
  'payment_methods_enabled',
])
```

- [ ] **Step 2: Add validation for `payment_methods_enabled` value shape**

In the same file, after the `ALLOWED_KEYS` constant and before `registerAdminSettingsRoutes`, add:

```ts
function validateSettingValue(key: string, value: string): string | null {
  if (key === 'payment_methods_enabled') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      return 'payment_methods_enabled must be a JSON array of strings'
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      return 'payment_methods_enabled must be a JSON array of strings'
    }
  }
  return null
}
```

Then in the PATCH handler, after the `if (typeof value !== 'string')` check (around line 56), add:

```ts
      const valErr = validateSettingValue(key, value)
      if (valErr) {
        return Response.json({ error: valErr }, { status: 400 })
      }
```

- [ ] **Step 3: Create the public methods endpoint**

Create `packages/api/src/routes/payment-methods.ts`:

```ts
import type { RouterType } from 'itty-router'
import type { Env, SiteSettingsMap } from '../lib/types'
import { listEnabledProviders } from '../services/payments/registry'

export function registerPaymentMethodsRoutes(router: RouterType) {
  router.get('/api/payment-methods', async (_request: Request, env: Env) => {
    let settingsMap: SiteSettingsMap = {}
    try {
      const { results } = await env.DB.prepare(`SELECT key, value FROM site_settings`).all<{
        key: string
        value: string
      }>()
      for (const row of results) {
        settingsMap[row.key] = row.value
      }
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    const methods = listEnabledProviders(settingsMap).map((p) => ({
      id: p.id,
      name: p.displayName,
    }))

    return Response.json({ methods }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  })
}
```

- [ ] **Step 4: Add `GET /api/orders/:id/intent` to `routes/orders.ts`**

Open `packages/api/src/routes/orders.ts`. At the top, ensure these imports exist (add if missing):

```ts
import { getProvider } from '../services/payments/registry'
import type { PaymentIntent, SiteSettingsMap } from '../lib/types'
```

Inside the route registration function (after the existing handlers), add:

```ts
  router.get('/api/orders/:id/intent', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const id = url.pathname.split('/')[3] || ''
    if (!isValidOrderId(id)) {
      return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
    }
    const orderId = id.toUpperCase()

    let row: { payment_method: string | null; total_thb: number; customer_email: string; status: string } | null
    try {
      row = await env.DB.prepare(
        `SELECT payment_method, total_thb, customer_email, status FROM orders WHERE id = ? LIMIT 1`
      )
        .bind(orderId)
        .first<{ payment_method: string | null; total_thb: number; customer_email: string; status: string }>()
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
    if (!row) return Response.json({ error: 'Order not found' }, { status: 404 })
    if (!row.payment_method) {
      return Response.json({ error: 'Order has no payment method' }, { status: 404 })
    }

    const provider = getProvider(row.payment_method)
    if (!provider) {
      return Response.json({ error: 'Payment method no longer supported' }, { status: 410 })
    }

    let settingsMap: SiteSettingsMap = {}
    try {
      const { results } = await env.DB.prepare(`SELECT key, value FROM site_settings`).all<{
        key: string
        value: string
      }>()
      for (const r of results) settingsMap[r.key] = r.value
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    let intent: PaymentIntent
    try {
      intent = await provider.createIntent({
        order: { id: orderId, total_thb: row.total_thb, customer_email: row.customer_email },
        settings: settingsMap,
        env,
      })
    } catch {
      return Response.json({ error: 'Failed to rebuild intent' }, { status: 500 })
    }

    return Response.json({ intent, status: row.status })
  })
```

`isValidOrderId` should already be imported in `orders.ts` from `../lib/utils`. If not, add the import.

- [ ] **Step 5: Wire `registerPaymentMethodsRoutes` in `packages/api/src/index.ts`**

Run: `grep -n "register" packages/api/src/index.ts`

Find where existing route registrations live (e.g. `registerCheckoutRoutes(router)`). Add the import:

```ts
import { registerPaymentMethodsRoutes } from './routes/payment-methods'
```

And the registration call alongside the others:

```ts
registerPaymentMethodsRoutes(router)
```

- [ ] **Step 6: Add integration tests**

Append to `packages/api/src/routes/admin-orders.integration.test.ts` (or create `packages/api/src/routes/payment-methods.integration.test.ts` if cleaner):

```ts
import { describe, it, expect } from 'vitest'
// reuse existing makeTestEnv pattern

describe('GET /api/payment-methods', () => {
  it('returns enabled methods with displayNames', async () => {
    const env = await makeTestEnv()
    const res = await app.fetch(new Request('http://x/api/payment-methods'), env)
    expect(res.status).toBe(200)
    const json = await res.json()
    const ids = json.methods.map((m: { id: string }) => m.id).sort()
    expect(ids).toEqual(['bank_transfer', 'promptpay'])
    expect(json.methods[0].name.en).toBeTruthy()
    expect(json.methods[0].name.th).toBeTruthy()
  })

  it('omits methods that are disabled in settings', async () => {
    const env = await makeTestEnv()
    await env.DB.prepare(`UPDATE site_settings SET value = '["promptpay"]' WHERE key = 'payment_methods_enabled'`).run()
    const res = await app.fetch(new Request('http://x/api/payment-methods'), env)
    const json = await res.json()
    expect(json.methods.map((m: { id: string }) => m.id)).toEqual(['promptpay'])
  })

  it('omits methods missing required settings', async () => {
    const env = await makeTestEnv()
    await env.DB.prepare(`UPDATE site_settings SET value = '' WHERE key = 'promptpay_number'`).run()
    const res = await app.fetch(new Request('http://x/api/payment-methods'), env)
    const json = await res.json()
    expect(json.methods.map((m: { id: string }) => m.id)).toEqual(['bank_transfer'])
  })
})

describe('GET /api/orders/:id/intent', () => {
  it('returns intent for an existing order', async () => {
    const env = await makeTestEnv()
    // create an order via checkout first
    const body = { ...makeValidCheckoutBody(), payment_method: 'promptpay', idempotency_key: 'int-1' }
    const checkoutRes = await app.fetch(
      new Request('http://x/api/checkout', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      env,
    )
    const { order_id } = await checkoutRes.json()
    const res = await app.fetch(new Request(`http://x/api/orders/${order_id}/intent`), env)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.intent.provider).toBe('promptpay')
    expect(json.intent.kind).toBe('instructions')
    expect(json.status).toBe('pending_payment')
  })

  it('returns 404 for unknown order', async () => {
    const env = await makeTestEnv()
    const res = await app.fetch(new Request('http://x/api/orders/01HZZZZZZZZZZZZZZZZZZZZZZZ/intent'), env)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 7: Run tests**

Run: `npm test --workspace=@cnx/api`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/routes/payment-methods.ts packages/api/src/routes/orders.ts packages/api/src/routes/admin/settings.ts packages/api/src/index.ts packages/api/src/routes/admin-orders.integration.test.ts
git commit -m "feat(api): add /api/payment-methods and /api/orders/:id/intent

Public endpoints power the checkout method picker and let the payment
instructions page survive reloads. Admin settings now accept
payment_methods_enabled with JSON-array validation."
```

---

## Task 12: Webhook route + status helpers

**Files:**
- Create: `packages/api/src/routes/payments.ts`
- Create: `packages/api/src/routes/payments-webhook.integration.test.ts`
- Modify: `packages/api/src/index.ts` (register)

- [ ] **Step 1: Write failing integration test (with a fake provider)**

Create `packages/api/src/routes/payments-webhook.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
// import existing test helpers (app, makeTestEnv, makeValidCheckoutBody)

describe('POST /api/payments/:provider/webhook', () => {
  it('returns 404 when provider has no verifyWebhook (manual)', async () => {
    const env = await makeTestEnv()
    const res = await app.fetch(
      new Request('http://x/api/payments/promptpay/webhook', { method: 'POST', body: '{}' }),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when provider unknown', async () => {
    const env = await makeTestEnv()
    const res = await app.fetch(
      new Request('http://x/api/payments/no-such/webhook', { method: 'POST', body: '{}' }),
      env,
    )
    expect(res.status).toBe(404)
  })
})

describe('webhook helpers', () => {
  it('mapWebhookToOrderStatus maps outcomes', async () => {
    const { mapWebhookToOrderStatus, allowedFromStates } = await import('./payments')
    expect(mapWebhookToOrderStatus('paid')).toBe('paid')
    expect(mapWebhookToOrderStatus('failed')).toBe('failed')
    expect(mapWebhookToOrderStatus('refunded')).toBe('refunded')
    expect(allowedFromStates('paid')).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(allowedFromStates('failed')).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(allowedFromStates('refunded')).toEqual(['paid', 'packed', 'shipped', 'delivered'])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test --workspace=@cnx/api -- payments-webhook`
Expected: FAIL — `Cannot find module './payments'`.

- [ ] **Step 3: Implement the route module**

Create `packages/api/src/routes/payments.ts`:

```ts
import type { RouterType } from 'itty-router'
import type { Env, WebhookOutcome } from '../lib/types'
import { getProvider } from '../services/payments/registry'
import { nowIso } from '../lib/utils'

export function mapWebhookToOrderStatus(outcome: WebhookOutcome): 'paid' | 'failed' | 'refunded' {
  return outcome
}

export function allowedFromStates(outcome: WebhookOutcome): string[] {
  if (outcome === 'paid' || outcome === 'failed') {
    return ['pending_payment', 'awaiting_gateway']
  }
  return ['paid', 'packed', 'shipped', 'delivered']  // refunded
}

function isUniqueViolation(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase()
  return msg.includes('unique') || msg.includes('constraint failed')
}

export function registerPaymentsRoutes(router: RouterType) {
  router.post('/api/payments/:provider/webhook', async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url)
    const providerId = url.pathname.split('/')[3] || ''
    const provider = getProvider(providerId)
    if (!provider || !provider.verifyWebhook) {
      return Response.json({ error: 'Provider has no webhook' }, { status: 404 })
    }

    const result = await provider.verifyWebhook(request, env)
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 400 })
    }

    const newStatus = mapWebhookToOrderStatus(result.status)
    const allowed = allowedFromStates(result.status)
    const placeholders = allowed.map(() => '?').join(',')
    const now = nowIso()

    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO payments (order_id, method, provider, provider_txn_id, status, payload_json, amount_thb, created_at)
           VALUES (?, ?, ?, ?, ?, ?, (SELECT total_thb FROM orders WHERE id = ?), ?)`
        ).bind(
          result.order_id,
          provider.id,
          provider.id,
          result.provider_txn_id,
          result.status,
          JSON.stringify(result.raw),
          result.order_id,
          now,
        ),
        env.DB.prepare(
          `UPDATE orders SET status = ?, updated_at = ?
           WHERE id = ? AND status IN (${placeholders})`
        ).bind(newStatus, now, result.order_id, ...allowed),
      ])
    } catch (e) {
      if (isUniqueViolation(e)) {
        return Response.json({ ok: true, replayed: true })
      }
      console.error('webhook DB error:', e)
      return Response.json({ error: 'DB error' }, { status: 500 })
    }

    // Email side-effects out of scope here; later wired via sendStatusEmail.
    void ctx

    return Response.json({ ok: true })
  })
}
```

- [ ] **Step 4: Register the route in `index.ts`**

Add the import at the top:

```ts
import { registerPaymentsRoutes } from './routes/payments'
```

And the call alongside others:

```ts
registerPaymentsRoutes(router)
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test --workspace=@cnx/api -- payments-webhook`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/payments.ts packages/api/src/routes/payments-webhook.integration.test.ts packages/api/src/index.ts
git commit -m "feat(api): add /api/payments/:provider/webhook route

Generic webhook dispatcher with idempotency via UNIQUE(provider, provider_txn_id)
and gated state transitions. Manual providers (no verifyWebhook) return 404.
Stub for future 2C2P / NowPayments integration."
```

---

## Task 13: Email templates for payment_failed and payment_refunded

**Files:**
- Modify: `packages/api/src/services/email.ts`

The existing file (`packages/api/src/services/email.ts`) defines `sendOrderEmail(env, event, data, opts)` and renders templates by switching on `event`. We add two new event names.

- [ ] **Step 1: Read the existing email module to find the event switch**

Run: `grep -n "function sendOrderEmail\|case '" packages/api/src/services/email.ts | head -40`

Identify where the switch on event-type lives and the existing case branches (e.g. `'order_created'`, `'order_paid'`, `'order_shipped'`, `'order_cancelled'`).

- [ ] **Step 2: Add `payment_failed` and `payment_refunded` event templates**

Locate the function that renders subject + body per event (likely a switch statement or a lookup map inside `sendOrderEmail`). Add two new branches following the existing pattern. The templates should use the existing `formatThb` helper, the existing `emailLayout` wrapper, and the existing `escapeHtml` helper.

Example branch for `payment_failed` (adapt to existing code style):

```ts
    case 'payment_failed': {
      const subject = `Payment failed for order ${data.order_id}`
      const html = emailLayout(
        subject,
        `<p>Hi ${escapeHtml(data.customer_name)},</p>
         <p>Your payment for order <strong>${escapeHtml(data.order_id)}</strong> (${formatThb(data.total_thb)}) could not be confirmed.</p>
         <p>Please try again or contact <a href="mailto:contact@cnxnature.com">contact@cnxnature.com</a> if you need help.</p>`
      )
      return { subject, html }
    }
```

And for `payment_refunded`:

```ts
    case 'payment_refunded': {
      const subject = `Refund issued for order ${data.order_id}`
      const html = emailLayout(
        subject,
        `<p>Hi ${escapeHtml(data.customer_name)},</p>
         <p>A refund of <strong>${formatThb(data.total_thb)}</strong> has been issued for order <strong>${escapeHtml(data.order_id)}</strong>.</p>
         <p>The funds should appear in your account within 5–10 business days depending on your bank or card issuer.</p>`
      )
      return { subject, html }
    }
```

> If the existing module dispatches via a `Record<EventName, Renderer>` instead of a switch, add the same two keys to that map.

- [ ] **Step 3: Extend the email-event union type if one exists**

Run: `grep -n "type.*Event\|OrderEmailEvent" packages/api/src/services/email.ts`

If there is a union type like `type OrderEmailEvent = 'order_created' | 'order_paid' | ...`, add `'payment_failed'` and `'payment_refunded'` to it.

- [ ] **Step 4: Add a small test (if existing tests cover other templates)**

Open `packages/api/src/services/email.test.ts`. If it exercises template rendering by calling a render helper directly, add cases:

```ts
import { describe, it, expect } from 'vitest'
// import the render helper used by existing tests

describe('email templates', () => {
  it('renders payment_failed', () => {
    const out = renderEmail('payment_failed', {
      order_id: 'O1', customer_name: 'Alice', customer_email: 'a@b.co',
      items: [], subtotal_thb: 100, shipping_thb: 0, discount_thb: 0, total_thb: 100,
    })
    expect(out.subject).toContain('O1')
    expect(out.html).toContain('Alice')
    expect(out.html).toContain('฿1.00')
  })

  it('renders payment_refunded', () => {
    const out = renderEmail('payment_refunded', {
      order_id: 'O2', customer_name: 'Bob', customer_email: 'b@c.co',
      items: [], subtotal_thb: 200, shipping_thb: 0, discount_thb: 0, total_thb: 200,
    })
    expect(out.subject).toContain('Refund')
    expect(out.html).toContain('Bob')
  })
})
```

> If the renderer is private and not exported, skip these template-render tests and rely on integration coverage when the webhook actually fires emails (deferred work).

- [ ] **Step 5: Run tests**

Run: `npm test --workspace=@cnx/api -- email`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/email.ts packages/api/src/services/email.test.ts
git commit -m "feat(api): add payment_failed and payment_refunded email templates"
```

---

## Task 14: Frontend API layer — types + paymentMethods.ts

**Files:**
- Modify: `packages/web/src/api/checkout.ts`
- Create: `packages/web/src/api/paymentMethods.ts`

- [ ] **Step 1: Replace `payment_instructions` with `intent` in `checkout.ts`**

In `packages/web/src/api/checkout.ts`, replace the current `CheckoutResponse` interface (lines 21-37):

```ts
export interface CheckoutResponse {
  order_id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  payment_instructions: {
    promptpay: { number: string; qr_url: string } | null
    bank_transfer: {
      bank_name: string
      account_name: string
      account_number: string
    }
    amount_thb: string
  }
  message?: string
}
```

With:

```ts
export type PaymentIntent =
  | {
      kind: 'instructions'
      provider: string
      instructions: Record<string, unknown>
    }
  | {
      kind: 'redirect'
      provider: string
      url: string
      expires_at?: string
    }
  | {
      kind: 'sdk'
      provider: string
      client_token: string
      provider_data: unknown
    }

export interface PromptPayInstructions {
  promptpay_number: string
  qr_url: string
  amount_thb: string
}

export interface BankTransferInstructions {
  bank_name: string
  account_name: string
  account_number: string
  amount_thb: string
}

export interface CheckoutResponse {
  order_id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  intent: PaymentIntent
  message?: string
}
```

- [ ] **Step 2: Add `payment_method` to `CheckoutPayload`**

Replace the `CheckoutPayload` interface (lines 3-19):

```ts
export interface CheckoutPayload {
  items: { product_id: number; quantity: number }[]
  customer: {
    name: string
    email: string
    phone: string
    address: {
      line1: string
      line2: string
      district: string
      province: string
      postal_code: string
    }
  }
  idempotency_key: string
  discount_code?: string
  payment_method: string
}
```

- [ ] **Step 3: Create `paymentMethods.ts`**

Create `packages/web/src/api/paymentMethods.ts`:

```ts
import { apiUrl } from './client'
import type { PaymentIntent } from './checkout'

export interface PaymentMethod {
  id: string
  name: { en: string; th: string }
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const res = await fetch(apiUrl('/api/payment-methods'))
  if (!res.ok) throw new Error(`Failed to fetch payment methods (${res.status})`)
  const data = (await res.json()) as { methods: PaymentMethod[] }
  return data.methods
}

export async function fetchOrderIntent(orderId: string): Promise<{ intent: PaymentIntent; status: string }> {
  const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderId)}/intent`), {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to fetch order intent (${res.status})`)
  return (await res.json()) as { intent: PaymentIntent; status: string }
}
```

- [ ] **Step 4: Run frontend typecheck**

Run: `npm run typecheck --workspace=@cnx/web` (or `npx vue-tsc --noEmit` from `packages/web/`).
Expected: Errors in `CheckoutPage.vue` and `PaymentInstructionsPage.vue` because they read the old `payment_instructions`. Those will be fixed in tasks 16-17.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/checkout.ts packages/web/src/api/paymentMethods.ts
git commit -m "feat(web): replace payment_instructions with discriminated PaymentIntent"
```

---

## Task 15: Payment method components

**Files:**
- Create: `packages/web/src/components/payment/PromptPayInstructions.vue`
- Create: `packages/web/src/components/payment/BankTransferInstructions.vue`
- Create: `packages/web/src/components/payment/PaymentMethodPicker.vue`

These extract the existing PromptPay and bank-transfer markup from `PaymentInstructionsPage.vue` into reusable components and add a picker.

- [ ] **Step 1: Create `PromptPayInstructions.vue`**

Create `packages/web/src/components/payment/PromptPayInstructions.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PromptPayQR from '../ui/PromptPayQR.vue'

const props = defineProps<{
  promptpayNumber: string
  amountThb: string
}>()

const { t } = useI18n({ useScope: 'global' })
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.promptpayNumber)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
  }
}
</script>

<template>
  <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
        <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <h2 class="text-xl font-bold text-foreground">{{ t('payment.promptpay') }}</h2>
        <p class="text-sm text-muted">{{ t('payment.scanQRDesc') }}</p>
      </div>
    </div>

    <div class="flex justify-center py-4">
      <div class="bg-white rounded-lg p-4">
        <PromptPayQR :promptpay-id="promptpayNumber" :amount="parseFloat(amountThb)" :size="192" />
      </div>
    </div>

    <div class="flex items-center justify-between bg-surface-alt rounded-md px-4 py-3">
      <div>
        <p class="text-xs text-muted">{{ t('payment.promptpayNumber') }}</p>
        <p class="font-mono text-foreground">{{ promptpayNumber }}</p>
      </div>
      <button @click="copy" class="text-primary text-sm font-semibold hover:underline underline-offset-4">
        {{ copied ? t('payment.copied') : t('payment.copy') }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Create `BankTransferInstructions.vue`**

Create `packages/web/src/components/payment/BankTransferInstructions.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  bankName: string
  accountName: string
  accountNumber: string
}>()

const { t } = useI18n({ useScope: 'global' })
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.accountNumber)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}
</script>

<template>
  <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-primary/15 rounded-lg flex items-center justify-center">
        <svg class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <div>
        <h2 class="text-xl font-bold text-foreground">{{ t('payment.bankTransfer') }}</h2>
        <p class="text-sm text-muted">{{ t('payment.transferToAccount') }}</p>
      </div>
    </div>

    <div class="space-y-3">
      <div class="bg-surface-alt rounded-md px-4 py-3">
        <p class="text-xs text-muted">{{ t('payment.bankName') }}</p>
        <p class="font-medium text-foreground">{{ bankName }}</p>
      </div>
      <div class="bg-surface-alt rounded-md px-4 py-3">
        <p class="text-xs text-muted">{{ t('payment.accountName') }}</p>
        <p class="font-medium text-foreground">{{ accountName }}</p>
      </div>
      <div class="flex items-center justify-between bg-surface-alt rounded-md px-4 py-3">
        <div>
          <p class="text-xs text-muted">{{ t('payment.accountNumber') }}</p>
          <p class="font-mono text-foreground">{{ accountNumber }}</p>
        </div>
        <button @click="copy" class="text-primary text-sm font-semibold hover:underline underline-offset-4">
          {{ copied ? t('payment.copied') : t('payment.copy') }}
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Create `PaymentMethodPicker.vue`**

Create `packages/web/src/components/payment/PaymentMethodPicker.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PaymentMethod } from '../../api/paymentMethods'

const props = defineProps<{
  modelValue: string
  methods: PaymentMethod[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { locale, t } = useI18n({ useScope: 'global' })
const localeKey = computed(() => (locale.value === 'th' ? 'th' : 'en'))

function pick(id: string) {
  emit('update:modelValue', id)
}
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="text-base font-semibold text-foreground mb-2">
      {{ t('payment.selectMethod') }}
    </legend>
    <label
      v-for="m in methods"
      :key="m.id"
      :class="[
        'flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors',
        modelValue === m.id ? 'border-primary bg-primary/10' : 'border-sand bg-surface-alt hover:border-primary/50',
      ]"
    >
      <input
        type="radio"
        :value="m.id"
        :checked="modelValue === m.id"
        class="text-primary focus:ring-primary"
        @change="pick(m.id)"
      />
      <span class="font-medium text-foreground">{{ m.name[localeKey] }}</span>
    </label>
  </fieldset>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/payment/
git commit -m "feat(web): add payment method components and picker"
```

---

## Task 16: `CheckoutPage.vue` — picker + intent dispatch

**Files:**
- Modify: `packages/web/src/pages/CheckoutPage.vue`

This task is high-risk because the checkout page is large. Read the file first, then patch surgically.

- [ ] **Step 1: Read the file to locate the relevant blocks**

Run: `wc -l packages/web/src/pages/CheckoutPage.vue && grep -n "submitCheckout\|idempotency\|payment_instructions\|sessionStorage" packages/web/src/pages/CheckoutPage.vue`

Identify:
- The `<script setup>` block where the submit handler lives
- Where the form payload is built (`payment_method` must be added)
- Where the response is consumed (sessionStorage key `cnx-last-order` and route push)
- Where the new `<PaymentMethodPicker>` should mount in the template

- [ ] **Step 2: Add picker imports and state**

In the `<script setup lang="ts">` block, add imports near the existing API imports:

```ts
import { onMounted } from 'vue'
import PaymentMethodPicker from '../components/payment/PaymentMethodPicker.vue'
import { fetchPaymentMethods, type PaymentMethod } from '../api/paymentMethods'
```

And add reactive state:

```ts
const paymentMethods = ref<PaymentMethod[]>([])
const selectedMethod = ref<string>('')
const methodsError = ref('')

onMounted(async () => {
  try {
    paymentMethods.value = await fetchPaymentMethods()
    if (paymentMethods.value.length > 0) {
      selectedMethod.value = paymentMethods.value[0].id
    } else {
      methodsError.value = 'No payment methods available. Please contact support.'
    }
  } catch {
    methodsError.value = 'Failed to load payment methods. Please refresh.'
  }
})
```

> If `onMounted` is already imported, do not duplicate the import. If the page already has an `onMounted` hook, merge the new logic into it rather than adding a second.

- [ ] **Step 3: Add `payment_method` to the submit payload**

Locate the `submitCheckout({...})` call (or the object passed into it). Add `payment_method: selectedMethod.value` to that object. Before submission, guard:

```ts
if (!selectedMethod.value) {
  // surface validation error to the user via existing mechanism
  return
}
```

- [ ] **Step 4: Update the response handling for `intent`**

Replace any code that reads `result.payment_instructions` with logic that dispatches based on `result.intent.kind`:

```ts
import type { CheckoutResponse } from '../api/checkout'

function handleCheckoutResponse(result: CheckoutResponse) {
  // Persist for the payment instructions page (still useful for first-render speed; the
  // page also fetches /intent on reload).
  sessionStorage.setItem('cnx-last-order', JSON.stringify(result))

  if (result.intent.kind === 'redirect') {
    window.location.href = result.intent.url
    return
  }
  // 'instructions' or 'sdk' → navigate to the payment page, which will render the intent.
  router.push(`/order/${result.order_id}/payment`)
}
```

Replace the existing post-checkout code path with a call to `handleCheckoutResponse(result)`.

- [ ] **Step 5: Mount the picker in the template**

In the template, immediately above the "Place order" button (or wherever payment-related markup currently lives), add:

```vue
<div v-if="methodsError" class="text-sm text-error">{{ methodsError }}</div>
<PaymentMethodPicker
  v-else-if="paymentMethods.length"
  v-model="selectedMethod"
  :methods="paymentMethods"
/>
```

- [ ] **Step 6: Run dev server and visually verify**

Run: `npm run dev --workspace=@cnx/web`
Open the checkout page. Confirm:
- Both PromptPay and Bank transfer appear as radio options.
- Default selection is PromptPay (first in seed).
- Submitting an order with PromptPay routes to `/order/<id>/payment`.

If you cannot run the browser yourself, state so explicitly per project guidelines.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/CheckoutPage.vue
git commit -m "feat(web): payment method picker + intent dispatch on checkout"
```

---

## Task 17: `PaymentInstructionsPage.vue` — render by intent

**Files:**
- Modify: `packages/web/src/pages/PaymentInstructionsPage.vue`

- [ ] **Step 1: Replace imports + state**

In the `<script setup lang="ts">`, replace the `import` block (lines 1-10) with:

```ts
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchOrder, submitPaymentProof, CheckoutError, type CheckoutResponse, type ApiOrder, type PaymentIntent } from '../api/checkout'
import { fetchOrderIntent } from '../api/paymentMethods'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import PromptPayInstructions from '../components/payment/PromptPayInstructions.vue'
import BankTransferInstructions from '../components/payment/BankTransferInstructions.vue'
import { formatMoney } from '../utils/money'
```

(The `satangToThb` import drops because the new components compute amount themselves. The old `PromptPayQR` import drops because it now lives inside `PromptPayInstructions`.)

- [ ] **Step 2: Replace the intent-handling state**

Around the existing `checkoutResult` ref, replace:

```ts
const checkoutResult = ref<CheckoutResponse | null>(null)
```

With:

```ts
const intent = ref<PaymentIntent | null>(null)
```

- [ ] **Step 3: Update `onMounted` to fetch intent from server**

Replace the existing `onMounted` block (lines 41-63) with:

```ts
onMounted(async () => {
  // Fast path: read cached checkout response if it matches this order.
  const stored = sessionStorage.getItem('cnx-last-order')
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as CheckoutResponse
      if (parsed.order_id === orderId && parsed.intent) {
        intent.value = parsed.intent
      }
    } catch {
      // ignore
    }
  }

  // Fetch order details + a fresh intent in parallel.
  try {
    await loadOrder()
    if (!intent.value) {
      try {
        const fresh = await fetchOrderIntent(orderId)
        intent.value = fresh.intent
      } catch {
        // Acceptable — page renders the order but no intent UI.
      }
    }
  } catch {
    error.value = 'Order not found. Please check your order ID.'
  } finally {
    loading.value = false
  }
})
```

- [ ] **Step 4: Replace amount computeds and template renders for PromptPay/bank**

Remove the `amountThb` computed (no longer needed at page level). Update `amountDisplay` to read from order only:

```ts
const amountDisplay = computed(() => order.value ? formatMoney(order.value.total_thb) : '')
```

In the template, replace the entire two `<!-- PromptPay -->` and `<!-- Bank Transfer -->` blocks (lines 180-274) with:

```vue
<!-- Provider-specific instructions -->
<template v-if="intent && intent.kind === 'instructions'">
  <PromptPayInstructions
    v-if="intent.provider === 'promptpay'"
    :promptpay-number="String(intent.instructions.promptpay_number)"
    :amount-thb="String(intent.instructions.amount_thb)"
  />
  <BankTransferInstructions
    v-else-if="intent.provider === 'bank_transfer'"
    :bank-name="String(intent.instructions.bank_name)"
    :account-name="String(intent.instructions.account_name)"
    :account-number="String(intent.instructions.account_number)"
  />
</template>

<!-- Fallback when no intent available -->
<div
  v-else
  class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4"
>
  <h2 class="text-xl font-bold text-foreground">{{ t('payment.paymentDetails') }}</h2>
  <p class="text-muted">{{ t('payment.paymentDetailsFallback') }}</p>
</div>
```

Also remove the now-unused `<!-- Fallback when no payment instructions from checkout -->` block (lines 276-286).

- [ ] **Step 5: Run dev server, manually verify each provider**

Run: `npm run dev --workspace=@cnx/web`

Verify both PromptPay and Bank transfer flows render correctly on `/order/<id>/payment`. Reload the page — intent should still display (server-rebuilt). If you cannot test interactively, state so.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/PaymentInstructionsPage.vue
git commit -m "refactor(web): render payment instructions from PaymentIntent

PaymentInstructionsPage now switches on intent.provider and uses
component extraction. Intent is fetched server-side via /api/orders/:id/intent
so the page survives reloads and device switches."
```

---

## Task 18: i18n keys

**Files:**
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/th.json`

- [ ] **Step 1: Find existing `payment` block**

Run: `grep -n '"payment"' packages/web/src/i18n/en.json`

- [ ] **Step 2: Add `selectMethod` key under `payment` in both files**

In `packages/web/src/i18n/en.json`, inside the existing `"payment": { ... }` object, add:

```json
"selectMethod": "Select a payment method"
```

In `packages/web/src/i18n/th.json`, add:

```json
"selectMethod": "เลือกวิธีการชำระเงิน"
```

> The provider display names come from the API (`displayName.en/th`), so no per-method i18n keys are needed here.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/i18n/en.json packages/web/src/i18n/th.json
git commit -m "i18n(web): add payment.selectMethod label"
```

---

## Task 19: Admin settings UI for enabled methods

**Files:**
- Modify: `packages/web/src/pages/AdminSettingsPage.vue`

- [ ] **Step 1: Read the file**

Run: `wc -l packages/web/src/pages/AdminSettingsPage.vue && grep -n "promptpay_number\|form\\.\\|saveSettings" packages/web/src/pages/AdminSettingsPage.vue | head -30`

Find where the form state is initialized, where settings are loaded, and where they are saved.

- [ ] **Step 2: Add `payment_methods_enabled` to form state**

Wherever the form is initialized (currently includes `promptpay_number` etc.), add:

```ts
const ALL_METHODS = [
  { id: 'promptpay', label: 'PromptPay' },
  { id: 'bank_transfer', label: 'Bank transfer' },
]

const enabledMethods = ref<string[]>([])
```

- [ ] **Step 3: Hydrate from settings on load**

Where `form.promptpay_number = settings.promptpay_number ?? ''` lives, add:

```ts
try {
  const parsed = JSON.parse(settings.payment_methods_enabled ?? '[]')
  enabledMethods.value = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : []
} catch {
  enabledMethods.value = []
}
```

- [ ] **Step 4: Include in save**

Where the save handler builds the patch payload, add:

```ts
payment_methods_enabled: JSON.stringify(enabledMethods.value),
```

- [ ] **Step 5: Add the UI block**

In the template, near the other payment settings (e.g. above the PromptPay number input), add:

```vue
<div class="space-y-2">
  <label class="block text-sm font-medium text-foreground">Enabled payment methods</label>
  <div class="space-y-1">
    <label v-for="m in ALL_METHODS" :key="m.id" class="flex items-center gap-2 text-sm">
      <input type="checkbox" :value="m.id" v-model="enabledMethods" />
      <span class="text-foreground">{{ m.label }}</span>
    </label>
  </div>
  <p class="text-xs text-muted">Customers see only enabled methods at checkout.</p>
</div>
```

- [ ] **Step 6: Manually verify**

Run: `npm run dev --workspace=@cnx/web` (or the existing admin command). Toggle methods, save, reload — value persists. If you cannot test interactively, state so.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/pages/AdminSettingsPage.vue
git commit -m "feat(web): admin toggle for enabled payment methods"
```

---

## Task 20: E2E test update

**Files:**
- Modify: `e2e/shopping-flow.spec.ts`

- [ ] **Step 1: Read the existing flow**

Run: `cat e2e/shopping-flow.spec.ts | head -120`

Identify the step where the user clicks "Place order" and the assertions for the payment page.

- [ ] **Step 2: Insert a method-pick step**

Before the "Place order" click, add:

```ts
await page.getByRole('radio', { name: /promptpay/i }).check()
```

Verify the existing assertions (e.g. PromptPay QR present) still hold.

- [ ] **Step 3: Add a second test variant for bank transfer**

Duplicate the existing happy-path test (or extract shared steps into a helper). In the new test, pick `bank_transfer` and assert that the bank-transfer panel renders with the expected account number.

```ts
test('checkout via bank transfer renders bank instructions', async ({ page }) => {
  // ... navigate to checkout, fill customer details (reuse helpers)
  await page.getByRole('radio', { name: /bank transfer/i }).check()
  await page.getByRole('button', { name: /place order/i }).click()
  await expect(page.getByText('123-4-56789-0')).toBeVisible()
})
```

- [ ] **Step 4: Run the e2e**

Run: `npm run test:e2e` (or whichever command the repo uses — check `package.json`).
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/shopping-flow.spec.ts
git commit -m "test(e2e): cover payment method picker and bank-transfer flow"
```

---

## Task 21: Changelog

**Files:**
- Modify: `docs/changelog.md`

- [ ] **Step 1: Read the existing `[Unreleased]` section**

Run: `head -40 docs/changelog.md`

- [ ] **Step 2: Add entries**

Under `[Unreleased]`, add (following the existing style):

```markdown
### Added
- Payment provider abstraction: `PaymentProvider` registry in `packages/api/src/services/payments/`, public `GET /api/payment-methods`, and webhook stub at `POST /api/payments/:provider/webhook`.
- Customer payment method picker on the checkout page (PromptPay and bank transfer).
- Admin toggle for enabled payment methods in site settings.
- New email templates for `payment_failed` and `payment_refunded` events.

### Changed
- Order schema: `orders.payment_method` column added; status enum expanded with `awaiting_gateway`, `failed`, `refunded`.
- Payments schema: `provider`, `provider_txn_id`, `status`, `payload_json` columns added; webhook idempotency via `UNIQUE(provider, provider_txn_id)`.
- `POST /api/checkout` now requires `payment_method` and returns a discriminated `intent` (instructions / redirect / sdk) instead of a fixed `payment_instructions` object.
- `PaymentInstructionsPage` rebuilds the intent server-side via `GET /api/orders/:id/intent` so the page survives reloads.

### Migration
- Run migration `0009_payment_providers.sql` in production. It backfills `orders.payment_method` from existing `payments.method` rows and seeds `payment_methods_enabled` to `["promptpay","bank_transfer"]`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/changelog.md
git commit -m "docs: log payment provider refactor in changelog [Unreleased]"
```

---

## Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass (api unit + integration, web unit if any).

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e`
Expected: All e2e tests pass.

- [ ] **Step 3: Smoke test in browser**

Run dev: `npm run dev --workspace=@cnx/web` and `npm run dev --workspace=@cnx/api` (or the repo equivalents).
Manually:
1. Add a product to cart, go to checkout.
2. Verify both methods appear in the picker.
3. Place order with PromptPay → see QR.
4. Reload payment page → QR still renders (intent rebuilt server-side).
5. Place a different order with bank transfer → see bank box.
6. Submit a payment proof reference → admin sees it (existing flow still works).
7. As admin, untick PromptPay in settings → next checkout only shows bank transfer.

If you cannot interactively test, state so explicitly.

- [ ] **Step 4: Final commit (if any cleanup or fixes were needed)**

If verification surfaced issues, fix and commit per task. Otherwise no commit needed.

---

## Out of scope reminders

These are intentionally NOT in this plan:
- Real 2C2P or NowPayments providers (each future spec).
- Auto-expiry of `pending_payment` orders.
- Refund admin UI (DB supports `refunded` status; no UI yet).
- Persisting one-time intents in a `payment_intents` table (only matters when redirect providers land).
