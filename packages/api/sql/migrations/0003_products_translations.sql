-- Add translations_json column to products for multi-locale name/description.
-- Safe to run once per environment. Will error with "duplicate column" if re-applied.
ALTER TABLE products ADD COLUMN translations_json TEXT NOT NULL DEFAULT '{}';
