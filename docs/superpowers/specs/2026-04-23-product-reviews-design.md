# Product Reviews System — Design

Date: 2026-04-23
Status: Approved (pending implementation plan)

## Goal

Allow authenticated customers who have purchased and received a product to leave a 1–5 star rating with optional text. Reviews are moderated by an admin before becoming public, aggregated at the product-line level, and surfaced on the product detail page.

## Eligibility & Rules

- **Auth required.** Submitter must have an active customer session (no guest reviews).
- **Order requirement.** Submitter must have at least one order containing a SKU in the target product line with status `shipped` or `delivered`.
- **One review per user per product line.** Enforced by DB UNIQUE constraint. To change a review, the user deletes and resubmits (re-enters approval queue).
- **Aggregation level.** Product line (`product_lines.id`). 500 g and 1000 g SKUs share a single rating.
- **Identity displayed.** "Verified buyer" label only — no name shown publicly.
- **Locale.** Review body stored as-is in the submitter's locale; locale tag (🇬🇧 / 🇹🇭) shown next to each review on the product page.
- **Moderation.** Reviews land as `pending`; only `approved` reviews appear publicly and contribute to the average.
- **Notifications.** Customer receives a single "leave a review" email immediately when their order transitions to `shipped`. No admin alert email; no approval/rejection notification to the customer.

## Data Model

New migration: `packages/api/sql/migrations/0006_reviews.sql`

```sql
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_line_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    body TEXT,
    locale TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    rejected_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moderated_at TEXT,
    moderated_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,
    UNIQUE (user_id, product_line_id),
    CHECK (rating BETWEEN 1 AND 5),
    CHECK (status IN ('pending','approved','rejected')),
    CHECK (locale IN ('en','th')),
    CHECK (body IS NULL OR length(body) <= 1000)
);

CREATE INDEX idx_reviews_line_status ON reviews(product_line_id, status, created_at DESC);
CREATE INDEX idx_reviews_user ON reviews(user_id);
CREATE INDEX idx_reviews_status_created ON reviews(status, created_at DESC);
```

Apply equivalent statements to `packages/api/sql/schema.sql` (full schema source-of-truth).

**Review-prompt email idempotency.** Reuse `email_logs` table — no schema change. The email service inserts a row with `event='review_prompt'` per `(order_id)`; the dispatcher checks for an existing `sent` log row before sending.

## API

### Public

- `GET /api/products/:slug/reviews?page=N&pageSize=10`
  Resolves `product_line_id` from product slug. Returns approved reviews newest-first plus aggregates.
  ```json
  {
    "summary": {
      "avgRating": 4.6,
      "count": 18,
      "distribution": { "1": 0, "2": 1, "3": 2, "4": 5, "5": 10 }
    },
    "reviews": [
      { "id": 42, "rating": 5, "body": "Great taste", "locale": "en", "createdAt": "2026-04-20T10:00:00Z" }
    ],
    "page": 1,
    "pageSize": 10,
    "total": 18
  }
  ```
  Headers: `Cache-Control: public, max-age=60`.
  No PII fields. Frontend renders the "Verified buyer" label.
  404 if product slug not found. Empty state returns `summary.avgRating: null, count: 0, distribution: {}` and `reviews: []`.

### Customer (session-auth)

- `GET /api/account/reviewable-products`
  Returns product lines the user is eligible to review and has not yet reviewed.
  ```json
  [
    { "productLineId": 1, "slug": "athletx-protein", "name": "AthletX Protein", "orderId": "01H...", "shippedAt": "2026-04-15T..." }
  ]
  ```
- `POST /api/account/reviews`
  Body: `{ "productLineId": 1, "rating": 5, "body": "optional", "locale": "en" }`.
  Server re-verifies eligibility on every call. Inserts as `pending`. UNIQUE violation → 409.
- `GET /api/account/reviews`
  Returns the current user's reviews with status.
