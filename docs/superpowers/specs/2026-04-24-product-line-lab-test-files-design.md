# Product Line Lab Test Files — Design

Date: 2026-04-24
Status: Draft for implementation

## Goal

Let admin upload lab test files (PDFs and/or images) for each product line via the
"Regulatory & Safety" tab of `AdminProductLinesPage`. On the storefront,
`ProductDetailPage` shows a "Show laboratory tests data" link inside the existing
"Regulatory & Safety" card that opens the files in an overlay, reusing the same
pattern as the existing product-image lightbox.

## Scope decisions (confirmed with user)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Files attach to `product_lines`, not `products` | Lab certificates apply to raw material — both 500g and 1000g SKUs of the same line share the same files. Single edit point for admin. |
| 2 | Single overlay with arrow navigation across mixed PDFs and images | Same UX as product image lightbox. One entry point ("Show laboratory tests data"), arrows cycle through all files. |
| 3 | Files are shared across locales (no per-locale uploads) | Lab certificates are typically English-only. Avoids duplicated admin work. |
| 4 | 2 MB per-file cap | Matches current image upload cap. Admin compresses PDFs as needed. |
| 5 | Full admin UI: multi-upload, editable label per file, drag-reorder, delete | Matches polish level of `product_images` admin. |
| 6 | PDFs render inline via `<iframe>` (browser-native viewer) | Zero JS dependency. Mobile Safari fallback: if iframe blank, surface "Open in new tab" link. |
| 7 | Storefront link style = text link with file count: `Show laboratory tests data (N files) →` | Subtle, informative, localized. |

## Out of scope (YAGNI)

- Per-locale files.
- Caption / description field beyond `label`.
- Expiry or issue-date metadata.
- Download analytics.
- Client-side PDF compression.
- Client-side PDF thumbnail generation (admin sees static PDF icon).

## Data model

New SQLite table, mirroring the existing `product_images` shape:

```sql
CREATE TABLE IF NOT EXISTS product_line_lab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_line_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT NOT NULL,          -- application/pdf | image/jpeg | image/png | image/webp
    label TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lab_tests_line
  ON product_line_lab_tests(product_line_id, sort_order);
```

Migration file: `packages/api/sql/migrations/0007_product_line_lab_tests.sql`.
Same migration also applied to `packages/api/sql/schema.sql` so fresh installs
include the table.

R2 storage layout: keys prefixed `lab-tests/<ulid>.<ext>` inside the existing
`PRODUCT_IMAGES` R2 bucket. Using the existing bucket avoids a new binding and
keeps delivery via the same `images.cnxnature.com` / `/images/:rest+` route.

## API endpoints

All admin endpoints gated by the existing `requireAdmin` middleware.

### Upload (new)

`POST /api/admin/upload/lab-test-file`

- Request body: raw binary (same style as product-image upload).
- Accepted `content-type`: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- Max size: 2,000,000 bytes (same constant as product images).
- Writes object to R2 at `lab-tests/<ulid>.<ext>` with
  `cache-control: public, max-age=31536000, immutable`.
- Audit log action: `lab_test_file_upload`.
- Response: `{ url, key, content_type, size_bytes }`, status 201.
- Errors: 415 (unsupported type), 400 (empty), 413 (too large), 500 (R2 failure).

### Collection CRUD

Attaches and manages file rows for a product line. Mirrors the
`/api/admin/products/:id/images*` routes.

- `POST /api/admin/product-lines/:id/lab-test-files`
  - Body: `{ url: string, r2_key: string, content_type: string, size_bytes: number, label?: string }`.
  - Validates `product_line_id` exists, `content_type` is in the allowlist,
    `size_bytes >= 0`, `url` starts with expected prefix.
  - Sort order = `max(sort_order) + 1` (append to end).
  - Returns 201 with inserted row.

- `PATCH /api/admin/product-lines/:id/lab-test-files/:fileId`
  - Body: `{ label: string }`. Trimmed, max length 200.
  - Rename-only. Reorder handled by a dedicated endpoint.
  - Returns updated row.

- `DELETE /api/admin/product-lines/:id/lab-test-files/:fileId`
  - Loads row, deletes DB row, then best-effort `env.PRODUCT_IMAGES.delete(r2_key)`.
  - R2 failure does not roll back the DB delete (same pattern as existing deletes).
  - Returns 204.

- `PATCH /api/admin/product-lines/:id/lab-test-files/reorder`
  - Body: `{ order: number[] }` — array of `fileId` values in desired sort order.
  - Validates every id belongs to the line and the array contains every existing file.
  - Updates `sort_order` to array index via `db.batch(...)`.
  - Returns 200 with the reordered list.

### Public read

Embed in existing public product response. In
`GET /api/products/:slug` under `product_line`:

```json
{
  "product_line": {
    "id": 1,
    "slug": "...",
    "regulatory_info": "...",
    "lab_test_files": [
      { "id": 12, "url": "https://images.cnxnature.com/lab-tests/01h...pdf",
        "content_type": "application/pdf", "label": "Heavy metals COA" }
    ]
  }
}
```

Only `id`, `url`, `content_type`, `label` are exposed publicly.
`r2_key` and `size_bytes` stay server-side.
Order follows `sort_order ASC, id ASC`.

No separate `GET /api/product-lines/:id/lab-tests` endpoint in v1 — the
storefront already loads the full product payload.

## Admin UI (AdminProductLinesPage.vue)

### Placement

