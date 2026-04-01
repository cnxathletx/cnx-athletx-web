import { Router } from 'itty-router'
import { generateULID } from './lib/ulid'

interface Env {
  DB: D1Database
  RESEND_API_KEY?: string
  ALLOWED_ORIGINS?: string
}

const router = Router()

// --- CORS Middleware ---

const CORS_BASE_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin')
  return {
    ...CORS_BASE_HEADERS,
    'Access-Control-Allow-Origin': origin ?? '*',
    Vary: 'Origin',
  }
}

function corsify(response: Response, request: Request): Response {
  const corsHeaders = getCorsHeaders(request)
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}

// Preflight
router.options('*', (request: Request) => new Response(null, { status: 204, headers: getCorsHeaders(request) }))

// --- Auth Utilities ---

const MAGIC_LINK_EXPIRY_MINUTES = 15
const MAGIC_LINK_RATE_LIMIT_MAX = 3
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

interface SessionUser {
  id: string
  email: string
  name: string | null
  phone: string | null
}

interface AdminUser {
  email: string
}

interface SessionRow {
  user_id: string
  email: string
  name: string | null
  phone: string | null
}

interface UserRow {
  id: string
  email: string
  name: string | null
  phone: string | null
}

interface RequestLinkBody {
  email: string
}

interface VerifyLinkBody {
  token: string
}

interface UpdateProfileBody {
  name?: string
  phone?: string
}

interface MagicLinkRow {
  id: number
  email: string
}

interface CountRow {
  count: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidPhoneNumber(phone: string): boolean {
  const normalized = phone.trim()
  return /^(\+66|0)[0-9]{9}$/.test(normalized) || /^\+[1-9][0-9]{6,14}$/.test(normalized)
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const target = `${name}=`
  const part = cookieHeader
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(target))
  if (!part) return null
  const value = part.slice(target.length)
  return value.length > 0 ? value : null
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return bytesToHex(arr)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

function buildSessionCookie(request: Request, token: string): string {
  const reqUrl = new URL(request.url)
  const requestOrigin = reqUrl.origin
  const callerOrigin = request.headers.get('Origin')
  const isCrossOrigin = !!callerOrigin && callerOrigin !== requestOrigin
  const isSecure = reqUrl.protocol === 'https:'
  const sameSite = isCrossOrigin ? 'None' : 'Lax'
  const secureFlag = isSecure || isCrossOrigin ? '; Secure' : ''

  return `session=${token}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureFlag}`
}

function clearSessionCookie(request: Request): string {
  const reqUrl = new URL(request.url)
  const requestOrigin = reqUrl.origin
  const callerOrigin = request.headers.get('Origin')
  const isCrossOrigin = !!callerOrigin && callerOrigin !== requestOrigin
  const isSecure = reqUrl.protocol === 'https:'
  const sameSite = isCrossOrigin ? 'None' : 'Lax'
  const secureFlag = isSecure || isCrossOrigin ? '; Secure' : ''

  return `session=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secureFlag}`
}

async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const sessionToken = parseCookie(request.headers.get('Cookie'), 'session')
  if (!sessionToken) return null

  const row = await env.DB.prepare(
    `SELECT s.user_id, u.email, u.name, u.phone
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND julianday(s.expires_at) > julianday('now') LIMIT 1`
  )
    .bind(sessionToken)
    .first<SessionRow>()

  if (!row) return null

  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    phone: row.phone,
  }
}

function getAdminUser(request: Request): AdminUser | null {
  const cfAccessEmail = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim()
  if (cfAccessEmail) {
    return { email: cfAccessEmail.toLowerCase() }
  }

  const url = new URL(request.url)
  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '0.0.0.0' ||
    url.hostname.endsWith('.local')

  if (!isLocal) return null

  const localHeader = request.headers.get('X-Admin-Email')?.trim()
  if (localHeader) {
    return { email: localHeader.toLowerCase() }
  }

  return { email: 'local-admin@cnxnature.com' }
}

async function sendMagicLinkEmail(env: Env, toEmail: string, magicLinkUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY) return

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f4f3ee;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: #a67c1f; padding: 20px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 24px;">CNX AthletX</h1>
    </div>
    <div style="padding: 30px 20px;">
      <h2 style="margin-top: 0;">Log in to CNX AthletX</h2>
      <p>Click the button below to log in. This link expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${magicLinkUrl}" style="display: inline-block; background-color: #a67c1f; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Log In
        </a>
      </p>
      <p style="font-size: 14px; color: #555;">If you did not request this link, you can safely ignore this email.</p>
      <p style="font-size: 12px; color: #777; word-break: break-all;">${magicLinkUrl}</p>
    </div>
  </div>
