# NOWPayments Hosted Invoice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NOWPayments crypto checkout through the hosted Invoice API.

**Architecture:** Use `POST /invoice` rather than direct `POST /payment` for the first integration, because invoices return a hosted `invoice_url` and match the existing redirect-intent checkout model. Store the generated invoice URL locally so `/api/orders/:id/intent` does not create duplicate invoices, and treat NOWPayments IPN callbacks as the only source of truth for final payment confirmation.

**Tech Stack:** Cloudflare Worker, D1, TypeScript, Web Crypto HMAC SHA-512, Vue 3 + Vite, Vitest, Wrangler integration tests.

---

## External References

- NOWPayments API entrypoint: https://nowpayments.io/help/api
- API endpoint descriptions: https://nowpayments.zendesk.com/hc/en-us/articles/21345824322717-API-and-endpoint-description
- IPN setup and signature verification: https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup
- Payment statuses: https://nowpayments.zendesk.com/hc/en-us/articles/18395434917149-Payment-statuses
- Integration guide: https://nowpayments.zendesk.com/hc/en-us/articles/21341613323421-NOWPayments-Integration-Guide
- Supported currencies, including THB: https://nowpayments.io/supported-coins/

## Integration Choice

Use NOWPayments **Invoice API**:

- `POST https://api.nowpayments.io/v1/invoice`
- Headers: `x-api-key`, `Content-Type: application/json`
- Request fields: `price_amount`, `price_currency`, `ipn_callback_url`, `order_id`, `order_description`, `success_url`, `cancel_url`, optional `pay_currency`, `is_fixed_rate`, `is_fee_paid_by_user`
- Response fields used by CNX AthletX: `id`, `invoice_url`

Do not build the direct deposit-address flow in this phase. Direct `POST /payment` returns `payment_id` and `pay_address`, which would require a crypto-specific address/QR UI and currency selection UX.

## Files

- Create `packages/api/sql/migrations/0011_payment_gateway_intents.sql`: persist redirect invoices/intents.
- Modify `packages/api/sql/schema.sql`: include `payment_gateway_intents`.
- Create `packages/api/src/services/payments/gateway-intents.ts`: load and save stored redirect intents.
- Create `packages/api/src/services/payments/gateway-intents.test.ts`: D1 helper tests.
- Create `packages/api/src/services/payments/nowpayments-signature.ts`: sorted JSON and HMAC SHA-512 signature verification.
- Create `packages/api/src/services/payments/nowpayments-signature.test.ts`: signature tests.
- Create `packages/api/src/services/payments/nowpayments-client.ts`: config parsing and Invoice API request.
- Create `packages/api/src/services/payments/nowpayments-client.test.ts`: mocked fetch tests.
- Create `packages/api/src/services/payments/nowpayments.ts`: `PaymentProvider` implementation and IPN verifier.
- Create `packages/api/src/services/payments/nowpayments.test.ts`: provider and IPN status mapping tests.
- Modify `packages/api/src/lib/types.ts`: NOWPayments env vars and non-terminal webhook result support.
- Modify `packages/api/src/services/payments/types.ts`: env-aware provider enablement and redirect instruction rendering.
- Modify `packages/api/src/services/payments/registry.ts`: register NOWPayments and pass env through enablement.
- Modify `packages/api/src/services/payments/registry.test.ts`: expect `getProvider('nowpayments')`.
- Modify `packages/api/src/routes/payment-methods.ts`: pass `env` to provider listing.
- Modify `packages/api/src/routes/orders.ts`: return stored/recreated NOWPayments redirect intent without creating duplicate invoices.
- Modify `packages/api/src/routes/checkout.ts`: set NOWPayments orders to `awaiting_gateway`, roll back on invoice creation failure, include redirect CTA in email.
- Modify `packages/api/src/routes/payments.ts`: return 200 for ignored non-terminal webhooks.
- Modify `packages/api/src/routes/payment-methods.integration.test.ts`, `packages/api/src/routes/checkout.integration.test.ts`, and `packages/api/src/routes/payments-webhook.integration.test.ts`: route coverage.
- Modify `packages/api/src/test/helpers.ts`: allow integration tests to restart worker with test vars when needed.
- Modify `packages/web/src/pages/AdminSettingsPage.vue`: add NOWPayments as an enabled method.
- Modify `packages/web/src/pages/PaymentInstructionsPage.vue`: render redirect CTA for `intent.kind === 'redirect'`.
- Modify `packages/web/src/i18n/en.json` and `packages/web/src/i18n/th.json`: redirect payment copy.
- Modify `packages/api/wrangler.toml` and `packages/api/.dev.vars.example` if it is added later; never commit real secrets.
- Modify `docs/plan/01-executive-summary.md`, `docs/plan/02-backend-architecture.md`, and `docs/changelog.md`.

