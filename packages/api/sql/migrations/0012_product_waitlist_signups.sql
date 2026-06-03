CREATE TABLE IF NOT EXISTS product_waitlist_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','th')),
    marketing_consent INTEGER NOT NULL DEFAULT 0,
    notified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_waitlist_product_status
    ON product_waitlist_signups(product_id, notified_at);

CREATE INDEX IF NOT EXISTS idx_product_waitlist_email
    ON product_waitlist_signups(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_waitlist_active_unique
    ON product_waitlist_signups(product_id, email)
    WHERE notified_at IS NULL;
