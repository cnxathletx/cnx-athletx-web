# Payment Provider Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the half-built `PaymentProvider` abstraction so checkout never reads payment-specific `site_settings` and the email layer never builds payment-method-specific HTML inline.

**Architecture:** Each provider declares `requiredSettingKeys` and a `renderInstructions(order, settings)` method that returns a structured `InstructionsBlock`. The email layer renders that block generically with brand styles. Checkout only calls `provider.createIntent` and `provider.renderInstructions`; the API response shape is unchanged.

**Tech Stack:** TypeScript on Cloudflare Workers, Vitest, D1, itty-router. npm workspaces (`packages/api`).

**Spec:** `docs/superpowers/specs/2026-04-27-payment-provider-abstraction-design.md`

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `packages/api/src/services/payments/types.ts` | modify | Add `InstructionsBlock` + extend `PaymentProvider` |
| `packages/api/src/services/payments/promptpay.ts` | modify | Add `requiredSettingKeys`, `renderInstructions` |
| `packages/api/src/services/payments/bank-transfer.ts` | modify | Same |
| `packages/api/src/services/email.ts` | modify | Add `renderInstructionsHtml`, retire `PaymentInstructions`, change signatures |
| `packages/api/src/services/email.test.ts` | create | Unit test for `renderInstructionsHtml` |
| `packages/api/src/routes/checkout.ts` | modify | Slim settings query, no direct payment-setting reads, pass `instructions` to email |
| `packages/api/src/lib/types.ts` | modify | Slim `SiteSettings` to shipping-only |
| `packages/api/src/services/payments/promptpay.test.ts` | modify | Add `renderInstructions` cases |
| `packages/api/src/services/payments/bank-transfer.test.ts` | modify | Add `renderInstructions` cases |

---

## Task 1: Extend provider interface with InstructionsBlock

**Files:**
- Modify: `packages/api/src/services/payments/types.ts`

- [ ] **Step 1: Replace the file contents**

```ts
import type {
  Env,
  ProviderId,
  PaymentIntent,
  WebhookResult,
  CheckoutOrderForIntent,
  SiteSettingsMap,
} from '../../lib/types'

export interface InstructionsBlockRow {
  label: string
  value: string
  mono?: boolean
}

export interface InstructionsBlock {
  title: string
  rows: InstructionsBlockRow[]
  qrImageUrl?: string
  ctaUrl?: string
  ctaLabel?: string
  footnote?: string
}

export interface PaymentProvider {
  id: ProviderId
  displayName: { en: string; th: string }
  requiredSettingKeys: readonly string[]
  isEnabled(settings: SiteSettingsMap): boolean
  createIntent(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
    env: Env
  }): Promise<PaymentIntent>
  renderInstructions(args: {
    order: CheckoutOrderForIntent
    settings: SiteSettingsMap
  }): InstructionsBlock | null
  verifyWebhook?(req: Request, env: Env): Promise<WebhookResult>
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run -w @cnx-athletx/api typecheck`
Expected: FAIL — `promptpayProvider` and `bankTransferProvider` missing `requiredSettingKeys` and `renderInstructions`.

- [ ] **Step 3: Do not commit yet**

The compile failure is intentional and resolved in tasks 2–3.

---

## Task 2: PromptPay — requiredSettingKeys + renderInstructions (TDD)

**Files:**
- Modify: `packages/api/src/services/payments/promptpay.test.ts`
- Modify: `packages/api/src/services/payments/promptpay.ts`

- [ ] **Step 1: Add failing tests**

Append inside the `describe('promptpayProvider', ...)` block in `promptpay.test.ts`:

```ts
  it('requiredSettingKeys lists promptpay_number', () => {
    expect(promptpayProvider.requiredSettingKeys).toEqual(['promptpay_number'])
  })

  it('renderInstructions returns null when promptpay_number missing', () => {
    expect(
      promptpayProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: {},
      })
    ).toBeNull()
    expect(
      promptpayProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: { promptpay_number: '   ' },
      })
    ).toBeNull()
  })

  it('renderInstructions returns block with rows, qrImageUrl, footnote', () => {
    const block = promptpayProvider.renderInstructions({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: { promptpay_number: '0812345678' },
    })
    expect(block).not.toBeNull()
    expect(block!.title).toBe('Payment Details')
    expect(block!.rows).toEqual([
      { label: 'Amount', value: '฿1,699.00' },
      { label: 'PromptPay', value: '0812345678' },
    ])
    expect(block!.qrImageUrl).toBe('https://promptpay.io/0812345678/1699.00.png')
    expect(block!.footnote).toMatch(/order ID/i)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cnx-athletx/api -- src/services/payments/promptpay.test.ts`