## Required Runtime Configuration

Use Worker env vars / Wrangler secrets, not D1 settings, for credentials:

- `NOWPAYMENTS_API_KEY`: API key from NOWPayments dashboard.
- `NOWPAYMENTS_IPN_SECRET`: IPN secret key from Payment Settings.
- `NOWPAYMENTS_API_BASE_URL`: `https://api.nowpayments.io/v1` in production; use `https://api-sandbox.nowpayments.io/v1` for sandbox.
- `NOWPAYMENTS_PRICE_CURRENCY`: default `thb`.
- `NOWPAYMENTS_PAY_CURRENCY`: optional; leave unset so the hosted invoice lets the customer choose crypto.
- `NOWPAYMENTS_FIXED_RATE`: optional `true` or `false`; default `false`.
- `NOWPAYMENTS_FEE_PAID_BY_USER`: optional `true` or `false`; default `false`.
- `SITE_URL`: public storefront origin, for example `https://cnxnature.com`.
- `API_BASE_URL`: public API origin; default to `SITE_URL` when same-origin.

Dashboard prerequisites:

- Add payout wallet.
- Generate API key.
- Generate IPN secret key.
- Set the IPN callback URL in the dashboard to `/api/payments/webhook/nowpayments`.
- Confirm Cloudflare allows NOWPayments callback requests.

---

### Task 1: Gateway Intent Persistence

**Files:**
- Create: `packages/api/sql/migrations/0011_payment_gateway_intents.sql`
- Modify: `packages/api/sql/schema.sql`
- Create: `packages/api/src/services/payments/gateway-intents.ts`
- Create: `packages/api/src/services/payments/gateway-intents.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests:

```ts
it('saves and loads a gateway redirect intent by order and provider', async () => {
  await saveGatewayIntent(env, {
    orderId: '01HXNOWPAYMENTSTEST000000000',
    provider: 'nowpayments',
    providerIntentId: 'invoice-123',
    redirectUrl: 'https://nowpayments.io/payment/?iid=invoice-123',
    status: 'created',
    payload: { id: 'invoice-123' },
  })

  await expect(loadGatewayIntent(env, '01HXNOWPAYMENTSTEST000000000', 'nowpayments')).resolves.toMatchObject({
    provider_intent_id: 'invoice-123',
    redirect_url: 'https://nowpayments.io/payment/?iid=invoice-123',
    status: 'created',
  })
})

