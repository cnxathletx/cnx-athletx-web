# Email Templates: Brand Config + (event, locale) Registry

**Roadmap item:** Critical #1 — "Email templates hardcode brand, domain, locale" (`docs/technical-debpt-roadmap.md`).

**Date:** 2026-04-27

**Scope:** Extract brand identity from inline strings; refactor all email templates into a registry keyed by `(event, locale)`; populate EN copy (byte-equivalent to today); leave TH stubs that fall back to EN until translation copy lands; capture customer locale at checkout into `orders.locale` so order emails render in the language seen at purchase.

**Out of scope (deferred to other roadmap items):**
- Money helper extraction (`formatThb` stays in email module — High #7).
- Settings type-safety (High #6).
- Theming through `site_settings` (white-label = swap static `brand` module export later).
- Populating real TH copy for the 6 transactional order events (separate content PR).

---

## Goals

1. Single source of truth for brand identity: name, domain, contact email, from-address, logo URL, palette.
2. Adding a new locale = add one branch per template entry. Today: `en` populated, `th` falls back to `en`.
3. Order emails are deterministic per order: locale captured at checkout, persisted, used on every send for that order (re-sends don't switch language).
4. Magic-link locale resolved at request time from `Accept-Language` (no order context).
5. Admin emails stay EN-only (internal team, no UX cost).
6. EN output byte-equivalent to today (snapshot-verified) so this change is invisible to customers.

## Non-goals

- Refactoring `formatThb` into shared money lib (High #7).
- Admin UI for editing copy / brand at runtime.
- Multi-brand deployment plumbing (env or `site_settings`-driven brand).
- Translating TH copy for transactional order emails.

---

## Architecture

```
packages/api/src/services/email/
  brand.ts        — static Brand config: identity + palette
  layout.ts       — emailLayout(brand, title, body); itemsTableHtml; orderTotalsHtml; renderInstructionsHtml; formatThb
  templates.ts    — registry: orderTemplates, adminTemplates, magicLinkTemplate, reviewPromptTemplate
  send.ts         — sendOrderEmail, sendAdminNewOrderEmail, sendAdminNewChatEmail, sendMagicLinkEmail, sendReviewPromptEmail, fetchOrderEmailData, logEmail
  index.ts        — public re-exports preserving today's import paths
```

Old `services/email.ts` is deleted; `index.ts` re-exports from the new modules so all current imports (`from '../services/email'`) keep working with no caller changes.

`emailLayout` consumes `brand`. Templates consume `brand` + event payload, return `{ subject, html }`. `send.ts` calls registry, calls Resend, logs.

### Brand config — `email/brand.ts`

```ts
export interface Brand {
  name: string                    // 'CNX AthletX'
  tagline: string                 // 'Plant-Based Protein, Chiang Mai'
  domain: string                  // 'www.cnxnature.com'
  contactEmail: string            // 'orders@cnxnature.com'
  fromAddress: string             // 'CNX AthletX <orders@cnxnature.com>'
  logoUrl: string                 // 'https://www.cnxnature.com/email-mark.png?v=3'
  palette: {
    bg: string; surface: string; text: string; muted: string
    headerBg: string; headerFg: string
    footerBg: string; footerFg: string
    primary: string; accent: string
    panel: string; border: string
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
    bg: '#F2EDE4', surface: '#ffffff', text: '#2E2B26', muted: '#555',
    headerBg: '#2E2B26', headerFg: '#E5DDD0',
    footerBg: '#252320', footerFg: '#8B8580',
    primary: '#8B9A7B', accent: '#B53A32',
    panel: '#F2EDE4', border: '#E8E2D8',
  },
}
```

Single export. White-label later = swap export (env-reader / `site_settings` adapter) without touching call sites.

### Layout — `email/layout.ts`

`emailLayout(brand, title, body)` consumes `brand.palette`, `brand.name`, `brand.tagline`, `brand.contactEmail`, `brand.logoUrl`. Helpers `itemsTableHtml`, `orderTotalsHtml`, `renderInstructionsHtml` consume `brand.palette` for color refs. `formatThb` lives here for now.

### Template registry — `email/templates.ts`

```ts
export type Locale = 'en' | 'th'
export type OrderEvent =
  | 'order_created' | 'payment_confirmed' | 'order_shipped'
  | 'order_cancelled' | 'payment_failed' | 'payment_refunded'

export interface RenderedEmail { subject: string; html: string }

export interface OrderTemplateCtx {
  brand: Brand
  order: OrderEmailData
  instructions?: InstructionsBlock | null
  shipment?: ShipmentData
}

type OrderRenderer = (ctx: OrderTemplateCtx) => RenderedEmail

export const orderTemplates: Record<OrderEvent, Record<Locale, OrderRenderer>> = {
  order_created: {
    en: (ctx) => { /* current EN copy from buildOrderCreatedEmail */ },
    th: (ctx) => orderTemplates.order_created.en(ctx), // fallback until TH copy lands
  },
  // … 5 more events, same shape
}

export const adminTemplates = {
  new_order: { en: (ctx) => { /* current EN copy */ } },
  new_chat:  { en: (ctx) => { /* current EN copy */ } },
}

export const magicLinkTemplate: Record<Locale, (ctx: MagicLinkCtx) => RenderedEmail> = {
  en: (ctx) => { /* current EN copy */ },
  th: (ctx) => magicLinkTemplate.en(ctx),
}

export const reviewPromptTemplate: Record<Locale, (ctx: ReviewPromptCtx) => RenderedEmail> = {
  en: (ctx) => { /* current EN copy */ },
  th: (ctx) => { /* current TH copy from buildReviewPromptEmail */ },
}
```

TH stubs literally call EN renderer. When real TH copy lands, replace the stub body. No runtime fallback logic in `send.ts` — registry always returns a value.

### Locale helper — `lib/locale.ts`

Lift `resolveLocale` from `routes/products.ts` into shared `lib/locale.ts` and add `parseAcceptLanguage(header: string | null): Locale` (returns `'th'` if `th` is highest-quality match, else `'en'`).

```ts
export type Locale = 'en' | 'th'
export function parseAcceptLanguage(header: string | null): Locale { /* … */ }
export function resolveLocale(raw: string | null | undefined): Locale { /* … */ }
```

`routes/products.ts` swaps its local copy for the shared import.

---

## Schema change

**Migration** — `packages/api/sql/migrations/0010_orders_locale.sql`:

```sql
ALTER TABLE orders ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en','th'));
```

Existing rows get `'en'` via DEFAULT — matches how today's emails are rendered.

**Canonical schema** — also update the `orders` CREATE in `packages/api/sql/schema.sql` to include `locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','th'))`.

**Test seed** — append the same column to the inline `orders` CREATE inside `routes/health.ts` `TEST_SCHEMA`.

**Type** — `OrderRow` (in `lib/types.ts`) gains `locale: 'en' | 'th'`. `OrderEmailData` gains `locale: 'en' | 'th'`.

---

## Data flow

### Checkout

1. `packages/web/src/api/checkout.ts` reads current i18n locale (`i18n.global.locale.value` or equivalent) and includes `locale` in the POST body.
2. `packages/api/src/routes/checkout.ts` validator gains optional `locale: 'en' | 'th'`, defaults `'en'` if absent.
3. INSERT into `orders` includes `locale`.
4. Order-confirmation email send path passes `order.locale` through `OrderEmailData` → registry dispatch.

### Order email send (existing or re-send)

1. `fetchOrderEmailData` adds `locale` to its SELECT and return shape.
2. `sendOrderEmail(env, event, order, extra?)` looks up `orderTemplates[event][order.locale]`, calls it with `{ brand, order, instructions?, shipment? }`, gets `{ subject, html }`.
3. Resend POST + `email_logs` write — unchanged.

### Magic link

1. `routes/auth.ts` reads `request.headers.get('Accept-Language')`, calls `parseAcceptLanguage` → `Locale`.
2. `sendMagicLinkEmail(env, toEmail, url, expiryMinutes, locale)` — new `locale` param (default `'en'` for backward compat at call sites that don't yet pass it).
3. Dispatches via `magicLinkTemplate[locale]`.

### Admin emails

`sendAdminNewOrderEmail`, `sendAdminNewChatEmail` — always render via `adminTemplates.*.en`. Signatures unchanged.

### Review prompt

`sendReviewPromptEmail(env, input)` — `input.locale` already exists. Routes through `reviewPromptTemplate[input.locale]`. No call-site change.

---

## Error handling

- Renderer throws → `send*` catch (existing pattern) writes `email_logs` row with `status='failed'`, `error=<message>`. No email sent. No fallback HTML.
- Resend non-OK → existing path: log `failed`. No retry added (out of scope; rate-limit & retry are roadmap High #10).
- Missing brand field at compile time → TypeScript error.

---

## Testing

New:
- `email/templates.test.ts`
  - For each `(event, locale)` in `orderTemplates`: renders without throwing; `subject` non-empty; `html` contains `brand.name` and `order.order_id`.
  - For `adminTemplates.new_order.en` and `.new_chat.en`: same checks.
  - For `magicLinkTemplate.{en,th}`: renders, `subject` non-empty, html contains the magic-link URL.
  - For `reviewPromptTemplate.{en,th}`: renders, html contains review URL.
  - Snapshot one EN body per event (regression guard for byte-equivalence).
- `lib/locale.test.ts`
  - `parseAcceptLanguage('th-TH,en;q=0.5')` → `'th'`
  - `parseAcceptLanguage('en-US,en;q=0.9')` → `'en'`
  - `parseAcceptLanguage(null)` → `'en'`
  - `parseAcceptLanguage('fr')` → `'en'`

Updated:
- Existing `email.test.ts` — adjust imports to `services/email` (still works via `index.ts` re-export); content assertions unchanged.
- `routes/checkout` integration test — POST with `locale: 'th'` persists to `orders.locale`; POST without `locale` defaults to `'en'`.

Manual:
- Run dev server, place order with web locale = TH, confirm `orders.locale = 'th'` in D1, confirm order-confirmation email renders (currently EN copy via fallback) — proves wiring without needing TH content.

---

## Rollout

1. Land migration in `packages/api/migrations/` and apply via `wrangler d1 migrations apply` (staging then prod).
2. Code change deploys atomically with migration. Existing rows back-fill `'en'` via DEFAULT.
3. EN snapshots prove customer-visible output is byte-equivalent.
4. Real TH copy ships in a follow-up PR that touches only the TH branches in `templates.ts` (and the matching subjects). No backend change required.

Forward-only. If rollback is needed, revert code + drop column together. The migration is non-destructive; the column DEFAULT keeps inserts working even if old code temporarily runs against new schema.

---

## File-touch summary

New:
- `packages/api/src/services/email/brand.ts`
- `packages/api/src/services/email/layout.ts`
- `packages/api/src/services/email/templates.ts`
- `packages/api/src/services/email/send.ts`
- `packages/api/src/services/email/index.ts`
- `packages/api/src/services/email/templates.test.ts`
- `packages/api/src/lib/locale.ts`
- `packages/api/src/lib/locale.test.ts`
- `packages/api/sql/migrations/0010_orders_locale.sql`

Modified:
- `packages/api/src/routes/health.ts` — extend `TEST_SCHEMA` for `orders.locale`.
- `packages/api/sql/schema.sql` — add `locale` column to `orders` CREATE.
- `packages/api/src/routes/checkout.ts` — accept + persist `locale`.
- `packages/api/src/routes/products.ts` — replace local `resolveLocale` with import from `lib/locale.ts`.
- `packages/api/src/routes/auth.ts` — pass `locale` from `Accept-Language`.
- `packages/api/src/lib/types.ts` — `OrderRow.locale`, extend `OrderEmailData.locale`.
- `packages/api/src/services/email.test.ts` — adjust imports if needed.
- `packages/web/src/api/checkout.ts` — include `locale` in POST body.

Deleted:
- `packages/api/src/services/email.ts` — replaced by `services/email/` directory.
