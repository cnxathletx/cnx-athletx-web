# Email Templates: Brand Config + (event, locale) Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract brand identity from inline strings into a static module; refactor every email template into a registry keyed by `(event, locale)`; capture customer locale at checkout; ship EN copy byte-equivalent to today, with TH stubs that fall back to EN until copy lands.

**Architecture:** New `packages/api/src/services/email/` directory replaces `services/email.ts`. `brand.ts` holds identity + palette; `layout.ts` holds shared HTML helpers consuming `brand`; `templates.ts` is a `Record<event, Record<locale, renderer>>` registry; `send.ts` holds Resend dispatch + logging; `index.ts` re-exports the public API at the original import path. New `lib/locale.ts` centralizes locale parsing. New column `orders.locale` persists the customer's locale at checkout.

**Tech Stack:** TypeScript, Cloudflare Workers, D1 (SQLite), Vitest, itty-router, Vue 3 + vue-i18n on the web side.

**Spec:** `docs/superpowers/specs/2026-04-27-email-templates-i18n-design.md`

---

## File Structure

New:
- `packages/api/sql/migrations/0010_orders_locale.sql`
- `packages/api/src/lib/locale.ts`
- `packages/api/src/lib/locale.test.ts`
- `packages/api/src/services/email/brand.ts`
- `packages/api/src/services/email/layout.ts`
- `packages/api/src/services/email/templates.ts`
- `packages/api/src/services/email/send.ts`
- `packages/api/src/services/email/index.ts`
- `packages/api/src/services/email/templates.test.ts`

Modified:
- `packages/api/sql/schema.sql` — orders CREATE gains `locale` column
- `packages/api/src/routes/health.ts` — TEST_SCHEMA gains `locale` column
- `packages/api/src/routes/products.ts` — local `resolveLocale` replaced with shared import
- `packages/api/src/routes/checkout.ts` — accept + persist `locale`
- `packages/api/src/routes/auth.ts` — parse Accept-Language, pass locale to `sendMagicLinkEmail`
- `packages/api/src/lib/types.ts` — `OrderRow.locale`, `CheckoutBody.locale`, `OrderEmailData.locale`
- `packages/api/src/lib/validation.ts` — `validateCheckoutBody` accepts optional `locale`
- `packages/api/src/services/email.test.ts` — unchanged content; import path resolves through new `email/index.ts` after delete
- `packages/web/src/api/checkout.ts` — `CheckoutPayload.locale`, `submitCheckout` includes it
- `packages/web/src/pages/CheckoutPage.vue` (or whatever calls `submitCheckout`) — passes current i18n locale

Deleted:
- `packages/api/src/services/email.ts` — replaced by `services/email/` directory

---

## Task 1: Migration + canonical schema for `orders.locale`

**Files:**
- Create: `packages/api/sql/migrations/0010_orders_locale.sql`
- Modify: `packages/api/sql/schema.sql:146` (orders CREATE)
- Modify: `packages/api/src/routes/health.ts` (TEST_SCHEMA inline `orders` CREATE)

- [ ] **Step 1: Write the migration**

Create `packages/api/sql/migrations/0010_orders_locale.sql`:

```sql
-- Adds locale column to orders to capture the customer's language at checkout.
-- Used by transactional email templates to render the correct locale even on re-sends.
ALTER TABLE orders ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en','th'));
```

- [ ] **Step 2: Update canonical schema.sql**

In `packages/api/sql/schema.sql`, find the `CREATE TABLE IF NOT EXISTS orders (...)` block (line 146). Add `locale` after `status` and before `idempotency_key`:

```sql
  status TEXT NOT NULL DEFAULT 'pending_payment',
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','th')),
  idempotency_key TEXT NOT NULL UNIQUE,
```

(Keep the existing CHECK on `status` unchanged — it stays at the bottom of the column list.)

- [ ] **Step 3: Update test schema in health.ts**

`routes/health.ts` `TEST_SCHEMA` is one giant string. Find the substring inside the `orders` CREATE: `status TEXT NOT NULL DEFAULT 'pending_payment',idempotency_key`. Replace with:

```
status TEXT NOT NULL DEFAULT 'pending_payment',locale TEXT NOT NULL DEFAULT 'en',idempotency_key
```

(No CHECK in test schema to keep the inline string short — the migration enforces it in prod.)

- [ ] **Step 4: Run integration tests against test DB to confirm schema is valid**

Run: `npm --workspace packages/api run test:integration`
Expected: All existing tests pass. New column defaults to `'en'` for every row.

- [ ] **Step 5: Apply migration to local D1 and verify column shape**

Run: `npx wrangler d1 migrations apply DB --local --config packages/api/wrangler.toml`
Then: `npx wrangler d1 execute DB --local --config packages/api/wrangler.toml --command "PRAGMA table_info(orders);" | grep locale`
Expected: a row showing `locale | TEXT | NOT NULL | 'en'`.

- [ ] **Step 6: Commit**

```bash
git add packages/api/sql/migrations/0010_orders_locale.sql \
        packages/api/sql/schema.sql \
        packages/api/src/routes/health.ts
git commit -m "feat(api): add orders.locale column for email i18n"
```

---

## Task 2: Shared `lib/locale.ts` helpers (TDD)

**Files:**
- Create: `packages/api/src/lib/locale.ts`
- Create: `packages/api/src/lib/locale.test.ts`
- Modify: `packages/api/src/routes/products.ts:42-50` (replace local `resolveLocale`)

- [ ] **Step 1: Write the failing test**

Create `packages/api/src/lib/locale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAcceptLanguage, resolveQueryLocale, SUPPORTED_LOCALES } from './locale'

describe('SUPPORTED_LOCALES', () => {
  it('exposes en and th', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'th'])
  })
})

describe('parseAcceptLanguage', () => {
  it('returns en when header is null', () => {
    expect(parseAcceptLanguage(null)).toBe('en')
  })

  it('returns en when header is empty', () => {
    expect(parseAcceptLanguage('')).toBe('en')
  })

  it('returns th when th appears first', () => {
    expect(parseAcceptLanguage('th-TH,en;q=0.5')).toBe('th')
  })

  it('returns th when th has higher q than en', () => {
    expect(parseAcceptLanguage('en;q=0.5,th;q=0.9')).toBe('th')
  })

  it('returns en when en has higher q than th', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,th;q=0.5')).toBe('en')
  })

  it('returns en for unsupported languages', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en')
  })

  it('handles bare th without region', () => {
    expect(parseAcceptLanguage('th')).toBe('th')
  })

  it('treats malformed q values as default 1.0', () => {
    expect(parseAcceptLanguage('th;q=garbage,en')).toBe('th')
  })
})

describe('resolveQueryLocale', () => {
  it('returns en when query param is missing', () => {
    expect(resolveQueryLocale(null)).toBe('en')
  })

  it('returns th when query param is th', () => {
    expect(resolveQueryLocale('th')).toBe('th')
  })

  it('lowercases input', () => {
    expect(resolveQueryLocale('TH')).toBe('th')
  })

  it('returns en for unsupported value', () => {
    expect(resolveQueryLocale('jp')).toBe('en')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm --workspace packages/api run test -- locale`