it('updates an existing gateway intent for the same order/provider', async () => {
  await saveGatewayIntent(env, {
    orderId: '01HXNOWPAYMENTSTEST000000001',
    provider: 'nowpayments',
    providerIntentId: 'invoice-old',
    redirectUrl: 'https://old.example',
    status: 'created',
    payload: {},
  })
  await saveGatewayIntent(env, {
    orderId: '01HXNOWPAYMENTSTEST000000001',
    provider: 'nowpayments',
    providerIntentId: 'invoice-new',
    redirectUrl: 'https://new.example',
    status: 'created',
    payload: {},
  })

  const row = await loadGatewayIntent(env, '01HXNOWPAYMENTSTEST000000001', 'nowpayments')
  expect(row?.provider_intent_id).toBe('invoice-new')
  expect(row?.redirect_url).toBe('https://new.example')
})
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/api -- gateway-intents.test.ts`

Expected: fail because migration/helper does not exist.

- [ ] **Step 3: Add schema and helper**

Migration/schema table:

```sql
CREATE TABLE IF NOT EXISTS payment_gateway_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_intent_id TEXT NOT NULL,
  redirect_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE(order_id, provider),
  UNIQUE(provider, provider_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_gateway_intents_order_provider
  ON payment_gateway_intents(order_id, provider);
```

Helper exports:

```ts
export interface GatewayIntentInput {
  orderId: string
  provider: ProviderId
  providerIntentId: string
  redirectUrl: string
  status: string
  payload: unknown
}

export async function loadGatewayIntent(env: Env, orderId: string, provider: ProviderId): Promise<GatewayIntentRow | null>
export async function saveGatewayIntent(env: Env, input: GatewayIntentInput): Promise<void>
```

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- migrations.test.ts gateway-intents.test.ts`

Expected: pass.

---

### Task 2: NOWPayments IPN Signature Helper

**Files:**
- Create: `packages/api/src/services/payments/nowpayments-signature.ts`
- Create: `packages/api/src/services/payments/nowpayments-signature.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests:

```ts
it('creates the HMAC SHA-512 signature from recursively sorted JSON', async () => {
  const body = {
    payment_status: 'finished',
    order_id: '01HXNOWPAYMENTSTEST000000000',
    payment_id: 123456789,
    fee: { withdrawalFee: 0, depositFee: 0.1, serviceFee: 0, currency: 'trx' },
  }

  const signature = await createNowPaymentsSignature(body, 'ipn-secret')
  expect(signature).toMatch(/^[a-f0-9]{128}$/)
  await expect(verifyNowPaymentsSignature(body, signature, 'ipn-secret')).resolves.toBe(true)
})

it('rejects a changed body', async () => {
  const signature = await createNowPaymentsSignature({ order_id: 'A', payment_status: 'finished' }, 'ipn-secret')
  await expect(verifyNowPaymentsSignature({ order_id: 'A', payment_status: 'failed' }, signature, 'ipn-secret')).resolves.toBe(false)
})
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/api -- nowpayments-signature.test.ts`

Expected: fail because the helper does not exist.

- [ ] **Step 3: Implement helper**

Exports:

```ts
export function sortNowPaymentsObject(value: unknown): unknown
export async function createNowPaymentsSignature(body: unknown, secret: string): Promise<string>
export async function verifyNowPaymentsSignature(body: unknown, signature: string, secret: string): Promise<boolean>
```

Implementation rules:

- Recursively sort object keys.
- Preserve arrays in original order while sorting objects inside arrays.
- Use `JSON.stringify(sortNowPaymentsObject(body))`.
- Use Worker Web Crypto `HMAC` with `SHA-512`.
- Compare lowercase hex strings with a constant-time byte comparison.

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- nowpayments-signature.test.ts`

Expected: pass.

---

### Task 3: NOWPayments Invoice Client

**Files:**
- Create: `packages/api/src/services/payments/nowpayments-client.ts`
- Create: `packages/api/src/services/payments/nowpayments-client.test.ts`
- Modify: `packages/api/src/lib/types.ts`

- [ ] **Step 1: Write failing tests**

Add tests:

```ts
expect(getNowPaymentsConfig({
  NOWPAYMENTS_API_KEY: 'api-key',
  NOWPAYMENTS_IPN_SECRET: 'ipn-secret',
  NOWPAYMENTS_API_BASE_URL: 'https://api-sandbox.nowpayments.io/v1',
  SITE_URL: 'https://shop.example',
  API_BASE_URL: 'https://api.example',
} as Env)).toMatchObject({
  apiKey: 'api-key',
  ipnSecret: 'ipn-secret',
  apiBaseUrl: 'https://api-sandbox.nowpayments.io/v1',
  siteUrl: 'https://shop.example',
  apiPublicUrl: 'https://api.example',
  priceCurrency: 'thb',
})

expect(formatNowPaymentsAmount(12345)).toBe('123.45')
expect(formatNowPaymentsAmount(100)).toBe('1.00')
```

Mock `fetch` and assert:

```ts
await createNowPaymentsInvoice({
  env,
  order: { id: '01HXNOWPAYMENTSTEST000000000', total_thb: 199900, customer_email: 'buyer@example.com' },
})

expect(fetch).toHaveBeenCalledWith('https://api-sandbox.nowpayments.io/v1/invoice', expect.objectContaining({
  method: 'POST',
  headers: expect.objectContaining({
    'x-api-key': 'api-key',
    'Content-Type': 'application/json',
  }),
}))
```

Assert body contains:

```json
{
  "price_amount": "1999.00",
  "price_currency": "thb",
  "ipn_callback_url": "https://api.example/api/payments/webhook/nowpayments",
  "order_id": "01HXNOWPAYMENTSTEST000000000",
  "order_description": "CNX AthletX order 01HXNOWPAYMENTSTEST000000000",
  "success_url": "https://shop.example/order/01HXNOWPAYMENTSTEST000000000",
  "cancel_url": "https://shop.example/order/01HXNOWPAYMENTSTEST000000000/payment"
}
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/api -- nowpayments-client.test.ts`

Expected: fail because the client and env keys do not exist.

- [ ] **Step 3: Implement client**

Add `Env` keys:

```ts
NOWPAYMENTS_API_KEY?: string
NOWPAYMENTS_IPN_SECRET?: string
NOWPAYMENTS_API_BASE_URL?: string
NOWPAYMENTS_PRICE_CURRENCY?: string
NOWPAYMENTS_PAY_CURRENCY?: string
NOWPAYMENTS_FIXED_RATE?: string
NOWPAYMENTS_FEE_PAID_BY_USER?: string
SITE_URL?: string
API_BASE_URL?: string
```

Client exports:

```ts
export interface NowPaymentsInvoiceResponse {
  id: string
  invoice_url: string
}

export function getNowPaymentsConfig(env: Env): NowPaymentsConfig
export function formatNowPaymentsAmount(satang: number): string
export function nowPaymentsBool(raw: string | undefined, fallback: boolean): boolean
export function buildNowPaymentsInvoicePayload(args: { order: CheckoutOrderForIntent; config: NowPaymentsConfig }): Record<string, unknown>
export async function createNowPaymentsInvoice(args: { env: Env; order: CheckoutOrderForIntent }): Promise<NowPaymentsInvoiceResponse>
```

Throw `Error('NOWPayments API key is required')` or `Error('NOWPayments IPN secret is required')` when missing.

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- nowpayments-client.test.ts`

Expected: pass.

---

### Task 4: Provider Registration

**Files:**
- Create: `packages/api/src/services/payments/nowpayments.ts`
- Create: `packages/api/src/services/payments/nowpayments.test.ts`
- Modify: `packages/api/src/services/payments/types.ts`
- Modify: `packages/api/src/services/payments/registry.ts`
- Modify: `packages/api/src/services/payments/registry.test.ts`
- Modify: `packages/api/src/routes/payment-methods.ts`

- [ ] **Step 1: Write failing tests**

Add expectations:

```ts
expect(getProvider('nowpayments')?.displayName.en).toBe('Crypto checkout')

expect(listEnabledProviders({
  payment_methods_enabled: '["nowpayments"]',
}, {
  NOWPAYMENTS_API_KEY: 'api-key',
  NOWPAYMENTS_IPN_SECRET: 'ipn-secret',
  SITE_URL: 'https://shop.example',
} as Env).map((p) => p.id)).toEqual(['nowpayments'])

expect(listEnabledProviders({ payment_methods_enabled: '["nowpayments"]' }, {} as Env)).toEqual([])
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -w @cnx-athletx/api -- registry.test.ts nowpayments.test.ts`

Expected: fail because provider is not registered and registry is not env-aware.

- [ ] **Step 3: Implement provider and registry changes**

Update provider interface:

```ts
requiredEnvKeys?: readonly (keyof Env)[]
isEnabled(settings: SiteSettingsMap, env?: Env): boolean
renderInstructions(args: {
  order: CheckoutOrderForIntent
  settings: SiteSettingsMap
  intent?: PaymentIntent
}): InstructionsBlock | null
```

Provider behavior:

- `id: 'nowpayments'`
- `displayName: { en: 'Crypto checkout', th: 'ชำระเงินคริปโต' }`
- `isEnabled` requires `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and `SITE_URL`.
- `createIntent` first checks `loadGatewayIntent(env, order.id, 'nowpayments')`; if present, return stored redirect URL.
- If no stored intent exists, call `createNowPaymentsInvoice`, save the invoice with `saveGatewayIntent`, and return `{ kind: 'redirect', provider: 'nowpayments', url: invoice.invoice_url }`.
- `renderInstructions` returns a CTA block when passed a redirect intent.

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- registry.test.ts nowpayments.test.ts`

Expected: pass.

---

### Task 5: Webhook No-Op Support

**Files:**
- Modify: `packages/api/src/lib/types.ts`
- Modify: `packages/api/src/routes/payments.ts`
- Modify: `packages/api/src/routes/payments-webhook.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Add a provider test double or NOWPayments integration test where `verifyWebhook` returns:

```ts
{
  ok: true,
  ignored: true,
  order_id: '01HXNOWPAYMENTSTEST000000000',
  provider_txn_id: '123456789',
  provider_status: 'confirming',
  raw: { payment_status: 'confirming' },
}
```

Expected route response:

```ts
expect(res.status).toBe(200)
expect(await res.json()).toEqual({ ok: true, ignored: true })
```

Assert no `payments` row is inserted and the order remains `awaiting_gateway`.

- [ ] **Step 2: Run failing test**

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: fail because `WebhookResult` has no ignored branch.

- [ ] **Step 3: Implement ignored webhook branch**

Change `WebhookResult`:

```ts
export type WebhookResult =
  | { ok: true; order_id: string; provider_txn_id: string; status: WebhookOutcome; raw: unknown }
  | { ok: true; ignored: true; order_id: string; provider_txn_id: string; provider_status: string; raw: unknown }
  | { ok: false; reason: string }
```

In `dispatchWebhook`, immediately return `Response.json({ ok: true, ignored: true })` when `result.ok && 'ignored' in result`.

- [ ] **Step 4: Verify**

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: pass.

---

### Task 6: NOWPayments IPN Verification

**Files:**
- Modify: `packages/api/src/services/payments/nowpayments.ts`
- Modify: `packages/api/src/services/payments/nowpayments.test.ts`
- Modify: `packages/api/src/routes/payments-webhook.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Provider unit tests:

```ts
expect(mapNowPaymentsStatus('finished')).toBe('paid')
expect(mapNowPaymentsStatus('failed')).toBe('failed')
expect(mapNowPaymentsStatus('expired')).toBe('failed')
expect(mapNowPaymentsStatus('partially_paid')).toBe('failed')
expect(mapNowPaymentsStatus('wrong_asset')).toBe('failed')
expect(mapNowPaymentsStatus('waiting')).toBe('ignored')
expect(mapNowPaymentsStatus('confirming')).toBe('ignored')
expect(mapNowPaymentsStatus('confirmed')).toBe('ignored')
expect(mapNowPaymentsStatus('sending')).toBe('ignored')
```

Webhook tests:

- Valid `finished` IPN maps to `paid`.
- Valid `expired` IPN maps to `failed`.
- Valid `confirming` IPN returns ignored.
- Missing `x-nowpayments-sig` returns `{ ok: false, reason: 'Missing NOWPayments signature' }`.
- Bad signature returns `{ ok: false, reason: 'Invalid NOWPayments signature' }`.
- Amount mismatch returns `{ ok: false, reason: 'Invalid amount' }`.
- Currency mismatch returns `{ ok: false, reason: 'Invalid currency' }`.

- [ ] **Step 2: Run failing tests**

Run: `npm test -w @cnx-athletx/api -- nowpayments.test.ts`

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: fail because verifier is not implemented.

- [ ] **Step 3: Implement verifier**

`verifyWebhook(req, env)` should:

- parse JSON body,
- read `x-nowpayments-sig`,
- verify HMAC SHA-512 with `NOWPAYMENTS_IPN_SECRET`,
- require `order_id`,
- fetch the order by `order_id`,
- compare `price_currency.toLowerCase()` to config `priceCurrency`,
- convert `price_amount` to satang and compare to `orders.total_thb`,
- set `provider_txn_id` to `String(payment_id ?? invoice_id ?? purchase_id)`,
- map terminal statuses to `paid` or `failed`,
- return ignored for non-terminal statuses,
- include decoded body in `raw`.

Use this amount parser:

```ts
export function nowPaymentsAmountToSatang(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(String(value))
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100)
}
```

- [ ] **Step 4: Verify**

Run both commands from Step 2.

Expected: pass.

---

### Task 7: Checkout and Stored Intent Flow

**Files:**
- Modify: `packages/api/src/routes/checkout.ts`
- Modify: `packages/api/src/routes/orders.ts`
- Modify: `packages/api/src/routes/checkout.integration.test.ts`
- Modify: `packages/api/src/routes/payment-methods.integration.test.ts`
- Modify: `packages/api/src/test/helpers.ts`

- [ ] **Step 1: Write failing integration tests**

Add tests:

- `/api/payment-methods` omits NOWPayments when `"nowpayments"` is enabled in D1 but env secrets are missing.
- With test vars and mocked Invoice API, checkout with `"payment_method": "nowpayments"` returns `intent.kind === 'redirect'`.
- Created NOWPayments order status is `awaiting_gateway`.
- `/api/orders/:id/intent` returns the stored invoice URL and does not call NOWPayments again.
- Invoice creation failure returns `502`, releases inventory, and rolls back discount usage.

- [ ] **Step 2: Run failing tests**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts payment-methods.integration.test.ts`

