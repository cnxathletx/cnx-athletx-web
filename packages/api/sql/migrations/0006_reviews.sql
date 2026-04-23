-- Add reviews table for product-line ratings + comments by verified buyers.
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

CREATE INDEX IF NOT EXISTS idx_reviews_line_status ON reviews(product_line_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at DESC);