Expected: FAIL — module `./locale` not found.

- [ ] **Step 3: Implement `lib/locale.ts`**

Create `packages/api/src/lib/locale.ts`:

```ts
export const SUPPORTED_LOCALES = ['en', 'th'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES)

export function resolveQueryLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'en'
  const value = raw.toLowerCase()
  return SUPPORTED_SET.has(value) ? (value as Locale) : 'en'
}

interface RankedLang {
  tag: string
  q: number
}

export function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return 'en'

  const parts = header.split(',')
  const ranked: RankedLang[] = []

  for (const part of parts) {
    const segments = part.trim().split(';')
    const tag = segments[0]?.trim().toLowerCase()
    if (!tag) continue

    let q = 1.0
    for (let i = 1; i < segments.length; i++) {
      const s = segments[i].trim()
      if (s.startsWith('q=')) {
        const parsed = parseFloat(s.slice(2))
        if (Number.isFinite(parsed)) q = parsed
      }
    }

    ranked.push({ tag, q })
  }

  ranked.sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0]
    if (SUPPORTED_SET.has(primary)) return primary as Locale
  }

  return 'en'
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm --workspace packages/api run test -- locale`
Expected: PASS — all 13 cases green.

- [ ] **Step 5: Replace local `resolveLocale` in `routes/products.ts`**

In `packages/api/src/routes/products.ts`, delete lines 42-50 (the local `SUPPORTED_LOCALES`, `Locale` type, and `resolveLocale` function). Replace with:

```ts
import { resolveQueryLocale, type Locale } from '../lib/locale'
```

(Add the import to the existing import block at the top of the file.)

Then find the call site `const locale = resolveLocale(request)` (around line 187) and change to:

```ts
const locale = resolveQueryLocale(new URL(request.url).searchParams.get('locale'))
```

- [ ] **Step 6: Run all api tests**

Run: `npm --workspace packages/api run test`
Expected: PASS — products tests still green; new locale tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/lib/locale.ts \
        packages/api/src/lib/locale.test.ts \
        packages/api/src/routes/products.ts
git commit -m "refactor(api): centralize locale parsing in lib/locale"
```

---

## Task 3: Static `email/brand.ts` module

**Files:**
- Create: `packages/api/src/services/email/brand.ts`

(No tests — it's a static config object. Type-checking is the contract.)

- [ ] **Step 1: Create the module**

Create `packages/api/src/services/email/brand.ts`:

```ts
export interface Brand {
  name: string
  tagline: string
  domain: string
  contactEmail: string
  fromAddress: string
  logoUrl: string
  palette: {
    bg: string
    surface: string
    text: string
    muted: string
    headerBg: string
    headerFg: string
    footerBg: string
    footerFg: string
    primary: string
    accent: string
    panel: string
    border: string
  }
}

export const brand: Brand = {
  name: 'CNX AthletX',
  tagline: 'Plant-Based Protein, Chiang Mai',
  domain: 'www.cnxnature.com',
  contactEmail: 'orders@cnxnature.com',
  fromAddress: 'CNX AthletX <orders@cnxnature.com>',
  logoUrl: 'https://www.cnxnature.com/email-mark.png?v=3',
  palette: {
    bg: '#F2EDE4',
    surface: '#ffffff',
    text: '#2E2B26',
    muted: '#555',
    headerBg: '#2E2B26',
    headerFg: '#E5DDD0',
    footerBg: '#252320',
    footerFg: '#8B8580',
    primary: '#8B9A7B',
    accent: '#B53A32',
    panel: '#F2EDE4',
    border: '#E8E2D8',
  },
}
```

- [ ] **Step 2: Type-check**

Run: `npm --workspace packages/api run typecheck` (or `tsc --noEmit` per project convention)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/email/brand.ts
git commit -m "feat(api): add email Brand config module"
```

---

## Task 4: `email/layout.ts` — shared HTML helpers consuming `brand`

**Files:**
- Create: `packages/api/src/services/email/layout.ts`

This is a literal extraction of helpers from the current `services/email.ts`, with hardcoded strings replaced by `brand` references. Behavior must be byte-equivalent to today's output.

- [ ] **Step 1: Create the module**

Create `packages/api/src/services/email/layout.ts`:

```ts
import { escapeHtml } from '../../lib/utils'
import type { InstructionsBlock } from '../payments/types'
import { brand } from './brand'

export interface EmailItem {
  name: string
  quantity: number
  line_total_thb: number
}

export function formatThb(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function emailLayout(title: string, body: string): string {
  const p = brand.palette
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: ${p.text}; margin: 0; padding: 0; background: ${p.bg};">
  <div style="max-width: 600px; margin: 0 auto; background: ${p.surface};">
    <div style="background: ${p.headerBg}; padding: 24px; text-align: center;">
      <img src="${brand.logoUrl}" alt="${escapeHtml(brand.name)}" width="48" height="48" style="display: block; margin: 0 auto 8px; width: 48px; height: 48px; border: 0;">
      <h1 style="margin: 0; color: ${p.headerFg}; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">${escapeHtml(brand.name)}</h1>
    </div>
    <div style="padding: 32px 24px;">
      ${body}
    </div>
    <div style="background: ${p.footerBg}; padding: 20px 24px; text-align: center;">
      <p style="margin: 0; color: ${p.footerFg}; font-size: 12px;">${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline)}</p>
      <p style="margin: 4px 0 0; color: ${p.footerFg}; font-size: 12px;">Questions? Contact us at ${escapeHtml(brand.contactEmail)}</p>
    </div>
  </div>
</body>
</html>`
}

export function itemsTableHtml(items: EmailItem[]): string {
  const p = brand.palette
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px;">${escapeHtml(item.name)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px; text-align: right;">${formatThb(item.line_total_thb)}</td>
        </tr>`
    )
    .join('')

  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="border-bottom: 2px solid ${p.text};">
        <th style="padding: 8px 0; text-align: left; font-size: 13px; font-weight: 600;">Item</th>
        <th style="padding: 8px 0; text-align: center; font-size: 13px; font-weight: 600;">Qty</th>
        <th style="padding: 8px 0; text-align: right; font-size: 13px; font-weight: 600;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

export interface OrderTotalsInput {
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
}

export function orderTotalsHtml(order: OrderTotalsInput): string {
  const p = brand.palette
  let html = `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.muted};">Subtotal</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatThb(order.subtotal_thb)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.muted};">Shipping</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${order.shipping_thb === 0 ? 'Free' : formatThb(order.shipping_thb)}</td>
    </tr>`

  if (order.discount_thb > 0) {
    html += `<tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.primary};">Discount</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right; color: ${p.primary};">-${formatThb(order.discount_thb)}</td>
    </tr>`
  }

  html += `<tr>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; border-top: 2px solid ${p.text};">Total</td>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; text-align: right; border-top: 2px solid ${p.text};">${formatThb(order.total_thb)}</td>
    </tr>
  </table>`

  return html
}

export function renderInstructionsHtml(block: InstructionsBlock): string {
  const p = brand.palette
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
    ? `<p style="text-align: center; margin: 18px 0 6px;"><a href="${block.ctaUrl}" style="display: inline-block; background-color: ${p.primary}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">${escapeHtml(block.ctaLabel)}</a></p>`
    : ''

  const footnote = block.footnote
    ? `<p style="margin: 12px 0 0; font-size: 13px; color: ${p.muted};">${escapeHtml(block.footnote)}</p>`
    : ''

  return `<div style="background: ${p.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: ${p.text};">${escapeHtml(block.title)}</h3>
    ${rows}
    ${qr}
    ${cta}
    ${footnote}
  </div>`
}
```

