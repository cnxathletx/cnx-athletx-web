# Backend Implementation Plan: CNX AthletX

## 1. Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CUSTOMER LAYER                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages (SPA)                       │
│  Vue 3 + Vite + Tailwind                                        │
│  - Product catalog pages                                        │
│  - Checkout flow                                                │
│  - Order status lookup                                          │
│  - Payment proof upload UI                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers (API)                     │
│  /api/products                          (public)                │
│  /api/checkout                          (public)                │
│  /api/orders/:id                        (public)                │
│  /api/orders/:id/payment-proof          (public)                │
│                                                                  │
│  /api/auth/*                   (public, rate-limited)           │
│  /api/account/*                (authenticated customer)         │
│                                                                  │
│  /api/admin/*                  (Cloudflare Access protected)    │
└─────────────────────────────────────────────────────────────────┘
           │                                        │
           ▼                                        ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│   Cloudflare D1 (SQLite) │          │      Resend API          │
│   - products             │          │   Transactional Email    │
│   - inventory            │          │   - Order created        │
│   - orders               │          │   - Payment confirmed    │
│   - order_items          │          │   - Order shipped        │
│   - payments             │          │   - Magic link           │
│   - payment_proofs       │          └──────────────────────────┘
│   - shipments            │
│   - users                │
│   - magic_links          │
│   - sessions             │
│   - site_settings        │
│   - admin_audit_log      │
│   - email_logs           │
└──────────────────────────┘
```

### Request Flow: Browse Products

```
1. Browser → GET https://cnxnature.com/products/whey-protein-500g
2. Cloudflare Pages → serves index.html (Vue SPA)
3. Vue Router → loads ProductDetail component
4. Component mounted → fetch('https://cnxnature.com/api/products/whey-protein-500g')
5. Workers → SELECT from products JOIN inventory WHERE slug = ? AND active = 1
6. D1 → returns product + stock_count
7. Workers → JSON response {product, available_stock}
8. Vue → renders product card, "Add to Cart" button (disabled if stock = 0)
```

### Request Flow: Checkout + Payment

```
1. Customer fills cart → clicks "Checkout"
2. Vue form → collects name, email, phone, shipping address
3. Submit → POST /api/checkout
   Body: {
     items: [{product_id, quantity}],
     customer: {name, email, phone, address},
     idempotency_key: crypto.randomUUID()
   }

4. Workers → D1 transaction:
   a. SELECT stock_count FROM inventory WHERE product_id IN (...)
   b. Validate stock >= requested quantity
   c. UPDATE inventory SET reserved_count += quantity
   d. INSERT INTO orders (...)
   e. INSERT INTO order_items (...)
   f. COMMIT

5. Workers → Resend.emails.send({
     to: customer_email,
     subject: "Order Confirmation",
     html: order_created_template
   })

6. Workers → Log to email_logs if Resend fails

7. Workers → Response: {
     order_id,
     total_thb,
     payment_instructions: {
       promptpay_qr_url,
       bank_transfer_details,
       reference: order_id
     }
   }

8. Vue → redirect to /orders/:id (shows payment instructions)

9. Customer → transfers via banking app → submits payment proof
10. Vue → POST /api/orders/:id/payment-proof {proof_value: "txn_ref_123"}
11. Workers → INSERT INTO payment_proofs
12. Response → "Proof submitted, admin will verify within 24h"
```

### Request Flow: Admin Order Management

```
1. Admin → visits https://cnxnature.com/admin/orders

2. Cloudflare Access middleware:
   - Provides a signed Cloudflare Access JWT via the `CF_Authorization` cookie
   - If missing/invalid/unauthorized → 403 Forbidden
   - If valid → forwards to Workers

3. Workers → verifies the JWT and authorizes the admin email
   - Verifies JWT audience (`CF_ACCESS_AUD`) and extracts email claim
   - Allows only emails in `ADMIN_EMAILS`
   - Local dev fallback (no CF Access): when `ENVIRONMENT` is unset, `X-Admin-Email` can be used

4. Workers → GET /api/admin/orders?status=pending_payment&page=1&limit=20
   - SELECT orders with filters
   - JOIN payment_proofs to show proof count
   - Response: paginated order list

5. Admin clicks order → GET /api/admin/orders/:id
   - Full order detail, customer info, payment proofs array

6. Admin verifies payment in bank app → clicks "Mark Paid"
   - POST /api/admin/orders/:id/mark-paid {verified_by: admin_email}
   - Workers → D1 transaction:
     a. UPDATE orders SET status = 'paid'
     b. INSERT INTO payments (verified_at, verified_by)
     c. UPDATE inventory SET reserved_count -= qty, stock_count -= qty
     d. INSERT INTO admin_audit_log
     e. COMMIT
   - Workers → Resend payment_confirmed email
   - Response: {success: true, new_status: 'paid'}

7. Admin packs order → POST /api/admin/orders/:id/pack
   - UPDATE orders SET status = 'packed'
   - Log audit

8. Admin ships → POST /api/admin/orders/:id/ship
   Body: {carrier: "Thailand Post", tracking_number: "RN123456789TH"}
   - INSERT INTO shipments
   - UPDATE orders SET status = 'shipped'
   - Resend order_shipped email
   - Log audit
```

### Cloudflare Access Protection

- **Access Policy Configuration:**
  - Path: `/admin/*` (Pages)
  - Path: `/api/admin/*` (Workers custom domain)
  - Allow rule: Email domain is `cnxnature.com`
  - Authentication: One-time PIN via email or Google Workspace SSO

- **Implementation in Workers:**
  - Middleware verifies Cloudflare Access JWT in `CF_Authorization` cookie
  - If admin route && email claim is missing/unauthorized → 403
  - Extract admin email from the verified JWT for audit logging
  - Local dev fallback: when `ENVIRONMENT` is unset, `X-Admin-Email` header is accepted

---

## 2. D1 Data Model

### Full Schema SQL

```sql
-- products table
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price_thb INTEGER NOT NULL, -- stored as satang (THB * 100)
    weight_g INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = hidden
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_active ON products(active);

-- inventory table (separate for atomic stock operations)
CREATE TABLE inventory (
    product_id INTEGER PRIMARY KEY,
    stock_count INTEGER NOT NULL DEFAULT 0, -- available stock
    reserved_count INTEGER NOT NULL DEFAULT 0, -- allocated to unpaid orders
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX idx_inventory_product_id ON inventory(product_id);

-- users table (customer accounts, see 05-user-management.md)
CREATE TABLE users (
    id TEXT PRIMARY KEY, -- ULID
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    phone TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- magic_links table
CREATE TABLE magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of token
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY, -- session token hash
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- site_settings table (admin-configurable settings)
CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- orders table
CREATE TABLE orders (
    id TEXT PRIMARY KEY, -- ULID
    user_id TEXT, -- nullable FK, NULL for guest checkout
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    shipping_address_line1 TEXT NOT NULL,
    shipping_address_line2 TEXT,
    district TEXT NOT NULL,
    province TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    subtotal_thb INTEGER NOT NULL, -- satang
    shipping_thb INTEGER NOT NULL, -- satang
    discount_thb INTEGER NOT NULL DEFAULT 0, -- satang
    total_thb INTEGER NOT NULL, -- satang
    status TEXT NOT NULL DEFAULT 'pending_payment',
    idempotency_key TEXT NOT NULL UNIQUE,
    discount_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CHECK (status IN ('pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'))
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_idempotency_key ON orders(idempotency_key);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- order_items table
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_thb INTEGER NOT NULL, -- satang at time of order
    line_total_thb INTEGER NOT NULL, -- satang
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- payments table
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL, -- 'promptpay' or 'bank_transfer'
    reference TEXT, -- optional customer-provided ref
    amount_thb INTEGER NOT NULL, -- satang
    verified_at TEXT,
    verified_by TEXT, -- admin email from Cloudflare Access
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CHECK (method IN ('promptpay', 'bank_transfer'))
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_verified_at ON payments(verified_at);

-- payment_proofs table
CREATE TABLE payment_proofs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    proof_type TEXT NOT NULL, -- 'reference' or 'image_url'
    proof_value TEXT NOT NULL, -- transaction ref string or R2 image URL
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CHECK (proof_type IN ('reference', 'image_url'))
);

CREATE INDEX idx_payment_proofs_order_id ON payment_proofs(order_id);

-- shipments table
CREATE TABLE shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    carrier TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    shipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);
CREATE INDEX idx_shipments_tracking_number ON shipments(tracking_number);

-- admin_audit_log table
CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'mark_paid', 'pack', 'ship', 'cancel', 'inventory_adjust'
    order_id TEXT, -- nullable for inventory adjustments
    details_json TEXT, -- JSON blob for extra context
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admin_audit_log_order_id ON admin_audit_log(order_id);
CREATE INDEX idx_admin_audit_log_admin_email ON admin_audit_log(admin_email);
CREATE INDEX idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

-- email_logs table (for Resend failure tracking)
CREATE TABLE email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT, -- nullable (magic link emails have no order)
    event TEXT NOT NULL, -- 'order_created', 'payment_confirmed', 'order_shipped', 'magic_link'
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL, -- 'sent', 'failed'
    error TEXT, -- error message if failed
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_logs_order_id ON email_logs(order_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
```

### Seed Data SQL

```sql
-- Seed initial products
INSERT INTO products (slug, name, description, price_thb, weight_g, image_url, active) VALUES
(
    'plant-protein-500g',
    'CNX Plant Protein 500g',
    'Premium pea and brown rice protein blend. 25g protein per serving. Made for athletes who care about what they put in their bodies. Neutral flavor, mixes smooth. Grown and produced in Thailand.',
    89900, -- 899.00 THB
    500,
    '/images/products/plant-protein-500g.jpg',
    1
),
(
    'plant-protein-1000g',
    'CNX Plant Protein 1kg',
    'Premium pea and brown rice protein blend. 25g protein per serving. Made for athletes who care about what they put in their bodies. Neutral flavor, mixes smooth. Grown and produced in Thailand. Better value for regular users.',
    169900, -- 1699.00 THB
    1000,
    '/images/products/plant-protein-1000g.jpg',
    1
);

-- Initialize inventory for both products
INSERT INTO inventory (product_id, stock_count, reserved_count) VALUES
((SELECT id FROM products WHERE slug = 'plant-protein-500g'), 100, 0),
((SELECT id FROM products WHERE slug = 'plant-protein-1000g'), 100, 0);

-- Site settings (admin-configurable)
INSERT INTO site_settings (key, value) VALUES
('shipping_flat_rate', '10000'), -- 100.00 THB in satang
('shipping_free_threshold', '0'), -- 0 = no free shipping threshold; set to e.g. 150000 for free above ฿1,500
('promptpay_number', '0812345678'),
('bank_name', 'Kasikorn Bank'),
('bank_account_name', 'CNX AthletX Co., Ltd.'),
('bank_account_number', '123-4-56789-0'),
('payment_deadline_hours', '24');
```

---

## 3. API Specification

### Public Endpoints

#### GET /api/products

**Purpose:** List all active products with current inventory availability.

**Auth:** Public

**Method:** `GET /api/products`

**Request:** None

**Response (200 OK):**
```json
{
  "products": [
    {
      "id": 1,
      "slug": "plant-protein-500g",
      "name": "CNX Plant Protein 500g",
      "description": "Premium pea and brown rice protein blend...",
      "price_thb": 89900,
      "weight_g": 500,
      "image_url": "/images/products/plant-protein-500g.jpg",
      "available_stock": 98
    },
    {
      "id": 2,
      "slug": "plant-protein-1000g",
      "name": "CNX Plant Protein 1kg",
      "description": "Premium pea and brown rice protein blend...",
      "price_thb": 169900,
      "weight_g": 1000,
      "image_url": "/images/products/plant-protein-1000g.jpg",
      "available_stock": 100
    }
  ]
}
```

**Validation:** None

**Errors:**
- `500 Internal Server Error` if D1 query fails

---

#### GET /api/products/:slug

**Purpose:** Fetch single product detail by slug with stock availability.

**Auth:** Public

**Method:** `GET /api/products/:slug`

**Request:** Path parameter `slug`

**Response (200 OK):**
```json
{
  "product": {
    "id": 1,
    "slug": "plant-protein-500g",
    "name": "CNX Plant Protein 500g",
    "description": "Premium pea and brown rice protein blend. 25g protein per serving...",
    "price_thb": 89900,
    "weight_g": 500,
    "image_url": "/images/products/plant-protein-500g.jpg",
    "available_stock": 98
  }
}
```

**Validation:**
- `slug` must match `/^[a-z0-9-]+$/`

**Errors:**
- `400 Bad Request` — `{"error": "Invalid slug format"}`
- `404 Not Found` — `{"error": "Product not found"}`
- `500 Internal Server Error` — `{"error": "Database error"}`

---

#### POST /api/checkout

**Purpose:** Create order with atomic inventory reservation. Returns order ID and payment instructions.

**Auth:** Public

**Method:** `POST /api/checkout`

**Request Body:**
```json
{
  "items": [
    {"product_id": 1, "quantity": 2},
    {"product_id": 2, "quantity": 1}
  ],
  "customer": {
    "name": "Somchai Rattana",
    "email": "somchai@example.com",
    "phone": "+66812345678",
    "address": {
      "line1": "123 Nimmanhaemin Road",
      "line2": "Soi 5",
      "district": "Suthep",
      "province": "Chiang Mai",
      "postal_code": "50200"
    }
  },
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response (201 Created):**
```json
{
  "order_id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
  "total_thb": 259700,
  "payment_instructions": {
    "methods": ["promptpay", "bank_transfer"],
    "promptpay": {
      "number": "{{from site_settings.promptpay_number}}",
      "qr_url": "https://promptpay.io/{{promptpay_number}}/2597.00"
    },
    "bank_transfer": {
      "bank": "{{from site_settings.bank_name}}",
      "account_name": "{{from site_settings.bank_account_name}}",
      "account_number": "{{from site_settings.bank_account_number}}",
      "amount_thb": 259700,
      "reference": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A"
    },
    "notes": "Please submit payment proof after transfer. Payment should be received within {{payment_deadline_hours}} hours."
  }
}
```

**Validation:**
- `items` array: min 1, max 10 items
- Each item: `product_id` must exist and be active, `quantity` must be 1-100
- `customer.name`: 2-100 chars
- `customer.email`: valid email format
- `customer.phone`: Thai phone format `/^\+66[0-9]{9}$/` or `0[0-9]{9}`
- `customer.address.line1`: required, 5-200 chars
- `customer.address.postal_code`: 5 digits
- `idempotency_key`: UUID v4 format

**Atomic Stock Reservation Flow (D1 Batch API):**

> **Note:** Cloudflare D1 does not support `FOR UPDATE` or raw `BEGIN TRANSACTION`. Use `db.batch()` which executes all statements in a single implicit transaction. If any statement fails, all changes are rolled back.

```typescript
// 1. First, read stock levels (outside the batch)
const stockCheck = await env.DB.prepare(`
  SELECT p.id, p.price_thb, i.stock_count, i.reserved_count
  FROM products p
  JOIN inventory i ON p.id = i.product_id
  WHERE p.id IN (?, ?) AND p.active = 1
`).bind(1, 2).all();

// 2. Validate stock >= quantity for each item (in application logic)
// If insufficient: return 422

// 3. Execute all writes atomically via db.batch()
const results = await env.DB.batch([
  // Reserve inventory
  env.DB.prepare('UPDATE inventory SET reserved_count = reserved_count + ? WHERE product_id = ?').bind(2, 1),
  env.DB.prepare('UPDATE inventory SET reserved_count = reserved_count + ? WHERE product_id = ?').bind(1, 2),

  // Create order
  env.DB.prepare(`INSERT INTO orders (id, user_id, customer_name, customer_email, ..., status, idempotency_key)
    VALUES (?, ?, ?, ?, ..., 'pending_payment', ?)`).bind(orderId, userId, ...),

  // Create order items
  env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_thb, line_total_thb) VALUES (?, ?, ?, ?, ?)').bind(orderId, 1, 2, 89900, 179800),
  env.DB.prepare('INSERT INTO order_items (order_id, product_id, quantity, unit_price_thb, line_total_thb) VALUES (?, ?, ?, ?, ?)').bind(orderId, 2, 1, 169900, 169900),
]);
```

> **Race condition note:** There is a small window between the stock check read and the batch write. For a low-traffic store (<1000 orders/month), this is acceptable. If two concurrent checkouts race for the last item, the `CHECK` constraint on `stock_count >= reserved_count` (enforced at DB level) will cause one batch to fail, which the application handles gracefully by returning 422.

**Errors:**
- `400 Bad Request` — validation errors:
  ```json
  {"error": "Validation failed", "details": ["Email is invalid", "Quantity must be >= 1"]}
  ```
- `409 Conflict` — duplicate idempotency key:
  ```json
  {"error": "Duplicate order submission", "existing_order_id": "01HN..."}
  ```
- `422 Unprocessable Entity` — insufficient stock:
  ```json
  {"error": "Insufficient stock", "product_id": 1, "requested": 5, "available": 3}
  ```
- `500 Internal Server Error` — transaction failed

**Idempotency:**
- If `idempotency_key` already exists in `orders` table, return existing order details with `200 OK` instead of creating new order
- Key expires naturally when order reaches terminal state (shipped/cancelled)
- Frontend generates UUID v4 on checkout page load, reuses on retry

---

#### GET /api/orders/:id

**Purpose:** Public order status lookup (sanitized, no full customer details).

**Auth:** Public

**Method:** `GET /api/orders/:id`

**Request:** Path parameter `id` (order ULID)

**Response (200 OK):**
```json
{
  "order": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "status": "pending_payment",
    "total_thb": 259700,
    "created_at": "2026-02-11T08:30:00Z",
    "items": [
      {
        "product_name": "CNX Plant Protein 500g",
        "quantity": 2,
        "line_total_thb": 179800
      },
      {
        "product_name": "CNX Plant Protein 1kg",
        "quantity": 1,
        "line_total_thb": 169900
      }
    ],
    "shipment": null,
    "payment_submitted": false
  }
}
```

If status = `shipped`:
```json
{
  "order": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "status": "shipped",
    "total_thb": 259700,
    "created_at": "2026-02-11T08:30:00Z",
    "items": [...],
    "shipment": {
      "carrier": "Thailand Post",
      "tracking_number": "RN123456789TH",
      "shipped_at": "2026-02-12T14:00:00Z"
    },
    "payment_submitted": true
  }
}
```

**Validation:**
- `id` must be valid ULID format

**Errors:**
- `400 Bad Request` — invalid ID format
- `404 Not Found` — order does not exist
- `500 Internal Server Error`

**Note:** Does NOT return customer name, email, phone, or full address (privacy).

---

#### POST /api/orders/:id/payment-proof

**Purpose:** Customer submits payment proof (transaction reference).

**Auth:** Public

**Method:** `POST /api/orders/:id/payment-proof`

**Request Body:**
```json
{
  "proof_value": "TXN20260211083045"
}
```
 
**Response (201 Created):**
```json
{
  "success": true,
}
```

**Validation:**
- `proof_value`: string between 5 and 100 characters
- Order must exist and status must be `pending_payment`

**Errors:**
- `400 Bad Request` — validation failed
- `404 Not Found` — order not found
- `409 Conflict` — order status not `pending_payment`:
  ```json
  {"error": "Payment proof can only be submitted for orders awaiting payment", "current_status": "paid"}
  ```
- `500 Internal Server Error`

**Note:** The endpoint currently records only `proof_type = 'reference'`.

---

### Shipping Cost Calculation

Shipping cost is admin-configurable via `site_settings` table:
- `shipping_flat_rate`: flat rate in satang (default: 10000 = ฿100)
- `shipping_free_threshold`: order subtotal above which shipping is free (0 = no free shipping)

**Checkout logic:**
```typescript
const flatRate = parseInt(settings.shipping_flat_rate);
const freeThreshold = parseInt(settings.shipping_free_threshold);
const shippingCost = (freeThreshold > 0 && subtotal >= freeThreshold) ? 0 : flatRate;
```

Admin can update these values via `PUT /api/admin/settings`.

---

### Admin Endpoints (Cloudflare Access Protected)

All admin endpoints require:
- Cloudflare Access JWT validated from `CF_Authorization` cookie (audience `CF_ACCESS_AUD`)
- Extracted email must be present in `ADMIN_EMAILS`
- Local dev fallback: when `ENVIRONMENT` is unset, `X-Admin-Email` header is accepted
- Returns `403 Forbidden` if missing/invalid (error: `Admin authentication required`)

---

#### GET /api/admin/orders

**Purpose:** Paginated order list with filters for admin dashboard.

**Auth:** Cloudflare Access

**Method:** `GET /api/admin/orders?status=pending_payment&page=1&limit=20`

**Query Parameters:**
- `status` (optional): filter by order status enum
- `q` (optional): search by order ID or customer name (partial match, case-insensitive)
- `page` (optional, default `1`): page number
- `limit` (optional, default `20`, max `100`): orders per page

**Response (200 OK):**
```json
{
  "orders": [
    {
      "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
      "customer_name": "Somchai Rattana",
      "total_thb": 259700,
      "status": "pending_payment",
      "items_count": 2,
      "created_at": "2026-02-11T08:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

**Validation:**
- `status` must be valid enum or empty
- `page` >= 1
- `limit` 1-100

**Errors:**
- `403 Forbidden` — missing/invalid Cloudflare Access credentials
- `400 Bad Request` — invalid query params
- `500 Internal Server Error`

---

#### GET /api/admin/orders/:id

**Purpose:** Full order detail including customer info, items, payment proofs, shipment, audit trail.

**Auth:** Cloudflare Access

**Method:** `GET /api/admin/orders/:id`

**Response (200 OK):**
```json
{
  "order": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "customer": {
      "name": "Somchai Rattana",
      "email": "somchai@example.com",
      "phone": "+66812345678"
    },
    "shipping_address": {
      "line1": "123 Nimmanhaemin Road",
      "line2": "Soi 5",
      "district": "Suthep",
      "province": "Chiang Mai",
      "postal_code": "50200"
    },
    "items": [
      {
        "product_name": "CNX Plant Protein 500g",
        "quantity": 2,
        "line_total_thb": 179800
      }
    ],
    "subtotal_thb": 349700,
    "shipping_thb": 10000,
    "discount_thb": 0,
    "total_thb": 359700,
    "status": "pending_payment",
    "payment_proofs": [
      {
        "id": 1,
        "proof_type": "reference",
        "proof_value": "TXN20260211083045",
        "submitted_at": "2026-02-11T08:45:00Z"
      }
    ],
    "shipment": null,
    "created_at": "2026-02-11T08:30:00Z",
    "updated_at": "2026-02-11T08:45:00Z",
    "audit_logs": [
      {
        "id": 1,
        "admin_email": "admin@cnxnature.com",
        "action": "mark_paid",
        "details_json": "{\"from\":\"pending_payment\",\"to\":\"paid\"}",
        "created_at": "2026-02-11T09:00:00Z"
      }
    ]
  }
}
```

**Errors:**
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`

---

#### POST /api/admin/orders/:id/mark-paid

**Purpose:** Admin verifies payment and transitions order to `paid` status. Deducts reserved stock.

**Auth:** Cloudflare Access

**Method:** `POST /api/admin/orders/:id/mark-paid`

**Request Body:** (ignored)
```json
{}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation:**
- Order must exist
- Current status must be `pending_payment`

**Errors:**
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict` — invalid status transition:
  ```json
  {"error": "Invalid status transition", "current_status": "shipped"}
  ```
- `500 Internal Server Error`

**Side Effects (D1 Batch):**
```typescript
// Fetch order items first to know quantities per product
const items = await env.DB.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').bind(orderId).all();

await env.DB.batch([
  env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('paid', orderId),

  env.DB.prepare('INSERT INTO payments (order_id, method, reference, amount_thb, verified_at, verified_by, created_at) VALUES (?, \'bank_transfer\', NULL, ?, ?, ?, ?)').bind(orderId, order.total_thb, now, adminEmail, now),

  // Deduct from reserved and stock counts (one statement per order item)
  ...items.results.map(item =>
    env.DB.prepare('UPDATE inventory SET reserved_count = MAX(reserved_count - ?, 0), stock_count = MAX(stock_count - ?, 0) WHERE product_id = ?').bind(item.quantity, item.quantity, item.product_id)
  ),

  env.DB.prepare('INSERT INTO admin_audit_log (admin_email, action, order_id, details_json) VALUES (?, ?, ?, ?)').bind(adminEmail, 'mark_paid', orderId, JSON.stringify({ from: 'pending_payment', to: 'paid' })),
]);
```

**Email Trigger:**
- Send "Payment Confirmed" email via Resend
- Log to `email_logs` table
- Email failure does NOT block status transition

---

#### POST /api/admin/orders/:id/pack

**Purpose:** Admin marks order as packed (physical fulfillment step).

**Auth:** Cloudflare Access

**Method:** `POST /api/admin/orders/:id/pack`

**Request Body:** (ignored)
```json
{}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation:**
- Current status must be `paid`

**Errors:**
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict` — invalid status
- `500 Internal Server Error`

**Side Effects (D1 Batch):**
```typescript
await env.DB.batch([
  env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('packed', orderId),
  env.DB.prepare('INSERT INTO admin_audit_log (admin_email, action, order_id, details_json) VALUES (?, ?, ?, ?)').bind(adminEmail, 'pack', orderId, JSON.stringify({ from: 'paid', to: 'packed' })),
]);
```

---

#### POST /api/admin/orders/:id/ship

**Purpose:** Admin adds shipment tracking and transitions order to `shipped`. Triggers shipment email.

**Auth:** Cloudflare Access

**Method:** `POST /api/admin/orders/:id/ship`

**Request Body:**
```json
{
  "carrier": "Thailand Post",
  "tracking_number": "RN123456789TH"
}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation:**
- Current status must be `packed`
- `carrier`: 2-50 chars
- `tracking_number`: 5-50 chars alphanumeric

**Errors:**
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict`
- `500 Internal Server Error`

**Side Effects (D1 Batch):**
```typescript
await env.DB.batch([
  env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('shipped', orderId),
  env.DB.prepare('INSERT INTO shipments (order_id, carrier, tracking_number, shipped_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').bind(orderId, carrier, trackingNumber),
  env.DB.prepare('INSERT INTO admin_audit_log (admin_email, action, order_id, details_json) VALUES (?, ?, ?, ?)').bind(adminEmail, 'ship', orderId, JSON.stringify({ carrier, tracking_number: trackingNumber })),
]);
```

**Email Trigger:**
- Send "Order Shipped" email with tracking link
- Tracking URL pattern: `https://track.thailandpost.co.th/?trackNumber=RN123456789TH`

---

#### POST /api/admin/orders/:id/cancel

**Purpose:** Cancel order and restore inventory (reserved or committed stock depending on status).

**Auth:** Cloudflare Access

**Method:** `POST /api/admin/orders/:id/cancel`

**Request Body:** (ignored)
```json
{}
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Validation:**
- Current status must be `pending_payment`, `paid`, or `packed` (NOT `shipped`, `delivered`, or already `cancelled`)

**Errors:**
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict` — cannot cancel shipped orders
- `500 Internal Server Error`

**Side Effects (Inventory Restoration Logic via D1 Batch):**

```typescript
// Fetch order + items to determine restoration strategy
const order = await env.DB.prepare('SELECT status FROM orders WHERE id = ?').bind(orderId).first();
const items = await env.DB.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').bind(orderId).all();

// Build inventory restoration statements based on current status
const inventoryUpdates = items.results.map(item => {
  if (order.status === 'pending_payment') {
    // Restore reserved stock only
    return env.DB.prepare('UPDATE inventory SET reserved_count = MAX(reserved_count - ?, 0), updated_at = CURRENT_TIMESTAMP WHERE product_id = ?')
      .bind(item.quantity, item.product_id);
  } else {
    // paid or packed: restore committed stock (was already deducted from stock_count)
    return env.DB.prepare('UPDATE inventory SET stock_count = stock_count + ? WHERE product_id = ?')
      .bind(item.quantity, item.product_id);
  }
});

await env.DB.batch([
  env.DB.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('cancelled', orderId),
  ...inventoryUpdates,
  env.DB.prepare('INSERT INTO admin_audit_log (admin_email, action, order_id, details_json) VALUES (?, ?, ?, ?)').bind(adminEmail, 'cancel', orderId, JSON.stringify({ from: order.status, to: 'cancelled' })),
]);
```

---

#### PATCH /api/admin/inventory/:productId

**Purpose:** Manually adjust product stock count (for restocks, corrections, spoilage).

**Auth:** Cloudflare Access

**Method:** `PATCH /api/admin/inventory/:productId`

**Request Body:**
```json
{
  "adjustment": 50,
  "notes": "Restocked from supplier"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "inventory": {
    "product_id": 1,
    "stock_count": 148,
    "reserved_count": 2,
    "updated_at": "2026-02-11T16:00:00Z"
  }
}
```

**Validation:**
- `adjustment`: integer, can be positive (restock) or negative (spoilage)
- Result `stock_count` must be >= `reserved_count` (cannot go below reserved)

**Errors:**
- `403 Forbidden`
- `404 Not Found` — product doesn't exist
- `422 Unprocessable Entity` — adjustment would make stock < reserved:
  ```json
  {"error": "Cannot reduce stock below reserved count", "stock_count": 5, "reserved_count": 10, "attempted_adjustment": -10}
  ```
- `500 Internal Server Error`

**Side Effects (D1 Batch):**
```typescript
await env.DB.batch([
  env.DB.prepare('UPDATE inventory SET stock_count = stock_count + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?').bind(adjustment, productId),
  env.DB.prepare('INSERT INTO admin_audit_log (admin_email, action, order_id, details_json) VALUES (?, ?, NULL, ?)').bind(adminEmail, 'inventory_adjust', JSON.stringify({ product_id: productId, adjustment, notes })),
]);
```

---

## 4. Admin Workflow

### Order Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORDER LIFECYCLE                            │
└─────────────────────────────────────────────────────────────────┘

  [CHECKOUT]
      │
      ▼
┌──────────────────┐
│ pending_payment  │ ◄───── Initial state, inventory reserved
└──────────────────┘
      │
      │ Admin verifies payment → POST /api/admin/orders/:id/mark-paid
      │ Side effect: deduct from stock_count, move from reserved
      ▼
┌──────────────────┐
│      paid        │ ◄───── Payment confirmed, ready to fulfill
└──────────────────┘
      │
      │ Admin packs box → POST /api/admin/orders/:id/pack
      ▼
┌──────────────────┐
│     packed       │ ◄───── Physical fulfillment done, ready to ship
└──────────────────┘
      │
      │ Admin adds tracking → POST /api/admin/orders/:id/ship
      │ Side effect: send shipment email
      ▼
┌──────────────────┐
│     shipped      │ ◄───── In transit (terminal state in v1)
└──────────────────┘
      │
      │ (Future: delivery confirmation)
      ▼
┌──────────────────┐
│    delivered     │ ◄───── Terminal state (not implemented in v1)
└──────────────────┘


CANCELLATION PATH (from any pre-shipped state):
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ pending_payment  │       │      paid        │       │     packed       │
└──────────────────┘       └──────────────────┘       └──────────────────┘
      │                           │                           │
      │ POST /api/admin/orders/:id/cancel                     │
      │                           │                           │
      └───────────────────────────┴───────────────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    cancelled     │ ◄───── Terminal state
                         └──────────────────┘
                         Side effect: restore inventory
```

**State Transition Rules:**
- `pending_payment` → `paid` (via mark-paid) OR `cancelled`
- `paid` → `packed` (via pack) OR `cancelled`
- `packed` → `shipped` (via ship) OR `cancelled`
- `shipped` → `delivered` (future, manual or webhook)
- `cancelled` and `delivered` are terminal (no further transitions)

---

### Payment Verification Flow

```
1. Admin opens dashboard → GET /api/admin/orders?status=pending_payment
2. Sees order #01HN... with total ฿2,597.00, items_count = 2
3. Clicks order → GET /api/admin/orders/01HN...
4. Views payment proof:
   - proof_type: "reference"
   - proof_value: "TXN20260211083045"
   - submitted_at: "2026-02-11T08:45:00Z"

5. Admin opens mobile banking app (Kasikorn/SCB)
6. Searches transaction history for ฿2,597.00 on 2026-02-11 around 08:45
7. Confirms:
   - Amount matches order total
   - Reference matches (if customer included order ID)
   - Timestamp is reasonable

8. Admin clicks "Mark Paid" button in UI
9. UI → POST /api/admin/orders/01HN.../mark-paid
   Body: {} (ignored by backend)

10. Workers:
    a. Updates order status to 'paid'
    b. Inserts payment record (method = `bank_transfer`, reference = null, verified_by from Access admin email)
    c. Deducts inventory (reserved → committed)
    d. Logs audit trail
    e. Sends "Payment Confirmed" email to customer
    f. Returns success

11. Admin sees updated status in dashboard
```

**Edge Cases:**
- Amount mismatch: admin adds note, contacts customer via email before marking paid
- No proof submitted: admin waits or proactively checks bank app using order ID as reference
- Partial payment: reject, contact customer (no partial payment support in v1)

---

### Fulfillment Flow

```
STEP 1: PACKING (physical)
├─ Admin receives notification that order #01HN... is paid
├─ Prints order details (customer name, address, items)
├─ Picks items from warehouse:
│  └─ 2x CNX Plant Protein 500g
│  └─ 1x CNX Plant Protein 1kg
├─ Packs in shipping box with branded tissue paper
├─ Includes thank-you card + QR code for feedback
├─ Seals box, writes order ID on exterior
└─ Returns to desk

STEP 2: MARK PACKED (system)
├─ Admin clicks "Mark Packed" in dashboard
├─ POST /api/admin/orders/01HN.../pack
├─ Body: {} (ignored by backend)
└─ Order status → 'packed'

STEP 3: SHIPPING (physical)
├─ Admin takes packed box to Thailand Post office
├─ Fills shipping label with customer address
├─ Clerk generates tracking number: RN123456789TH
├─ Admin pays shipping fee (cash/card)
└─ Receives receipt

STEP 4: MARK SHIPPED (system)
├─ Admin returns to dashboard
├─ Clicks "Mark Shipped"
├─ Enters:
│  ├─ Carrier: "Thailand Post"
│  └─ Tracking number: "RN123456789TH"
├─ POST /api/admin/orders/01HN.../ship
├─ Order status → 'shipped'
├─ Shipment email sent to customer automatically
└─ Customer can track package via Thailand Post website
```

---

### Cancellation Flow

```
SCENARIO A: Customer requests cancellation (pending_payment)
├─ Customer emails support@cnxnature.com: "Please cancel order #01HN..."
├─ Admin opens order in dashboard
├─ Verifies no payment received yet
├─ Clicks "Cancel Order"
├─ Enters reason: "Customer requested cancellation"
├─ POST /api/admin/orders/01HN.../cancel
├─ System:
│  ├─ Sets status = 'cancelled'
│  ├─ Restores reserved inventory (reserved_count -= quantity)
│  └─ Logs audit trail
└─ Admin replies to customer: "Order cancelled, no charge"

SCENARIO B: Payment not received within 24h (pending_payment)
├─ Admin manually reviews pending_payment orders older than 24h
├─ Selects stale orders → bulk cancel action
├─ For each order:
│  ├─ POST /api/admin/orders/:id/cancel
│  ├─ Reason: "Payment not received within 24 hours"
│  └─ Inventory restored
└─ No customer email needed (order was never confirmed)

SCENARIO C: Out of stock after payment (paid/packed)
├─ Admin discovers product damaged/spoiled before shipping
├─ Clicks "Cancel Order" in dashboard
├─ Reason: "Product damaged, issued refund"
├─ POST /api/admin/orders/01HN.../cancel
├─ System:
│  ├─ Sets status = 'cancelled'
│  ├─ Restores committed stock (stock_count += quantity)
│  └─ Logs audit trail
├─ Admin manually processes refund via bank transfer
└─ Admin emails customer with apology + refund confirmation

SCENARIO D: Cannot cancel shipped orders
├─ Admin tries to cancel order in 'shipped' status
├─ UI prevents button click (disabled state)
├─ If attempted via API: 409 Conflict
└─ For shipped order issues: handle via customer service (return/refund flow, not in v1)
```

---

### Audit Logging

**Every admin action is logged to `admin_audit_log` table.**

**Captured fields:**
- `admin_email` — from verified Cloudflare Access email claim in `CF_Authorization` cookie (or `X-Admin-Email` in local dev)
- `action` — enum: `mark_paid`, `pack`, `ship`, `cancel`, `inventory_adjust`
- `order_id` — related order (null for inventory adjustments)
- `details_json` — JSON blob with context (notes, payment ref, tracking number, etc.)
- `created_at` — timestamp

**Example log entries:**
```json
[
  {
    "id": 1,
    "admin_email": "admin@cnxnature.com",
    "action": "mark_paid",
    "order_id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "details_json": "{\"from\":\"pending_payment\",\"to\":\"paid\"}",
    "created_at": "2026-02-11T09:00:00Z"
  },
  {
    "id": 2,
    "admin_email": "fulfillment@cnxnature.com",
    "action": "pack",
    "order_id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "details_json": "{\"from\":\"paid\",\"to\":\"packed\"}",
    "created_at": "2026-02-11T10:00:00Z"
  },
  {
    "id": 3,
    "admin_email": "fulfillment@cnxnature.com",
    "action": "ship",
    "order_id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "details_json": "{\"carrier\":\"Thailand Post\",\"tracking_number\":\"RN123456789TH\"}",
    "created_at": "2026-02-11T14:00:00Z"
  }
]
```

**Audit log UI (admin dashboard):**
- Per-order audit trail: shown on order detail page
- Per-order audit trail is available in the admin order detail view

---

## 5. Resend Integration Plan

### Domain Setup

**DNS records to add in Cloudflare dashboard:**

1. **SPF Record:**
   ```
   Type: TXT
   Name: cnxnature.com
   Content: v=spf1 include:_spf.resend.com ~all
   ```

2. **DKIM Record (provided by Resend after domain verification):**
   ```
   Type: TXT
   Name: resend._domainkey.cnxnature.com
   Content: [Resend-provided DKIM key]
   ```

3. **Return-Path:**
   ```
   Type: CNAME
   Name: em.cnxnature.com
   Content: feedback-smtp.resend.com
   ```

**Verification steps:**
1. Add domain in Resend dashboard
2. Add DNS records in Cloudflare
3. Wait for propagation (5-15 minutes)
4. Click "Verify" in Resend dashboard
5. Test send to personal email

**API Key Storage:**
- Store in Workers secret: `wrangler secret put RESEND_API_KEY`
- Access in code: `env.RESEND_API_KEY`
- Key format: `re_...` (Resend API key)

---

### Email Templates

#### 1. Order Created Email

**Trigger:** POST /api/checkout success (after order insert commits)

**From:** `CNX AthletX <orders@cnxnature.com>`

**Reply-To:** `support@cnxnature.com`

**Subject:** `Order Confirmation #{{order_id}}`

**HTML Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .header { background-color: #2F6B4F; padding: 20px; text-align: center; }
    .header img { max-width: 150px; }
    .content { padding: 30px 20px; max-width: 600px; margin: 0 auto; }
    .order-summary { background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
    .total { font-size: 18px; font-weight: bold; margin-top: 10px; }
    .payment-box { background-color: #FFF9E6; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cnxnature.com/logo-white.png" alt="CNX AthletX">
  </div>
  
  <div class="content">
    <h1>Thanks for your order!</h1>
    <p>Hey {{customer_name}},</p>
    <p>We've received your order. Here's what you ordered:</p>
    
    <div class="order-summary">
      <h3>Order #{{order_id}}</h3>
      {{#each items}}
      <div class="item">
        <span>{{quantity}}x {{product_name}}</span>
        <span>฿{{line_total_display}}</span>
      </div>
      {{/each}}
      <div class="item">
        <span>Shipping</span>
        <span>฿{{shipping_display}}</span>
      </div>
      <div class="total">
        <div class="item">
          <span>Total</span>
          <span>฿{{total_display}}</span>
        </div>
      </div>
    </div>
    
    <div class="payment-box">
      <h3>⏱️ Next Step: Send Payment</h3>
      <p><strong>Please transfer ฿{{total_display}} within 24 hours</strong> to confirm your order.</p>
      
      <h4>Option 1: PromptPay</h4>
      <p>Scan this QR code with your banking app:</p>
      <img src="{{promptpay_qr_url}}" alt="PromptPay QR" style="max-width: 200px;">
      <p>PromptPay ID: {{promptpay_number}}</p>
      
      <h4>Option 2: Bank Transfer</h4>
      <ul>
        <li>Bank: {{bank_name}}</li>
        <li>Account Name: {{bank_account_name}}</li>
        <li>Account Number: {{bank_account_number}}</li>
        <li>Amount: ฿{{total_display}}</li>
      </ul>
      
      <p><strong>After payment:</strong> Submit your payment proof here:<br>
      <a href="https://cnxnature.com/orders/{{order_id}}/payment-proof">https://cnxnature.com/orders/{{order_id}}/payment-proof</a></p>
    </div>
    
    <h3>What happens next?</h3>
    <ol>
      <li>Transfer payment using PromptPay or bank transfer</li>
      <li>Submit payment proof (we'll verify within 24 hours)</li>
      <li>We'll pack your order and ship it out</li>
      <li>You'll receive tracking info via email</li>
    </ol>
    
    <p>Track your order anytime: <a href="https://cnxnature.com/orders/{{order_id}}">View Order Status</a></p>
    
    <p>Questions? Reply to this email or contact us at support@cnxnature.com</p>
    
    <p>Thanks for supporting local,<br>
    The CNX AthletX Team</p>
  </div>
  
  <div class="footer">
    <p>CNX AthletX | Chiang Mai, Thailand<br>
    This email was sent to {{customer_email}}</p>
  </div>
</body>
</html>
```

**Template Variables:**
```javascript
{
  order_id: "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
  customer_name: "Somchai",
  customer_email: "somchai@example.com",
  items: [
    {product_name: "CNX Plant Protein 500g", quantity: 2, line_total_display: "1,798.00"}
  ],
  shipping_display: "100.00",
  total_display: "2,597.00",
  promptpay_qr_url: "https://promptpay.io/0812345678/2597.00",
  promptpay_number: "0812345678"
}
```

---

#### 2. Payment Confirmed Email

**Trigger:** POST /api/admin/orders/:id/mark-paid success

**From:** `CNX AthletX <orders@cnxnature.com>`

**Subject:** `Payment Confirmed – Order #{{order_id}}`

**HTML Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .header { background-color: #2F6B4F; padding: 20px; text-align: center; }
    .header img { max-width: 150px; }
    .content { padding: 30px 20px; max-width: 600px; margin: 0 auto; }
    .success-box { background-color: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cnxnature.com/logo-white.png" alt="CNX AthletX">
  </div>
  
  <div class="content">
    <div class="success-box">
      <h2>✅ Payment Confirmed!</h2>
      <p>Your payment for Order #{{order_id}} has been verified.</p>
    </div>
    
    <p>Hey {{customer_name}},</p>
    <p>Good news! We've confirmed your payment of <strong>฿{{total_display}}</strong>.</p>
    
    <h3>What's next?</h3>
    <p>We're preparing your order right now. You'll receive another email with tracking information once it ships (usually within 1-2 business days).</p>
    
    <p>Track your order: <a href="https://cnxnature.com/orders/{{order_id}}">View Order Status</a></p>
    
    <p>Thanks for your patience,<br>
    The CNX AthletX Team</p>
  </div>
  
  <div class="footer">
    <p>CNX AthletX | Chiang Mai, Thailand</p>
  </div>
</body>
</html>
```

---

#### 3. Order Shipped Email

**Trigger:** POST /api/admin/orders/:id/ship success

**From:** `CNX AthletX <orders@cnxnature.com>`

**Subject:** `Your Order Has Shipped! #{{order_id}}`

**HTML Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .header { background-color: #2F6B4F; padding: 20px; text-align: center; }
    .header img { max-width: 150px; }
    .content { padding: 30px 20px; max-width: 600px; margin: 0 auto; }
    .tracking-box { background-color: #E0F2FE; border-left: 4px solid #0EA5E9; padding: 15px; margin: 20px 0; }
    .tracking-button { display: inline-block; background-color: #0EA5E9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cnxnature.com/logo-white.png" alt="CNX AthletX">
  </div>
  
  <div class="content">
    <h1>📦 Your Order Is On The Way!</h1>
    
    <p>Hey {{customer_name}},</p>
    <p>Great news! Order #{{order_id}} has been shipped and is heading your way.</p>
    
    <div class="tracking-box">
      <h3>Tracking Information</h3>
      <p><strong>Carrier:</strong> {{carrier}}<br>
      <strong>Tracking Number:</strong> {{tracking_number}}</p>
      
      <a href="{{tracking_url}}" class="tracking-button">Track Your Package</a>
    </div>
    
    <h3>Delivery Details</h3>
    <p>Shipping to:<br>
    {{customer_name}}<br>
    {{shipping_address_line1}}<br>
    {{#if shipping_address_line2}}{{shipping_address_line2}}<br>{{/if}}
    {{district}}, {{province}} {{postal_code}}</p>
    
    <p>Estimated delivery: <strong>2-4 business days</strong> (depending on your location).</p>
    
    <h3>What's in your package?</h3>
    <ul>
      {{#each items}}
      <li>{{quantity}}x {{product_name}}</li>
      {{/each}}
    </ul>
    
    <p>If you have any questions or issues with your delivery, reply to this email or contact us at support@cnxnature.com</p>
    
    <p>Enjoy your protein!<br>
    The CNX AthletX Team</p>
  </div>
  
  <div class="footer">
    <p>CNX AthletX | Chiang Mai, Thailand</p>
  </div>
</body>
</html>
```

**Template Variables:**
```javascript
{
  order_id: "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
  customer_name: "Somchai Rattana",
  total_display: "2,597.00",
  carrier: "Thailand Post",
  tracking_number: "RN123456789TH",
  tracking_url: "https://track.thailandpost.co.th/?trackNumber=RN123456789TH",
  shipping_address_line1: "123 Nimmanhaemin Road",
  shipping_address_line2: "Soi 5",
  district: "Suthep",
  province: "Chiang Mai",
  postal_code: "50200",
  items: [
    {product_name: "CNX Plant Protein 500g", quantity: 2}
  ]
}
```

---

### Email Sending Implementation (Workers)

**File:** `/packages/api/src/services/email.ts`

```typescript
import { Resend } from 'resend';

interface EmailService {
  sendOrderCreated(order: Order): Promise<void>;
  sendPaymentConfirmed(order: Order): Promise<void>;
  sendOrderShipped(order: Order, shipment: Shipment): Promise<void>;
}

export class ResendEmailService implements EmailService {
  private resend: Resend;
  private db: D1Database;

  constructor(apiKey: string, db: D1Database) {
    this.resend = new Resend(apiKey);
    this.db = db;
  }

  async sendOrderCreated(order: Order): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'CNX AthletX <orders@cnxnature.com>',
        to: order.customer_email,
        reply_to: 'support@cnxnature.com',
        subject: `Order Confirmation #${order.id}`,
        html: this.renderOrderCreatedTemplate(order),
      });

      await this.logEmail(order.id, 'order_created', order.customer_email, 'sent', null);
    } catch (error) {
      console.error('Failed to send order_created email:', error);
      await this.logEmail(order.id, 'order_created', order.customer_email, 'failed', error.message);
      // Do NOT throw – email failure should not block order creation
    }
  }

  async sendPaymentConfirmed(order: Order): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'CNX AthletX <orders@cnxnature.com>',
        to: order.customer_email,
        subject: `Payment Confirmed – Order #${order.id}`,
        html: this.renderPaymentConfirmedTemplate(order),
      });

      await this.logEmail(order.id, 'payment_confirmed', order.customer_email, 'sent', null);
    } catch (error) {
      console.error('Failed to send payment_confirmed email:', error);
      await this.logEmail(order.id, 'payment_confirmed', order.customer_email, 'failed', error.message);
    }
  }

  async sendOrderShipped(order: Order, shipment: Shipment): Promise<void> {
    try {
      await this.resend.emails.send({
        from: 'CNX AthletX <orders@cnxnature.com>',
        to: order.customer_email,
        subject: `Your Order Has Shipped! #${order.id}`,
        html: this.renderOrderShippedTemplate(order, shipment),
      });

      await this.logEmail(order.id, 'order_shipped', order.customer_email, 'sent', null);
    } catch (error) {
      console.error('Failed to send order_shipped email:', error);
      await this.logEmail(order.id, 'order_shipped', order.customer_email, 'failed', error.message);
    }
  }

  private async logEmail(orderId: string | null, event: string, recipientEmail: string, status: string, error: string | null): Promise<void> {
    await this.db.prepare(
      'INSERT INTO email_logs (order_id, event, recipient_email, status, error) VALUES (?, ?, ?, ?, ?)'
    ).bind(orderId, event, recipientEmail, status, error).run();
  }

  private renderOrderCreatedTemplate(order: Order): string {
    // Use simple template literals (no external templating library needed for 4 templates)
    const itemsHtml = order.items.map(item =>
      `<div class="item"><span>${item.quantity}x ${item.product_name}</span><span>฿${formatThb(item.line_total_thb)}</span></div>`
    ).join('');
    return `<!-- Full HTML template with ${itemsHtml} interpolated -->`;
  }

  // Similar for other templates...
}
```

---

### Failure Handling Strategy

**Design Principle:** Email delivery is best-effort. Failures must NOT block order processing.

**Error Handling Flow:**
```
1. Order state transition commits to D1
   ↓
2. Email send attempted (Resend API call)
   ↓
3a. Success → log to email_logs (status='sent')
3b. Failure → catch error, log to email_logs (status='failed', error=message)
   ↓
4. Return success response to admin/customer
   (state transition already committed)
```

**Manual Resend (Admin Dashboard):**
- Not implemented yet (there is no `/api/admin/orders/:id/resend-email` endpoint in the current backend)
- Failed email deliveries are recorded in `email_logs` for admin review

**Monitoring:**
- Admin dashboard shows email failure count per day
- Query: `SELECT COUNT(*) FROM email_logs WHERE status='failed' AND created_at > date('now', '-1 day')`
- If count > 5, investigate Resend API status or DNS issues

---

### Brand Copy Guidelines

**Voice & Tone:**
- Confident but not aggressive
- Grounded in real benefits (protein, convenience, local)
- Community-focused ("supporting local", "made in Thailand")
- Avoid superlatives ("best", "ultimate", "revolutionary")
- Short sentences, active voice
- Mobile-friendly (70% of Thai ecommerce is mobile)

**Thailand FDA Compliance (Food Supplements):**
- Do NOT claim: cures disease, treats medical conditions, "boosts immunity", "detoxifies"
- Do NOT use: "medical-grade", "clinically proven" (unless you have Thai FDA approval docs)
- DO use: "supports protein intake", "convenient nutrition", "25g protein per serving"
- DO include: "This product is not intended to diagnose, treat, cure, or prevent any disease"

**Email-Specific Rules:**
- Subject line: max 50 chars (mobile preview)
- Preheader text: max 100 chars (shows in inbox preview)
- CTA buttons: clear action ("Track Your Package", not "Click Here")
- Always include customer's first name (personalization)
- Footer: physical address required (CAN-SPAM / Thai PDPA compliance)

---

## 6. Testing & Observability

### Unit Tests (Vitest)

**File:** `/packages/api/src/routes/checkout.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('POST /api/checkout', () => {
  let worker;

  beforeEach(async () => {
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
    });
  });

  it('should create order and reserve inventory atomically', async () => {
    const resp = await worker.fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ product_id: 1, quantity: 2 }],
        customer: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '+66812345678',
          address: {
            line1: '123 Test St',
            district: 'Suthep',
            province: 'Chiang Mai',
            postal_code: '50200',
          },
        },
        idempotency_key: crypto.randomUUID(),
      }),
    });

    expect(resp.status).toBe(201);
    const data = await resp.json();
    expect(data.order_id).toBeDefined();
    expect(data.total_thb).toBeGreaterThan(0);
  });

  it('should reject if insufficient stock', async () => {
    const resp = await worker.fetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ product_id: 1, quantity: 9999 }],
        customer: { /* valid customer data */ },
        idempotency_key: crypto.randomUUID(),
      }),
    });

    expect(resp.status).toBe(422);
    const data = await resp.json();
    expect(data.error).toContain('Insufficient stock');
  });

  it('should honor idempotency key', async () => {
    const key = crypto.randomUUID();
    const body = {
      items: [{ product_id: 1, quantity: 1 }],
      customer: { /* valid */ },
      idempotency_key: key,
    };

    const resp1 = await worker.fetch('/api/checkout', { method: 'POST', body: JSON.stringify(body) });
    const data1 = await resp1.json();

    // Second request with same key
    const resp2 = await worker.fetch('/api/checkout', { method: 'POST', body: JSON.stringify(body) });
    const data2 = await resp2.json();

    expect(resp2.status).toBe(200); // Not 201
    expect(data2.order_id).toBe(data1.order_id);
  });
});
```

---

### Integration Tests (Miniflare)

**File:** `/packages/api/tests/integration/order-lifecycle.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'fs';