- `DELETE /api/account/reviews/:id`
  Owner-only hard delete. Frees the slot.

### Admin (Cloudflare Access)

- `GET /api/admin/reviews?status=pending|approved|rejected&page=N`
  Joins `users` (email, name) and `product_lines` (name) for moderation context.
- `POST /api/admin/reviews/:id/approve`
- `POST /api/admin/reviews/:id/reject` body `{ "reason"?: string }`
- `DELETE /api/admin/reviews/:id`

All admin actions append to `admin_audit_log` with action `review.approve | review.reject | review.delete` and `details_json` including the review id, rating, and prior status.

### Error contracts

- `POST /api/account/reviews`
  - 401 no session
  - 400 invalid rating (not integer 1–5), body > 1000 chars, invalid locale
  - 404 product line not found
  - 403 no qualifying order (no `shipped`/`delivered` order containing a SKU in that line)
  - 409 review already exists for `(user_id, product_line_id)`
- `DELETE /api/account/reviews/:id` — 401 no session; 404 if not owned by current user (do not leak existence).
- Admin approve on already-approved review: idempotent 200, no duplicate audit-log entry.
- Reject without `reason` allowed.

## Frontend

### Components — `packages/web/src/components/reviews/`

- `ReviewSummary.vue` — average stars, total count, distribution bars. Used on `ProductDetailPage`.
- `ReviewList.vue` — paginated list. Each item: stars, locale flag, date, "Verified buyer" label, body.
- `ReviewForm.vue` — star picker, textarea with 1000-char counter, submit handler.
- `ReviewableProductCard.vue` — eligible-product card on `AccountPage` opening `ReviewForm` modal.

### Pages

- `ProductDetailPage.vue` — append `<ReviewSummary>` near the title and a `<ReviewList>` section below the product description. Data via new `useProductReviews(slug)` composable.
- `AccountPage.vue` — new "My reviews" tab with two lists:
  - Reviewable products (eligible, no review yet) → opens `ReviewForm` modal.
  - Submitted reviews → status badge (`pending` / `approved` / `rejected`) + delete button.
- `AdminReviewsPage.vue` (new, English only — admin pages are not localized) — table with status filter, row actions Approve / Reject (with optional reason input) / Delete. Columns: reviewer email, product line, rating, body, locale, created date, status. Add nav link to `AdminLayout`. Route `/admin/reviews` guarded the same as other admin routes.

### API clients — `packages/web/src/api/`

- `reviews.ts` — `fetchProductReviews`, `fetchReviewableProducts`, `submitReview`, `fetchMyReviews`, `deleteReview`.
- `adminReviews.ts` — `fetchAdminReviews`, `approveReview`, `rejectReview`, `deleteReview`.

### i18n

Add to both `packages/web/src/i18n/en.json` and `th.json` (same keys, both files in same commit):

`reviews.title`, `reviews.summaryAverage`, `reviews.summaryCount`, `reviews.empty`, `reviews.verifiedBuyer`,
`reviews.writeReview`, `reviews.ratingLabel`, `reviews.bodyLabel`, `reviews.bodyPlaceholder`,
`reviews.charCount`, `reviews.submit`, `reviews.thankYou`, `reviews.statusPending`,
`reviews.statusApproved`, `reviews.statusRejected`, `reviews.deleteConfirm`, `reviews.deleted`,
`reviews.errorEligibility`, `reviews.errorDuplicate`, `reviews.errorGeneric`,
`account.tabs.reviews`, `account.reviews.eligibleHeading`, `account.reviews.submittedHeading`.

## Email & Status Hook

**Trigger.** The order-ship admin endpoint (the one that transitions an order to `shipped`) dispatches the review-prompt email after successfully sending the existing shipping confirmation. Failure of the review-prompt email does not roll back the status change (consistent with existing email-failure policy).