Notes on byte-equivalence:
- Today's hardcoded `#2E2B26` becomes `${p.text}` and `${p.headerBg}` — both are `#2E2B26`. Same output.
- Today's hardcoded `#F2EDE4` is split between `bg`, `panel` — both `#F2EDE4`.
- Footer copy was inline `'CNX AthletX — Plant-Based Protein, Chiang Mai'`. Now `${brand.name} — ${brand.tagline}`. Identical.
- Logo `?v=3` cache-buster preserved in `brand.logoUrl`.
- The single behavioral nuance: the logo `alt` was previously `"CNX AthletX"` (raw); now `escapeHtml(brand.name)` — same value, same string (no HTML chars to escape).

- [ ] **Step 2: Type-check + run existing email.test.ts**

The existing `services/email.test.ts` still imports from `'./email'` — `services/email.ts` hasn't been touched yet. Tests should still pass.

Run: `npm --workspace packages/api run test -- email`
Expected: PASS — all existing email tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/email/layout.ts
git commit -m "feat(api): extract email layout helpers consuming brand config"
```

---

## Task 5: `email/templates.ts` — registry

**Files:**
- Create: `packages/api/src/services/email/templates.ts`
- Create: `packages/api/src/services/email/templates.test.ts`

This is the largest task. Each template body is a literal copy of today's `build*Email` function from `services/email.ts`, with the layout-helper imports redirected to `./layout`. EN entries match today byte-for-byte; TH entries delegate to EN until real copy lands. Review prompt is the exception: TH copy already exists today and is preserved.

- [ ] **Step 1: Write the failing tests**

Create `packages/api/src/services/email/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  orderTemplates,
  adminTemplates,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
} from './templates'
import { brand } from './brand'
import type { OrderEmailData } from './send'
import type { InstructionsBlock } from '../payments/types'

const ORDER_EVENTS: OrderEvent[] = [
  'order_created',
  'payment_confirmed',
  'order_shipped',
  'order_cancelled',
  'payment_failed',
  'payment_refunded',
]

function makeOrder(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    order_id: 'ORD-T-001',
    customer_name: 'Jane',
    customer_email: 'j@example.com',
    items: [{ name: 'Protein 500g', quantity: 1, line_total_thb: 89900 }],
    subtotal_thb: 89900,
    shipping_thb: 0,
    discount_thb: 0,
    total_thb: 89900,
    locale: 'en',
    ...overrides,
  }
}

const promptpayBlock: InstructionsBlock = {
  title: 'Payment Details',
  rows: [{ label: 'PromptPay', value: '0812345678' }],
}

describe('orderTemplates', () => {
  for (const event of ORDER_EVENTS) {
    for (const locale of ['en', 'th'] as const) {
      it(`${event} / ${locale} renders subject + html with brand and order id`, () => {
        const renderer = orderTemplates[event][locale]
        const out = renderer({
          order: makeOrder({ locale }),
          instructions: event === 'order_created' ? promptpayBlock : null,
          shipment: event === 'order_shipped'
            ? { carrier: 'Kerry', tracking_number: 'KRY1' }
            : undefined,
        })
        expect(out.subject).toBeTruthy()
        expect(out.html).toContain(brand.name)
        expect(out.html).toContain('ORD-T-001')
      })
    }
  }
})

describe('adminTemplates.new_order.en', () => {
  it('renders with order id and customer info', () => {
    const out = adminTemplates.new_order.en({
      order: makeOrder(),
      address: {
        line1: '123 Test',
        district: 'Mueang',
        province: 'Chiang Mai',
        postal_code: '50200',
      },
    })
    expect(out.subject).toContain('ORD-T-001')
    expect(out.html).toContain('123 Test')
    expect(out.html).toContain('j@example.com')
  })
})

describe('magicLinkTemplate', () => {
  for (const locale of ['en', 'th'] as const) {
    it(`${locale} renders subject and includes magic link url`, () => {
      const out = magicLinkTemplate[locale]({
        magicLinkUrl: 'https://www.cnxnature.com/auth/verify?token=abc',
        expiryMinutes: 15,
      })
      expect(out.subject).toBeTruthy()
      expect(out.html).toContain('https://www.cnxnature.com/auth/verify?token=abc')
    })
  }
})

