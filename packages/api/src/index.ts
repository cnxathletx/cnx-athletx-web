import { Router } from 'itty-router'
import { generateULID } from './lib/ulid'

interface Env {
  DB: D1Database
}

const router = Router()

// --- CORS Middleware ---

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function corsify(response: Response): Response {
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

// Preflight
router.options('*', () => new Response(null, { status: 204, headers: CORS_HEADERS }))

// --- Health Endpoints ---

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

// --- Product Endpoints ---

router.get('/api/products', async (_request: Request, env: Env) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
              (i.stock_count - i.reserved_count) AS available_stock
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.active = 1
       ORDER BY p.id ASC`
    ).all()

    return Response.json({ products: results })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.get('/api/products/:slug', async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const slug = url.pathname.split('/').pop() || ''

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ error: 'Invalid slug format' }, { status: 400 })
  }

  try {
    const product = await env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
              (i.stock_count - i.reserved_count) AS available_stock
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.slug = ? AND p.active = 1`
    )
      .bind(slug)
      .first()

    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    return Response.json({ product })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

// --- Checkout Types ---

interface CheckoutItem {
  product_id: number
  quantity: number
}

interface CheckoutAddress {
  line1: string
  line2?: string
  district: string
  province: string
  postal_code: string
}

interface CheckoutCustomer {
  name: string
  email: string
  phone: string
  address: CheckoutAddress
}

interface CheckoutBody {
  items: CheckoutItem[]
  customer: CheckoutCustomer
  idempotency_key: string
  discount_code?: string
}

interface ValidationError {
  field: string
  message: string
}

interface ProductRow {
  id: number
  price_thb: number
  stock_count: number
  reserved_count: number
}

interface SiteSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
  promptpay_number: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
}

interface DiscountCodeRow {
  id: number
  code: string
  type: 'fixed' | 'percent'
  value: number
  min_order_thb: number
  max_uses: number | null
  used_count: number
  active: number
  expires_at: string | null
}

interface ExistingOrderRow {
  id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
}

// --- Checkout Validation ---

function validateCheckoutBody(body: unknown): { errors: ValidationError[]; data: CheckoutBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>

  // idempotency_key
  if (!b.idempotency_key || typeof b.idempotency_key !== 'string' || b.idempotency_key.trim() === '') {
    errors.push({ field: 'idempotency_key', message: 'idempotency_key is required' })
  }

  // items
  if (!Array.isArray(b.items)) {
    errors.push({ field: 'items', message: 'items must be an array' })
  } else if (b.items.length < 1 || b.items.length > 10) {
    errors.push({ field: 'items', message: 'items must contain between 1 and 10 entries' })
  } else {
    for (let i = 0; i < b.items.length; i++) {
      const item = b.items[i] as Record<string, unknown>
      if (!item || typeof item !== 'object') {
        errors.push({ field: `items[${i}]`, message: 'Each item must be an object' })
        continue
      }
      if (typeof item.product_id !== 'number' || !Number.isInteger(item.product_id) || item.product_id < 1) {
        errors.push({ field: `items[${i}].product_id`, message: 'product_id must be a positive integer' })
      }
      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        errors.push({ field: `items[${i}].quantity`, message: 'quantity must be an integer between 1 and 100' })
      }
    }
  }

  // customer
  if (!b.customer || typeof b.customer !== 'object') {
    errors.push({ field: 'customer', message: 'customer is required' })
  } else {
    const c = b.customer as Record<string, unknown>

    if (typeof c.name !== 'string' || c.name.trim().length < 2 || c.name.trim().length > 100) {
      errors.push({ field: 'customer.name', message: 'name must be between 2 and 100 characters' })
    }

    if (typeof c.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
      errors.push({ field: 'customer.email', message: 'email must be a valid email address' })
    }

    if (typeof c.phone !== 'string' || !/^(\+66|0)[0-9]{9}$/.test(c.phone)) {
      errors.push({
        field: 'customer.phone',
        message: 'phone must be a valid Thai phone number (e.g. 0812345678 or +66812345678)',
      })
    }

    if (!c.address || typeof c.address !== 'object') {
      errors.push({ field: 'customer.address', message: 'address is required' })
    } else {
      const a = c.address as Record<string, unknown>

      if (typeof a.line1 !== 'string' || a.line1.trim().length < 5 || a.line1.trim().length > 200) {
        errors.push({ field: 'customer.address.line1', message: 'line1 must be between 5 and 200 characters' })
      }

      if (typeof a.district !== 'string' || a.district.trim() === '') {
        errors.push({ field: 'customer.address.district', message: 'district is required' })
      }

      if (typeof a.province !== 'string' || a.province.trim() === '') {
        errors.push({ field: 'customer.address.province', message: 'province is required' })
      }

      if (typeof a.postal_code !== 'string' || !/^\d{5}$/.test(a.postal_code)) {
        errors.push({ field: 'customer.address.postal_code', message: 'postal_code must be exactly 5 digits' })
      }
    }
  }

  // discount_code (optional)
  if (b.discount_code !== undefined && b.discount_code !== null) {
    if (typeof b.discount_code !== 'string') {
      errors.push({ field: 'discount_code', message: 'discount_code must be a string' })
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: b as unknown as CheckoutBody }
}

