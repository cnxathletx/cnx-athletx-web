import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'

// SQL embedded for test-reset endpoint (localhost only)
const TEST_SCHEMA = `CREATE TABLE IF NOT EXISTS product_lines (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,nutrition_json TEXT NOT NULL DEFAULT '{}',ingredients TEXT NOT NULL DEFAULT '',how_to_use TEXT NOT NULL DEFAULT '',who_is_for TEXT NOT NULL DEFAULT '',regulatory_info TEXT NOT NULL DEFAULT '',translations_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT,product_line_id INTEGER,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT NOT NULL,price_thb INTEGER NOT NULL,weight_g INTEGER NOT NULL,image_url TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,translations_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE SET NULL);CREATE TABLE IF NOT EXISTS product_images (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS price_tiers (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,min_quantity INTEGER NOT NULL,unit_price_thb INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,UNIQUE (product_id, min_quantity),CHECK (min_quantity >= 2),CHECK (unit_price_thb > 0));CREATE TABLE IF NOT EXISTS inventory (product_id INTEGER PRIMARY KEY,stock_count INTEGER NOT NULL DEFAULT 0,reserved_count INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT,phone TEXT,saved_address_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS magic_links (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY,user_id TEXT,customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,customer_phone TEXT NOT NULL,shipping_address_line1 TEXT NOT NULL,shipping_address_line2 TEXT,district TEXT NOT NULL,province TEXT NOT NULL,postal_code TEXT NOT NULL,subtotal_thb INTEGER NOT NULL,shipping_thb INTEGER NOT NULL,discount_thb INTEGER NOT NULL DEFAULT 0,total_thb INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending_payment',idempotency_key TEXT NOT NULL UNIQUE,discount_code TEXT,payment_method TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,CHECK (status IN ('pending_payment','awaiting_gateway','paid','failed','packed','shipped','delivered','refunded','cancelled')));CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,product_id INTEGER NOT NULL,quantity INTEGER NOT NULL,unit_price_thb INTEGER NOT NULL,line_total_thb INTEGER NOT NULL,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT);CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,method TEXT NOT NULL,provider TEXT,provider_txn_id TEXT,status TEXT NOT NULL DEFAULT 'pending',payload_json TEXT,reference TEXT,amount_thb INTEGER NOT NULL,verified_at TEXT,verified_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_txn ON payments(provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;CREATE TABLE IF NOT EXISTS payment_proofs (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,proof_type TEXT NOT NULL,proof_value TEXT NOT NULL,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,CHECK (proof_type IN ('reference','image_url')));CREATE TABLE IF NOT EXISTS shipments (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT NOT NULL,carrier TEXT NOT NULL,tracking_number TEXT NOT NULL,shipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS discount_codes (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL UNIQUE,type TEXT NOT NULL,value INTEGER NOT NULL,min_order_thb INTEGER NOT NULL DEFAULT 0,max_uses INTEGER,used_count INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,expires_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK (type IN ('fixed','percent')));CREATE TABLE IF NOT EXISTS admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,admin_email TEXT NOT NULL,action TEXT NOT NULL,order_id TEXT,details_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS email_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,event TEXT NOT NULL,recipient_email TEXT NOT NULL,status TEXT NOT NULL,error TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,product_line_id INTEGER NOT NULL,rating INTEGER NOT NULL,body TEXT,locale TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',rejected_reason TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,moderated_at TEXT,moderated_by TEXT,FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,UNIQUE (user_id, product_line_id),CHECK (rating BETWEEN 1 AND 5),CHECK (status IN ('pending','approved','rejected')),CHECK (locale IN ('en','th')),CHECK (body IS NULL OR length(body) <= 1000));CREATE TABLE IF NOT EXISTS product_line_lab_tests (id INTEGER PRIMARY KEY AUTOINCREMENT,product_line_id INTEGER NOT NULL,url TEXT NOT NULL,r2_key TEXT NOT NULL,content_type TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL DEFAULT 0,size_bytes INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (product_line_id) REFERENCES product_lines(id) ON DELETE CASCADE,CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')));CREATE TABLE IF NOT EXISTS rate_limits (scope TEXT NOT NULL,key TEXT NOT NULL,window_start TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 1,PRIMARY KEY (scope, key, window_start));`