describe('reviewPromptTemplate', () => {
  const baseInput = {
    customer_name: 'Buyer',
    product_lines: [{ name: 'AthletX Protein' }],
    review_url: 'https://www.cnxnature.com/account?tab=reviews',
    order_id: '01H123',
  }

  it('en renders with English subject', () => {
    const out = reviewPromptTemplate.en(baseInput)
    expect(out.subject).toMatch(/How was/i)
    expect(out.html).toContain('AthletX Protein')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('th renders with Thai subject', () => {
    const out = reviewPromptTemplate.th(baseInput)
    expect(out.subject).toContain('โปรตีน')
    expect(out.html).toContain(baseInput.review_url)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm --workspace packages/api run test -- templates`
Expected: FAIL — module `./templates` not found, `OrderEmailData` not exported from `./send`.

- [ ] **Step 3: Implement the registry**

Create `packages/api/src/services/email/templates.ts`:

```ts
import { escapeHtml } from '../../lib/utils'
import type { InstructionsBlock } from '../payments/types'
import {
  emailLayout,
  itemsTableHtml,
  orderTotalsHtml,
  renderInstructionsHtml,
  formatThb,
} from './layout'
import { brand } from './brand'
import type { Locale } from '../../lib/locale'

// Re-export Locale for convenience at the email-domain boundary.
export type { Locale }

export type OrderEvent =
  | 'order_created'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_cancelled'
  | 'payment_failed'
  | 'payment_refunded'

export interface RenderedEmail {
  subject: string
  html: string
}

export interface OrderEmailItem {
  name: string
  quantity: number
  line_total_thb: number
}

export interface OrderRenderInput {
  order_id: string
  customer_name: string
  customer_email: string
  items: OrderEmailItem[]
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  locale: Locale
}

export interface OrderTemplateCtx {
  order: OrderRenderInput
  instructions?: InstructionsBlock | null
  shipment?: { carrier: string; tracking_number: string }
}

type OrderRenderer = (ctx: OrderTemplateCtx) => RenderedEmail

// --- order_created ---

const orderCreatedEn: OrderRenderer = ({ order, instructions }) => {
  const paymentHtml = instructions ? renderInstructionsHtml(instructions) : ''
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Order Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, thank you for your order.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}
    ${paymentHtml}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Once you've completed the transfer, you can submit your payment proof on our website. We'll verify it and get your order packed.</p>`

  return {
    subject: `Order Confirmed — ${order.order_id}`,
    html: emailLayout(`Order Confirmed — ${brand.name}`, body),
  }
}

// --- payment_confirmed ---

const paymentConfirmedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Payment Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, we've verified your payment. Your order is now being prepared.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <div style="background: ${brand.palette.primary}; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 600;">Your order is being packed and will ship soon.</p>
    </div>

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">We'll send you another email with tracking information once your order ships.</p>`

  return {
    subject: `Payment Confirmed — ${order.order_id}`,
    html: emailLayout(`Payment Confirmed — ${brand.name}`, body),
  }
}

// --- order_shipped ---

const orderShippedEn: OrderRenderer = ({ order, shipment }) => {
  if (!shipment) throw new Error('order_shipped requires shipment')
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Your Order Has Shipped</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, your order is on its way.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px; font-size: 16px; color: ${brand.palette.text};">Shipping Details</h3>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Carrier:</strong> ${escapeHtml(shipment.carrier)}</p>
      <p style="margin: 0; font-size: 14px;"><strong>Tracking Number:</strong> ${escapeHtml(shipment.tracking_number)}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Thank you for choosing ${escapeHtml(brand.name)}. We hope you enjoy your order!</p>`

  return {
    subject: `Your Order Has Shipped — ${order.order_id}`,
    html: emailLayout(`Your Order Has Shipped — ${brand.name}`, body),
  }
}

// --- order_cancelled ---

const orderCancelledEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Order Cancelled</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, your order has been cancelled.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">If you believe this was a mistake or have any questions, please contact us at ${escapeHtml(brand.contactEmail)}.</p>`

  return {
    subject: `Order Cancelled — ${order.order_id}`,
    html: emailLayout(`Order Cancelled — ${brand.name}`, body),
  }
}

// --- payment_failed ---

const paymentFailedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.accent};">Payment Failed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, we couldn't confirm your payment for the order below.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Please try the payment again from your order page, or contact us at <a href="mailto:contact@${brand.domain.replace(/^www\./, '')}" style="color: ${brand.palette.primary};">contact@${brand.domain.replace(/^www\./, '')}</a> for help.</p>`

  return {
    subject: `Payment Failed — ${order.order_id}`,
    html: emailLayout(`Payment Failed — ${brand.name}`, body),
  }
}

// --- payment_refunded ---

const paymentRefundedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Refund Issued</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, a refund of <strong>${formatThb(order.total_thb)}</strong> has been issued for the order below.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">The funds should appear in your account within 5–10 business days depending on your bank or card issuer.</p>`

  return {
    subject: `Refund Issued — ${order.order_id}`,
    html: emailLayout(`Refund Issued — ${brand.name}`, body),
  }
}

export const orderTemplates: Record<OrderEvent, Record<Locale, OrderRenderer>> = {
  order_created:     { en: orderCreatedEn,     th: (ctx) => orderCreatedEn(ctx) },
  payment_confirmed: { en: paymentConfirmedEn, th: (ctx) => paymentConfirmedEn(ctx) },
  order_shipped:     { en: orderShippedEn,     th: (ctx) => orderShippedEn(ctx) },
  order_cancelled:   { en: orderCancelledEn,   th: (ctx) => orderCancelledEn(ctx) },
  payment_failed:    { en: paymentFailedEn,    th: (ctx) => paymentFailedEn(ctx) },
  payment_refunded:  { en: paymentRefundedEn,  th: (ctx) => paymentRefundedEn(ctx) },
}

// --- Admin templates (EN only) ---

export interface AdminOrderAddress {
  line1: string
  line2?: string
  district: string
  province: string
  postal_code: string
}

export interface AdminNewOrderCtx {
  order: OrderRenderInput
  address?: AdminOrderAddress
  discountCode?: string
}

const adminNewOrderEn = ({ order, address, discountCode }: AdminNewOrderCtx): RenderedEmail => {
  let customerHtml = `<div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: ${brand.palette.text};">Customer</h3>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(order.customer_email)}</p>`

  if (address) {
    customerHtml += `<h3 style="margin: 16px 0 12px; font-size: 16px; color: ${brand.palette.text};">Shipping Address</h3>
    <p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line1)}</p>`
    if (address.line2) {
      customerHtml += `<p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line2)}</p>`
    }
    customerHtml += `<p style="margin: 0; font-size: 14px;">${escapeHtml(address.district)}, ${escapeHtml(address.province)} ${escapeHtml(address.postal_code)}</p>`
  }

  customerHtml += `</div>`

  const discountHtml = discountCode
    ? `<p style="margin: 0 0 4px; font-size: 14px;"><strong>Discount Code:</strong> ${escapeHtml(discountCode)}</p>`
    : ''

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">New Order Received</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">A new order has been placed and is awaiting payment.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${customerHtml}
    ${discountHtml}
    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}`

  return {
    subject: `New Order — ${order.order_id}`,
    html: emailLayout(`New Order — ${brand.name}`, body),
  }
}

export interface AdminNewChatCtx {
  guest_name: string
  guest_email: string
  initial_message: string
  created_at: string
}

const adminNewChatEn = (data: AdminNewChatCtx): RenderedEmail => {
  const adminUrl = `https://${brand.domain}/admin/chat`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">New Chat Started</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">A visitor has started a new support conversation.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>From:</strong> ${escapeHtml(data.guest_name)}</p>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(data.guest_email)}</p>
      <p style="margin: 0 0 12px; font-size: 13px; color: ${brand.palette.muted};"><strong>Started:</strong> ${escapeHtml(data.created_at)}</p>
      <p style="margin: 12px 0 4px; font-size: 13px; color: ${brand.palette.muted};"><strong>First message:</strong></p>
      <div style="background: ${brand.palette.surface}; border-radius: 6px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(data.initial_message)}</div>
    </div>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${adminUrl}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Open Chat Dashboard
      </a>
    </p>`

  return {
    subject: `New chat from ${data.guest_name}`,
    html: emailLayout(`New Chat — ${brand.name}`, body),
  }
}

export const adminTemplates = {
  new_order: { en: adminNewOrderEn },
  new_chat:  { en: adminNewChatEn },
}

// --- Magic link ---

export interface MagicLinkCtx {
  magicLinkUrl: string
  expiryMinutes: number
}

const magicLinkEn = ({ magicLinkUrl, expiryMinutes }: MagicLinkCtx): RenderedEmail => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Log in to ${escapeHtml(brand.name)}</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Click the button below to log in. This link expires in ${expiryMinutes} minutes.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Log In
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">If you did not request this link, you can safely ignore this email.</p>
    <p style="margin: 8px 0 0; font-size: 12px; color: #777; word-break: break-all;">${magicLinkUrl}</p>`

  return {
    subject: `Log in to ${brand.name}`,
    html: emailLayout(`Log In — ${brand.name}`, body),
  }
}

export const magicLinkTemplate: Record<Locale, (ctx: MagicLinkCtx) => RenderedEmail> = {
  en: magicLinkEn,
  th: (ctx) => magicLinkEn(ctx),
}

// --- Review prompt ---

export interface ReviewPromptCtx {
  customer_name: string
  product_lines: { name: string }[]
  review_url: string
  order_id: string
}

const reviewPromptEn = (input: ReviewPromptCtx): RenderedEmail => {
  const lineList = input.product_lines
    .map((p) => `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`)
    .join('')

  const subject = `How was your ${brand.name} protein?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">Thanks for your order, ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${brand.palette.muted};">We hope you're enjoying what you received. Your feedback helps other customers.</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Write a Review</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">Order ID: ${escapeHtml(input.order_id)}</p>`

  return { subject, html: emailLayout(subject, body) }
}

const reviewPromptTh = (input: ReviewPromptCtx): RenderedEmail => {
  const lineList = input.product_lines
    .map((p) => `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`)
    .join('')

  const subject = `โปรตีน ${brand.name} เป็นอย่างไรบ้าง?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">ขอบคุณที่สั่งซื้อ ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${brand.palette.muted};">เราหวังว่าคุณจะพอใจกับสินค้าที่ได้รับ</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">เขียนรีวิว</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">หมายเลขคำสั่งซื้อ: ${escapeHtml(input.order_id)}</p>`

  return { subject, html: emailLayout(subject, body) }
}

export const reviewPromptTemplate: Record<Locale, (ctx: ReviewPromptCtx) => RenderedEmail> = {
  en: reviewPromptEn,
  th: reviewPromptTh,
}
```

Notes on byte-equivalence vs. today:
- Footnote color in payment_failed body changed from hardcoded `#B53A32` (heading only) — heading is `${brand.palette.accent}` which is `#B53A32`. Same.
- Mailto link to `contact@cnxnature.com` was hardcoded. Replaced with `contact@${brand.domain.replace(/^www\./, '')}` which produces `contact@cnxnature.com`. Same.
- Admin chat dashboard URL was hardcoded `https://www.cnxnature.com/admin/chat`. Now `https://${brand.domain}/admin/chat` = `https://www.cnxnature.com/admin/chat`. Same.
- Review prompt subjects/bodies: text identical to today. `'CNX AthletX'` in subjects becomes `${brand.name}`.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm --workspace packages/api run test -- templates`
Expected: PASS — all registry tests green.

`OrderEmailData` is imported by the test from `./send` — that file doesn't exist yet, so this test will fail to compile until Task 6. That's intentional — it forces Task 6 to land before tests go green for the registry. Acknowledge this as a known temporary failure and proceed to Task 6 in the same commit chain.

(Alternative if test-ordering matters: define `OrderEmailData` re-export in `templates.ts` itself. Choose this if you want Task 5 to land green standalone. The plan below assumes you DO defer the test green to after Task 6 — keeps `OrderEmailData` defined in one place.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/email/templates.ts \
        packages/api/src/services/email/templates.test.ts
git commit -m "feat(api): add email template registry keyed by (event, locale)"
```

(Tests for templates.ts will go green at the end of Task 6.)

---

## Task 6: `email/send.ts` — Resend dispatch + logging

**Files:**
- Create: `packages/api/src/services/email/send.ts`

This is a literal extraction of `sendOrderEmail`, `sendAdminNewOrderEmail`, `sendAdminNewChatEmail`, `sendMagicLinkEmail`, `sendReviewPromptEmail`, `fetchOrderEmailData`, plus the private helpers `resendFetch`, `sendResendEmail`, `logEmail`. Behavior unchanged. Difference: dispatch goes through the registry from `templates.ts`, and `OrderEmailData` lives here.

- [ ] **Step 1: Create the module**

Create `packages/api/src/services/email/send.ts`:

```ts
import type { Env } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import type { Locale } from '../../lib/locale'
import { brand } from './brand'
import {
  orderTemplates,
  adminTemplates,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
  type OrderRenderInput,
  type AdminOrderAddress,
} from './templates'
import type { InstructionsBlock } from '../payments/types'

const RESEND_TIMEOUT_MS = 5000

export interface OrderEmailData extends OrderRenderInput {}

export interface ShipmentData {
  carrier: string
  tracking_number: string
}

export interface NewChatEmailData {
  conversation_id: string
  guest_name: string
  guest_email: string
  initial_message: string
  created_at: string
}

export interface ReviewPromptEmailInput {
  order_id: string
  customer_name: string
  customer_email: string
  product_lines: { name: string }[]
  review_url: string
  locale: Locale
}

async function resendFetch(input: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), RESEND_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function logEmail(
  env: Env,
  orderId: string | null,
  event: string,
  recipientEmail: string,
  status: 'sent' | 'failed',
  error?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_logs (order_id, event, recipient_email, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(orderId, event, recipientEmail, status, error ?? null, nowIso()).run()
  } catch {
    // Best effort
  }
}

async function sendResendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  try {
    const res = await resendFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: brand.fromAddress,
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Fire-and-forget: sends order-related email and logs result, never throws */
export async function sendOrderEmail(
  env: Env,
  event: OrderEvent,
  order: OrderEmailData,
  extra?: { instructions?: InstructionsBlock | null; shipment?: ShipmentData }
): Promise<void> {
  try {
    const renderer = orderTemplates[event][order.locale]
    const { subject, html } = renderer({
      order,
      instructions: extra?.instructions ?? null,
      shipment: extra?.shipment,
    })
    const ok = await sendResendEmail(env, order.customer_email, subject, html)
    await logEmail(env, order.order_id, event, order.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, order.order_id, event, order.customer_email, 'failed', message)
  }
}

/** Fire-and-forget: sends admin notification for new orders, never throws */
export async function sendAdminNewOrderEmail(
  env: Env,
  order: OrderEmailData,
  address?: AdminOrderAddress,
  discountCode?: string
): Promise<void> {
  if (!env.ADMIN_EMAILS) return
  const emails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return

  const { subject, html } = adminTemplates.new_order.en({ order, address, discountCode })

  for (const adminEmail of emails) {
    try {
      const ok = await sendResendEmail(env, adminEmail, subject, html)
      await logEmail(env, order.order_id, 'admin_new_order', adminEmail, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await logEmail(env, order.order_id, 'admin_new_order', adminEmail, 'failed', message)
    }
  }
}

/** Fire-and-forget: notifies admins of new chat conversation, never throws */
export async function sendAdminNewChatEmail(env: Env, data: NewChatEmailData): Promise<void> {
  if (!env.ADMIN_EMAILS) return
  const emails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return

  const { subject, html } = adminTemplates.new_chat.en(data)

  for (const adminEmail of emails) {
    try {
      const ok = await sendResendEmail(env, adminEmail, subject, html)
      await logEmail(env, null, 'admin_new_chat', adminEmail, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await logEmail(env, null, 'admin_new_chat', adminEmail, 'failed', message)
    }
  }
}

/** Throws on failure — caller (auth route) needs to know if the email made it */
export async function sendMagicLinkEmail(
  env: Env,
  toEmail: string,
  magicLinkUrl: string,
  expiryMinutes: number,
  locale: Locale = 'en'
): Promise<void> {
  if (!env.RESEND_API_KEY) return

  const { subject, html } = magicLinkTemplate[locale]({ magicLinkUrl, expiryMinutes })

  let emailRes: Response
  try {
    emailRes = await resendFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: brand.fromAddress,
        to: [toEmail],
        subject,
        html,
      }),
    })
  } catch {
    throw new Error('Failed to send magic link email')
  }

  if (!emailRes.ok) {
    throw new Error('Failed to send magic link email')
  }
}

/** Fire-and-forget review prompt email; idempotent via email_logs lookup. */
export async function sendReviewPromptEmail(env: Env, input: ReviewPromptEmailInput): Promise<void> {
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM email_logs WHERE order_id = ? AND event = 'review_prompt' AND status = 'sent' LIMIT 1`
    ).bind(input.order_id).first<{ id: number }>()
    if (existing) return
  } catch {
    return
  }

  try {
    const { subject, html } = reviewPromptTemplate[input.locale]({
      customer_name: input.customer_name,
      product_lines: input.product_lines,
      review_url: input.review_url,
      order_id: input.order_id,
    })
    const ok = await sendResendEmail(env, input.customer_email, subject, html)
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, 'failed', message)
  }
}