// --- POST /api/checkout ---

router.post('/api/checkout', async (request: Request, env: Env) => {
  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  // Validate
  const { errors, data } = validateCheckoutBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  // --- Idempotency check ---
  try {
    const existing = await env.DB.prepare(
      `SELECT id, subtotal_thb, shipping_thb, discount_thb, total_thb FROM orders WHERE idempotency_key = ? LIMIT 1`
    )
      .bind(data.idempotency_key)
      .first<ExistingOrderRow>()

    if (existing) {
      return Response.json(
        {
          order_id: existing.id,
          subtotal_thb: existing.subtotal_thb,
          shipping_thb: existing.shipping_thb,
          discount_thb: existing.discount_thb,
          total_thb: existing.total_thb,
          message: 'Order already created (idempotent response)',
        },
        { status: 200 }
      )
    }
  } catch {
    return Response.json({ error: 'Database error during idempotency check' }, { status: 500 })
  }

  // --- Deduplicate items (merge quantities for same product_id) ---
  const itemMap = new Map<number, number>()
  for (const item of data.items) {
    itemMap.set(item.product_id, (itemMap.get(item.product_id) ?? 0) + item.quantity)
  }
  const mergedItems = Array.from(itemMap.entries()).map(([product_id, quantity]) => ({ product_id, quantity }))

  // --- Fetch products + inventory ---
  const productIds = mergedItems.map((i) => i.product_id)
  const placeholders = productIds.map(() => '?').join(', ')

  let productRows: ProductRow[]
  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.price_thb, i.stock_count, i.reserved_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.id IN (${placeholders}) AND p.active = 1`
    )
      .bind(...productIds)
      .all<ProductRow>()
    productRows = results
  } catch {
    return Response.json({ error: 'Database error fetching products' }, { status: 500 })
  }

  // Build a lookup map and check that all requested products exist
  const productMap = new Map<number, ProductRow>()
  for (const row of productRows) {
    productMap.set(row.id, row)
  }

  const missingIds = productIds.filter((id) => !productMap.has(id))
  if (missingIds.length > 0) {
    return Response.json(
      {
        error: 'Validation failed',
        details: missingIds.map((id) => ({ field: 'items', message: `Product with id ${id} not found or inactive` })),
      },
      { status: 400 }
    )
  }

  // --- Stock availability check ---
  const stockErrors: ValidationError[] = []
  for (const item of mergedItems) {
    const product = productMap.get(item.product_id)!
    const available = product.stock_count - product.reserved_count
    if (available < item.quantity) {
      stockErrors.push({
        field: 'items',
        message: `Insufficient stock for product id ${item.product_id}: requested ${item.quantity}, available ${available}`,
      })
    }
  }
  if (stockErrors.length > 0) {
    return Response.json({ error: 'Insufficient stock', details: stockErrors }, { status: 422 })
  }

  // --- Fetch site settings ---
  let settings: SiteSettings
  try {
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM site_settings WHERE key IN (
        'shipping_flat_rate', 'shipping_free_threshold',
        'promptpay_number', 'bank_name', 'bank_account_name', 'bank_account_number'
      )`
    ).all<{ key: string; value: string }>()

    const settingsMap = new Map<string, string>()
    for (const row of results) {
      settingsMap.set(row.key, row.value)
    }

    settings = {
      shipping_flat_rate: parseInt(settingsMap.get('shipping_flat_rate') ?? '10000', 10),
      shipping_free_threshold: parseInt(settingsMap.get('shipping_free_threshold') ?? '0', 10),
      promptpay_number: settingsMap.get('promptpay_number') ?? '',
      bank_name: settingsMap.get('bank_name') ?? '',
      bank_account_name: settingsMap.get('bank_account_name') ?? '',
      bank_account_number: settingsMap.get('bank_account_number') ?? '',
    }
  } catch {
    return Response.json({ error: 'Database error fetching site settings' }, { status: 500 })
  }

  // --- Calculate subtotal ---
  let subtotal = 0
  for (const item of mergedItems) {
    const product = productMap.get(item.product_id)!
    subtotal += product.price_thb * item.quantity
  }

  // --- Shipping cost ---
  const shipping =
    settings.shipping_free_threshold > 0 && subtotal >= settings.shipping_free_threshold
      ? 0
      : settings.shipping_flat_rate

  // --- Discount code ---
  let discountThb = 0
  let discountCodeRow: DiscountCodeRow | null = null

  if (data.discount_code && data.discount_code.trim() !== '') {
    const code = data.discount_code.trim().toUpperCase()

    try {
      discountCodeRow = await env.DB.prepare(
        `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, expires_at
         FROM discount_codes WHERE code = ? LIMIT 1`
      )
        .bind(code)
        .first<DiscountCodeRow>()
    } catch {
      return Response.json({ error: 'Database error validating discount code' }, { status: 500 })
    }

    if (!discountCodeRow) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'discount_code', message: 'Discount code not found' }] },
        { status: 400 }
      )
    }

    if (!discountCodeRow.active) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'discount_code', message: 'Discount code is not active' }] },
        { status: 400 }
      )
    }

    if (discountCodeRow.expires_at && new Date(discountCodeRow.expires_at) < new Date()) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'discount_code', message: 'Discount code has expired' }] },
        { status: 400 }
      )
    }

    if (discountCodeRow.max_uses !== null && discountCodeRow.used_count >= discountCodeRow.max_uses) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [{ field: 'discount_code', message: 'Discount code has reached its maximum usage limit' }],
        },
        { status: 400 }
      )
    }

    if (subtotal < discountCodeRow.min_order_thb) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [
            {
              field: 'discount_code',
              message: `Discount code requires a minimum order of ${discountCodeRow.min_order_thb / 100} THB`,
            },
          ],
        },
        { status: 400 }
      )
    }

    if (discountCodeRow.type === 'fixed') {
      discountThb = discountCodeRow.value
    } else {
      // percent — value is stored as integer percentage (e.g. 10 = 10%)
      discountThb = Math.floor((subtotal * discountCodeRow.value) / 100)
    }

    // Discount cannot exceed subtotal
    discountThb = Math.min(discountThb, subtotal)
  }

  // --- Final total ---
  const total = subtotal + shipping - discountThb

  // --- Generate order ID ---
  const orderId = generateULID()
  const now = new Date().toISOString()

  // --- Atomic batch write ---
  const statements: D1PreparedStatement[] = []

  // Reserve inventory for each item
  for (const item of mergedItems) {
    statements.push(
      env.DB.prepare(
        `UPDATE inventory SET reserved_count = reserved_count + ?, updated_at = ? WHERE product_id = ?`
      ).bind(item.quantity, now, item.product_id)
    )
  }

  // Insert order
  statements.push(
    env.DB.prepare(
      `INSERT INTO orders (
        id, customer_name, customer_email, customer_phone,
        shipping_address_line1, shipping_address_line2,
        district, province, postal_code,
        subtotal_thb, shipping_thb, discount_thb, total_thb,
        status, idempotency_key, discount_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`
    ).bind(
      orderId,
      data.customer.name.trim(),
      data.customer.email.toLowerCase().trim(),
      data.customer.phone.trim(),
      data.customer.address.line1.trim(),
      data.customer.address.line2?.trim() ?? null,
      data.customer.address.district.trim(),
      data.customer.address.province.trim(),
      data.customer.address.postal_code,
      subtotal,
      shipping,
      discountThb,
      total,
      data.idempotency_key,
      discountCodeRow ? discountCodeRow.code : null,
      now,
      now
    )
  )

  // Insert order items
  for (const item of mergedItems) {
    const product = productMap.get(item.product_id)!
    const lineTotal = product.price_thb * item.quantity
    statements.push(
      env.DB.prepare(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_thb, line_total_thb)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(orderId, item.product_id, item.quantity, product.price_thb, lineTotal)
    )
  }

  // Increment discount code usage if applicable
  if (discountCodeRow) {
    statements.push(
      env.DB.prepare(`UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?`).bind(discountCodeRow.id)
    )
  }

  try {
    await env.DB.batch(statements)
  } catch {
    return Response.json({ error: 'Database error creating order' }, { status: 500 })
  }

  // --- Build payment instructions ---
  const totalTHB = (total / 100).toFixed(2)
  const promptpayUrl = settings.promptpay_number
    ? `https://promptpay.io/${settings.promptpay_number}/${totalTHB}.png`
    : null

  return Response.json(
    {
      order_id: orderId,
      subtotal_thb: subtotal,
      shipping_thb: shipping,
      discount_thb: discountThb,
      total_thb: total,
      payment_instructions: {
        promptpay: promptpayUrl
          ? {
              number: settings.promptpay_number,
              qr_url: promptpayUrl,
            }
          : null,
        bank_transfer: {
          bank_name: settings.bank_name,
          account_name: settings.bank_account_name,
          account_number: settings.bank_account_number,
        },
        amount_thb: totalTHB,
      },
    },
    { status: 201 }
  )
})