Expected: fail before checkout and test helpers support NOWPayments.

- [ ] **Step 3: Add test env support**

Modify helper signature:

```ts
export async function startWorker(options: { vars?: Record<string, string> } = {}): Promise<Unstable_DevWorker> {
  if (worker) return worker
  worker = await unstable_dev('src/index.ts', {
    experimental: { disableExperimentalWarning: true },
    local: true,
    persist: false,
    vars: options.vars,
  })
  return worker
}
```

In tests that need NOWPayments env, call `await stopWorker()` before `startWorker({ vars: { ... } })`, then `await resetDb()`.

- [ ] **Step 4: Implement checkout/order route behavior**

Update `listEnabledProviders(settingsMap, env)` call sites.

In checkout:

- insert NOWPayments order with `status = 'pending_payment'`,
- call `provider.createIntent`,
- update the order to `awaiting_gateway`,
- call `provider.renderInstructions({ order, settings, intent })` before sending email,
- return redirect intent.

On NOWPayments invoice failure after order insert:

- release inventory,
- roll back discount commit,
- update order to `failed`,
- return `{ error: 'Failed to initialize payment' }` with status `502`.

In `/api/orders/:id/intent`, provider `createIntent` must return the stored invoice URL for NOWPayments.

- [ ] **Step 5: Verify**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts payment-methods.integration.test.ts`

Expected: pass.

---

### Task 8: Frontend Redirect Payment UI

**Files:**
- Modify: `packages/web/src/pages/PaymentInstructionsPage.vue`
- Modify: `packages/web/src/i18n/en.json`
- Modify: `packages/web/src/i18n/th.json`
- Create or modify: `packages/web/src/pages/PaymentInstructionsPage.test.ts`

- [ ] **Step 1: Write failing component test**

Assert redirect intent renders a CTA:

```ts
expect(wrapper.text()).toContain('Continue to secure crypto checkout')
expect(wrapper.find('a[href="https://nowpayments.io/payment/?iid=invoice-123"]').exists()).toBe(true)
```

Assert manual proof form is hidden for `awaiting_gateway`:

```ts
expect(wrapper.text()).not.toContain('Transfer Reference')
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/web -- PaymentInstructionsPage`

Expected: fail because redirect intents render fallback text.

- [ ] **Step 3: Implement UI**

Add status label:

```ts
awaiting_gateway: t('orderStatus.statusLabels.awaiting_gateway')
```

Add redirect branch:

```vue
<div
  v-else-if="intent && intent.kind === 'redirect'"
  class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4"