/** Fetch order data needed for email templates */
export async function fetchOrderEmailData(env: Env, orderId: string): Promise<OrderEmailData | null> {
  const order = await env.DB.prepare(
    `SELECT id, customer_name, customer_email, subtotal_thb, shipping_thb, discount_thb, total_thb, locale
     FROM orders WHERE id = ? LIMIT 1`
  ).bind(orderId).first<{
    id: string
    customer_name: string
    customer_email: string
    subtotal_thb: number
    shipping_thb: number
    discount_thb: number
    total_thb: number
    locale: Locale
  }>()

  if (!order) return null

  const { results: items } = await env.DB.prepare(
    `SELECT p.name, oi.quantity, oi.line_total_thb
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  ).bind(orderId).all<{ name: string; quantity: number; line_total_thb: number }>()

  return {
    order_id: order.id,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, line_total_thb: i.line_total_thb })),
    subtotal_thb: order.subtotal_thb,
    shipping_thb: order.shipping_thb,
    discount_thb: order.discount_thb,
    total_thb: order.total_thb,
    locale: order.locale,
  }
}
```

- [ ] **Step 2: Run templates.test.ts to confirm Task 5's tests now pass**

Run: `npm --workspace packages/api run test -- templates`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/services/email/send.ts
git commit -m "feat(api): add email send module wired to template registry"
```

---

## Task 7: `email/index.ts` + delete old `services/email.ts`

**Files:**
- Create: `packages/api/src/services/email/index.ts`
- Modify: `packages/api/src/services/email.test.ts` (move imports + remove tests for retired build* helpers)
- Delete: `packages/api/src/services/email.ts`

This is the cutover step. The existing `services/email.ts` file goes away; Node module resolution starts resolving `'../services/email'` to the new `email/index.ts`. The existing `email.test.ts` file lives at `services/email.test.ts` and continues to import from `'./email'` — it now resolves to `./email/index.ts`.

The current `email.test.ts` tests `buildOrderCreatedEmail`, `buildPaymentConfirmedEmail`, etc. — top-level wrapper functions in old `email.ts`. These wrappers don't exist in the new structure (the registry is the API). Two choices:

(a) Add thin wrappers in `email/index.ts` that adapt the registry to the old build-fn signatures, keeping all old tests intact.

(b) Replace `email.test.ts` content with assertions against the registry (Task 5 already covers this).

**Plan: (a).** Wrappers are 6-line shims and let us prove byte-equivalence via the existing snapshot-style tests.

- [ ] **Step 1: Create `email/index.ts` with public API**

Create `packages/api/src/services/email/index.ts`:

```ts
// Re-exports preserving the original public surface of services/email.ts so
// existing imports from '../services/email' keep working unchanged.

export { brand, type Brand } from './brand'
export {
  emailLayout,
  itemsTableHtml,
  orderTotalsHtml,
  renderInstructionsHtml,
  formatThb,
  type EmailItem,
} from './layout'
export {
  orderTemplates,
  adminTemplates,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
  type OrderTemplateCtx,
  type RenderedEmail,
  type AdminOrderAddress,
  type AdminNewOrderCtx,
  type AdminNewChatCtx,
  type MagicLinkCtx,
  type ReviewPromptCtx,
} from './templates'
export {
  sendOrderEmail,
  sendAdminNewOrderEmail,
  sendAdminNewChatEmail,
  sendMagicLinkEmail,
  sendReviewPromptEmail,
  fetchOrderEmailData,
  type OrderEmailData,
  type ShipmentData,
  type NewChatEmailData,
  type ReviewPromptEmailInput,
} from './send'

// --- Back-compat wrappers for existing email.test.ts ---
// These adapt the new (event, locale) registry to the legacy build* signatures
// from the pre-refactor services/email.ts. Returned HTML is byte-equivalent to
// before this change (verified via the existing test snapshots).

import { orderTemplates, adminTemplates, reviewPromptTemplate } from './templates'
import type {
  OrderTemplateCtx,
  AdminNewOrderCtx,
  ReviewPromptCtx,
  RenderedEmail,
} from './templates'
import type { OrderEmailData, ShipmentData } from './send'
import type { InstructionsBlock } from '../payments/types'
import type { Locale } from '../../lib/locale'

function legacyOrderInput(data: OrderEmailData): OrderTemplateCtx['order'] {
  // Existing tests pass OrderEmailData WITHOUT a locale field. Default to 'en'.
  return { ...data, locale: (data.locale ?? 'en') as Locale }
}

export function buildOrderCreatedEmail(
  order: OrderEmailData,
  instructions: InstructionsBlock | null
): string {
  return orderTemplates.order_created.en({
    order: legacyOrderInput(order),
    instructions,
  }).html
}

export function buildPaymentConfirmedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_confirmed.en({ order: legacyOrderInput(order) }).html
}

export function buildOrderShippedEmail(order: OrderEmailData, shipment: ShipmentData): string {
  return orderTemplates.order_shipped.en({ order: legacyOrderInput(order), shipment }).html
}

export function buildOrderCancelledEmail(order: OrderEmailData): string {
  return orderTemplates.order_cancelled.en({ order: legacyOrderInput(order) }).html
}

export function buildPaymentFailedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_failed.en({ order: legacyOrderInput(order) }).html
}

