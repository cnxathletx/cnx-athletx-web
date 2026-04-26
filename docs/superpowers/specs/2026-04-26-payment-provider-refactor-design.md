# Payment Provider Refactor — Design Spec

**Date:** 2026-04-26
**Status:** Approved (design phase)
**Scope:** Refactor only. No new payment providers wired. Future-proof for 2C2P (v2) and NowPayments crypto (later).

## Goal

Replace hardwired PromptPay + bank-transfer payment logic with a `PaymentProvider` registry pattern. After this refactor, adding a new provider (2C2P, NowPayments, etc.) means dropping a new file in `services/payments/` and registering it. Manual flow (PromptPay + bank transfer) must continue working with zero behavior change for end users — they will see a payment method picker at checkout instead of both methods on the payment page.

## Decisions (locked from brainstorming)

1. **Provider strategy:** Manual methods coexist with future gateways. PromptPay and bank transfer each become independent providers. (Q1=A, Q6=A.)
2. **2C2P scope:** Refactor only. No 2C2P code committed. (Q2=A.)
3. **Method selection UX:** Customer picks payment method at checkout step, before order creation. `payment_method` stored on `orders` row. (Q3=A.)
4. **Status state machine:** Add `awaiting_gateway`, `failed`, `refunded` now. (Q4=A.)
5. **Per-provider config:** Flat `site_settings` keys with provider prefix. (Q5=A.)
6. **Architecture:** Registry + Interface (functional, plain objects, no classes). Discriminated `PaymentIntent` union. (Approach #1.)

## Architecture

`services/payments/registry.ts` exports a `Map<ProviderId, PaymentProvider>`. The checkout route validates the customer's `payment_method`, looks up the provider, calls `createIntent`, and returns the resulting `PaymentIntent` to the frontend. The frontend switches on `intent.kind` to render instructions, perform a redirect, or initialize an SDK. Webhooks route to `provider.verifyWebhook` and update order state idempotently via a `UNIQUE(provider, provider_txn_id)` index on `payments`.

## Schema changes

Migration `0009_payment_providers.sql` (0008 is `rate_limits`):

```sql
-- Add payment_method to orders, backfilled from payments.method
ALTER TABLE orders ADD COLUMN payment_method TEXT;
UPDATE orders SET payment_method = (
  SELECT method FROM payments WHERE payments.order_id = orders.id LIMIT 1
);

-- Expand orders.status enum via SQLite table-rebuild pattern.
-- Final set: pending_payment, awaiting_gateway, paid, failed,
--            packed, shipped, delivered, refunded, cancelled.

-- Expand payments table
ALTER TABLE payments ADD COLUMN provider TEXT;
ALTER TABLE payments ADD COLUMN provider_txn_id TEXT;
ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE payments ADD COLUMN payload_json TEXT;
-- Backfill: provider := method, status := 'verified' if verified_at NOT NULL else 'pending'
-- Drop CHECK on payments.method via table-rebuild. Keep `method` for back-compat.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn
  ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;
```

`packages/api/src/routes/health.ts` `TEST_SCHEMA` constant must mirror the new shape so integration tests run against the same schema.

### Settings keys (flat, prefixed)

Existing keys unchanged: `promptpay_number`, `bank_name`, `bank_account_name`, `bank_account_number`.

New keys:

- `payment_methods_enabled` — JSON array (e.g. `["promptpay","bank_transfer"]`). Admin toggles which providers appear at checkout.

Future keys (not added in this refactor): `twoc2p_merchant_id`, `twoc2p_secret_key`, `twoc2p_currency`, `nowpay_api_key`, `nowpay_ipn_secret`.

## Provider interface

`packages/api/src/services/payments/types.ts`:

```ts
export type ProviderId = 'promptpay' | 'bank_transfer' | '2c2p' | 'nowpayments'

export type PaymentIntent =
  | { kind: 'instructions'; provider: ProviderId; instructions: Record<string, unknown> }
  | { kind: 'redirect'; provider: ProviderId; url: string; expires_at?: string }
  | { kind: 'sdk'; provider: ProviderId; client_token: string; provider_data: unknown }

export type WebhookResult =
  | { ok: true; order_id: string; provider_txn_id: string; status: 'paid' | 'failed' | 'refunded'; raw: unknown }
  | { ok: false; reason: string }

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: {
    order: { id: string; total_thb: number; customer_email: string }
    settings: SiteSettingsMap
    env: Env
  }): Promise<PaymentIntent>
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
```

`packages/api/src/services/payments/registry.ts`:

```ts
import { promptpayProvider } from './promptpay'
import { bankTransferProvider } from './bank-transfer'

const ALL: PaymentProvider[] = [promptpayProvider, bankTransferProvider]

export function getProvider(id: string): PaymentProvider | null {
  return ALL.find((p) => p.id === id) ?? null
}

export function listEnabledProviders(settings: SiteSettingsMap): PaymentProvider[] {
  const enabled = new Set<string>(JSON.parse(settings.payment_methods_enabled ?? '[]'))
  return ALL.filter((p) => enabled.has(p.id) && p.isEnabled(settings))
}
```

Each provider file (`promptpay.ts`, `bank-transfer.ts`) implements `PaymentProvider`. `createIntent` returns `{ kind: 'instructions', ... }` matching the current shape. `isEnabled` checks the required settings are non-empty (e.g. `promptpay_number` for PromptPay). Manual providers do not implement `verifyWebhook`.

## API contract changes

### `POST /api/checkout` — request

Adds required field `payment_method`. Validation rejects:

- Missing or non-string `payment_method` (400, validation error).
- Unknown id not in registry (400).
- Disabled id (not in `listEnabledProviders(settings)`) (400).

### `POST /api/checkout` — response

Replaces hardcoded `payment_instructions` object with a discriminated `intent` field:

```json
{
  "order_id": "01H...",
  "subtotal_thb": 159900,
  "shipping_thb": 10000,
  "discount_thb": 0,
  "total_thb": 169900,
  "intent": {
    "kind": "instructions",
    "provider": "promptpay",
    "instructions": {
      "promptpay_number": "0812345678",
      "qr_url": "https://promptpay.io/0812345678/1699.00.png",
      "amount_thb": "1699.00"
    }
  }
}
```

For `bank_transfer`, `instructions` is `{ bank_name, account_name, account_number, amount_thb }`. For future redirect providers, `intent.kind === 'redirect'` with `url`.

### Checkout flow inside route

1. Validate body (including `payment_method`).
2. Resolve `provider = getProvider(payment_method)`. Reject if null or disabled.
3. Reserve stock + create order with `payment_method` column set.
4. `intent = await provider.createIntent({ order, settings, env })`.
5. Return totals + `intent`.

### New endpoint `GET /api/payment-methods`

Public. Returns enabled providers for the checkout picker:

```json
{
  "methods": [
    { "id": "promptpay", "name": { "en": "PromptPay", "th": "พร้อมเพย์" } },
    { "id": "bank_transfer", "name": { "en": "Bank transfer", "th": "โอนเงิน" } }
  ]
}
```

### New endpoint `GET /api/orders/:id/intent`

Returns the persistent intent for an existing order (rebuilds from `payment_method` + current settings). Required so `PaymentInstructionsPage` survives reloads and device switches.

**Edge case — settings mutation after order creation:** If admin changes `promptpay_number` or bank details between order creation and customer reload, the rebuilt intent reflects current settings, not the original. Acceptable for v1 (manual flow, customer pays whoever is configured now). When non-manual providers are added, providers that mint a one-time URL/token (2C2P redirect) will need to persist the intent in a new `payment_intents` table. Out of scope for this refactor.

### Existing endpoint `POST /api/orders/:id/payment-proof`

Unchanged. Only manual providers use it.

### New endpoint `POST /api/payments/:provider/webhook`

Routes to `provider.verifyWebhook`. Idempotent via `UNIQUE(provider, provider_txn_id)`. Manual providers return 404. Rate limited via existing `rate_limits` table.

```ts
router.post('/api/payments/:provider/webhook', async (req, env) => {
  const provider = getProvider(params.provider)
  if (!provider?.verifyWebhook) {
    return Response.json({ error: 'Provider has no webhook' }, { status: 404 })
  }
  const result = await provider.verifyWebhook(req, env)
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 })

  const newStatus = mapWebhookToOrderStatus(result.status)  // 'paid'|'failed'|'refunded'
  const allowedFrom = allowedFromStates(result.status)
  // 'paid'/'failed' allowed only from pending_payment/awaiting_gateway
  // 'refunded' allowed only from paid/packed/shipped/delivered
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO payments (order_id, method, provider, provider_txn_id, amount_thb, status, payload_json, created_at)
         VALUES (?, ?, ?, ?, (SELECT total_thb FROM orders WHERE id = ?), ?, ?, ?)`
      ).bind(result.order_id, provider.id, provider.id, result.provider_txn_id, result.order_id, result.status, JSON.stringify(result.raw), now),
      env.DB.prepare(
        `UPDATE orders SET status = ?, updated_at = ?
         WHERE id = ? AND status IN (${allowedFrom.map(() => '?').join(',')})`
      ).bind(newStatus, now, result.order_id, ...allowedFrom),
    ])
  } catch (e) {
    if (isUniqueViolation(e)) return Response.json({ ok: true, replayed: true })
    return Response.json({ error: 'DB error' }, { status: 500 })
  }
  ctx.waitUntil(sendStatusEmail(env, result.order_id, result.status))
  return Response.json({ ok: true })
})
```

Helpers `mapWebhookToOrderStatus` and `allowedFromStates` live alongside the route. Status transition rules:

- `paid` → `orders.status = 'paid'`; allowed from `pending_payment`, `awaiting_gateway`.
- `failed` → `orders.status = 'failed'`; allowed from `pending_payment`, `awaiting_gateway`.
- `refunded` → `orders.status = 'refunded'`; allowed from `paid`, `packed`, `shipped`, `delivered`.

Each provider's `verifyWebhook` MUST verify HMAC/signature against secret in settings before returning `ok: true`.

## Frontend changes

### New module `packages/web/src/api/paymentMethods.ts`

Exports `fetchPaymentMethods()` calling `GET /api/payment-methods`. Cache via composable.

### Updated `packages/web/src/api/checkout.ts`

```ts
type Intent =
  | { kind: 'instructions'; provider: string; instructions: Record<string, unknown> }
  | { kind: 'redirect'; provider: string; url: string; expires_at?: string }
  | { kind: 'sdk'; provider: string; client_token: string; provider_data: unknown }