>
  <h2 class="text-xl font-bold text-foreground">{{ t('payment.redirectTitle') }}</h2>
  <p class="text-muted">{{ t('payment.redirectDesc') }}</p>
  <a :href="intent.url" rel="noopener noreferrer">
    <PrimaryButton size="lg">{{ t('payment.continueToGateway') }}</PrimaryButton>
  </a>
</div>
```

Add locale keys:

```json
"redirectTitle": "Secure payment",
"redirectDesc": "Continue to the hosted payment page to complete this order.",
"continueToGateway": "Continue to secure crypto checkout"
```

Thai copy:

```json
"redirectTitle": "ชำระเงินอย่างปลอดภัย",
"redirectDesc": "ไปยังหน้าชำระเงินที่ปลอดภัยเพื่อชำระคำสั่งซื้อนี้ให้เสร็จสมบูรณ์",
"continueToGateway": "ไปยังหน้าชำระเงินคริปโต"
```

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/web -- PaymentInstructionsPage`

Run: `npm run typecheck -w @cnx-athletx/web`

Expected: pass.

---

### Task 9: Admin Settings UI

**Files:**
- Modify: `packages/web/src/pages/AdminSettingsPage.vue`
- Modify or create: `packages/web/src/pages/AdminSettingsPage.test.ts`