export function buildPaymentRefundedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_refunded.en({ order: legacyOrderInput(order) }).html
}

export function buildAdminNewOrderEmail(
  order: OrderEmailData,
  address?: AdminNewOrderCtx['address'],
  discountCode?: string
): string {
  return adminTemplates.new_order.en({
    order: legacyOrderInput(order),
    address,
    discountCode,
  }).html
}

export interface BuiltEmail {
  subject: string
  html: string
}

export interface ReviewPromptEmailInputLegacy extends ReviewPromptCtx {
  customer_email: string
  locale: Locale | string
}

export function buildReviewPromptEmail(input: ReviewPromptEmailInputLegacy): BuiltEmail {
  const locale: Locale = input.locale === 'th' ? 'th' : 'en'
  return reviewPromptTemplate[locale]({
    customer_name: input.customer_name,
    product_lines: input.product_lines,
    review_url: input.review_url,
    order_id: input.order_id,
  })
}
```

- [ ] **Step 2: Delete the old monolith**

```bash
git rm packages/api/src/services/email.ts
```

- [ ] **Step 3: Run the full email test suite**

Run: `npm --workspace packages/api run test -- email`
Expected: PASS — `services/email.test.ts` now resolves `from './email'` to `email/index.ts` and exercises the wrappers.

If a snapshot mismatch surfaces (e.g. an EN body changed by a single byte), inspect the diff. The byte-equivalence claim depends on the literal extraction in Tasks 4 + 5 being exact.

- [ ] **Step 4: Run full api test suite**

Run: `npm --workspace packages/api run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/services/email/index.ts \
        packages/api/src/services/email.test.ts