interface CheckoutResponse {
  order_id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  intent: Intent
}
```

Old `payment_instructions` shape removed. Discriminated union forces exhaustive handling at compile time.

### `CheckoutPage.vue`

Adds payment method picker section above "Place order":

- Radio list rendered from `fetchPaymentMethods()`.
- `payment_method` reactive ref; required. Defaults to first enabled.
- POST body includes `payment_method`.
- After response: route to `PaymentInstructionsPage` if `intent.kind === 'instructions'`, OR `window.location.href = intent.url` if `intent.kind === 'redirect'`.

### `PaymentInstructionsPage.vue`

Refactored to render based on `intent`:

- On mount, fetch order + intent via `GET /api/orders/:id/intent` (survives reload / device switch).
- Switch on `intent.provider` to choose component.
- New components `PromptPayInstructions.vue`, `BankTransferInstructions.vue`. Existing `PromptPayQR.vue` stays, nested inside `PromptPayInstructions.vue`.

### `AdminSettingsPage.vue`

Adds "Enabled payment methods" section with checkbox list. Writes `payment_methods_enabled` JSON array.

### i18n

Add keys `payment.method.promptpay` and `payment.method.bank_transfer` (display labels for picker) in both `en.json` and `th.json`. Existing payment instruction strings kept.

## Failure & lifecycle semantics

- Admin can mark payment proof rejected → order remains `pending_payment` (current behavior). New optional admin action "Mark order failed" → `orders.status = 'failed'`.
- `failed` orders trigger inventory release (extend current `cancelled` logic).
- New email events: `payment_failed`, `payment_refunded`. Add to `services/email.ts`.
- Existing `order_paid` email unchanged. Both webhook path and admin manual-verify path converge on the same `paid` transition + email.

## Testing

- **Unit tests** (`services/payments/*.test.ts`): per-provider `isEnabled` and `createIntent`; registry resolution and `listEnabledProviders` filtering.
- **Integration tests**:
  - `checkout.integration.test.ts`: missing/invalid/disabled `payment_method` (400); each enabled method returns correct `intent` shape.
  - `payments-webhook.integration.test.ts` (new): 404 for manual providers; replay returns `replayed: true`; fake provider with `verifyWebhook` transitions order to `paid`.
  - `admin-settings.integration.test.ts`: writing `payment_methods_enabled` reflects in `GET /api/payment-methods`.
- **E2E** (`e2e/shopping-flow.spec.ts`): update existing flow to pick payment method at checkout. Add second variant for `bank_transfer`.
- **Test schema**: `health.ts` `TEST_SCHEMA` kept in sync with migration.

## Migration plan (production)

1. Deploy migration `0009_payment_providers.sql` via wrangler. Backfill `orders.payment_method` from `payments.method`. Set default `payment_methods_enabled = '["promptpay","bank_transfer"]'`.
2. Deploy API + web together (single coordinated release). Both sides under our control, so no transitional dual-shape support is needed.
3. Smoke test: place test order with each method. Confirm admin dashboard shows `payment_method` column.
4. Update `docs/changelog.md` `[Unreleased]` section per repo convention.

## Files touched (estimate)

- **New (8):** `services/payments/types.ts`, `services/payments/registry.ts`, `services/payments/promptpay.ts`, `services/payments/bank-transfer.ts`, `routes/payments.ts`, `web/src/api/paymentMethods.ts`, `web/src/components/payment/PromptPayInstructions.vue`, `web/src/components/payment/BankTransferInstructions.vue`. Plus migration SQL.
- **Modified (~12):** `routes/checkout.ts`, `routes/orders.ts` (intent endpoint), `lib/types.ts`, `lib/validation.ts`, `routes/health.ts`, `routes/admin/settings.ts`, `web/src/api/checkout.ts`, `web/src/pages/CheckoutPage.vue`, `web/src/pages/PaymentInstructionsPage.vue`, `web/src/pages/AdminSettingsPage.vue`, `web/src/i18n/{en,th}.json`, `services/email.ts`.
- **Test files (~6):** as listed above.

## Out of scope

- Real 2C2P or NowPayments providers (each gets its own follow-up spec).
- Auto-expiry of `pending_payment` orders.
- Refund admin UI (`refunded` status exists in DB, no UI in this refactor).
