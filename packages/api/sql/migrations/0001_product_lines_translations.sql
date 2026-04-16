-- Add translations_json column to product_lines for multi-locale content.
-- Safe to run once per environment. Will error with "duplicate column" if re-applied.
ALTER TABLE product_lines ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