git commit -m "refactor(api): replace services/email.ts with email/ directory"
```

---

## Task 8: Persist `locale` through CheckoutBody and into orders

**Files:**
- Modify: `packages/api/src/lib/types.ts` (`CheckoutBody`, `OrderRow`)
- Modify: `packages/api/src/lib/validation.ts` (`validateCheckoutBody`)
- Modify: `packages/api/src/routes/checkout.ts` (INSERT into orders, pass to email send)

- [ ] **Step 1: Extend types**

In `packages/api/src/lib/types.ts`:

Find `CheckoutBody` (line 109). Add `locale?: 'en' | 'th'` to its fields.

Find `OrderRow` (search). Add `locale: 'en' | 'th'`.

- [ ] **Step 2: Extend validator**

In `packages/api/src/lib/validation.ts`, inside `validateCheckoutBody`, after the `payment_method` block (around line 227), add:

```ts
  if (b.locale !== undefined && b.locale !== null) {
    if (b.locale !== 'en' && b.locale !== 'th') {
      errors.push({ field: 'locale', message: 'locale must be "en" or "th"' })
    }
  }
```

- [ ] **Step 3: Persist on INSERT**

In `packages/api/src/routes/checkout.ts`, locate the INSERT into `orders`. Find the column list and `VALUES (...)` block (the actual location varies in this large file — search for `INSERT INTO orders`). Add `locale` to the column list and the corresponding bind value:

```ts
const orderLocale: 'en' | 'th' = data.locale === 'th' ? 'th' : 'en'
```

(declare near where the order_id and other persisted scalars are computed)

In the INSERT statement column list add `locale` after `status` (matching the schema order). In the VALUES clause add a `?`. In `.bind(...)` add `orderLocale` in the matching position.

- [ ] **Step 4: Pass locale to email send paths**

`sendOrderEmail` already reads `order.locale` from `OrderEmailData`. The checkout route builds `EmailItem[]` and an `OrderEmailData` shape inline before calling `sendOrderEmail` and `sendAdminNewOrderEmail`. Find that block and add `locale: orderLocale` to the OrderEmailData literal.

- [ ] **Step 5: Write integration test for the new field**

Append to the existing checkout integration test file (find it under `packages/api/src/routes/` or `packages/api/test/` — look for tests that exercise `/api/checkout`):

```ts
it('persists locale=th when present in body', async () => {
  const res = await workerFetch('/api/checkout', {
    method: 'POST',
    body: { /* … standard valid checkout body … */, locale: 'th' },
  })
  expect(res.status).toBe(200)
  const json = await res.json()
  const row = await env.DB.prepare(`SELECT locale FROM orders WHERE id = ?`)
    .bind(json.order_id).first<{ locale: string }>()
  expect(row?.locale).toBe('th')
})

it('defaults locale to en when omitted', async () => {
  const res = await workerFetch('/api/checkout', {
    method: 'POST',
    body: { /* … standard valid checkout body, no locale … */ },
  })
  expect(res.status).toBe(200)
  const json = await res.json()
  const row = await env.DB.prepare(`SELECT locale FROM orders WHERE id = ?`)
    .bind(json.order_id).first<{ locale: string }>()
  expect(row?.locale).toBe('en')
})

it('rejects invalid locale value', async () => {
  const res = await workerFetch('/api/checkout', {
    method: 'POST',
    body: { /* … standard valid checkout body … */, locale: 'fr' },
  })
  expect(res.status).toBe(400)
  const json = await res.json()
  expect(json.details).toContainEqual(
    expect.objectContaining({ field: 'locale' })
  )
})
```

(Use whatever helper pattern the existing checkout test file uses for the standard valid body — copy from one of the existing happy-path tests in the same file.)

- [ ] **Step 6: Run integration tests**

Run: `npm --workspace packages/api run test:integration`
Expected: PASS — including new locale tests.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/lib/types.ts \
        packages/api/src/lib/validation.ts \
        packages/api/src/routes/checkout.ts \
        packages/api/src/routes/checkout.integration.test.ts
git commit -m "feat(api): persist customer locale at checkout and propagate to order emails"
```

(Adjust the test file path to whichever file you appended to.)

---

## Task 9: Web checkout sends current locale

**Files:**
- Modify: `packages/web/src/api/checkout.ts`
- Modify: whichever Vue component calls `submitCheckout` (likely `packages/web/src/pages/CheckoutPage.vue`; confirm by `grep -rln "submitCheckout" packages/web/src`)

- [ ] **Step 1: Extend `CheckoutPayload`**

In `packages/web/src/api/checkout.ts:3-20`, add `locale?: 'en' | 'th'` to `CheckoutPayload`:

```ts
export interface CheckoutPayload {
  items: { product_id: number; quantity: number }[]
  customer: { /* unchanged */ }
  idempotency_key: string
  discount_code?: string
  payment_method: string
  locale?: 'en' | 'th'
}
```

`submitCheckout` already JSON-stringifies the whole payload — no change needed there.

