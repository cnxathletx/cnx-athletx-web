# 2C2P Hosted Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 2C2P Hosted Payment Page / Redirect API as an automated payment method for CNX AthletX checkout.

**Architecture:** Keep 2C2P behind the existing `PaymentProvider` abstraction. Checkout creates the local order, asks 2C2P for a payment token, returns a redirect intent to the Vue app, and moves the order into `awaiting_gateway`; 2C2P backend notification is the only source that marks the order `paid` or `failed`. Browser return only redirects the customer to the order status page.

**Tech Stack:** Cloudflare Worker, D1, TypeScript, Web Crypto HMAC SHA-256 JWT, Vue 3 + Vite, Vitest, Wrangler integration tests.

---

## External References

- 2C2P overview and integration methods: https://developer.2c2p.com/docs/general
- Redirect API flow: https://developer.2c2p.com/docs/redirect-api-how-it-works
- Sandbox and JWT authentication: https://developer.2c2p.com/docs/sandbox-setup
- Payment Token request parameters: https://developer.2c2p.com/docs/api-payment-token-request-parameter
- Backend payment response: https://developer.2c2p.com/docs/api-payment-response-backend
- Frontend payment response: https://developer.2c2p.com/docs/api-payment-response-frontend

## Files

- Create `packages/api/src/services/payments/2c2p-jwt.ts`: base64url, JWT signing, JWT verification with Worker Web Crypto.
- Create `packages/api/src/services/payments/2c2p-jwt.test.ts`: round-trip and tamper tests for JWT helper.
- Create `packages/api/src/services/payments/2c2p-client.ts`: config parsing, amount/date formatting, Payment Token API call.
- Create `packages/api/src/services/payments/2c2p-client.test.ts`: config, payload, and mocked fetch tests.
- Create `packages/api/src/services/payments/2c2p.ts`: `PaymentProvider` implementation and webhook verifier.
- Create `packages/api/src/services/payments/2c2p.test.ts`: provider behavior and webhook verification tests.
- Modify `packages/api/src/lib/types.ts`: add 2C2P env vars and provider interface support types.
- Modify `packages/api/src/services/payments/types.ts`: allow providers to declare required env keys and to render instructions from redirect intents.
- Modify `packages/api/src/services/payments/registry.ts`: register 2C2P and pass `env` to enablement checks.
- Modify `packages/api/src/services/payments/registry.test.ts`: expect `getProvider('2c2p')` and env-gated enablement.
- Modify `packages/api/src/routes/payment-methods.ts`: pass `env` to `listEnabledProviders`.
- Modify `packages/api/src/routes/checkout.ts`: create redirect intent before emails, mark 2C2P orders `awaiting_gateway`, rollback inventory/discount on gateway init failure.
- Modify `packages/api/src/routes/payments.ts`: add 2C2P frontend-return route and keep backend webhook route canonical.
- Modify `packages/api/src/routes/payments-webhook.integration.test.ts`: add end-to-end 2C2P webhook status tests.
- Modify `packages/api/src/services/settings.ts`: allow any 2C2P admin-visible non-secret setting if used; keep secrets in Worker env.
- Modify `packages/web/src/pages/AdminSettingsPage.vue`: add `2C2P Hosted Checkout` to enabled method checkboxes and show env-secret note.
- Modify `packages/web/src/i18n/en.json` and `packages/web/src/i18n/th.json`: add any new customer-facing payment/return strings if a return page is introduced.
- Modify `packages/api/wrangler.toml`, `.dev.vars.example` if present, and docs: document required 2C2P env vars without committing secrets.
- Modify `docs/plan/02-backend-architecture.md`, `docs/plan/01-executive-summary.md`, and `docs/changelog.md`: record gateway integration behavior.

## Required Runtime Configuration

Use Worker env vars / Wrangler secrets, not D1 settings, for credentials:

- `TWOC2P_MERCHANT_ID`: 2C2P merchant ID.
- `TWOC2P_SECRET_KEY`: 2C2P HMAC secret key.
- `TWOC2P_ENVIRONMENT`: `sandbox` or `production`; default to `sandbox` outside production.
- `SITE_URL`: public storefront origin, for example `https://cnx-athletx.com`.
- `API_BASE_URL`: public API origin if different from `SITE_URL`; default to `SITE_URL`.

Do not enable `"2c2p"` in `payment_methods_enabled` until sandbox credentials are configured and webhook tests pass.

---

### Task 1: JWT Helper

**Files:**
- Create: `packages/api/src/services/payments/2c2p-jwt.ts`
- Create: `packages/api/src/services/payments/2c2p-jwt.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```ts
it('signs and verifies a JWT payload with HS256', async () => {
  const token = await sign2c2pJwt({ invoiceNo: '01HXTESTORDER', amount: '100.00' }, 'secret')
  await expect(verify2c2pJwt(token, 'secret')).resolves.toEqual({
    invoiceNo: '01HXTESTORDER',
    amount: '100.00',
  })
})