// --- GET /api/orders/:id ---

interface OrderRow {
  id: string
  status: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  created_at: string
}

interface OrderItemRow {
  product_name: string
  quantity: number
  line_total_thb: number
}

interface ShipmentRow {
  carrier: string
  tracking_number: string
  shipped_at: string
}

interface PaymentProofCountRow {
  proof_count: number
}

router.get('/api/orders/:id', async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop() || ''

  // ULID is 26 alphanumeric characters (Crockford base32 = uppercase A-Z0-9 minus I,L,O,U)
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }

  try {
    // Fetch the order (exclude PII fields from the public response)
    const order = await env.DB.prepare(
      `SELECT id, status, subtotal_thb, shipping_thb, discount_thb, total_thb, created_at
       FROM orders WHERE id = ? LIMIT 1`
    )
      .bind(id.toUpperCase())
      .first<OrderRow>()

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch order items with product name
    const { results: items } = await env.DB.prepare(
      `SELECT p.name AS product_name, oi.quantity, oi.line_total_thb
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`
    )
      .bind(id.toUpperCase())
      .all<OrderItemRow>()

    // Fetch shipment (if any)
    const shipment = await env.DB.prepare(
      `SELECT carrier, tracking_number, shipped_at
       FROM shipments WHERE order_id = ? LIMIT 1`
    )
      .bind(id.toUpperCase())
      .first<ShipmentRow>()

    // Fetch payment proof count (true/false indicator)
    const proofCount = await env.DB.prepare(
      `SELECT COUNT(*) AS proof_count FROM payment_proofs WHERE order_id = ?`
    )
      .bind(id.toUpperCase())
      .first<PaymentProofCountRow>()

    return Response.json({
      order: {
        id: order.id,
        status: order.status,
        subtotal_thb: order.subtotal_thb,
        shipping_thb: order.shipping_thb,
        discount_thb: order.discount_thb,
        total_thb: order.total_thb,
        created_at: order.created_at,
        items: items.map((item) => ({
          product_name: item.product_name,
          quantity: item.quantity,
          line_total_thb: item.line_total_thb,
        })),
        shipment: shipment
          ? {
              carrier: shipment.carrier,
              tracking_number: shipment.tracking_number,
              shipped_at: shipment.shipped_at,
            }
          : null,
        payment_submitted: (proofCount?.proof_count ?? 0) > 0,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

// --- 404 ---

router.all('*', () => new Response('Not Found', { status: 404 }))

// --- Export ---

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const instance = router as unknown as {
      fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
      handle?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
    }

    let response: Response

    if (instance.fetch) {
      response = await instance.fetch(request, env, ctx)
    } else if (instance.handle) {
      response = await instance.handle(request, env, ctx)
    } else {
      response = new Response('Router method is unavailable', { status: 500 })
    }

    return corsify(response)
  },
}
