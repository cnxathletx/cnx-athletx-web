-- CNX AthletX D1 Schema
-- All monetary values stored as satang (THB * 100)

-- product_lines table (shared nutrition, ingredients, usage across SKUs)
CREATE TABLE IF NOT EXISTS product_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    nutrition_json TEXT NOT NULL DEFAULT '{}',
    ingredients TEXT NOT NULL DEFAULT '',
    how_to_use TEXT NOT NULL DEFAULT '',
    who_is_for TEXT NOT NULL DEFAULT '',
    regulatory_info TEXT NOT NULL DEFAULT '',
    translations_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_lines_slug ON product_lines(slug);

-- products table
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_line_id INTEGER,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price_thb INTEGER NOT NULL,
    weight_g INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    translations_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(archived);
CREATE INDEX IF NOT EXISTS idx_products_product_line_id ON products(product_line_id);

-- product_images table (multiple screenshots per product with display order)
CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id, sort_order);

-- price_tiers table (volume discount ladders per product)
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

-- inventory table (separate for atomic stock operations)
CREATE TABLE IF NOT EXISTS inventory (
    product_id INTEGER PRIMARY KEY,
    stock_count INTEGER NOT NULL DEFAULT 0,
    reserved_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);

-- users table (customer accounts)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    saved_address_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- magic_links table
CREATE TABLE IF NOT EXISTS magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

-- sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- orders table
CREATE TABLE IF NOT EXISTS orders (
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN ('pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- order_items table
CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_thb INTEGER NOT NULL,
    line_total_thb INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL,
    reference TEXT,
    amount_thb INTEGER NOT NULL,
    verified_at TEXT,
    verified_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CHECK (method IN ('promptpay', 'bank_transfer'))
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_at ON payments(verified_at);

-- payment_proofs table
CREATE TABLE IF NOT EXISTS payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    proof_type TEXT NOT NULL,
    proof_value TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CHECK (proof_type IN ('reference', 'image_url'))
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_order_id ON payment_proofs(order_id);

-- shipments table
CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    carrier TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    shipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);

-- discount_codes table
CREATE TABLE IF NOT EXISTS discount_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    value INTEGER NOT NULL,
    min_order_thb INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    archived INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (type IN ('fixed', 'percent'))
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);
CREATE INDEX IF NOT EXISTS idx_discount_codes_archived ON discount_codes(archived);

-- admin_audit_log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    order_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_order_id ON admin_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_email ON admin_audit_log(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT,
    event TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

-- chat_conversations table
CREATE TABLE IF NOT EXISTS chat_conversations (
    id TEXT PRIMARY KEY,
    visitor_id TEXT NOT NULL,
    user_id TEXT,
    guest_name TEXT,
    guest_email TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_admin_read_at TEXT,
    last_customer_read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN ('open', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_visitor_id ON chat_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_at ON chat_conversations(created_at DESC);

-- chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,
    sender_email TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    CHECK (sender_type IN ('customer', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id, created_at);