it('rejects a tampered JWT payload', async () => {
  const token = await sign2c2pJwt({ invoiceNo: '01HXTESTORDER' }, 'secret')
  const [header, payload, signature] = token.split('.')
  const tamperedPayload = payload.replace(/.$/, payload.endsWith('A') ? 'B' : 'A')
  await expect(verify2c2pJwt(`${header}.${tamperedPayload}.${signature}`, 'secret')).rejects.toThrow('Invalid JWT signature')
})
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/api -- 2c2p-jwt.test.ts`

Expected: fails because `2c2p-jwt.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

Implement:

```ts
export async function sign2c2pJwt(payload: Record<string, unknown>, secret: string): Promise<string>
export async function verify2c2pJwt<T extends Record<string, unknown>>(token: string, secret: string): Promise<T>
```

Use `crypto.subtle.importKey` with `{ name: 'HMAC', hash: 'SHA-256' }`, base64url without padding, and constant byte comparison for signatures.

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- 2c2p-jwt.test.ts`

Expected: pass.

---

### Task 2: 2C2P Client

**Files:**
- Create: `packages/api/src/services/payments/2c2p-client.ts`
- Create: `packages/api/src/services/payments/2c2p-client.test.ts`
- Modify: `packages/api/src/lib/types.ts`

- [ ] **Step 1: Write failing tests**

Cover these cases:

```ts
expect(get2c2pConfig({
  TWOC2P_MERCHANT_ID: 'JT01',
  TWOC2P_SECRET_KEY: 'secret',
  TWOC2P_ENVIRONMENT: 'sandbox',
  SITE_URL: 'https://shop.example',
} as Env)).toMatchObject({
  merchantId: 'JT01',
  secretKey: 'secret',
  apiBaseUrl: 'https://sandbox-pgw.2c2p.com',
  appBaseUrl: 'https://shop.example',
})
```

```ts
expect(format2c2pAmount(12345)).toBe('123.45')
expect(format2c2pAmount(100)).toBe('1.00')
```

Mock `fetch` and assert `requestPaymentToken()` posts to `/payment/4.3/paymentToken` with `{ payload: '<jwt>' }`, decodes the JWT response, and returns `{ paymentToken, webPaymentUrl, respCode, respDesc }`.

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/api -- 2c2p-client.test.ts`

Expected: fails because the client does not exist and `Env` does not include the new keys.

- [ ] **Step 3: Implement client**

Add `Env` keys:

```ts
TWOC2P_MERCHANT_ID?: string
TWOC2P_SECRET_KEY?: string
TWOC2P_ENVIRONMENT?: 'sandbox' | 'production'
SITE_URL?: string
API_BASE_URL?: string
```

Client functions:

```ts
export function get2c2pConfig(env: Env): TwoC2PConfig
export function format2c2pAmount(satang: number): string
export function build2c2pPaymentTokenPayload(args: { order: CheckoutOrderForIntent; config: TwoC2PConfig; locale: 'en' | 'th'; paymentExpiry: string }): Record<string, unknown>
export async function request2c2pPaymentToken(args: { env: Env; order: CheckoutOrderForIntent; locale: 'en' | 'th'; paymentExpiry: string }): Promise<TwoC2PPaymentTokenResponse>
```

Payload fields:

```ts
{
  merchantID: config.merchantId,
  invoiceNo: order.id,
  idempotencyID: order.id,
  description: `CNX AthletX order ${order.id}`,
  amount: format2c2pAmount(order.total_thb),
  currencyCode: 'THB',
  locale,
  frontendReturnUrl: `${config.apiBaseUrl}/api/payments/2c2p/return`,
  backendReturnUrl: `${config.apiBaseUrl}/api/payments/webhook/2c2p`,
  userDefined1: order.id,
}
```

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- 2c2p-client.test.ts`

Expected: pass.

---

### Task 3: Provider Registration

**Files:**
- Create: `packages/api/src/services/payments/2c2p.ts`
- Create: `packages/api/src/services/payments/2c2p.test.ts`
- Modify: `packages/api/src/services/payments/types.ts`
- Modify: `packages/api/src/services/payments/registry.ts`
- Modify: `packages/api/src/services/payments/registry.test.ts`
- Modify: `packages/api/src/routes/payment-methods.ts`

- [ ] **Step 1: Write failing tests**

Expected behavior:

```ts
expect(getProvider('2c2p')?.displayName.en).toBe('2C2P secure checkout')

expect(listEnabledProviders({
  payment_methods_enabled: '["2c2p"]',
}, {
  TWOC2P_MERCHANT_ID: 'JT01',
  TWOC2P_SECRET_KEY: 'secret',
  SITE_URL: 'https://shop.example',
} as Env).map((p) => p.id)).toEqual(['2c2p'])