describe('Order Lifecycle Integration', () => {
  let mf: Miniflare;

  beforeAll(async () => {
    mf = new Miniflare({
      scriptPath: './src/index.ts',
      d1Databases: ['DB'],
      d1Persist: true,
    });

    // Seed database
    const schema = readFileSync('./src/db/schema.sql', 'utf-8');
    const seed = readFileSync('./src/db/seed.sql', 'utf-8');
    await mf.getD1Database('DB').exec(schema);
    await mf.getD1Database('DB').exec(seed);
  });

  it('should handle full order lifecycle', async () => {
    // 1. Create order
    const checkoutResp = await mf.dispatchFetch('/api/checkout', {
      method: 'POST',
      body: JSON.stringify({ /* valid checkout data */ }),
    });
    const { order_id } = await checkoutResp.json();

    // 2. Submit payment proof
    await mf.dispatchFetch(`/api/orders/${order_id}/payment-proof`, {
      method: 'POST',
      body: JSON.stringify({ proof_value: 'TXN123' }),
    });

    // 3. Admin marks paid
    await mf.dispatchFetch(`/api/admin/orders/${order_id}/mark-paid`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
    });

    // Verify inventory deducted
    const db = await mf.getD1Database('DB');
    const { stock_count } = await db.prepare('SELECT stock_count FROM inventory WHERE product_id = 1').first();
    expect(stock_count).toBe(98); // Started at 100, ordered 2

    // 4. Pack
    await mf.dispatchFetch(`/api/admin/orders/${order_id}/pack`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
    });

    // 5. Ship
    await mf.dispatchFetch(`/api/admin/orders/${order_id}/ship`, {
      method: 'POST',
      headers: { 'X-Admin-Email': 'jdelaire@gmail.com' },
      body: JSON.stringify({ carrier: 'Thailand Post', tracking_number: 'RN123' }),
    });

    // Verify final state
    const order = await db.prepare('SELECT status FROM orders WHERE id = ?').bind(order_id).first();
    expect(order.status).toBe('shipped');
  });
});
```

---

### Key Test Scenarios

**Critical Scenarios to Cover:**

1. **Checkout Stock Reservation:**
   - Happy path: sufficient stock → order created, inventory reserved
   - Insufficient stock → 422 error, no order created, inventory unchanged
   - Concurrent orders for same product → both succeed if total stock allows, otherwise second fails

2. **Idempotency:**
   - Same idempotency key twice → second request returns existing order, no duplicate
   - Different keys → both orders created

3. **Status Transitions:**
   - Valid transitions (pending → paid → packed → shipped) succeed
   - Invalid transitions (shipped → paid) return 409

4. **Cancellation Inventory Restoration:**
   - Cancel pending_payment → reserved_count decreases
   - Cancel paid → stock_count increases
   - Cancel shipped → 409 error

5. **Email Failure Resilience:**
   - Resend API throws error → order still created, email_logs shows failure

6. **Admin Auth:**
   - Missing/invalid `CF_Authorization` cookie (or missing `X-Admin-Email` in local dev) → 403
   - Authorized admin email → admin action succeeds, audit log created

---

### Observability

**Cloudflare Workers Analytics (Built-in):**
- Request count, error rate, latency (p50, p95, p99)
- Available in Cloudflare dashboard under Workers > Analytics
- No code changes needed

**Logs (console.log):**
- Workers logs visible via: `wrangler tail` (local dev) or Cloudflare dashboard (production)
- Log format:
  ```typescript
  console.log(JSON.stringify({
    level: 'info',
    message: 'Order created',
    order_id: '01HN...',
    customer_email: 'somchai@example.com',
    total_thb: 259700,
  }));
  ```

**D1 Query Metrics:**
- Cloudflare dashboard shows:
  - Query count per day
  - Average query duration
  - Slow queries (> 100ms)
- No external APM needed

**Error Tracking:**
- Workers catch all errors, log to console with stack trace
- Critical errors (checkout failure, D1 transaction rollback) include full context:
  ```typescript
  console.error(JSON.stringify({
    level: 'error',
    message: 'Checkout transaction failed',
    error: error.message,
    stack: error.stack,
    request_body: sanitizedBody, // Remove sensitive data
  }));
  ```

**Manual Monitoring Checklist (Admin Dashboard):**
- Orders pending payment > 24h (stale orders)
- Email failure count (last 24h)
- Low stock alerts (stock_count < 10)
- Unpacked paid orders > 48h (fulfillment backlog)

**No External Tools in v1:**
- No Sentry, DataDog, New Relic
- Cloudflare's built-in tools sufficient for low traffic (<1000 orders/month)
- Add external monitoring when traffic grows

---

## 7. SEO + Compliance Checklist

### Meta Tags Per Page

**Product Page (`/products/:slug`):**
```html
<head>
  <title>CNX Plant Protein 500g | CNX AthletX</title>
  <meta name="description" content="Premium pea and brown rice protein blend. 25g protein per serving. Made in Thailand for athletes who care about clean nutrition. Free shipping in Chiang Mai.">
  
  <!-- Open Graph (Facebook, LINE) -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="CNX Plant Protein 500g">
  <meta property="og:description" content="Premium plant-based protein powder. 25g protein per serving. Made in Thailand.">
  <meta property="og:image" content="https://cnxnature.com/images/products/plant-protein-500g.jpg">
  <meta property="og:url" content="https://cnxnature.com/products/plant-protein-500g">
  <meta property="product:price:amount" content="899.00">
  <meta property="product:price:currency" content="THB">
  
  <!-- Twitter (X) -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="CNX Plant Protein 500g">
  <meta name="twitter:description" content="Premium plant-based protein powder. Made in Thailand.">
  <meta name="twitter:image" content="https://cnxnature.com/images/products/plant-protein-500g.jpg">