Expected: FAIL on the three new cases (`requiredSettingKeys` undefined, `renderInstructions` undefined).

- [ ] **Step 3: Replace `promptpay.ts` with extended implementation**

```ts
import type { PaymentProvider } from './types'

const REQUIRED = ['promptpay_number'] as const

function formatThbAmount(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const promptpayProvider: PaymentProvider = {
  id: 'promptpay',
  displayName: { en: 'PromptPay', th: 'พร้อมเพย์' },
  requiredSettingKeys: REQUIRED,

  isEnabled(settings) {
    return REQUIRED.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
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

  renderInstructions({ order, settings }) {
    const num = settings.promptpay_number
    if (!num || num.trim() === '') return null
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      title: 'Payment Details',
      rows: [
        { label: 'Amount', value: formatThbAmount(order.total_thb) },
        { label: 'PromptPay', value: num },
      ],
      qrImageUrl: `https://promptpay.io/${num}/${amountThb}.png`,
      footnote: 'Please use your order ID as the transfer reference.',
    }
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cnx-athletx/api -- src/services/payments/promptpay.test.ts`
Expected: PASS for all cases.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/payments/types.ts packages/api/src/services/payments/promptpay.ts packages/api/src/services/payments/promptpay.test.ts
git commit -m "feat(api): add renderInstructions to PromptPay provider"
```

---

## Task 3: Bank transfer — requiredSettingKeys + renderInstructions (TDD)

**Files:**
- Modify: `packages/api/src/services/payments/bank-transfer.test.ts`
- Modify: `packages/api/src/services/payments/bank-transfer.ts`

- [ ] **Step 1: Add failing tests**

Append inside the `describe('bankTransferProvider', ...)` block in `bank-transfer.test.ts`:

```ts
  it('requiredSettingKeys lists the three bank fields', () => {
    expect(bankTransferProvider.requiredSettingKeys).toEqual([
      'bank_name', 'bank_account_name', 'bank_account_number',
    ])
  })

  it('renderInstructions returns null when any field missing', () => {
    expect(
      bankTransferProvider.renderInstructions({
        order: { id: 'O1', total_thb: 100, customer_email: 'a@b.co' },
        settings: { bank_name: 'Kasikorn', bank_account_name: 'CNX' },
      })
    ).toBeNull()
  })

  it('renderInstructions returns block with all bank rows and footnote', () => {
    const block = bankTransferProvider.renderInstructions({
      order: { id: 'O1', total_thb: 169900, customer_email: 'a@b.co' },
      settings: {
        bank_name: 'Kasikorn',
        bank_account_name: 'CNX AthletX Co., Ltd.',
        bank_account_number: '123-4-56789-0',
      },
    })
    expect(block).not.toBeNull()
    expect(block!.title).toBe('Payment Details')
    expect(block!.rows).toEqual([
      { label: 'Amount', value: '฿1,699.00' },
      { label: 'Bank', value: 'Kasikorn' },
      { label: 'Account Name', value: 'CNX AthletX Co., Ltd.' },
      { label: 'Account Number', value: '123-4-56789-0' },
    ])
    expect(block!.qrImageUrl).toBeUndefined()
    expect(block!.footnote).toMatch(/order ID/i)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cnx-athletx/api -- src/services/payments/bank-transfer.test.ts`
Expected: FAIL on the three new cases.

- [ ] **Step 3: Replace `bank-transfer.ts`**

```ts
import type { PaymentProvider } from './types'

const REQUIRED = ['bank_name', 'bank_account_name', 'bank_account_number'] as const

function formatThbAmount(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const bankTransferProvider: PaymentProvider = {
  id: 'bank_transfer',
  displayName: { en: 'Bank transfer', th: 'โอนเงินผ่านธนาคาร' },
  requiredSettingKeys: REQUIRED,

  isEnabled(settings) {
    return REQUIRED.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
  },

  async createIntent({ order, settings }) {
    for (const k of REQUIRED) {
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

  renderInstructions({ order, settings }) {
    if (!REQUIRED.every((k) => settings[k] && settings[k].trim() !== '')) return null
    return {
      title: 'Payment Details',
      rows: [
        { label: 'Amount', value: formatThbAmount(order.total_thb) },
        { label: 'Bank', value: settings.bank_name },
        { label: 'Account Name', value: settings.bank_account_name },
        { label: 'Account Number', value: settings.bank_account_number },
      ],
      footnote: 'Please use your order ID as the transfer reference.',
    }
  },
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -w @cnx-athletx/api -- src/services/payments/bank-transfer.test.ts`
Expected: PASS for all cases.