expect(listEnabledProviders({ payment_methods_enabled: '["2c2p"]' }, {} as Env)).toEqual([])
```

- [ ] **Step 2: Run failing tests**

Run: `npm test -w @cnx-athletx/api -- registry.test.ts 2c2p.test.ts`

Expected: fails because provider is not registered and registry does not accept `env`.

- [ ] **Step 3: Implement provider and registry changes**

Change provider interface to:

```ts
requiredEnvKeys?: readonly (keyof Env)[]
isEnabled(settings: SiteSettingsMap, env?: Env): boolean
renderInstructions(args: {
  order: CheckoutOrderForIntent
  settings: SiteSettingsMap
  intent?: PaymentIntent
}): InstructionsBlock | null
```

Register `twoC2PProvider` in `ALL`.

Provider behavior:

- `id: '2c2p'`
- `displayName: { en: '2C2P secure checkout', th: 'ชำระเงินปลอดภัยผ่าน 2C2P' }`
- `isEnabled` requires `TWOC2P_MERCHANT_ID`, `TWOC2P_SECRET_KEY`, and `SITE_URL`.
- `createIntent` calls `request2c2pPaymentToken` and returns `{ kind: 'redirect', provider: '2c2p', url: response.webPaymentUrl }` only when `respCode === '0000'`.
- `renderInstructions` returns a CTA block only when passed a redirect intent.

- [ ] **Step 4: Verify**

Run: `npm test -w @cnx-athletx/api -- registry.test.ts 2c2p.test.ts`

Expected: pass.

---

### Task 4: Checkout Flow

**Files:**
- Modify: `packages/api/src/routes/checkout.ts`
- Modify: `packages/api/src/routes/checkout.integration.test.ts`

- [ ] **Step 1: Write failing integration tests**

Add tests for:

- Checkout with `"payment_method": "2c2p"` returns `intent.kind === 'redirect'`.
- Created 2C2P order status is `awaiting_gateway`.
- `payment_methods_enabled` containing `"2c2p"` does not expose 2C2P when env secrets are missing.
- If 2C2P token creation fails, checkout returns `502`, inventory reservation is released, and discount use count is rolled back.

- [ ] **Step 2: Run failing tests**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts payment-methods.integration.test.ts`

Expected: fails before checkout supports 2C2P.

- [ ] **Step 3: Implement checkout changes**

Update `listEnabledProviders(settingsMap, env)` call sites.

Move payment intent creation before order-created emails so redirect CTA can be included in the email. For 2C2P only:

- insert order as `pending_payment`,
- create 2C2P intent,
- update order to `awaiting_gateway`,
- send customer/admin emails,
- return redirect intent.

On 2C2P intent failure after order insert:

- release inventory,
- roll back discount commit,
- set order status to `failed`,
- return `{ error: 'Failed to initialize payment' }` with `502`.

Manual providers keep current `pending_payment` behavior.

- [ ] **Step 4: Verify**

Run: `npm run test:integration -w @cnx-athletx/api -- checkout.integration.test.ts payment-methods.integration.test.ts`

Expected: pass.

---

### Task 5: Webhook Verification

**Files:**
- Modify: `packages/api/src/services/payments/2c2p.ts`
- Modify: `packages/api/src/services/payments/2c2p.test.ts`
- Modify: `packages/api/src/routes/payments-webhook.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Provider unit tests:

- Valid backend JWT payload with `respCode: '0000'` maps to `{ ok: true, status: 'paid' }`.
- Valid backend JWT payload with a non-success `respCode` maps to `{ ok: true, status: 'failed' }`.
- Wrong merchant ID returns `{ ok: false, reason: 'Invalid merchant' }`.
- Amount mismatch returns `{ ok: false, reason: 'Invalid amount' }`.
- Missing transaction reference returns `{ ok: false, reason: 'Missing transaction reference' }`.

Integration test:

- Create an `awaiting_gateway` order, post a signed 2C2P webhook to `/api/payments/webhook/2c2p`, assert order becomes `paid` and one `payments` row is inserted.
- Post the same webhook again and assert `{ ok: true, replayed: true }`.

- [ ] **Step 2: Run failing tests**

Run: `npm test -w @cnx-athletx/api -- 2c2p.test.ts`

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: fails because webhook verification is not implemented.

- [ ] **Step 3: Implement verifier**

`verifyWebhook(req, env)` should:

- parse JSON body with `payload`,
- verify JWT using `TWOC2P_SECRET_KEY`,
- validate `merchantID === TWOC2P_MERCHANT_ID`,
- use `invoiceNo` as the order ID,
- fetch the order from D1 and compare `total_thb` to `amount`,
- set `provider_txn_id` to `paymentID || tranRef || referenceNo`,
- map `respCode === '0000'` to `paid`, all other valid responses to `failed`,
- return raw decoded payload for audit storage.

- [ ] **Step 4: Verify**

Run both commands from Step 2.

Expected: pass.

---

### Task 6: Frontend Return Endpoint

**Files:**
- Modify: `packages/api/src/routes/payments.ts`
- Modify: `packages/api/src/routes/payments-webhook.integration.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for `POST /api/payments/2c2p/return`:

- Given form body `paymentResponse=<base64url-json>`, decode `invoiceNo` and return `303 Location: ${SITE_URL}/order/${invoiceNo}`.
- If body is missing or invalid, return `303 Location: ${SITE_URL}/order/status`.

- [ ] **Step 2: Run failing tests**

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: fails because return route does not exist.

- [ ] **Step 3: Implement route**

Add `router.post('/api/payments/2c2p/return', ...)`.

This route must not mark orders as paid. It only decodes the browser response enough to choose a redirect URL. Payment state changes remain webhook-driven.

- [ ] **Step 4: Verify**

Run: `npm run test:integration -w @cnx-athletx/api -- payments-webhook.integration.test.ts`

Expected: pass.

---

### Task 7: Admin Settings UI

**Files:**
- Modify: `packages/web/src/pages/AdminSettingsPage.vue`
- Modify: `packages/web/src/pages/AdminSettingsPage.test.ts` if test file exists; otherwise create a focused component test only if current web test setup supports this page cleanly.

- [ ] **Step 1: Write failing test or perform scoped manual verification plan**

Preferred test assertion:

```ts
expect(wrapper.text()).toContain('2C2P Hosted Checkout')
expect(wrapper.text()).toContain('Requires Worker environment secrets')
```

- [ ] **Step 2: Run failing test**

Run: `npm test -w @cnx-athletx/web -- AdminSettingsPage`

Expected: fails if test exists; if no suitable test harness exists, record manual verification in the implementation notes and rely on `npm run typecheck`.

- [ ] **Step 3: Implement UI**

Add to `ALL_METHODS`:

```ts
{ id: '2c2p', label: '2C2P Hosted Checkout' }
```

Add a short admin-only note near enabled methods:

```html
<p class="text-xs text-muted">2C2P requires Worker environment secrets before customers can see it at checkout.</p>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck -w @cnx-athletx/web`

Expected: pass.

---

### Task 8: Configuration and Docs

**Files:**
- Modify: `packages/api/wrangler.toml`
- Modify: `.dev.vars.example` if present
- Modify: `docs/plan/01-executive-summary.md`
- Modify: `docs/plan/02-backend-architecture.md`
- Modify: `docs/changelog.md`

- [ ] **Step 1: Document config**

Add non-secret defaults only:

```toml
TWOC2P_ENVIRONMENT = "sandbox"
```

Document these as secrets/env vars:

```bash
wrangler secret put TWOC2P_MERCHANT_ID
wrangler secret put TWOC2P_SECRET_KEY
wrangler secret put SITE_URL
wrangler secret put API_BASE_URL
```

- [ ] **Step 2: Update architecture docs**

Record:

- 2C2P is redirect-hosted, not Direct API.
- Customer browser return does not confirm payment.
- Backend webhook is authoritative.
- Manual PromptPay/bank transfer remain available.

- [ ] **Step 3: Update changelog**

Add under `[Unreleased]` / `Added`:

```md
- Planned 2C2P Hosted Payment Page integration with redirect intents and webhook-driven order confirmation.
```

Replace "planned" with "added" when implementation is complete.

---

### Task 9: Full Verification

**Files:** no new files.

- [ ] **Step 1: Run unit and integration tests**

Run:

```bash
npm test
npm run test:integration -w @cnx-athletx/api
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 2: Sandbox smoke test**

With sandbox credentials in `.dev.vars`, run:

```bash
npm run dev:api
npm run dev:web
```

Manual flow:

1. Enable `"2c2p"` in admin settings.
2. Place an order using 2C2P.
3. Confirm browser redirects to 2C2P hosted page.
4. Complete sandbox payment with a 2C2P test card.
5. Confirm browser returns to `/order/<orderId>`.
6. Confirm webhook marks the order `paid`.
7. Confirm duplicate webhook does not duplicate payment rows.

Expected: no manual payment proof is needed for the 2C2P order.

## Open Decisions Before Implementation

- Whether to keep `payment_methods_enabled` as the only admin toggle for 2C2P, or add a separate visible "gateway configured" status in admin settings.
- Whether 2C2P order-created emails should include a "Pay securely" CTA immediately, or keep the email as an order receipt and rely on the browser redirect.
- Whether `API_BASE_URL` is necessary in production or same-origin `/api` is guaranteed for CNX AthletX.