</body>
</html>`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CNX AthletX <orders@cnxnature.com>',
      to: [toEmail],
      subject: 'Log in to CNX AthletX',
      html,
    }),
  })

  if (!emailRes.ok) {
    throw new Error('Failed to send magic link email')
  }
}

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

// --- Auth + Account Endpoints ---

interface AccountOrderRow {
  id: string
  status: string
  total_thb: number
  created_at: string
  items_count: number
  carrier: string | null
  tracking_number: string | null
}

interface LastAddressRow {
  shipping_address_line1: string
  shipping_address_line2: string | null
  district: string
  province: string
  postal_code: string
}

function validateRequestLinkBody(body: unknown): { errors: ValidationError[]; data: RequestLinkBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'email must be a valid email address' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { email } }
}

function validateVerifyBody(body: unknown): { errors: ValidationError[]; data: VerifyLinkBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const token = typeof b.token === 'string' ? b.token.trim().toLowerCase() : ''

  if (!/^[a-f0-9]{64}$/.test(token)) {
    errors.push({ field: 'token', message: 'token must be a 64-character hex string' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { token } }
}

function validateProfileBody(body: unknown): { errors: ValidationError[]; data: UpdateProfileBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const hasName = b.name !== undefined
  const hasPhone = b.phone !== undefined

  if (!hasName && !hasPhone) {
    errors.push({ field: 'body', message: 'At least one of name or phone must be provided' })
  }

  let name: string | undefined
  if (hasName) {
    if (typeof b.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a string' })
    } else {
      const trimmed = b.name.trim()
      if (trimmed.length < 2 || trimmed.length > 100) {
        errors.push({ field: 'name', message: 'name must be between 2 and 100 characters' })
      } else {
        name = trimmed
      }
    }
  }

  let phone: string | undefined
  if (hasPhone) {
    if (typeof b.phone !== 'string') {
      errors.push({ field: 'phone', message: 'phone must be a string' })
    } else {
      const trimmed = b.phone.trim()
      if (!isValidPhoneNumber(trimmed)) {
        errors.push({ field: 'phone', message: 'phone must be a valid phone number' })
      } else {
        phone = trimmed
      }
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { name, phone } }
}

router.post('/api/auth/request-link', async (request: Request, env: Env) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateRequestLinkBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const now = nowIso()

  try {
    const rateLimit = await env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM magic_links
       WHERE email = ? AND julianday(created_at) > julianday('now', '-15 minutes')`
    )
      .bind(data.email)
      .first<CountRow>()

    if ((rateLimit?.count ?? 0) >= MAGIC_LINK_RATE_LIMIT_MAX) {
      return Response.json({ error: 'Too many login attempts. Please wait 15 minutes.' }, { status: 429 })
    }

    const token = randomHex(32)
    const tokenHash = await sha256Hex(token)
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString()

    await env.DB.batch([
      env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE email = ? AND used_at IS NULL`).bind(now, data.email),
      env.DB.prepare(
        `INSERT INTO magic_links (email, token_hash, expires_at)
         VALUES (?, ?, ?)`
      ).bind(data.email, tokenHash, expiresAt),
    ])

    const callerOrigin = request.headers.get('Origin')
    const fallbackOrigin = new URL(request.url).origin
    const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : []
    const appOrigin = callerOrigin && allowedOrigins.includes(callerOrigin) ? callerOrigin : fallbackOrigin
    const magicLinkUrl = `${appOrigin}/auth/verify?token=${token}`

    await sendMagicLinkEmail(env, data.email, magicLinkUrl)

    const responseBody: { success: boolean; message: string; dev_magic_link?: string } = {
      success: true,
      message: 'If an account exists or can be created with this email, you will receive a login link.',
    }

    if (!env.RESEND_API_KEY && /localhost|127\.0\.0\.1/.test(appOrigin)) {
      responseBody.dev_magic_link = magicLinkUrl
    }

    return Response.json(responseBody)
  } catch {
    return Response.json({ error: 'Unable to send login link right now. Please try again.' }, { status: 500 })
  }
})

router.post('/api/auth/verify', async (request: Request, env: Env) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateVerifyBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const now = nowIso()

  try {
    const tokenHash = await sha256Hex(data.token)
    const magicLink = await env.DB.prepare(
      `SELECT id, email
       FROM magic_links
       WHERE token_hash = ? AND used_at IS NULL AND julianday(expires_at) > julianday('now')
       LIMIT 1`
    )
      .bind(tokenHash)
      .first<MagicLinkRow>()

    if (!magicLink) {
      return Response.json({ error: 'Login link is invalid or expired. Please request a new one.' }, { status: 401 })
    }

    const consumeResult = await env.DB.prepare(
      `UPDATE magic_links
       SET used_at = ?
       WHERE id = ? AND used_at IS NULL`
    )
      .bind(now, magicLink.id)
      .run()

    if ((consumeResult.meta.changes ?? 0) !== 1) {
      return Response.json({ error: 'Login link is invalid or expired. Please request a new one.' }, { status: 401 })
    }

    const newUserId = generateULID()
    await env.DB.prepare(
      `INSERT INTO users (id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`
    )
      .bind(newUserId, magicLink.email, now, now)
      .run()

    const user = await env.DB.prepare(`SELECT id, email, name, phone FROM users WHERE email = ? LIMIT 1`)
      .bind(magicLink.email)
      .first<UserRow>()

    if (!user) {
      return Response.json({ error: 'Failed to create user session' }, { status: 500 })
    }

    // Link historical guest orders to the authenticated user email.
    await env.DB.prepare(`UPDATE orders SET user_id = ? WHERE customer_email = ? AND user_id IS NULL`)
      .bind(user.id, magicLink.email)
      .run()

    const sessionToken = randomHex(32)
    const sessionExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
    await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
      .bind(sessionToken, user.id, sessionExpiresAt, now)
      .run()

    return Response.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
        },
      },
      {
        headers: {
          'Set-Cookie': buildSessionCookie(request, sessionToken),
        },
      }
    )
  } catch {
    return Response.json({ error: 'Unable to verify login link' }, { status: 500 })
  }
})

router.post('/api/auth/logout', async (request: Request, env: Env) => {
  const sessionToken = parseCookie(request.headers.get('Cookie'), 'session')

  if (sessionToken) {
    try {
      await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionToken).run()
    } catch {
      // Best-effort session cleanup.
    }
  }

  return Response.json(
    { success: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookie(request),
      },
    }
  )
})

router.get('/api/auth/me', async (request: Request, env: Env) => {
  try {
    const user = await getSessionUser(request, env)
    return Response.json({ user })
  } catch {
    return Response.json({ user: null })
  }
})

router.get('/api/account/orders', async (request: Request, env: Env) => {
  const user = await getSessionUser(request, env)
  if (!user) {
    return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
  }

  const url = new URL(request.url)
  const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10)
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '10', 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10
  const offset = (page - 1) * limit

  try {
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders WHERE user_id = ?`)
      .bind(user.id)
      .first<CountRow>()
    const total = totalRow?.count ?? 0

    const { results } = await env.DB.prepare(
      `SELECT o.id, o.status, o.total_thb, o.created_at,
              COUNT(oi.id) AS items_count,
              s.carrier, s.tracking_number
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN shipments s ON s.order_id = o.id
       WHERE o.user_id = ?
       GROUP BY o.id, o.status, o.total_thb, o.created_at, s.carrier, s.tracking_number
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(user.id, limit, offset)
      .all<AccountOrderRow>()

    return Response.json({
      orders: results.map((row) => ({
        id: row.id,
        status: row.status,
        total_thb: row.total_thb,
        items_count: row.items_count,
        created_at: row.created_at,
        shipment: row.carrier && row.tracking_number ? { carrier: row.carrier, tracking_number: row.tracking_number } : null,
      })),
      pagination: {
        page,
        limit,
        total,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.get('/api/account/last-address', async (request: Request, env: Env) => {
  const user = await getSessionUser(request, env)
  if (!user) {
    return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
  }

  try {
    const latest = await env.DB.prepare(
      `SELECT shipping_address_line1, shipping_address_line2, district, province, postal_code
       FROM orders
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(user.id)
      .first<LastAddressRow>()

    if (!latest) {
      return Response.json({ address: null })
    }

    return Response.json({
      address: {
        line1: latest.shipping_address_line1,
        line2: latest.shipping_address_line2,
        district: latest.district,
        province: latest.province,
        postal_code: latest.postal_code,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.patch('/api/account/profile', async (request: Request, env: Env) => {
  const sessionUser = await getSessionUser(request, env)
  if (!sessionUser) {
    return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateProfileBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const nextName = data.name ?? sessionUser.name
  const nextPhone = data.phone ?? sessionUser.phone

  try {
    await env.DB.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?`)
      .bind(nextName, nextPhone, nowIso(), sessionUser.id)
      .run()

    const user = await env.DB.prepare(`SELECT id, email, name, phone FROM users WHERE id = ? LIMIT 1`)
      .bind(sessionUser.id)
      .first<UserRow>()

    if (!user) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    return Response.json({ user })
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

interface PaymentProofBody {
  proof_value: string
}

interface OrderStatusOnlyRow {
  status: string
}

function isValidOrderId(id: string): boolean {
  // ULID is 26 alphanumeric characters (Crockford base32 = uppercase A-Z0-9 minus I,L,O,U)
  return /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(id)
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

    if (typeof c.phone !== 'string' || !isValidPhoneNumber(c.phone)) {
      errors.push({
        field: 'customer.phone',
        message: 'phone must be a valid phone number (e.g. +66812345678)',
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

function validatePaymentProofBody(body: unknown): { errors: ValidationError[]; data: PaymentProofBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const proofValue = typeof b.proof_value === 'string' ? b.proof_value.trim() : ''

  if (proofValue.length < 5 || proofValue.length > 100) {
    errors.push({
      field: 'proof_value',
      message: 'proof_value must be a string between 5 and 100 characters',
    })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { proof_value: proofValue } }
}

// --- POST /api/checkout ---

router.post('/api/checkout', async (request: Request, env: Env) => {
  const sessionUser = await getSessionUser(request, env)

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

  if (sessionUser && data.customer.email.trim().toLowerCase() !== sessionUser.email.toLowerCase()) {
    return Response.json(
      {
        error: 'Validation failed',
        details: [{ field: 'customer.email', message: 'customer.email must match your logged-in account email' }],
      },
      { status: 400 }
    )
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
        id, user_id, customer_name, customer_email, customer_phone,
        shipping_address_line1, shipping_address_line2,
        district, province, postal_code,
        subtotal_thb, shipping_thb, discount_thb, total_thb,
        status, idempotency_key, discount_code,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?)`
    ).bind(
      orderId,
      sessionUser?.id ?? null,
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

  if (sessionUser) {
    statements.push(
      env.DB.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).bind(
        data.customer.name.trim(),
        data.customer.phone.trim(),
        now,
        sessionUser.id
      )
    )
  }

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

// --- POST /api/orders/:id/payment-proof ---

router.post('/api/orders/:id/payment-proof', async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const id = url.pathname.split('/')[3] || ''

  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validatePaymentProofBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const orderId = id.toUpperCase()

  let order: OrderStatusOnlyRow | null
  try {
    order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`).bind(orderId).first<OrderStatusOnlyRow>()
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }

  if (!order) {
    return Response.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'pending_payment') {
    return Response.json(
      {
        error: 'Order status does not allow payment proof submission',
        current_status: order.status,
      },
      { status: 409 }
    )
  }

  try {
    await env.DB.prepare(
      `INSERT INTO payment_proofs (order_id, proof_type, proof_value, submitted_at)
       VALUES (?, 'reference', ?, ?)`
    )
      .bind(orderId, data.proof_value, new Date().toISOString())
      .run()
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }

  return Response.json({
    success: true,
    message: 'Payment proof submitted successfully. We will verify within 24 hours.',
  })
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

interface PaymentProofRow {
  proof_type: 'reference' | 'image_url'
  proof_value: string
  submitted_at: string
}

interface AdminOrderDetailRow {
  id: string
  status: string
  customer_name: string
  customer_email: string
  customer_phone: string
  shipping_address_line1: string
  shipping_address_line2: string | null
  district: string
  province: string
  postal_code: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  created_at: string
  updated_at: string
}

interface AdminPaymentProofRow extends PaymentProofRow {
  id: number
}

interface AdminOrderListRow {
  id: string
  status: string
  customer_name: string
  total_thb: number
  created_at: string
  items_count: number
}

interface AdminOrderListCountRow {
  total: number
}

interface AdminOrderItemForStockRow {
  product_id: number
  quantity: number
}

interface AdminShipmentBody {
  carrier: string
  tracking_number: string
}

interface AdminInventoryRow {
  product_id: number
  slug: string
  name: string
  price_thb: number
  active: number
  stock_count: number
  reserved_count: number
  available_count: number
}

interface AdminInventoryUpdateBody {
  adjustment: number
  notes?: string
}

interface AdminInventorySingleRow {
  stock_count: number
  reserved_count: number
}

interface AdminAuditLogRow {
  id: number
  admin_email: string
  action: string
  details_json: string | null
  created_at: string
}

interface AdminProductRow {
  id: number
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: number
  created_at: string
  updated_at: string
  stock_count: number
  reserved_count: number
  available_count: number
}

interface AdminCreateProductBody {
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  active: boolean
  stock_count: number
}

interface AdminUpdateProductBody {
  slug?: string
  name?: string
  description?: string
  price_thb?: number
  weight_g?: number
  image_url?: string
  active?: boolean
}

function parseAdminPagination(url: URL): { page: number; limit: number; offset: number } {
  const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20
  return { page, limit, offset: (page - 1) * limit }
}

function validateShipmentBody(body: unknown): { errors: ValidationError[]; data: AdminShipmentBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const carrier = typeof b.carrier === 'string' ? b.carrier.trim() : ''
  const tracking = typeof b.tracking_number === 'string' ? b.tracking_number.trim() : ''

  if (carrier.length < 2 || carrier.length > 100) {
    errors.push({ field: 'carrier', message: 'carrier must be between 2 and 100 characters' })
  }

  if (tracking.length < 3 || tracking.length > 100) {
    errors.push({ field: 'tracking_number', message: 'tracking_number must be between 3 and 100 characters' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { carrier, tracking_number: tracking } }
}

function validateInventoryUpdateBody(body: unknown): { errors: ValidationError[]; data: AdminInventoryUpdateBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const adjustment = typeof b.adjustment === 'number' ? b.adjustment : Number.NaN
  const notes = typeof b.notes === 'string' ? b.notes.trim() : undefined

  if (!Number.isInteger(adjustment) || adjustment === 0 || Math.abs(adjustment) > 100000) {
    errors.push({ field: 'adjustment', message: 'adjustment must be a non-zero integer between -100000 and 100000' })
  }

  if (notes && notes.length > 500) {
    errors.push({ field: 'notes', message: 'notes must be 500 characters or fewer' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { adjustment, notes } }
}

function isValidProductSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,100}$/.test(slug)
}

function isValidProductImageUrl(value: string): boolean {
  if (value.startsWith('/')) {
    return value.length <= 2000000 && !/\s/.test(value)
  }

  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    return value.length <= 2000000
  }

  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && value.length <= 2000000
  } catch {
    return false
  }
}

function validateCreateProductBody(body: unknown): { errors: ValidationError[]; data: AdminCreateProductBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : ''
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const price = typeof b.price_thb === 'number' ? b.price_thb : Number.NaN
  const weight = typeof b.weight_g === 'number' ? b.weight_g : Number.NaN
  const imageUrl = typeof b.image_url === 'string' ? b.image_url.trim() : ''
  const active = typeof b.active === 'boolean' ? b.active : true
  const stockCount = typeof b.stock_count === 'number' ? b.stock_count : 0

  if (!isValidProductSlug(slug)) {
    errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
  }
  if (name.length < 2 || name.length > 120) {
    errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
  }
  if (description.length < 10 || description.length > 5000) {
    errors.push({ field: 'description', message: 'description must be between 10 and 5000 characters' })
  }
  if (!Number.isInteger(price) || price <= 0 || price > 100000000) {
    errors.push({ field: 'price_thb', message: 'price_thb must be a positive integer up to 100000000' })
  }
  if (!Number.isInteger(weight) || weight <= 0 || weight > 50000) {
    errors.push({ field: 'weight_g', message: 'weight_g must be a positive integer up to 50000' })
  }
  if (imageUrl.length < 2 || imageUrl.length > 2000000) {
    errors.push({ field: 'image_url', message: 'image_url must be between 2 and 2000000 characters' })
  } else if (!isValidProductImageUrl(imageUrl)) {
    errors.push({
      field: 'image_url',
      message: 'image_url must be an absolute URL, root-relative path, or data image URL',
    })
  }
  if (!Number.isInteger(stockCount) || stockCount < 0 || stockCount > 1000000) {
    errors.push({ field: 'stock_count', message: 'stock_count must be an integer between 0 and 1000000' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: {
      slug,
      name,
      description,
      price_thb: price,
      weight_g: weight,
      image_url: imageUrl,
      active,
      stock_count: stockCount,
    },
  }
}

function validateUpdateProductBody(body: unknown): { errors: ValidationError[]; data: AdminUpdateProductBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const allowed = ['slug', 'name', 'description', 'price_thb', 'weight_g', 'image_url', 'active']
  const provided = allowed.filter((key) => key in b)

  if (provided.length === 0) {
    return { errors: [{ field: 'body', message: 'At least one updatable product field is required' }], data: null }
  }

  const data: AdminUpdateProductBody = {}

  if ('slug' in b) {
    if (typeof b.slug !== 'string') {
      errors.push({ field: 'slug', message: 'slug must be a string' })
    } else {
      const slug = b.slug.trim().toLowerCase()
      if (!isValidProductSlug(slug)) {
        errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
      } else {
        data.slug = slug
      }
    }
  }

  if ('name' in b) {
    if (typeof b.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a string' })
    } else {
      const name = b.name.trim()
      if (name.length < 2 || name.length > 120) {
        errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
      } else {
        data.name = name
      }
    }
  }

  if ('description' in b) {
    if (typeof b.description !== 'string') {
      errors.push({ field: 'description', message: 'description must be a string' })
    } else {
      const description = b.description.trim()
      if (description.length < 10 || description.length > 5000) {
        errors.push({ field: 'description', message: 'description must be between 10 and 5000 characters' })
      } else {
        data.description = description
      }
    }
  }

  if ('price_thb' in b) {
    if (typeof b.price_thb !== 'number' || !Number.isInteger(b.price_thb) || b.price_thb <= 0 || b.price_thb > 100000000) {
      errors.push({ field: 'price_thb', message: 'price_thb must be a positive integer up to 100000000' })
    } else {
      data.price_thb = b.price_thb
    }
  }

  if ('weight_g' in b) {
    if (typeof b.weight_g !== 'number' || !Number.isInteger(b.weight_g) || b.weight_g <= 0 || b.weight_g > 50000) {
      errors.push({ field: 'weight_g', message: 'weight_g must be a positive integer up to 50000' })
    } else {
      data.weight_g = b.weight_g
    }
  }

  if ('image_url' in b) {
    if (typeof b.image_url !== 'string') {
      errors.push({ field: 'image_url', message: 'image_url must be a string' })
    } else {
      const imageUrl = b.image_url.trim()
      if (imageUrl.length < 2 || imageUrl.length > 2000000) {
        errors.push({ field: 'image_url', message: 'image_url must be between 2 and 2000000 characters' })
      } else if (!isValidProductImageUrl(imageUrl)) {
        errors.push({
          field: 'image_url',
          message: 'image_url must be an absolute URL, root-relative path, or data image URL',
        })
      } else {
        data.image_url = imageUrl
      }
    }
  }

  if ('active' in b) {
    if (typeof b.active !== 'boolean') {
      errors.push({ field: 'active', message: 'active must be boolean' })
    } else {
      data.active = b.active
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data }
}

router.get('/api/orders/:id', async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop() || ''

  if (!isValidOrderId(id)) {
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

    // Fetch latest payment proof (if any)
    const latestPaymentProof = await env.DB.prepare(
      `SELECT proof_type, proof_value, submitted_at
       FROM payment_proofs
       WHERE order_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
      .bind(id.toUpperCase())
      .first<PaymentProofRow>()

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
        payment_submitted: !!latestPaymentProof,
        latest_payment_proof: latestPaymentProof
          ? {
              proof_type: latestPaymentProof.proof_type,
              proof_value: latestPaymentProof.proof_value,
              submitted_at: latestPaymentProof.submitted_at,
            }
          : null,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

// --- Admin Order + Inventory Endpoints ---

router.get('/api/admin/orders', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? '').trim()
  const q = (url.searchParams.get('q') ?? '').trim()
  const { page, limit, offset } = parseAdminPagination(url)

  const allowedStatuses = new Set(['pending_payment', 'paid', 'packed', 'shipped', 'delivered', 'cancelled'])
  if (status && !allowedStatuses.has(status)) {
    return Response.json({ error: 'Invalid status filter' }, { status: 400 })
  }

  const whereParts = ['1=1']
  const binds: Array<string | number> = []

  if (status) {
    whereParts.push('o.status = ?')
    binds.push(status)
  }

  if (q) {
    whereParts.push('(o.id LIKE ? OR o.customer_name LIKE ?)')
    binds.push(`%${q.toUpperCase()}%`, `%${q}%`)
  }

  const whereClause = whereParts.join(' AND ')

  try {
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS total FROM orders o WHERE ${whereClause}`)
      .bind(...binds)
      .first<AdminOrderListCountRow>()
    const total = totalRow?.total ?? 0

    const { results } = await env.DB.prepare(
      `SELECT o.id, o.status, o.customer_name, o.total_thb, o.created_at, COUNT(oi.id) AS items_count
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${whereClause}
       GROUP BY o.id, o.status, o.customer_name, o.total_thb, o.created_at
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(...binds, limit, offset)
      .all<AdminOrderListRow>()

    return Response.json({
      orders: results.map((row) => ({
        id: row.id,
        status: row.status,
        customer_name: row.customer_name,
        total_thb: row.total_thb,
        items_count: row.items_count,
        created_at: row.created_at,
      })),
      pagination: { page, limit, total },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.get('/api/admin/orders/:id', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.pathname.split('/').pop() || ''

  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }

  const orderId = id.toUpperCase()

  try {
    const order = await env.DB.prepare(
      `SELECT id, status,
              customer_name, customer_email, customer_phone,
              shipping_address_line1, shipping_address_line2, district, province, postal_code,
              subtotal_thb, shipping_thb, discount_thb, total_thb,
              created_at, updated_at
       FROM orders WHERE id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<AdminOrderDetailRow>()

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 })
    }

    const { results: items } = await env.DB.prepare(
      `SELECT p.name AS product_name, oi.quantity, oi.line_total_thb
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`
    )
      .bind(orderId)
      .all<OrderItemRow>()

    const shipment = await env.DB.prepare(
      `SELECT carrier, tracking_number, shipped_at
       FROM shipments WHERE order_id = ? LIMIT 1`
    )
      .bind(orderId)
      .first<ShipmentRow>()

    const { results: paymentProofs } = await env.DB.prepare(
      `SELECT id, proof_type, proof_value, submitted_at
       FROM payment_proofs
       WHERE order_id = ?
       ORDER BY id DESC`
    )
      .bind(orderId)
      .all<AdminPaymentProofRow>()

    const { results: auditLogs } = await env.DB.prepare(
      `SELECT id, admin_email, action, details_json, created_at
       FROM admin_audit_log
       WHERE order_id = ?
       ORDER BY id DESC`
    )
      .bind(orderId)
      .all<AdminAuditLogRow>()

    return Response.json({
      order: {
        id: order.id,
        status: order.status,
        customer: {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone,
        },
        shipping_address: {
          line1: order.shipping_address_line1,
          line2: order.shipping_address_line2,
          district: order.district,
          province: order.province,
          postal_code: order.postal_code,
        },
        subtotal_thb: order.subtotal_thb,
        shipping_thb: order.shipping_thb,
        discount_thb: order.discount_thb,
        total_thb: order.total_thb,
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
        payment_proofs: paymentProofs.map((proof) => ({
          id: proof.id,
          proof_type: proof.proof_type,
          proof_value: proof.proof_value,
          submitted_at: proof.submitted_at,
        })),
        audit_logs: auditLogs.map((log) => ({
          id: log.id,
          admin_email: log.admin_email,
          action: log.action,
          details_json: log.details_json,
          created_at: log.created_at,
        })),
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.post('/api/admin/orders/:id/mark-paid', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.pathname.split('/')[4] || ''
  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }
  const orderId = id.toUpperCase()

  try {
    const order = await env.DB.prepare(`SELECT status, total_thb FROM orders WHERE id = ? LIMIT 1`)
      .bind(orderId)
      .first<{ status: string; total_thb: number }>()
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'pending_payment') {
      return Response.json({ error: 'Invalid status transition', current_status: order.status }, { status: 409 })
    }

    const { results: items } = await env.DB.prepare(
      `SELECT product_id, quantity FROM order_items WHERE order_id = ?`
    )
      .bind(orderId)
      .all<AdminOrderItemForStockRow>()

    const now = nowIso()
    const statements: D1PreparedStatement[] = []
    statements.push(env.DB.prepare(`UPDATE orders SET status = 'paid', updated_at = ? WHERE id = ?`).bind(now, orderId))
    statements.push(
      env.DB.prepare(
        `INSERT INTO payments (order_id, method, reference, amount_thb, verified_at, verified_by, created_at)
         VALUES (?, 'bank_transfer', NULL, ?, ?, ?, ?)`
      ).bind(orderId, order.total_thb, now, adminUser.email, now)
    )

    for (const item of items) {
      statements.push(
        env.DB.prepare(
          `UPDATE inventory
           SET reserved_count = MAX(reserved_count - ?, 0),
               stock_count = MAX(stock_count - ?, 0),
               updated_at = ?
           WHERE product_id = ?`
        ).bind(item.quantity, item.quantity, now, item.product_id)
      )
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'mark_paid', ?, ?, ?)`
      ).bind(adminUser.email, orderId, JSON.stringify({ from: 'pending_payment', to: 'paid' }), now)
    )

    await env.DB.batch(statements)
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.post('/api/admin/orders/:id/pack', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.pathname.split('/')[4] || ''
  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }
  const orderId = id.toUpperCase()

  try {
    const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`)
      .bind(orderId)
      .first<{ status: string }>()
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'paid') {
      return Response.json({ error: 'Invalid status transition', current_status: order.status }, { status: 409 })
    }

    const now = nowIso()
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'packed', updated_at = ? WHERE id = ?`).bind(now, orderId),
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'pack', ?, ?, ?)`
      ).bind(adminUser.email, orderId, JSON.stringify({ from: 'paid', to: 'packed' }), now),
    ])

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.post('/api/admin/orders/:id/ship', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.pathname.split('/')[4] || ''
  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }
  const orderId = id.toUpperCase()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateShipmentBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  try {
    const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`)
      .bind(orderId)
      .first<{ status: string }>()
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })
    if (order.status !== 'packed') {
      return Response.json({ error: 'Invalid status transition', current_status: order.status }, { status: 409 })
    }

    const now = nowIso()
    await env.DB.batch([
      env.DB.prepare(`UPDATE orders SET status = 'shipped', updated_at = ? WHERE id = ?`).bind(now, orderId),
      env.DB.prepare(
        `INSERT INTO shipments (order_id, carrier, tracking_number, shipped_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(orderId, data.carrier, data.tracking_number, now, now),
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'ship', ?, ?, ?)`
      ).bind(
        adminUser.email,
        orderId,
        JSON.stringify({ from: 'packed', to: 'shipped', carrier: data.carrier, tracking_number: data.tracking_number }),
        now
      ),
    ])

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.post('/api/admin/orders/:id/cancel', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const id = url.pathname.split('/')[4] || ''
  if (!isValidOrderId(id)) {
    return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
  }
  const orderId = id.toUpperCase()

  try {
    const order = await env.DB.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`)
      .bind(orderId)
      .first<{ status: string }>()
    if (!order) return Response.json({ error: 'Order not found' }, { status: 404 })

    const allowedFrom = new Set(['pending_payment', 'paid', 'packed'])
    if (!allowedFrom.has(order.status)) {
      return Response.json({ error: 'Invalid status transition', current_status: order.status }, { status: 409 })
    }

    const { results: items } = await env.DB.prepare(
      `SELECT product_id, quantity FROM order_items WHERE order_id = ?`
    )
      .bind(orderId)
      .all<AdminOrderItemForStockRow>()

    const now = nowIso()
    const statements: D1PreparedStatement[] = []
    statements.push(env.DB.prepare(`UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(now, orderId))

    for (const item of items) {
      if (order.status === 'pending_payment') {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory
             SET reserved_count = MAX(reserved_count - ?, 0),
                 updated_at = ?
             WHERE product_id = ?`
          ).bind(item.quantity, now, item.product_id)
        )
      } else {
        statements.push(
          env.DB.prepare(
            `UPDATE inventory
             SET stock_count = stock_count + ?,
                 updated_at = ?
             WHERE product_id = ?`
          ).bind(item.quantity, now, item.product_id)
        )
      }
    }

    statements.push(
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'cancel', ?, ?, ?)`
      ).bind(adminUser.email, orderId, JSON.stringify({ from: order.status, to: 'cancelled' }), now)
    )

    await env.DB.batch(statements)
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.get('/api/admin/inventory', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id AS product_id, p.slug, p.name, p.price_thb, p.active,
              i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       ORDER BY p.id ASC`
    ).all<AdminInventoryRow>()

    return Response.json({
      inventory: results.map((row) => ({
        product_id: row.product_id,
        slug: row.slug,
        name: row.name,
        price_thb: row.price_thb,
        active: !!row.active,
        stock_count: row.stock_count,
        reserved_count: row.reserved_count,
        available_count: row.available_count,
      })),
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.patch('/api/admin/inventory/:productId', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const productIdRaw = url.pathname.split('/').pop() || ''
  const productId = parseInt(productIdRaw, 10)
  if (!Number.isInteger(productId) || productId < 1) {
    return Response.json({ error: 'Invalid productId' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateInventoryUpdateBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  try {
    const product = await env.DB.prepare(`SELECT id, name FROM products WHERE id = ? LIMIT 1`)
      .bind(productId)
      .first<{ id: number; name: string }>()
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const now = nowIso()
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE inventory
         SET stock_count = MAX(stock_count + ?, 0),
             updated_at = ?
         WHERE product_id = ?`
      ).bind(data.adjustment, now, productId),
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'inventory_adjust', NULL, ?, ?)`
      ).bind(
        adminUser.email,
        JSON.stringify({ product_id: productId, product_name: product.name, adjustment: data.adjustment, notes: data.notes ?? null }),
        now
      ),
    ])

    const inventory = await env.DB.prepare(
      `SELECT stock_count, reserved_count
       FROM inventory
       WHERE product_id = ? LIMIT 1`
    )
      .bind(productId)
      .first<AdminInventorySingleRow>()

    if (!inventory) {
      return Response.json({ error: 'Inventory row not found' }, { status: 404 })
    }

    return Response.json({
      success: true,
      inventory: {
        product_id: productId,
        stock_count: inventory.stock_count,
        reserved_count: inventory.reserved_count,
        available_count: inventory.stock_count - inventory.reserved_count,
      },
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.get('/api/admin/products', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.created_at, p.updated_at,
              i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       ORDER BY p.id ASC`
    ).all<AdminProductRow>()

    return Response.json({
      products: results.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        price_thb: row.price_thb,
        weight_g: row.weight_g,
        image_url: row.image_url,
        active: !!row.active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        stock_count: row.stock_count,
        reserved_count: row.reserved_count,
        available_count: row.available_count,
      })),
    })
  } catch {
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.post('/api/admin/products', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateCreateProductBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const now = nowIso()

  try {
    const insertProduct = await env.DB.prepare(
      `INSERT INTO products (slug, name, description, price_thb, weight_g, image_url, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        data.slug,
        data.name,
        data.description,
        data.price_thb,
        data.weight_g,
        data.image_url,
        data.active ? 1 : 0,
        now,
        now
      )
      .run()

    const productId = Number(insertProduct.meta.last_row_id)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Failed to create product' }, { status: 500 })
    }

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO inventory (product_id, stock_count, reserved_count, updated_at)
         VALUES (?, ?, 0, ?)`
      ).bind(productId, data.stock_count, now),
      env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_create', NULL, ?, ?)`
      ).bind(
        adminUser.email,
        JSON.stringify({
          product_id: productId,
          slug: data.slug,
          name: data.name,
          price_thb: data.price_thb,
          weight_g: data.weight_g,
          active: data.active,
          stock_count: data.stock_count,
        }),
        now
      ),
    ])

    const product = await env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.created_at, p.updated_at,
              i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.id = ?
       LIMIT 1`
    )
      .bind(productId)
      .first<AdminProductRow>()

    if (!product) {
      return Response.json({ error: 'Product created but retrieval failed' }, { status: 500 })
    }

    return Response.json(
      {
        success: true,
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          price_thb: product.price_thb,
          weight_g: product.weight_g,
          image_url: product.image_url,
          active: !!product.active,
          created_at: product.created_at,
          updated_at: product.updated_at,
          stock_count: product.stock_count,
          reserved_count: product.reserved_count,
          available_count: product.available_count,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'slug', message: 'slug already exists' }] },
        { status: 409 }
      )
    }
    return Response.json({ error: 'Database error' }, { status: 500 })
  }
})

router.patch('/api/admin/products/:id', async (request: Request, env: Env) => {
  const adminUser = getAdminUser(request)
  if (!adminUser) {
    return Response.json({ error: 'Admin authentication required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const idRaw = url.pathname.split('/').pop() || ''
  const productId = parseInt(idRaw, 10)
  if (!Number.isInteger(productId) || productId < 1) {
    return Response.json({ error: 'Invalid product ID' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
      { status: 400 }
    )
  }

  const { errors, data } = validateUpdateProductBody(body)
  if (errors.length > 0 || !data) {
    return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  const existing = await env.DB.prepare(`SELECT id FROM products WHERE id = ? LIMIT 1`).bind(productId).first<{ id: number }>()
  if (!existing) {
    return Response.json({ error: 'Product not found' }, { status: 404 })
  }

  const setParts: string[] = []
  const binds: Array<string | number> = []

  if (data.slug !== undefined) {
    setParts.push('slug = ?')
    binds.push(data.slug)
  }
  if (data.name !== undefined) {
    setParts.push('name = ?')
    binds.push(data.name)
  }
  if (data.description !== undefined) {
    setParts.push('description = ?')
    binds.push(data.description)
  }
  if (data.price_thb !== undefined) {
    setParts.push('price_thb = ?')
    binds.push(data.price_thb)
  }
  if (data.weight_g !== undefined) {
    setParts.push('weight_g = ?')
    binds.push(data.weight_g)
  }
  if (data.image_url !== undefined) {
    setParts.push('image_url = ?')
    binds.push(data.image_url)
  }
  if (data.active !== undefined) {
    setParts.push('active = ?')
    binds.push(data.active ? 1 : 0)
  }

  const now = nowIso()
  setParts.push('updated_at = ?')
  binds.push(now)
  binds.push(productId)

  try {
    await env.DB.prepare(`UPDATE products SET ${setParts.join(', ')} WHERE id = ?`)
      .bind(...binds)
      .run()

    await env.DB.prepare(
      `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
       VALUES (?, 'product_update', NULL, ?, ?)`
    )
      .bind(adminUser.email, JSON.stringify({ product_id: productId, changes: data }), now)
      .run()

    const product = await env.DB.prepare(
      `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.created_at, p.updated_at,
              i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
       FROM products p
       JOIN inventory i ON i.product_id = p.id
       WHERE p.id = ?
       LIMIT 1`
    )
      .bind(productId)
      .first<AdminProductRow>()

    if (!product) {
      return Response.json({ error: 'Product updated but retrieval failed' }, { status: 500 })
    }

    return Response.json({
      success: true,
      product: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        price_thb: product.price_thb,
        weight_g: product.weight_g,
        image_url: product.image_url,
        active: !!product.active,
        created_at: product.created_at,
        updated_at: product.updated_at,
        stock_count: product.stock_count,
        reserved_count: product.reserved_count,
        available_count: product.available_count,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'slug', message: 'slug already exists' }] },
        { status: 409 }
      )
    }
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

    return corsify(response, request)
  },
}