const TEST_SEED = `INSERT INTO product_lines (id,name,slug) VALUES (1,'Plant Protein','plant-protein');INSERT INTO products (product_line_id,slug,name,description,price_thb,weight_g,image_url,active) VALUES (1,'plant-protein-500g','CNX Plant Protein 500g','Premium pea and brown rice protein blend. 25g protein per serving.',89900,500,'/images/products/plant-protein-500g.jpg',1),(1,'plant-protein-1000g','CNX Plant Protein 1kg','Premium pea and brown rice protein blend. Better value.',159900,1000,'/images/products/plant-protein-1000g.jpg',1);INSERT INTO inventory (product_id,stock_count,reserved_count) VALUES (1,100,0),(2,100,0);INSERT INTO site_settings (key,value) VALUES ('shipping_flat_rate','10000'),('shipping_free_threshold','0'),('promptpay_number','0812345678'),('bank_name','Kasikorn Bank'),('bank_account_name','CNX AthletX Co., Ltd.'),('bank_account_number','123-4-56789-0'),('payment_deadline_hours','24'),('payment_methods_enabled','["promptpay","bank_transfer"]');INSERT INTO discount_codes (code,type,value,min_order_thb,max_uses,used_count,active,expires_at) VALUES ('SAVE100','fixed',10000,0,NULL,0,1,NULL),('PERCENT20','percent',20,0,NULL,0,1,NULL),('EXPIRED','fixed',5000,0,NULL,0,1,'2020-01-01T00:00:00.000Z'),('MAXEDOUT','fixed',5000,0,1,1,1,NULL),('MINORDER','fixed',10000,200000,NULL,0,1,NULL),('INACTIVE','fixed',5000,0,NULL,0,0,NULL);`

const DROP_TABLES = ['rate_limits','product_line_lab_tests','reviews','email_logs','admin_audit_log','shipments','payment_proofs','payments','order_items','orders','sessions','magic_links','users','discount_codes','inventory','price_tiers','product_images','products','product_lines','site_settings']

export function registerHealthRoutes(router: RouterType) {
  router.get('/api/health', () => {
    return Response.json({
      ok: true,
      service: 'cnx-athletx-api',
      timestamp: new Date().toISOString(),
    })
  })

  router.get('/api/health/db', async (_request: Request, env: Env) => {
    if (!env.DB) {
      return Response.json({ ok: false, error: 'D1 binding DB is not configured' }, { status: 500 })
    }

    const result = await env.DB.prepare('SELECT 1 AS ping').first<{ ping: number }>()

    return Response.json({
      ok: true,
      service: 'cnx-athletx-api',
      db: result?.ping === 1 ? 'connected' : 'unknown',
      timestamp: new Date().toISOString(),
    })
  })

  // Test-only endpoint: reset DB with schema + seed (local dev only)
  router.post('/api/__test-reset', async (request: Request, env: Env) => {
    if (env.ENVIRONMENT) {
      return Response.json({ error: 'Not available' }, { status: 403 })
    }
    const url = new URL(request.url)
    const host = url.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('[') || host === '::1'
    if (!isLocal) {
      return Response.json({ error: 'Not available' }, { status: 403 })
    }
    for (const t of DROP_TABLES) {
      await env.DB.exec(`DROP TABLE IF EXISTS ${t}`)
    }
    await env.DB.exec(TEST_SCHEMA)
    await env.DB.exec(TEST_SEED)
    return Response.json({ ok: true })
  })

  router.get('/api/__test-email-log', async (request: Request, env: Env) => {
    if (env.ENVIRONMENT) {
      return Response.json({ error: 'Not available' }, { status: 403 })
    }
    const url = new URL(request.url)
    const host = url.hostname
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('[') || host === '::1'
    if (!isLocal) {
      return Response.json({ error: 'Not available' }, { status: 403 })
    }
    const orderId = url.searchParams.get('order_id') ?? ''
    const event = url.searchParams.get('event') ?? ''
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM email_logs WHERE order_id = ? AND event = ?`
    ).bind(orderId, event).first<{ count: number }>()
    return Response.json({ count: row?.count ?? 0 })
  })
}
