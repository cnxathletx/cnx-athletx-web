-- Dev DB only: create product_lines table (missing).
CREATE TABLE IF NOT EXISTS product_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    nutrition_json TEXT NOT NULL DEFAULT '{}',
    ingredients TEXT NOT NULL DEFAULT '',
    how_to_use TEXT NOT NULL DEFAULT '',
    who_is_for TEXT NOT NULL DEFAULT '',
    regulatory_info TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_lines_slug ON product_lines(slug);