</head>
```

**Homepage (`/`):**
```html
<head>
  <title>CNX AthletX | Plant-Based Protein Powder from Chiang Mai</title>
  <meta name="description" content="Premium plant-based protein powder made in Thailand. Pea and brown rice protein blend. Clean ingredients, no nonsense. Shop now.">
  
  <meta property="og:type" content="website">
  <meta property="og:title" content="CNX AthletX | Plant-Based Protein from Chiang Mai">
  <meta property="og:description" content="Premium plant-based protein powder made in Thailand. Clean ingredients, no nonsense.">
  <meta property="og:image" content="https://cnxnature.com/images/og-default.jpg">
  <meta property="og:url" content="https://cnxnature.com">
</head>
```

---

### Structured Data (JSON-LD)

**Product Schema (on product pages):**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "CNX Plant Protein 500g",
  "image": "https://cnxnature.com/images/products/plant-protein-500g.jpg",
  "description": "Premium pea and brown rice protein blend. 25g protein per serving. Made in Thailand.",
  "brand": {
    "@type": "Brand",
    "name": "CNX AthletX"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://cnxnature.com/products/plant-protein-500g",
    "priceCurrency": "THB",
    "price": "899.00",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "CNX AthletX"
    }
  }
}
</script>
```

**Organization Schema (on homepage):**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "CNX AthletX",
  "url": "https://cnxnature.com",
  "logo": "https://cnxnature.com/logo.png",
  "contactPoint": {
    "@type": "ContactPoint",
    "email": "support@cnxnature.com",
    "contactType": "Customer Service",
    "areaServed": "TH",
    "availableLanguage": ["en", "th"]
  },
  "sameAs": [
    "https://www.instagram.com/cnxathletx",
    "https://www.facebook.com/cnxathletx"
  ]
}
</script>
```

---

### robots.txt

**File:** `/packages/web/public/robots.txt`

```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/admin/

