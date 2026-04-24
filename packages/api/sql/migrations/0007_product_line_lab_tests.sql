-- Lab test files attached to product lines (PDFs and images shown in the
-- Regulatory & Safety section of the product detail page).
CREATE TABLE IF NOT EXISTS product_line_lab_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_line_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,
    CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp'))
);

CREATE INDEX IF NOT EXISTS idx_lab_tests_line ON product_line_lab_tests(product_line_id, sort_order);