**Logic.**
1. After ship status committed, query order + line items.
2. Resolve unique `product_line_id`s in the order.
3. Look up `email_logs WHERE order_id=? AND event='review_prompt' AND status='sent'`. Skip if a row exists.
4. If `orders.user_id IS NULL` (guest order), skip — only account holders can submit reviews.
5. Send a single email summarising shipped products with one CTA → `/account?tab=reviews`.
6. Log to `email_logs` with `event='review_prompt'` and the resulting status.

**Template.** New `sendReviewPromptEmail({ user, order, productLines, locale })` in `packages/api/src/services/email.ts`. Localized en/th using the existing simple-interpolation pattern. Subject: `"How was your CNX AthletX protein?"` / `"โปรตีน CNX AthletX เป็นอย่างไรบ้าง?"`.

**Locale resolution.** No `users.locale` column exists today. v1 fallback: default to `en`. Documented as a v1.5 enhancement to add `users.locale` and propagate from frontend on magic-link verification.

**No admin email alert.** Pending count surfaced visually in the admin nav via `GET /api/admin/reviews?status=pending&pageSize=1` (read `total` for the badge).

**No approval/rejection email to customer.** Status visible on `AccountPage`.

## Edge Cases

- **Eligibility race.** User has shipped order, submits review, admin reverts to `paid`. Existing review remains (it was submitted under valid eligibility at the time). New submissions are blocked.
- **Order cancel after review.** Cancelling does not delete the review (review tied to user, not order).
- **User account deletion.** `ON DELETE CASCADE` removes their reviews; aggregates recompute live.
- **Product line deletion.** `ON DELETE CASCADE` removes reviews. Archive flag on individual `products` does not affect reviews — line still exists.
- **Spam.** Approval queue is the moderation gate. No additional rate limiting beyond the per-user-per-line UNIQUE constraint.

## Tests (TDD order)

### API integration — `packages/api/src/routes/`

- `reviews.integration.test.ts` (public)
  - empty list returns `count: 0`
  - approved-only filter excludes pending and rejected
  - pagination returns correct slice and `total`
  - unknown slug → 404
- `account-reviews.integration.test.ts`
  - 401 unauth
  - 403 user has no shipped/delivered order in line
  - 403 user has only paid (not shipped) order
  - 200 happy path inserts as `pending`
  - 409 duplicate
  - 400 invalid rating, oversize body, bad locale
  - DELETE owner-only (404 for other users)
  - re-submit after delete succeeds
- `admin-reviews.integration.test.ts`
  - queue filters by status
  - approve / reject / delete write `admin_audit_log` rows
  - reject persists `rejected_reason`
- Extend `admin-orders.integration.test.ts` ship transition:
  - dispatches `sendReviewPromptEmail`
  - logs `email_logs.event='review_prompt'`
  - idempotent on re-ship (no second send)
  - guest order (no `user_id`) skipped

### API unit

- Extend `services/email.test.ts` with `sendReviewPromptEmail` template rendering for en + th and the no-locale fallback to en.

### Vue component — `packages/web/src/**/*.test.ts`

- `components/reviews/ReviewSummary.test.ts` — renders avg + count, empty state.
- `components/reviews/ReviewList.test.ts` — renders items, locale flag, pagination control.
- `components/reviews/ReviewForm.test.ts` — star binding, char counter, submit calls API client, error states.

### E2E — `e2e/reviews.spec.ts`

1. Sign in, place order, admin marks shipped.
2. Customer visits `/account` and sees reviewable item; submits review.
3. Public product page does NOT yet show the review (status pending).
4. Admin opens `/admin/reviews` and approves.
5. Public product page now shows the review and updated average.
6. Customer deletes own review; public page reverts.

## Out of Scope (v1)

- `users.locale` column and propagation (deferred to v1.5).
- Auto-translation of review body.
- Photo uploads.
- Helpfulness votes / replies.
- Admin email alerts on new pending review.
- Customer email on approval/rejection.
- Edit existing review (delete + resubmit only).
- Per-SKU rating breakdown (aggregation is line-level).