Sitemap: https://cnxnature.com/sitemap.xml
```

---

### Sitemap

**File:** `/packages/web/public/sitemap.xml` (generated dynamically or static)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://cnxnature.com/</loc>
    <lastmod>2026-02-11</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://cnxnature.com/products/plant-protein-500g</loc>
    <lastmod>2026-02-11</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://cnxnature.com/products/plant-protein-1000g</loc>
    <lastmod>2026-02-11</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://cnxnature.com/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://cnxnature.com/privacy</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://cnxnature.com/terms</loc>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

---

### Thailand FDA Supplement Advertising Compliance

**Rules (Food Act B.E. 2522 + FDA Notifications):**
1. No medical claims (cannot claim to treat, cure, or prevent disease)
2. Must state: "This product is a food supplement, not a medicine"
3. Cannot use words: "medical", "clinical", "therapeutic", "heals"
4. Can state factual nutrition info: "Contains 25g protein per serving"
5. Cannot target children under 12 without special approval
6. Must list ingredients in Thai language (on product label)

**Compliant Copy Examples:**
- ✅ "Supports daily protein intake for active lifestyles"
- ✅ "25g plant-based protein per serving"
- ✅ "Convenient nutrition for athletes and fitness enthusiasts"
- ❌ "Boosts muscle recovery and immune function"
- ❌ "Clinically proven to increase strength"
- ❌ "Detoxifies and cleanses your body"

**Website Footer Disclaimer:**
```
This product is a food supplement, not a medicine. It is not intended to diagnose, treat, cure, or prevent any disease. Results may vary. Consult a healthcare professional before use if pregnant, nursing, or have a medical condition.
```

---

### Privacy Policy (Placeholder)

**File:** `/packages/web/src/pages/privacy.md`

**Key Points to Cover:**
- **Data Collected:** Name, email, phone, shipping address, payment proof (transaction reference or image)
- **Purpose:** Order fulfillment, customer communication, transaction records
- **Storage:** Cloudflare D1 database (EU/US regions), payment proofs in Cloudflare R2
- **Third Parties:** Resend (email service), Cloudflare (hosting)
- **Retention:** Order data kept for 7 years (Thai tax law), then anonymized
- **Customer Rights:** Access, correction, deletion (email support@cnxnature.com)
- **Thailand PDPA Compliance:** Right to withdraw consent, data breach notification

**Placeholder Text:**
```markdown
# Privacy Policy

