# Back-In-Stock Waitlist Design

## Context

CNX AthletX already exposes SKU-level available stock through the public product API and uses that value on product cards and product detail pages to switch between in-stock and sold-out purchase states. Admin stock changes happen through the existing inventory adjustment route. The API also has an email service, localized customer templates, and an `email_logs` table.

The goal is to let customers leave an email address when a SKU is out of stock, send them an automatic back-in-stock notification when that SKU becomes available again, and preserve marketing-consent data for later export.

## Decisions

- Waitlist signup is SKU-specific, not product-line-wide.
- The signup stores two separate signals: back-in-stock notification email and optional marketing consent.
- Marketing consent is an unchecked checkbox in the customer UI.
- No double opt-in for v1.
- Notifications send automatically when admin inventory adjustment changes available stock from `<= 0` to `> 0`.
- Historical rows are kept after notification by setting `notified_at`.
- A customer can create a new active signup later after the same SKU sells out again.
- Admin gets a waitlist page with active/notified filtering and CSV export.

## Data Model

Add a D1 table named `product_waitlist_signups`.

Fields:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `product_id INTEGER NOT NULL`
- `email TEXT NOT NULL`
- `locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','th'))`
- `marketing_consent INTEGER NOT NULL DEFAULT 0`
- `notified_at TEXT`
- `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

Indexes:

- `idx_product_waitlist_product_status` on `(product_id, notified_at)`
- `idx_product_waitlist_email` on `(email)`
- unique active signup on `(product_id, email)` where `notified_at IS NULL`

`product_id` references `products(id)` with `ON DELETE CASCADE`.

## Public API

Add `POST /api/products/:slug/waitlist`.

Request body:

```json
{
  "email": "customer@example.com",
  "marketing_consent": true
}
```

Behavior:

- Validate slug with the same format as product detail.
- Validate email with existing validation style.
- Resolve locale from query or request language, matching product routes.
- Load active, non-archived product and current available stock.
- Reject signup if product does not exist.
- Reject signup if product is currently in stock.
- Insert active signup for `(product_id, normalized email)`.
- If an active row already exists for that SKU/email, update `marketing_consent`, `locale`, and `updated_at`, then return success.
- Return a generic success payload without exposing whether the email was already present.

This endpoint should be rate-limited under the public write route pattern already used by the API.

## Notification Trigger

Extend `PATCH /api/admin/inventory/:productId`.

Flow:

1. Read current `stock_count`, `reserved_count`, and available count before applying adjustment.
2. Apply the existing stock adjustment and audit log.
3. Read new available count.
4. If previous available count was `<= 0` and new available count is `> 0`, load active waitlist rows for the product.
5. Send one back-in-stock email per active row.
6. Mark each row with `notified_at` only when the email send succeeds.
7. Leave failed rows active so they can be retried by a later stock transition or future manual retry path.

The admin inventory response can include a small optional summary such as `waitlist_notified_count`, but the UI does not need to depend on it for v1.

## Email

Add a `back_in_stock` customer email template in the existing email template system.

Template input:

- customer email
- product name
- product slug
- locale
- product URL

Email content:

- Subject: product is back in stock.
- Body: short restock message with product name.
- CTA link to the product detail page.

The template must escape product names and links. The email send path should log to `email_logs` with event `back_in_stock`. Unlike most order emails, this path should return a send result so the waitlist row is only marked notified after success.

Thai copy can mirror English initially if final Thai marketing copy is not ready, matching current template fallback patterns.

## Customer UI

Product detail page:

- If `available_stock > 0`, keep the existing quantity selector and Add to Cart behavior unchanged.
- If `available_stock <= 0`, replace the disabled purchase action area with:
  - email input
  - unchecked marketing-consent checkbox
  - `Notify when back in stock` button
  - validation/error state
  - success state: customer is told they will receive an email when the product is back in stock
- Keep the existing out-of-stock indicator.
- Add all new customer-facing copy to both `en.json` and `th.json`.

Product cards:

- Keep the existing disabled `Sold Out` button.
- Do not add an inline waitlist form to cards in v1.
- Customers sign up from the product detail page.

## Admin UI

Add an admin waitlist page at `/admin/waitlist` and link it from admin navigation.

The page should show:

- product name and SKU
- email
- marketing consent yes/no
- locale
- created date
- notified date

Default filter is active signups. Admin can switch between active, notified, and all.

CSV export is generated client-side from the currently loaded admin API response. No separate export storage or background job is needed for v1.

## Admin API

Add `GET /api/admin/waitlist?status=active|notified|all`.

Behavior:

- Require admin authentication.
- Return waitlist rows joined with product name and slug.
- Default to `active` if no status is provided.
- Sort active rows by newest first.
- Sort notified rows by notification date newest first.
- No delete or edit endpoint in v1.

## Documentation

Update these docs during implementation:

- `docs/plan/02-backend-architecture.md` for the table, public API, admin API, and notification trigger.
- `docs/plan/03-frontend-design.md` for the out-of-stock form and admin waitlist page.
- `docs/changelog.md` under `[Unreleased]` because this is user-visible and operationally relevant.

## Testing

API integration tests:

- Signup succeeds for out-of-stock product.
- Signup rejects an in-stock product.
- Duplicate active signup does not create a duplicate row and can update consent.
- Admin inventory update from out-of-stock to in-stock sends notification and marks rows notified.
- Failed email send leaves row active.

API unit/email tests:

- Back-in-stock template renders escaped product name and product URL.
- Send helper returns success/failure for notification caller.

Web tests:

- Product detail shows waitlist form when out of stock.
- Product detail keeps Add to Cart when in stock.
- Successful waitlist submit shows confirmation.
- Marketing checkbox value is sent.

E2E tests are optional for v1 if API integration and Vue component coverage verify the behavior.

## Risks

- Email failures could leave rows active indefinitely. This is intentional for v1 so failed sends can retry later.
- Stock can become unavailable again after notification. The email only says the product is back in stock, not that stock is reserved.
- Marketing consent storage is not a full subscriber-management system. This feature captures consent for later use; campaign tooling remains out of scope.

## Success Criteria

- Customers see a notify form only for out-of-stock SKUs.
- Customers can sign up once per SKU per out-of-stock cycle.
- Optional marketing consent is stored separately from the notification request.
- Admin stock transition from out-of-stock to in-stock sends back-in-stock email.
- Successfully sent rows are marked notified and kept as history.
- Admin can view and export active/notified waitlist rows.