Inside the existing "Regulatory & Safety" section, both the **create** and
**edit** modals, directly below the `regulatory_info` textarea. The subsection
is gated: **only rendered in edit mode for existing product lines**, because
upload requires an `id`. For new lines the admin must save first, reopen the
edit modal, then upload. This matches how `product_images` is handled today.

### Subsection layout

- Section heading: `Lab Test Files`.
- Helper text: `PDFs or images. 2 MB max each. Shown to all locales.`
- File list (empty state: `No lab test files` in muted italic).
- Each row:
  - Drag handle or up/down arrows for reorder (mirror whatever pattern
    `product_images` admin uses today — see
    `packages/web/src/pages/AdminProductLinesPage.vue` and the product-images
    admin for reference).
  - Thumbnail 48x48:
    - Image content types → actual `<img>`.
    - PDF → document SVG icon with extension label.
  - Inline label input, debounced PATCH on blur (skip PATCH if unchanged).
  - File-type badge (`PDF` / `IMG`).
  - "Open in new tab" icon-link to `file.url`.
  - Delete button with native `confirm(...)` prompt (matches current pattern).
- Upload control:
  - `<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp">`.
  - On select: for each file
    1. Client-side size check (<= 2 MB); reject with inline error if too big.
    2. `POST /api/admin/upload/lab-test-file` with raw file body and its content-type.
    3. `POST /api/admin/product-lines/:id/lab-test-files` with returned metadata,
       using original filename (without extension) as initial `label`.
  - Per-file progress indicator + error message surfaced inline.

### State and API client

Add typed helpers in `packages/web/src/api/admin.ts`:

- `uploadLabTestFile(file: File)` → `{ url, key, content_type, size_bytes }`
- `listLabTestFiles(productLineId)` (via product line fetch or dedicated helper)
- `createLabTestFile(productLineId, payload)`
- `renameLabTestFile(productLineId, fileId, label)`
- `reorderLabTestFiles(productLineId, orderedIds)`
- `deleteLabTestFile(productLineId, fileId)`

## Storefront (ProductDetailPage.vue)

### Link placement

Inside the "Regulatory & Safety" card, below the existing `regulatory_info` text.
Render only if `product.product_line?.lab_test_files?.length > 0`.

```
Show laboratory tests data ({count} files) →
```

Styled consistently with other text links on the page (accent color, hover
underline). i18n keys:

- `en`: `"Show laboratory tests data ({count} files)"`
- `th`: `"ดูข้อมูลผลตรวจห้องปฏิบัติการ ({count} ไฟล์)"` (final wording reviewed
  by admin before release — acceptable to ship placeholder)

### Overlay

Reuse the existing image-lightbox structure in `ProductDetailPage.vue` as a
template, but with separate refs so the lab-test overlay cannot collide with
the image lightbox:

- New refs: `labTestOpen`, `labTestIndex`.
- Gallery = `product.product_line.lab_test_files`.
- Open handler locks body scroll (same pattern as image lightbox).
- Close / prev / next buttons cloned; Escape closes, ArrowLeft/Right navigate.
- Body area renders differently based on `content_type`:
  - `application/pdf` → `<iframe :src="file.url" class="w-full h-full bg-white" />`,
    sized to fill the overlay minus button padding.
  - image types → `<img :src="file.url">` with `object-contain`, matching the
    existing lightbox image styling.
- Caption strip at bottom of overlay: `{label} — {index + 1} / {total}`.
- Fallback below iframe (mobile Safari hedge): a small muted `Open PDF in new tab`
  link, always rendered, opens `file.url` with `target="_blank" rel="noopener"`.

### Deduplication

Consider extracting a shared overlay component if the two lightboxes diverge
only in their "slot content". **Not required for v1** — a second, sibling
overlay block is acceptable. Revisit after this ships.

## Testing

### API integration tests

(Patterned after `packages/api/src/routes/products.integration.test.ts`.)

- Upload: accepts each allowed `content-type`; rejects bogus types; rejects
  empty body; rejects > 2 MB; writes an audit-log row.
- Collection CRUD:
  - `POST` appends at end; rejects unknown `product_line_id`; rejects
    disallowed `content_type`.
  - `PATCH label` trims and persists; rejects >200 chars.
  - `PATCH reorder` enforces the "must be exact set of existing ids" rule.
  - `DELETE` removes the row and calls `R2.delete(r2_key)` (assert with mock).
- Public read: `GET /api/products/:slug` returns files ordered by
  `sort_order`, only public fields, empty array when no files attached.

### E2E (Playwright)

- Admin: open product line edit modal → upload one PDF and one image → rename
  labels → reorder → delete one → refresh → state persists.
- Storefront: link absent when no files; link visible with correct count; click
  opens overlay; arrows cycle through entries; PDF renders in iframe; image
  renders as `<img>`; Escape closes; body scroll restored.

## Rollout

1. Merge migration `0007_product_line_lab_tests.sql` and schema update.
2. Apply migration to D1 dev, verify, then apply to D1 prod.
3. Deploy API + Web together. Public response change is additive
   (`lab_test_files` absent → existing clients unaffected).

## Known limitations and debt

- R2 cleanup on `product_lines` delete: the CASCADE only drops DB rows;
  R2 objects under `lab-tests/` orphan. Same limitation already exists for
  `product_images` — document and defer.
- 2 MB cap means scanned COAs with many pages may need manual compression.
  Revisit cap if admin hits it repeatedly.
- Mobile Safari inline PDF rendering is best-effort. Fallback link is the
  escape hatch.
