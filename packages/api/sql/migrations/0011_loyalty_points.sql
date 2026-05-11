-- Account loyalty points ledger and order-level redemption accounting.

CREATE TABLE IF NOT EXISTS loyalty_point_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    order_id TEXT,
    points_delta INTEGER NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CHECK (points_delta != 0),
    CHECK (kind IN ('earn', 'redeem', 'restore', 'reverse_earn', 'manual_adjustment'))
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user_created
  ON loyalty_point_ledger(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order
  ON loyalty_point_ledger(order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_earn_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'earn';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_redeem_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'redeem';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_restore_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'restore';

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_one_reverse_earn_per_order
  ON loyalty_point_ledger(order_id)
  WHERE kind = 'reverse_earn';

ALTER TABLE orders ADD COLUMN discount_code_thb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_redeemed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_discount_thb INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;

UPDATE orders
SET discount_code_thb = discount_thb
WHERE discount_thb > 0 AND (discount_code IS NOT NULL AND discount_code != '');
