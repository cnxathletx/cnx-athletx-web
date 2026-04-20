-- Add price_tiers table for volume-based unit pricing per product.
CREATE TABLE IF NOT EXISTS price_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    min_quantity INTEGER NOT NULL,
    unit_price_thb INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (product_id, min_quantity),
    CHECK (min_quantity >= 2),
    CHECK (unit_price_thb > 0)
);

CREATE INDEX IF NOT EXISTS idx_price_tiers_product_id ON price_tiers(product_id, min_quantity);
