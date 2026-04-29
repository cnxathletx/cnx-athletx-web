-- Adds locale column to orders to capture the customer's language at checkout.
-- Used by transactional email templates to render the correct locale even on re-sends.
ALTER TABLE orders ADD COLUMN locale TEXT NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en','th'));
