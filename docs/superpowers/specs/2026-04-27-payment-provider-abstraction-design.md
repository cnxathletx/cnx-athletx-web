# Payment Provider Abstraction — Design Spec

**Date:** 2026-04-27
**Roadmap item:** Critical #1 — `docs/technical-debpt-roadmap.md`
**Status:** Approved

---

## Goal

Complete the half-built `PaymentProvider` abstraction so:

- Checkout never reads payment-specific `site_settings` keys directly.
- Email layer never builds payment-method-specific HTML inline.
- Adding a new gateway (e.g. 2C2P, NOWPayments) means dropping a new provider file and registering it — no edits to `routes/checkout.ts` or `services/email.ts`.

## Non-goals

- Webhook dispatcher (roadmap #11).
- Typed settings loader (roadmap #6).
- Money helper extraction (roadmap #7).
- Brand/i18n config extraction from email templates (roadmap #2).
- Order state machine (roadmap #3).
- Inventory service (roadmap #4).

These remain separate roadmap items.

## Current state (snapshot)

- `services/payments/types.ts` defines `PaymentProvider` with `id`, `displayName`, `isEnabled`, `createIntent`, optional `verifyWebhook`.
- `promptpay.ts` and `bank-transfer.ts` implement it.
- `registry.ts` exposes `getProvider`, `listEnabledProviders`, `parseEnabledMethods`.
- `routes/checkout.ts` already calls `provider.createIntent` for the API response.
- BUT `routes/checkout.ts:151-179` still reads `promptpay_number`, `bank_name`, `bank_account_name`, `bank_account_number` to populate `SiteSettings`, then `routes/checkout.ts:484-490` passes them as `PaymentInstructions` into `sendOrderEmail`.
- `services/email.ts:33-38` defines `PaymentInstructions` and `services/email.ts:172-188` hard-codes PromptPay/bank HTML in `buildOrderCreatedEmail`.

## Design

### 1. Provider interface — extend

`packages/api/src/services/payments/types.ts`:

```ts
export interface InstructionsBlock {
  title: string                                          // e.g. "Payment Details"
  rows: { label: string; value: string; mono?: boolean }[]
  qrImageUrl?: string                                    // PromptPay
  ctaUrl?: string                                        // future redirect-style gateways (2C2P)
  ctaLabel?: string
  footnote?: string                                      // e.g. "Use your order ID as the transfer reference."
}

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  requiredSettingKeys: readonly string[]                 // NEW — single source for isEnabled + admin validation
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: { ... }): Promise<PaymentIntent>
  renderInstructions(args: {                             // NEW — returns email block, or null if N/A
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
  }): InstructionsBlock | null
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
```

`isEnabled` may be implemented by reusing `requiredSettingKeys` (default predicate: every key non-empty), but each provider can override if it has extra logic. To keep things simple, leave `isEnabled` explicitly implemented in each provider but DRY it via `requiredSettingKeys.every(k => settings[k]?.trim())`.

`renderInstructions` returning `null` is reserved for future redirect-only providers where there is no useful email block; v1 providers always return a block.

### 2. PromptPay provider — `services/payments/promptpay.ts`

```ts
requiredSettingKeys: ['promptpay_number'] as const,

renderInstructions({ order, settings }) {
  const num = settings.promptpay_number ?? ''
  if (!num.trim()) return null
  const amountThb = (order.total_thb / 100).toFixed(2)
  return {
    title: 'Payment Details',
    rows: [
      { label: 'Amount', value: formatThb(order.total_thb) },
      { label: 'PromptPay', value: num },
    ],
    qrImageUrl: `https://promptpay.io/${num}/${amountThb}.png`,
    footnote: 'Please use your order ID as the transfer reference.',
  }
}
```

`createIntent` stays as-is. `formatThb` is the existing helper from `services/email.ts` — to keep this provider free of an email-layer import, expose it via `lib/money.ts` as a one-liner re-export now (small pre-extraction), or duplicate the `฿X.XX` format inline. Decision: **inline `฿${(satang/100).toLocaleString(...)}` in each provider for now**; full `lib/money.ts` extraction is roadmap #7.

### 3. Bank-transfer provider — `services/payments/bank-transfer.ts`

```ts
requiredSettingKeys: ['bank_name', 'bank_account_name', 'bank_account_number'] as const,

renderInstructions({ order, settings }) {
  const required = ['bank_name', 'bank_account_name', 'bank_account_number'] as const
  if (!required.every(k => settings[k]?.trim())) return null
  return {
    title: 'Payment Details',
    rows: [
      { label: 'Amount', value: formatThbInline(order.total_thb) },
      { label: 'Bank', value: settings.bank_name },
      { label: 'Account Name', value: settings.bank_account_name },
      { label: 'Account Number', value: settings.bank_account_number },
    ],
    footnote: 'Please use your order ID as the transfer reference.',
  }
}
```

### 4. Email layer — `services/email.ts`

- Delete `PaymentInstructions` interface.
- Add `renderInstructionsHtml(block: InstructionsBlock): string` helper — generic renderer using existing brand styles. Output structure:
  - Outer `<div style="background: #F2EDE4; border-radius: 8px; padding: 20px; margin: 24px 0;">`
  - `<h3>` for `block.title` (existing styling)
  - One `<p>` per row with `<strong>{label}:</strong> {escapeHtml(value)}` (rows with `mono: true` get `font-family: monospace`)
  - If `qrImageUrl`: `<img src=... alt="PromptPay QR" style="display:block; margin: 12px 0; max-width: 200px;">` (NEW — current email omits the QR; small visual addition justified because the PromptPay number alone is hard for users)
  - If `ctaUrl`+`ctaLabel`: anchor styled like the existing primary button
  - If `footnote`: `<p style="margin: 12px 0 0; font-size: 13px; color: #555;">{footnote}</p>`
  - `escapeHtml` applied to every `value` and `footnote`.
- `buildOrderCreatedEmail(order: OrderEmailData, instructions: InstructionsBlock | null): string` — embeds `renderInstructionsHtml(instructions)` if non-null, otherwise omits the block.
- `sendOrderEmail` extra changes:
  ```ts
  extra?: { instructions?: InstructionsBlock | null; shipment?: ShipmentData }
  ```

### 5. Checkout — `routes/checkout.ts`

- Settings query (`checkout.ts:155-161`) drops `promptpay_number`, `bank_name`, `bank_account_name`, `bank_account_number`. Keeps `shipping_flat_rate`, `shipping_free_threshold`, `payment_methods_enabled`.
- `SiteSettings` literal (`checkout.ts:168-176`) drops payment fields. `settingsMap` is still built and passed unchanged to providers.
- After `provider.createIntent`, also compute:
  ```ts
  const instructions = provider.renderInstructions({
    order: { id: orderId, total_thb: total, customer_email: ... },
    settings: settingsMap,
  })
  ```
- `sendOrderEmail(env, 'order_created', orderEmailData, { instructions })`.

### 6. Type cleanup — `lib/types.ts`

- `SiteSettings` slims to shipping-only:
  ```ts
  export interface SiteSettings {
    shipping_flat_rate: number
    shipping_free_threshold: number
  }
  ```
- `payment_methods_enabled` was already an unused `string[]` here (parsed via `parseEnabledMethods` in registry). Drop it from `SiteSettings`.

### 7. Admin settings validation — `routes/admin/settings.ts`

No required change for v1 — admin can save any allowed key. Optional later improvement: cross-check that providers in `payment_methods_enabled` have their `requiredSettingKeys` populated. Out of scope here.

## Touchpoints

| File | Change |
|------|--------|
| `packages/api/src/services/payments/types.ts` | Add `InstructionsBlock`, `requiredSettingKeys`, `renderInstructions` |
| `packages/api/src/services/payments/promptpay.ts` | Add `requiredSettingKeys`, `renderInstructions` |
| `packages/api/src/services/payments/bank-transfer.ts` | Add `requiredSettingKeys`, `renderInstructions` |
| `packages/api/src/services/payments/registry.ts` | No change |
| `packages/api/src/services/email.ts` | Drop `PaymentInstructions`, add `renderInstructionsHtml`, change `buildOrderCreatedEmail` and `sendOrderEmail` signatures |
| `packages/api/src/routes/checkout.ts` | Slim settings query/type, call `renderInstructions`, pass to email |
| `packages/api/src/lib/types.ts` | Slim `SiteSettings`, no other change |
| `packages/api/src/services/payments/promptpay.test.ts` | Add `renderInstructions` tests |
| `packages/api/src/services/payments/bank-transfer.test.ts` | Add `renderInstructions` tests |
| `packages/api/src/routes/checkout.integration.test.ts` | Verify behavior unchanged for `intent.instructions` shape; verify email path still works |
| `packages/api/src/routes/payment-methods.integration.test.ts` | Same as above |

## Migration / compatibility

- API response shape (`POST /api/checkout` → `intent.instructions`) is unchanged: `provider.createIntent` continues to return the same `PaymentIntent` payload. Frontend code untouched.
- DB schema unchanged.
- `site_settings` keys unchanged.

## Risks

1. **Email visual regression.** The structured renderer must produce HTML close enough to today's hand-built block. Mitigation: keep markup nearly identical (same `#F2EDE4` background, same headings, same row layout). One intentional addition: PromptPay block now includes the QR `<img>` (today's email shows only the number). Visually diff one rendered email of each method locally before merging.
2. **Tests asserting `PaymentInstructions` import** — type is removed. Mitigation: grep for `PaymentInstructions` in `packages/api/`, update or delete usages.
3. **Future provider with no email block.** Handled by `renderInstructions` returning `null`; email skips the block.

## Acceptance criteria

- `routes/checkout.ts` contains no string literals matching `promptpay_number`, `bank_name`, `bank_account_*`.
- `services/email.ts` contains no string literals matching `promptpay_number`, `bank_name`, `bank_account_*`.
- `PaymentInstructions` type does not exist anywhere.
- `npm test` (api workspace) passes, including new `renderInstructions` unit tests.
- `POST /api/checkout` with `payment_method: 'promptpay'` still returns `intent.instructions.promptpay_number` and `qr_url` in the API response.
- Order-created email sent during integration tests still contains the PromptPay number / bank details when respective method is used.