Run: `npm run -w @cnx-athletx/api typecheck`
Expected: PASS (interface satisfied by both providers; checkout/email still type-check because `PaymentInstructions`-related code is untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/payments/bank-transfer.ts packages/api/src/services/payments/bank-transfer.test.ts
git commit -m "feat(api): add renderInstructions to bank-transfer provider"
```

---

## Task 4: Generic `renderInstructionsHtml` helper in email.ts (TDD)

**Files:**
- Create: `packages/api/src/services/email.test.ts`
- Modify: `packages/api/src/services/email.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest'
import { renderInstructionsHtml } from './email'
import type { InstructionsBlock } from './payments/types'

describe('renderInstructionsHtml', () => {
  const baseRows = [
    { label: 'Amount', value: '฿1,699.00' },
    { label: 'PromptPay', value: '0812345678' },
  ]

  it('renders title and rows', () => {
    const html = renderInstructionsHtml({ title: 'Payment Details', rows: baseRows })
    expect(html).toContain('Payment Details')
    expect(html).toContain('<strong>Amount:</strong> ฿1,699.00')
    expect(html).toContain('<strong>PromptPay:</strong> 0812345678')
  })

  it('escapes html in values and footnote', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: [{ label: 'X', value: '<script>x</script>' }],
      footnote: '<b>watch out</b>',
    })
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;watch out&lt;/b&gt;')
    expect(html).not.toContain('<script>x</script>')
  })

  it('renders qrImageUrl when provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      qrImageUrl: 'https://promptpay.io/0812345678/1699.00.png',
    })
    expect(html).toContain('<img')
    expect(html).toContain('src="https://promptpay.io/0812345678/1699.00.png"')
    expect(html).toContain('alt="PromptPay QR"')
  })

  it('omits qrImageUrl block when not provided', () => {
    const html = renderInstructionsHtml({ title: 'Payment Details', rows: baseRows })
    expect(html).not.toContain('<img')
  })

  it('renders cta link when ctaUrl + ctaLabel provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      ctaUrl: 'https://example.test/pay',
      ctaLabel: 'Pay now',
    })
    expect(html).toContain('href="https://example.test/pay"')
    expect(html).toContain('Pay now')
  })

  it('renders mono row with monospace font', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: [{ label: 'Account Number', value: '123-4-56789-0', mono: true }],
    })
    expect(html).toMatch(/font-family:\s*monospace/i)
    expect(html).toContain('123-4-56789-0')
  })

  it('renders footnote when provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      footnote: 'Please use your order ID as the transfer reference.',
    })
    expect(html).toContain('Please use your order ID as the transfer reference.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @cnx-athletx/api -- src/services/email.test.ts`
Expected: FAIL — `renderInstructionsHtml` is not exported.

- [ ] **Step 3: Add the helper to `email.ts`**

Insert this block in `packages/api/src/services/email.ts` immediately above the existing `export function buildOrderCreatedEmail(...)` (currently around line 172):

```ts
import type { InstructionsBlock } from './payments/types'

export function renderInstructionsHtml(block: InstructionsBlock): string {
  const rows = block.rows
    .map((r) => {
      const valueStyle = r.mono ? ' style="font-family: monospace;"' : ''
      return `<p style="margin: 8px 0 4px; font-size: 14px;"><strong>${escapeHtml(r.label)}:</strong> <span${valueStyle}>${escapeHtml(r.value)}</span></p>`
    })
    .join('')

  const qr = block.qrImageUrl
    ? `<p style="margin: 12px 0; text-align: center;"><img src="${block.qrImageUrl}" alt="PromptPay QR" style="display: inline-block; max-width: 220px; height: auto; border: 0;"></p>`
    : ''

  const cta = block.ctaUrl && block.ctaLabel
    ? `<p style="text-align: center; margin: 18px 0 6px;"><a href="${block.ctaUrl}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">${escapeHtml(block.ctaLabel)}</a></p>`
    : ''

  const footnote = block.footnote
    ? `<p style="margin: 12px 0 0; font-size: 13px; color: #555;">${escapeHtml(block.footnote)}</p>`
    : ''

  return `<div style="background: #F2EDE4; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: #2E2B26;">${escapeHtml(block.title)}</h3>
    ${rows}
    ${qr}
    ${cta}
    ${footnote}
  </div>`
}
```

Make sure the `import type { InstructionsBlock } from './payments/types'` line is added near the other imports at the top of the file rather than mid-file. Move it manually into the existing import section.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cnx-athletx/api -- src/services/email.test.ts`
Expected: PASS for all cases.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/email.ts packages/api/src/services/email.test.ts
git commit -m "feat(api): add generic renderInstructionsHtml email helper"
```

---

## Task 5: Switch `buildOrderCreatedEmail` and `sendOrderEmail` to InstructionsBlock

**Files:**
- Modify: `packages/api/src/services/email.ts`

- [ ] **Step 1: Replace `PaymentInstructions` interface and `buildOrderCreatedEmail`**

In `packages/api/src/services/email.ts`:

Delete this block (currently around lines 33-38):

```ts
export interface PaymentInstructions {
  promptpay_number: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
}
```

Replace `buildOrderCreatedEmail` (currently lines 172-205) with:

```ts
export function buildOrderCreatedEmail(order: OrderEmailData, instructions: InstructionsBlock | null): string {
  const paymentHtml = instructions ? renderInstructionsHtml(instructions) : ''

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Order Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Hi ${escapeHtml(order.customer_name)}, thank you for your order.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}
    ${paymentHtml}

    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">Once you've completed the transfer, you can submit your payment proof on our website. We'll verify it and get your order packed.</p>`

  return emailLayout('Order Confirmed — CNX AthletX', body)
}
```

- [ ] **Step 2: Update `sendOrderEmail` extra-arg type and dispatcher**

Replace the `sendOrderEmail` declaration (currently lines 379-422):

```ts
export async function sendOrderEmail(
  env: Env,
  event: 'order_created' | 'payment_confirmed' | 'order_shipped' | 'order_cancelled' | 'payment_failed' | 'payment_refunded',
  order: OrderEmailData,
  extra?: { instructions?: InstructionsBlock | null; shipment?: ShipmentData }
): Promise<void> {
  try {
    let subject: string
    let html: string

    switch (event) {
      case 'order_created':
        subject = `Order Confirmed — ${order.order_id}`
        html = buildOrderCreatedEmail(order, extra?.instructions ?? null)
        break
      case 'payment_confirmed':
        subject = `Payment Confirmed — ${order.order_id}`
        html = buildPaymentConfirmedEmail(order)
        break
      case 'order_shipped':
        subject = `Your Order Has Shipped — ${order.order_id}`
        html = buildOrderShippedEmail(order, extra!.shipment!)
        break
      case 'order_cancelled':
        subject = `Order Cancelled — ${order.order_id}`
        html = buildOrderCancelledEmail(order)
        break
      case 'payment_failed':
        subject = `Payment Failed — ${order.order_id}`
        html = buildPaymentFailedEmail(order)
        break
      case 'payment_refunded':
        subject = `Refund Issued — ${order.order_id}`
        html = buildPaymentRefundedEmail(order)
        break
    }

    const ok = await sendResendEmail(env, order.customer_email, subject, html)
    await logEmail(env, order.order_id, event, order.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, order.order_id, event, order.customer_email, 'failed', message)
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run -w @cnx-athletx/api typecheck`
Expected: FAIL — `routes/checkout.ts` still references `PaymentInstructions` and the old `extra.payment` shape. Resolved in Task 6.

- [ ] **Step 4: Do not commit yet**

The compile failure is expected and resolved by Task 6.

---

## Task 6: Wire checkout to use `renderInstructions`; drop direct payment-setting reads

**Files:**
- Modify: `packages/api/src/routes/checkout.ts`
- Modify: `packages/api/src/lib/types.ts`

- [ ] **Step 1: Slim `SiteSettings` in `lib/types.ts`**

Replace (currently lines 125-133):

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

with:

```ts
export interface SiteSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
}
```

- [ ] **Step 2: Update settings query and removed-field usage in `routes/checkout.ts`**

Replace the settings block (currently `checkout.ts:151-179`) with:

```ts
    // --- Fetch site settings ---
    let settings: SiteSettings
    let settingsMap: SiteSettingsMap
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings`
      ).all<{ key: string; value: string }>()

      settingsMap = {}
      for (const row of results) {
        settingsMap[row.key] = row.value
      }

      settings = {
        shipping_flat_rate: parseInt(settingsMap.shipping_flat_rate ?? '10000', 10),
        shipping_free_threshold: parseInt(settingsMap.shipping_free_threshold ?? '0', 10),
      }
    } catch {
      return Response.json({ error: 'Database error fetching site settings' }, { status: 500 })
    }
```

Reading the whole `site_settings` row set is acceptable here — the table is small (~10 rows) and providers may declare their own keys. The shipping-only typed view stays narrow.

- [ ] **Step 3: Replace the `sendOrderEmail` call site**

Replace the `ctx.waitUntil(sendOrderEmail(...))` block (currently `checkout.ts:483-492`) with:

```ts
    const instructions = provider.renderInstructions({
      order: { id: orderId, total_thb: total, customer_email: data.customer.email.toLowerCase().trim() },
      settings: settingsMap,
    })

    ctx.waitUntil(
      sendOrderEmail(env, 'order_created', orderEmailData, { instructions }).catch((err) =>
        console.error('order_created email failed:', err)
      )
    )
```

- [ ] **Step 4: Verify no leftover references**

Run: `grep -n "promptpay_number\|bank_name\|bank_account_name\|bank_account_number\|PaymentInstructions" packages/api/src/routes/checkout.ts packages/api/src/services/email.ts packages/api/src/lib/types.ts`
Expected: NO matches.

- [ ] **Step 5: Run typecheck**

Run: `npm run -w @cnx-athletx/api typecheck`
Expected: PASS.

- [ ] **Step 6: Run unit tests**

Run: `npm test -w @cnx-athletx/api`
Expected: PASS — including the new email and provider tests.

- [ ] **Step 7: Run integration tests**

Run: `npm run -w @cnx-athletx/api test:integration`
Expected: PASS — `intent.instructions.promptpay_number`, `intent.instructions.bank_name`, etc. assertions are unchanged because `createIntent` output is untouched.

- [ ] **Step 8: Commit**

```bash
git add packages/api/src/services/email.ts packages/api/src/routes/checkout.ts packages/api/src/lib/types.ts
git commit -m "refactor(api): route checkout email through provider.renderInstructions

Drops direct reads of promptpay_number/bank_* in checkout and the inline
payment HTML in the order_created email. PaymentInstructions type retired.
API response shape unchanged."
```

---

## Task 7: Final acceptance sweep

**Files:** none (verification only)

- [ ] **Step 1: Confirm acceptance criteria from spec**

Run each command, verify expected output:

```bash
# 1. checkout.ts contains no payment-setting key strings
grep -n "promptpay_number\|bank_name\|bank_account_name\|bank_account_number" packages/api/src/routes/checkout.ts
```
Expected: NO matches.

```bash
# 2. email.ts contains no payment-setting key strings
grep -n "promptpay_number\|bank_name\|bank_account_name\|bank_account_number" packages/api/src/services/email.ts
```
Expected: NO matches.

```bash
# 3. PaymentInstructions type does not exist anywhere in the api package
grep -rn "PaymentInstructions" packages/api/src
```
Expected: NO matches.

```bash
# 4. Full test suite green
npm run -w @cnx-athletx/api test:all
```
Expected: PASS.

- [ ] **Step 2: Update changelog**

Append to the `[Unreleased]` section of `docs/changelog.md` under `### Changed`:

```
- API: payment provider abstraction now owns email-instruction rendering — checkout no longer reads PromptPay/bank settings directly, easing addition of new gateways (e.g. 2C2P).
```

- [ ] **Step 3: Update technical-debt roadmap**

In `docs/technical-debpt-roadmap.md`, move item **Critical #1 — Payment provider plumbing leaks into checkout** to a new section at the bottom:

```
## Done
- [2026-04-27] Critical #1 — Payment provider plumbing extracted (renderInstructions on PaymentProvider). See `docs/superpowers/specs/2026-04-27-payment-provider-abstraction-design.md`.
```

Renumber remaining Critical items (2→1, 3→2, 4→3) and bump the `Last updated:` date.

- [ ] **Step 4: Commit**

```bash
git add docs/changelog.md docs/technical-debpt-roadmap.md
git commit -m "docs: mark payment provider abstraction (critical #1) done"
```

---

## Self-review notes

- All spec sections covered: interface (Task 1), providers (Tasks 2–3), email layer (Tasks 4–5), checkout (Task 6), types (Task 6), acceptance (Task 7).
- No `PaymentInstructions` references survive in code; old `extra.payment` shape replaced by `extra.instructions`.
- Tests in Task 2/3 lock the exact `rows` shape so future refactors of providers won't silently change email output.
- Amount formatting (`formatThbAmount`) is duplicated across the two providers — intentional; full extraction is roadmap #7 (`lib/money.ts`).
- Settings query in checkout switches from `WHERE key IN (...)` to a full table scan. The table is bounded and small (≤ ~12 rows in v1); the trade-off is acceptable and matches the goal of keeping checkout free of payment-key knowledge.