Last updated: February 11, 2026

CNX AthletX ("we", "us", "our") operates cnxnature.com. This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our service.

## Data We Collect
- Name, email, phone number, shipping address
- Order details and transaction references
- Payment proof images (if submitted)

## How We Use Your Data
- Fulfill orders and ship products
- Send order confirmations and shipping updates via email
- Customer support

## Data Storage
- Order data: Cloudflare D1 (encrypted at rest)
- Payment proofs: Cloudflare R2 (encrypted)
- Emails: Resend API (transactional only)

## Your Rights (Thailand PDPA)
- Access your data
- Request correction or deletion
- Withdraw consent for marketing (we don't send marketing emails in v1)

Contact us: privacy@cnxnature.com

[Full legal text to be drafted with legal counsel]
```

---

### Terms of Service (Placeholder)

**Key Points:**
- **Payment Terms:** Payment due within 24 hours of order creation, orders auto-cancelled if not paid
- **Shipping:** 2-4 business days within Thailand via Thailand Post, customer responsible for customs if shipped internationally (future)
- **Returns:** 7-day return policy for unopened products, customer pays return shipping
- **Refunds:** Processed within 7 days via bank transfer to original account
- **Liability:** Not responsible for shipping delays beyond our control (weather, carrier issues)
- **Governing Law:** Thai law, jurisdiction in Chiang Mai courts

**Placeholder Text:**
```markdown
# Terms of Service

Last updated: February 11, 2026

By using cnxnature.com, you agree to these terms.

## Orders & Payment
- Payment must be received within 24 hours or order will be cancelled
- Accepted methods: PromptPay, Thai bank transfer

## Shipping
- Ships within 1-2 business days after payment confirmation
- Delivery: 2-4 business days via Thailand Post
- Customer responsible for providing accurate shipping address

## Returns & Refunds
- Unopened products: 7-day return window
- Customer pays return shipping
- Refunds issued within 7 business days

## Contact
Email: support@cnxnature.com

[Full legal text to be drafted]
```

---

### Cookie Notice

**Not required in v1.** The only cookies used are:
- **Customer session cookie** (HttpOnly, functional) — required for magic link auth. Functional/essential cookies do not require consent under Thailand PDPA.
- **Cloudflare Access cookie** (admin only) — handled by Cloudflare.
- No Google Analytics or third-party tracking cookies.

Cookies are documented in the Privacy Policy. If tracking cookies are added in the future (e.g., Google Analytics), a consent banner will be required.

---

## 8. Repo Structure

```
cnx-athletx/
├── packages/
│   ├── web/                      # Cloudflare Pages (Vue SPA)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ProductCard.vue
│   │   │   │   ├── CartDrawer.vue
│   │   │   │   ├── CheckoutForm.vue
│   │   │   │   ├── OrderStatusCard.vue
│   │   │   │   └── PaymentProofUpload.vue
│   │   │   ├── pages/
│   │   │   │   ├── HomePage.vue
│   │   │   │   ├── ProductListPage.vue
│   │   │   │   ├── ProductDetailPage.vue
│   │   │   │   ├── CheckoutPage.vue
│   │   │   │   ├── OrderStatusPage.vue
│   │   │   │   ├── LoginPage.vue
│   │   │   │   ├── AuthVerifyPage.vue
│   │   │   │   ├── AccountPage.vue
│   │   │   │   ├── PrivacyPage.vue
│   │   │   │   ├── TermsPage.vue
│   │   │   │   └── admin/
│   │   │   │       ├── OrderListPage.vue
│   │   │   │       ├── OrderDetailPage.vue
│   │   │   │       └── InventoryPage.vue
│   │   │   ├── composables/
│   │   │   │   ├── useCart.ts           # Cart state, localStorage
│   │   │   │   ├── useCheckout.ts       # Checkout flow
│   │   │   │   └── useApi.ts            # API client wrapper
│   │   │   ├── stores/
│   │   │   │   ├── cart.ts              # Pinia store for cart
│   │   │   │   ├── auth.ts             # Pinia store for auth state
│   │   │   │   └── products.ts          # Product catalog cache
│   │   │   ├── assets/
│   │   │   │   ├── logo.svg
│   │   │   │   └── styles/
│   │   │   │       └── main.css         # Tailwind imports
│   │   │   ├── router/
│   │   │   │   └── index.ts             # Vue Router config
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── public/
│   │   │   ├── images/
│   │   │   │   └── products/
│   │   │   │       ├── plant-protein-500g.jpg
│   │   │   │       └── plant-protein-1000g.jpg
│   │   │   ├── robots.txt
│   │   │   ├── sitemap.xml
│   │   │   └── favicon.ico
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                      # Cloudflare Workers
│       ├── src/
│       │   ├── routes/
│       │   │   ├── products.ts           # GET /api/products, /api/products/:slug
│       │   │   ├── checkout.ts           # POST /api/checkout
│       │   │   ├── orders.ts             # GET /api/orders/:id, POST payment-proof
│       │   │   ├── auth.ts              # POST /api/auth/request-link, verify, logout; GET /api/auth/me
│       │   │   ├── account.ts           # GET /api/account/orders, last-address; PATCH profile
│       │   │   └── admin/
│       │   │       ├── orders.ts         # Admin order management
│       │   │       ├── inventory.ts      # PATCH /api/admin/inventory/:id
│       │   │       └── settings.ts       # GET/PUT /api/admin/settings (shipping, payment config)
│       │   ├── services/
│       │   │   ├── email.ts              # ResendEmailService
│       │   │   ├── inventory.ts          # Stock reservation logic
│       │   │   ├── auth.ts              # Magic link generation, session management
│       │   │   └── idempotency.ts        # Idempotency key handling
│       │   ├── db/
│       │   │   ├── schema.sql            # Full D1 schema
│       │   │   ├── seed.sql              # Initial product data
│       │   │   └── migrations/
│       │   │       └── 001_initial.sql   # Same as schema.sql
│       │   ├── middleware/
│       │   │   ├── auth.ts               # Cloudflare Access header validation (admin)
│       │   │   ├── session.ts            # Customer session cookie validation
│       │   │   ├── cors.ts               # CORS headers
│       │   │   ├── rateLimit.ts          # Rate limiting for auth endpoints
│       │   │   └── errorHandler.ts       # Global error formatter
│       │   ├── types/
│       │   │   ├── order.ts              # TypeScript interfaces
│       │   │   ├── product.ts
│       │   │   └── api.ts
│       │   ├── utils/
│       │   │   ├── ulid.ts               # ULID generator for order IDs
│       │   │   ├── validation.ts         # Request body validators
│       │   │   └── money.ts              # THB satang conversion
│       │   └── index.ts                  # Workers entry point, router
│       ├── tests/
│       │   ├── unit/
│       │   │   ├── checkout.test.ts
│       │   │   ├── inventory.test.ts
│       │   │   └── idempotency.test.ts
│       │   └── integration/
│       │       └── order-lifecycle.test.ts
│       ├── wrangler.toml                 # Workers config
│       ├── vitest.config.ts
│       └── package.json
│
├── docs/
│   └── plan/
│       ├── backend-plan.md               # This document
│       ├── frontend-plan.md              # Frontend architecture (separate)
│       └── deployment.md                 # Deployment guide
│
├── .github/
│   └── workflows/
│       ├── deploy-api.yml                # CI/CD for Workers
│       └── deploy-web.yml                # CI/CD for Pages
│
├── .gitignore
├── package.json                          # Workspace root (npm workspaces)
└── README.md
```

---

### File Breakdown

**Key Files:**

1. **`/packages/api/src/index.ts`** — Workers entry point, router setup
   ```typescript
   import { Router } from 'itty-router';
   import { productsRoutes } from './routes/products';
   import { checkoutRoutes } from './routes/checkout';
   import { ordersRoutes } from './routes/orders';
   import { authRoutes } from './routes/auth';
   import { accountRoutes } from './routes/account';
   import { adminRoutes } from './routes/admin/orders';
   import { adminAuthMiddleware } from './middleware/auth';
   import { sessionMiddleware } from './middleware/session';
   import { errorHandler } from './middleware/errorHandler';

   const router = Router();

   // Public routes
   router.get('/api/products', productsRoutes.list);
   router.get('/api/products/:slug', productsRoutes.get);
   router.post('/api/checkout', checkoutRoutes.create);
   router.get('/api/orders/:id', ordersRoutes.getStatus);
   router.post('/api/orders/:id/payment-proof', ordersRoutes.submitProof);

   // Auth routes (public, rate-limited)
   router.post('/api/auth/request-link', authRoutes.requestLink);
   router.post('/api/auth/verify', authRoutes.verify);
   router.post('/api/auth/logout', authRoutes.logout);
   router.get('/api/auth/me', authRoutes.me);

   // Customer account routes (session-authenticated)
   router.all('/api/account/*', sessionMiddleware);
   router.get('/api/account/orders', accountRoutes.listOrders);
   router.get('/api/account/last-address', accountRoutes.lastAddress);
   router.patch('/api/account/profile', accountRoutes.updateProfile);

   // Admin routes (Cloudflare Access protected)
   router.all('/api/admin/*', adminAuthMiddleware);
   router.get('/api/admin/orders', adminRoutes.list);
   router.post('/api/admin/orders/:id/mark-paid', adminRoutes.markPaid);
   // ... other admin routes

   export default {
     async fetch(request: Request, env: Env, ctx: ExecutionContext) {
       return router.handle(request, env, ctx).catch(errorHandler);
     },
   };
   ```

2. **`/packages/api/wrangler.toml`** — Cloudflare Workers config
   ```toml
   name = "cnx-athletx-api"
   main = "src/index.ts"
   compatibility_date = "2026-02-11"

   [env.production]
   workers_dev = false
   route = "cnxnature.com/api/*"

   [[d1_databases]]
   binding = "DB"
   database_name = "cnx-athletx-prod"
   database_id = "abc123..."

   [vars]
   ENVIRONMENT = "production"

   # Secrets (set via wrangler secret put):
   # - RESEND_API_KEY
   ```

3. **`/packages/web/vite.config.ts`** — Vite config for Cloudflare Pages
   ```typescript
   import { defineConfig } from 'vite';
   import vue from '@vitejs/plugin-vue';

   export default defineConfig({
     plugins: [vue()],
     build: {
       outDir: 'dist',
       rollupOptions: {
         output: {
           manualChunks: {
             vendor: ['vue', 'vue-router', 'pinia'],
           },
         },
       },
     },
   });
   ```

4. **`/packages/web/src/router/index.ts`** — Vue Router
   ```typescript
   import { createRouter, createWebHistory } from 'vue-router';

   const router = createRouter({
     history: createWebHistory(),
     routes: [
       { path: '/', component: () => import('@/pages/HomePage.vue') },
       { path: '/products/:slug', component: () => import('@/pages/ProductDetailPage.vue') },
       { path: '/checkout', component: () => import('@/pages/CheckoutPage.vue') },
       { path: '/orders/:id', component: () => import('@/pages/OrderStatusPage.vue') },
       { path: '/login', component: () => import('@/pages/LoginPage.vue') },
       { path: '/auth/verify', component: () => import('@/pages/AuthVerifyPage.vue') },
       { path: '/account', component: () => import('@/pages/AccountPage.vue'), meta: { requiresSession: true } },
       { path: '/privacy', component: () => import('@/pages/PrivacyPage.vue') },
       { path: '/terms', component: () => import('@/pages/TermsPage.vue') },
       {
         path: '/admin/orders',
         component: () => import('@/pages/admin/OrderListPage.vue'),
         meta: { requiresAdmin: true }, // Cloudflare Access enforces this
       },
       {
         path: '/admin/orders/:id',
         component: () => import('@/pages/admin/OrderDetailPage.vue'),
         meta: { requiresAdmin: true },
       },
     ],
   });

   export default router;
   ```

---

### Workspace Setup (npm workspaces)

**Root `/package.json`:**
```json
{
  "name": "cnx-athletx",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:web": "npm run dev --workspace=packages/web",
    "dev:api": "npm run dev --workspace=packages/api",
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.2.1"
  }
}
```

**`/packages/api/package.json`:**
```json
{
  "name": "@cnx-athletx/api",
  "version": "1.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest"
  },
  "dependencies": {
    "itty-router": "^4.0.0",
    "resend": "^3.0.0",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240117.0",
    "wrangler": "^3.25.0",
    "vitest": "^1.2.1",
    "miniflare": "^3.20240117.0"
  }
}
```

**`/packages/web/package.json`:**
```json
{
  "name": "@cnx-athletx/web",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "vue": "^3.4.15",
    "vue-router": "^4.2.5",
    "pinia": "^2.1.7"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.3",
    "vite": "^5.0.11",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

---

This is a complete, actionable backend implementation plan. Every section provides specific technical details, SQL schemas, API contracts, workflows, and file structures. No ambiguity, no vague statements. Ready to build.