-- 0009_payment_providers.sql
-- Payment provider abstraction: payment_method on orders, expanded statuses,
-- provider/txn columns on payments, webhook idempotency index, enabled-methods setting.

-- 1. Add payment_method to orders
ALTER TABLE orders ADD COLUMN payment_method TEXT;

-- 2. Backfill payment_method from existing payments rows
UPDATE orders SET payment_method = (
  SELECT method FROM payments WHERE payments.order_id = orders.id LIMIT 1
);

-- 3. Rebuild orders to expand status CHECK constraint.
CREATE TABLE orders_new (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address_line1 TEXT NOT NULL,
    shipping_address_line2 TEXT,
    district TEXT NOT NULL,
    province TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    subtotal_thb INTEGER NOT NULL,
    shipping_thb INTEGER NOT NULL,
    discount_thb INTEGER NOT NULL DEFAULT 0,
    total_thb INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    idempotency_key TEXT NOT NULL UNIQUE,
    discount_code TEXT,
    payment_method TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN (
      'pending_payment', 'awaiting_gateway', 'paid', 'failed',
      'packed', 'shipped', 'delivered', 'refunded', 'cancelled'
    ))
);

INSERT INTO orders_new (
    id, user_id, customer_name, customer_email, customer_phone,
    shipping_address_line1, shipping_address_line2, district, province, postal_code,
    subtotal_thb, shipping_thb, discount_thb, total_thb,
    status, idempotency_key, discount_code, payment_method,
    created_at, updated_at
)
SELECT
    id, user_id, customer_name, customer_email, customer_phone,
    shipping_address_line1, shipping_address_line2, district, province, postal_code,
    subtotal_thb, shipping_thb, discount_thb, total_thb,
    status, idempotency_key, discount_code, payment_method,
    created_at, updated_at
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- 4. Rebuild payments to drop method CHECK and add provider columns
CREATE TABLE payments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL,
    provider TEXT,
    provider_txn_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    payload_json TEXT,
    reference TEXT,
    amount_thb INTEGER NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

INSERT INTO payments_new (
    id, order_id, method, provider, provider_txn_id, status, payload_json,
    reference, amount_thb, verified_at, verified_by, created_at
)
SELECT
    id, order_id, method,
    method,                                                  -- backfill provider := method
    NULL,
    CASE WHEN verified_at IS NOT NULL THEN 'verified' ELSE 'pending' END,
    NULL,
    reference, amount_thb, verified_at, verified_by, created_at
FROM payments;

DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_at ON payments(verified_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn
  ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;

-- 5. Default payment_methods_enabled setting
INSERT INTO site_settings (key, value)
VALUES ('payment_methods_enabled', '["promptpay","bank_transfer"]')
ON CONFLICT(key) DO NOTHING;