- [ ] **Step 1: Write failing test**

Assert:

```ts
expect(wrapper.text()).toContain('NOWPayments crypto checkout')
expect(wrapper.text()).toContain('Requires NOWPayments API key and IPN secret in Worker environment secrets.')
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/web -- AdminSettingsPage`

Expected: fail because the option does not exist.

- [ ] **Step 3: Implement UI**

Add to `ALL_METHODS`:

```ts
{ id: 'nowpayments', label: 'NOWPayments crypto checkout' }
```

Add admin-only note:

```html
<p class="text-xs text-muted">NOWPayments requires API key and IPN secret in Worker environment secrets before customers can see it at checkout.</p>
```

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/web -- AdminSettingsPage`

Run: `npm run typecheck -w @cnx-athletx/web`

Expected: pass.

---

### Task 10: Configuration and Docs

**Files:**
- Modify: `packages/api/wrangler.toml`
- Modify: `docs/plan/01-executive-summary.md`
- Modify: `docs/plan/02-backend-architecture.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Add non-secret config**

Add vars:

```toml
NOWPAYMENTS_PRICE_CURRENCY = "thb"
```

For local sandbox, document:

```bash
NOWPAYMENTS_API_BASE_URL=https://api-sandbox.nowpayments.io/v1
```

Secrets:

```bash
wrangler secret put NOWPAYMENTS_API_KEY
wrangler secret put NOWPAYMENTS_IPN_SECRET
wrangler secret put SITE_URL
wrangler secret put API_BASE_URL
```

- [ ] **Step 2: Update architecture docs**

Record:

- NOWPayments uses hosted invoices, not direct deposit-address API.
- Checkout redirects customers to `invoice_url`.
- `success_url` and `cancel_url` only bring customers back to order status/payment UI.
- IPN is authoritative for order state.
- Non-terminal IPN statuses are acknowledged and ignored.
- `partially_paid` and `wrong_asset` are treated as `failed` for fulfillment safety.

- [ ] **Step 3: Update changelog**

Add under `[Unreleased]` / `Added`:

```md
- Planned NOWPayments hosted crypto invoice integration with stored redirect intents and IPN-driven payment confirmation.
```

Change "Planned" to "Added" when the implementation ships.

---

### Task 11: Full Verification

**Files:** no new files.

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run test:integration -w @cnx-athletx/api
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 2: Sandbox smoke test**

With NOWPayments sandbox credentials:

```bash
npm run dev:api
npm run dev:web
```

Manual flow:

1. Enable `"nowpayments"` in admin settings.
2. Place an order using NOWPayments crypto checkout.
3. Confirm the browser redirects to hosted NOWPayments invoice URL.
4. Cancel/return and confirm `/order/<orderId>/payment` shows a "Continue to secure crypto checkout" CTA.
5. Complete sandbox payment.
6. Confirm IPN marks the order `paid`.
7. Send duplicate `finished` IPN and confirm the route returns `{ ok: true, replayed: true }`.
8. Send `confirming` IPN and confirm the order remains `awaiting_gateway`.
9. Send `partially_paid` IPN in sandbox/test mode and confirm the order becomes `failed`, not `paid`.

Expected: no manual payment proof is needed for NOWPayments orders.

## Open Decisions Before Implementation

- Whether to let customers choose any crypto on the hosted invoice or constrain `NOWPAYMENTS_PAY_CURRENCY` to a stablecoin such as `usdttrc20`.
- Whether failed crypto payments should release inventory immediately or wait for an admin review window when funds may still have been received under `partially_paid` or `wrong_asset`.
- Whether to show NOWPayments fees/network volatility copy in checkout before redirect.