- [ ] **Step 2: Pass current i18n locale at the call site**

In the Vue component that calls `submitCheckout(payload)`, add at the top:

```ts
import { useI18n } from 'vue-i18n'
const { locale } = useI18n()
```

(Skip the import if it's already present.)

When constructing the payload, include:

```ts
locale: (locale.value === 'th' ? 'th' : 'en'),
```

- [ ] **Step 3: Run web typecheck + unit tests**

Run: `npm --workspace packages/web run typecheck`
Then: `npm --workspace packages/web run test`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

```bash
npm run dev
```

Open `http://localhost:5173`. Toggle to TH locale (existing UI). Add a product, complete checkout. Inspect the request payload in DevTools network tab — should contain `"locale":"th"`. Then in a separate terminal:

```bash
npx wrangler d1 execute DB --local --config packages/api/wrangler.toml --command "SELECT id, locale FROM orders ORDER BY created_at DESC LIMIT 1"
```

Expected: latest order shows `locale = 'th'`.

(Email rendering still EN — TH templates are stubs. This is intentional; copy lands later. Verify via Resend dashboard or check `email_logs.status`.)

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/api/checkout.ts packages/web/src/pages/CheckoutPage.vue
git commit -m "feat(web): send current locale with checkout request"
```

(Adjust the second path to the actual call site.)

---

## Task 10: Magic link uses Accept-Language

**Files:**
- Modify: `packages/api/src/routes/auth.ts` (around line 77)

- [ ] **Step 1: Pass parsed locale to `sendMagicLinkEmail`**

In `packages/api/src/routes/auth.ts`, near the top:

```ts
import { parseAcceptLanguage } from '../lib/locale'
```

Replace the existing call:

```ts
await sendMagicLinkEmail(env, data.email, magicLinkUrl, MAGIC_LINK_EXPIRY_MINUTES)
```

with:

```ts
const locale = parseAcceptLanguage(request.headers.get('Accept-Language'))
await sendMagicLinkEmail(env, data.email, magicLinkUrl, MAGIC_LINK_EXPIRY_MINUTES, locale)
```

(The `request` variable is already in scope inside the route handler — check the function signature; if the param is named differently, use the actual name.)

- [ ] **Step 2: Run auth + email tests**

Run: `npm --workspace packages/api run test -- auth`
Then: `npm --workspace packages/api run test -- email`
Expected: PASS — `sendMagicLinkEmail` now has 5 params with locale defaulting to `'en'`, so the new arg is additive.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/routes/auth.ts
git commit -m "feat(api): localize magic-link email via Accept-Language"
```

---

## Task 11: Final verification — EN byte-equivalence and full suite

**Files:** none modified

- [ ] **Step 1: Run the full test suites**

```bash
npm --workspace packages/api run test
npm --workspace packages/api run test:integration
npm --workspace packages/web run test
npm --workspace packages/web run typecheck
```

Expected: PASS across all suites.

- [ ] **Step 2: Diff EN HTML vs. pre-refactor baseline (manual sanity)**

Pick one representative event (e.g. `order_created`) and render via the registry with a fixed input, then compare against the output captured before this work started. Easiest: check out the parent of the first commit in this series, render via the old `buildOrderCreatedEmail`, save HTML to a file. Then check out HEAD, render via `orderTemplates.order_created.en`, save HTML. Diff:

```bash
diff <(node -e "...old render...") <(node -e "...new render...")
```

Expected: empty diff.

(Skip this if the existing `email.test.ts` HTML assertions already cover every visible string — they mostly do, since they assert specific colors, headings, and copy. The wrapper-based test green from Task 7 is the primary signal.)

- [ ] **Step 3: Commit any test cleanup if needed**

If you discovered drift while diffing, fix the relevant template entry and recommit. Otherwise nothing to do here.

- [ ] **Step 4: Update `docs/changelog.md` `[Unreleased]` block**

Per project memory: every commit that ships user-visible / operational changes updates `[Unreleased]`. Add under the appropriate heading (likely `### Changed` or `### Added`):

```
- Email templates now render through a `(event, locale)` registry. Customer locale is captured at checkout and persisted on `orders.locale`. EN copy unchanged; TH transactional copy will follow in a content-only PR.
```

- [ ] **Step 5: Update roadmap**

In `docs/technical-debpt-roadmap.md`, move the Critical #1 entry into the `## Done` section with today's date and a link to the spec + plan, mirroring the format used for the prior payment-provider item.

- [ ] **Step 6: Commit docs**

```bash
git add docs/changelog.md docs/technical-debpt-roadmap.md
git commit -m "docs: log email i18n refactor and mark roadmap item done"
```

---

## Self-Review

**Spec coverage:**
- Brand config extracted → Task 3 (`brand.ts`).
- Layout consumes brand → Task 4 (`layout.ts`).
- Registry keyed by `(event, locale)` → Task 5 (`templates.ts`).
- TH stubs delegate to EN → Task 5 (`th: (ctx) => …En(ctx)`).
- TH review-prompt copy preserved → Task 5 (`reviewPromptTh`).
- Send pipeline through registry → Task 6 (`send.ts`).
- Public API preserved → Task 7 (`index.ts` re-exports + back-compat wrappers).
- Schema migration → Task 1.
- `lib/locale.ts` for parseAcceptLanguage + resolveQueryLocale → Task 2.
- Checkout persists locale → Task 8.
- Web sends locale → Task 9.
- Magic link uses Accept-Language → Task 10.
- Admin emails stay EN → Task 6 (`adminTemplates` exposes only `.en`).
- EN byte-equivalence → Tasks 4 + 5 + 11 (existing snapshot tests + diff).
- `formatThb` stays in email module (High #7 deferred) → Task 4 (`layout.ts` keeps it).

**Placeholder scan:** No "TBD"/"TODO"/"implement later" steps. Every code-bearing step shows the code. The one inline ambiguity in Task 9 ("the Vue component that calls `submitCheckout`") is resolved by a concrete grep hint in the file-list — that's a lookup, not a TBD.

**Type consistency:**
- `OrderEmailData` is defined once in `send.ts` and re-exported via `index.ts`. `OrderRenderInput` (in `templates.ts`) is its structural twin; `OrderEmailData extends OrderRenderInput`.
- `Locale` is defined once in `lib/locale.ts`, re-exported from `templates.ts` for convenience. Same union throughout.
- `OrderEvent` is defined once in `templates.ts`; `send.ts` imports it.
- `AdminOrderAddress`, `AdminNewOrderCtx`, `AdminNewChatCtx`, `MagicLinkCtx`, `ReviewPromptCtx` defined once in `templates.ts`; `send.ts` imports `AdminOrderAddress`.
- `RenderedEmail` and `BuiltEmail` are intentionally distinct: `RenderedEmail` is the new internal type; `BuiltEmail` is preserved for legacy `buildReviewPromptEmail` consumers (they have the same shape — that's fine, structural typing).

No gaps found.
