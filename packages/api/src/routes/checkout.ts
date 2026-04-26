import type { RouterType } from 'itty-router'
import type {
  Env,
  ProductRow,
  SiteSettings,
  DiscountCodeRow,
  ExistingOrderRow,
  ValidationError,
  OrderStatusOnlyRow,
  PaymentProofBody,
  PriceTierRow,
} from '../lib/types'
import { isValidOrderId } from '../lib/utils'
import { validateCheckoutBody, validatePaymentProofBody } from '../lib/validation'
import { getSessionUser, parseJsonBody } from '../middleware/auth'
import { enforceLimit, enforceGlobalLimit, getClientIp, rateLimitedResponse } from '../middleware/rate-limit'
import { sendOrderEmail, sendAdminNewOrderEmail } from '../services/email'
import type { EmailItem } from '../services/email'
import { generateULID } from '../lib/ulid'
import { pickUnitPrice, type PriceTier } from '../lib/pricing'
import { getProvider, listEnabledProviders } from '../services/payments/registry'
import type { PaymentIntent, SiteSettingsMap } from '../lib/types'

const CHECKOUT_PER_IP_MAX = 30
const CHECKOUT_PER_IP_WINDOW_SEC = 60 * 60
const CHECKOUT_GLOBAL_MAX = 1000
const CHECKOUT_GLOBAL_WINDOW_SEC = 60 * 60

export function registerCheckoutRoutes(router: RouterType) {
  router.post('/api/checkout', async (request: Request, env: Env, ctx: ExecutionContext) => {
    const sessionUser = await getSessionUser(request, env)

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateCheckoutBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const ip = getClientIp(request)
    const ipLimit = await enforceLimit(env, {
      scope: 'checkout',
      key: ip,
      max: CHECKOUT_PER_IP_MAX,
      windowSec: CHECKOUT_PER_IP_WINDOW_SEC,
    })
    if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec)

    const globalLimit = await enforceGlobalLimit(
      env,
      'checkout',
      CHECKOUT_GLOBAL_MAX,
      CHECKOUT_GLOBAL_WINDOW_SEC,
    )
    if (!globalLimit.ok) return rateLimitedResponse(globalLimit.retryAfterSec)

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

    // --- Deduplicate items ---
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
        `SELECT p.id, p.name, p.price_thb, i.stock_count, i.reserved_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id IN (${placeholders}) AND p.active = 1 AND p.archived = 0`
      )
        .bind(...productIds)
        .all<ProductRow>()
      productRows = results
    } catch {
      return Response.json({ error: 'Database error fetching products' }, { status: 500 })
    }

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
    let settingsMap: SiteSettingsMap
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings WHERE key IN (
          'shipping_flat_rate', 'shipping_free_threshold',
          'promptpay_number', 'bank_name', 'bank_account_name', 'bank_account_number',
          'payment_methods_enabled'
        )`
      ).all<{ key: string; value: string }>()

      settingsMap = {}
      for (const row of results) {
        settingsMap[row.key] = row.value
      }

      settings = {
        shipping_flat_rate: parseInt(settingsMap.shipping_flat_rate ?? '10000', 10),
        shipping_free_threshold: parseInt(settingsMap.shipping_free_threshold ?? '0', 10),
        promptpay_number: settingsMap.promptpay_number ?? '',
        bank_name: settingsMap.bank_name ?? '',
        bank_account_name: settingsMap.bank_account_name ?? '',
        bank_account_number: settingsMap.bank_account_number ?? '',
        payment_methods_enabled: [],
      }
    } catch {
      return Response.json({ error: 'Database error fetching site settings' }, { status: 500 })
    }

    // --- Verify chosen payment method is enabled ---
    const provider = getProvider(data.payment_method)
    if (!provider) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [{ field: 'payment_method', message: `payment_method "${data.payment_method}" is not supported` }],
        },
        { status: 400 }
      )
    }
    const enabledIds = new Set(listEnabledProviders(settingsMap).map((p) => p.id))
    if (!enabledIds.has(provider.id)) {
      return Response.json(
        {
          error: 'Validation failed',
          details: [{ field: 'payment_method', message: `payment_method "${provider.id}" is currently disabled` }],
        },
        { status: 400 }
      )
    }

    // --- Fetch price tiers for all items ---
    const tierMap = new Map<number, PriceTier[]>()
    try {
      const placeholdersT = productIds.map(() => '?').join(', ')
      const { results: tierRows } = await env.DB.prepare(
        `SELECT id, product_id, min_quantity, unit_price_thb
         FROM price_tiers WHERE product_id IN (${placeholdersT})`
      )
        .bind(...productIds)
        .all<PriceTierRow>()
      for (const t of tierRows) {
        const list = tierMap.get(t.product_id) ?? []
        list.push({ min_quantity: t.min_quantity, unit_price_thb: t.unit_price_thb })
        tierMap.set(t.product_id, list)
      }
    } catch {
      return Response.json({ error: 'Database error fetching price tiers' }, { status: 500 })
    }

    // --- Calculate subtotal (apply best volume tier per line) ---
    const unitPriceByProduct = new Map<number, number>()
    let subtotal = 0
    for (const item of mergedItems) {
      const product = productMap.get(item.product_id)!
      const unitPrice = pickUnitPrice(product.price_thb, tierMap.get(item.product_id) ?? [], item.quantity)
      unitPriceByProduct.set(item.product_id, unitPrice)
      subtotal += unitPrice * item.quantity
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
           FROM discount_codes WHERE code = ? AND archived = 0 LIMIT 1`
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
        discountThb = Math.floor((subtotal * discountCodeRow.value) / 100)
      }

      discountThb = Math.min(discountThb, subtotal)
    }

    // --- Final total ---
    const total = subtotal + shipping - discountThb

    // --- Generate order ID ---
    const orderId = generateULID()
    const now = new Date().toISOString()

    // --- Phase 1: Reserve inventory with conditional updates ---
    const reserveStatements: D1PreparedStatement[] = []
    for (const item of mergedItems) {
      reserveStatements.push(
        env.DB.prepare(
          `UPDATE inventory SET reserved_count = reserved_count + ?, updated_at = ?
           WHERE product_id = ? AND (stock_count - reserved_count) >= ?`
        ).bind(item.quantity, now, item.product_id, item.quantity)
      )
    }

    if (discountCodeRow) {
      reserveStatements.push(
        env.DB.prepare(
          `UPDATE discount_codes SET used_count = used_count + 1
           WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)`
        ).bind(discountCodeRow.id)
      )
    }

    try {
      const reserveResults = await env.DB.batch(reserveStatements)

      for (let i = 0; i < mergedItems.length; i++) {
        if (reserveResults[i]?.meta?.changes === 0) {
          const rollbacks: D1PreparedStatement[] = []
          for (let j = 0; j < i; j++) {
            if (reserveResults[j]?.meta?.changes && reserveResults[j].meta.changes > 0) {
              rollbacks.push(
                env.DB.prepare(
                  `UPDATE inventory SET reserved_count = reserved_count - ?, updated_at = ? WHERE product_id = ?`
                ).bind(mergedItems[j].quantity, now, mergedItems[j].product_id)
              )
            }
          }
          if (rollbacks.length > 0) await env.DB.batch(rollbacks).catch(() => {})

          return Response.json(
            {
              error: 'Insufficient stock',
              details: [{ field: 'items', message: `Product ${mergedItems[i].product_id} is no longer available in the requested quantity` }],
            },
            { status: 422 }
          )
        }
      }

      if (discountCodeRow) {
        const discountResult = reserveResults[mergedItems.length]
        if (discountResult?.meta?.changes === 0) {
          const rollbacks = mergedItems.map((item) =>
            env.DB.prepare(
              `UPDATE inventory SET reserved_count = reserved_count - ?, updated_at = ? WHERE product_id = ?`
            ).bind(item.quantity, now, item.product_id)
          )
          await env.DB.batch(rollbacks).catch(() => {})

          return Response.json(
            {
              error: 'Validation failed',
              details: [{ field: 'discount_code', message: 'Discount code has reached its maximum usage limit' }],
            },
            { status: 400 }
          )
        }
      }
    } catch {
      return Response.json({ error: 'Database error reserving stock' }, { status: 500 })
    }

    // --- Phase 2: Create order ---
    const orderStatements: D1PreparedStatement[] = []

    orderStatements.push(
      env.DB.prepare(
        `INSERT INTO orders (
          id, user_id, customer_name, customer_email, customer_phone,
          shipping_address_line1, shipping_address_line2,
          district, province, postal_code,
          subtotal_thb, shipping_thb, discount_thb, total_thb,
          status, idempotency_key, discount_code, payment_method,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?)`
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
        provider.id,
        now,
        now
      )
    )

    if (sessionUser) {
      orderStatements.push(
        env.DB.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).bind(
          data.customer.name.trim(),
          data.customer.phone.trim(),
          now,
          sessionUser.id
        )
      )
    }

    for (const item of mergedItems) {
      const unitPrice = unitPriceByProduct.get(item.product_id)!
      const lineTotal = unitPrice * item.quantity
      orderStatements.push(
        env.DB.prepare(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_thb, line_total_thb)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(orderId, item.product_id, item.quantity, unitPrice, lineTotal)
      )
    }

    try {
      await env.DB.batch(orderStatements)
    } catch {
      const rollbacks: D1PreparedStatement[] = mergedItems.map((item) =>
        env.DB.prepare(
          `UPDATE inventory SET reserved_count = reserved_count - ?, updated_at = ? WHERE product_id = ?`
        ).bind(item.quantity, now, item.product_id)
      )
      if (discountCodeRow) {
        rollbacks.push(
          env.DB.prepare(`UPDATE discount_codes SET used_count = used_count - 1 WHERE id = ? AND used_count > 0`).bind(
            discountCodeRow.id
          )
        )
      }
      await env.DB.batch(rollbacks).catch(() => {})
      return Response.json({ error: 'Database error creating order' }, { status: 500 })
    }

    // --- Send Order Created email (fire-and-forget) ---
    const emailItems: EmailItem[] = mergedItems.map((item) => {
      const product = productMap.get(item.product_id)!
      const unitPrice = unitPriceByProduct.get(item.product_id)!
      return { name: product.name, quantity: item.quantity, line_total_thb: unitPrice * item.quantity }
    })

    const orderEmailData = {
      order_id: orderId,
      customer_name: data.customer.name.trim(),
      customer_email: data.customer.email.toLowerCase().trim(),
      items: emailItems,
      subtotal_thb: subtotal,
      shipping_thb: shipping,
      discount_thb: discountThb,
      total_thb: total,
    }

    ctx.waitUntil(
      sendOrderEmail(env, 'order_created', orderEmailData, {
        payment: {
          promptpay_number: settings.promptpay_number,
          bank_name: settings.bank_name,
          bank_account_name: settings.bank_account_name,
          bank_account_number: settings.bank_account_number,
        },
      }).catch((err) => console.error('order_created email failed:', err))
    )

    // --- Notify admin (fire-and-forget) ---
    ctx.waitUntil(
      sendAdminNewOrderEmail(
        env,
        orderEmailData,
        {
          line1: data.customer.address.line1.trim(),
          line2: data.customer.address.line2?.trim(),
          district: data.customer.address.district.trim(),
          province: data.customer.address.province.trim(),
          postal_code: data.customer.address.postal_code,
        },
        discountCodeRow?.code
      ).catch((err) => console.error('admin new order email failed:', err))
    )

    // --- Build payment intent via provider ---
    let intent: PaymentIntent
    try {
      intent = await provider.createIntent({
        order: { id: orderId, total_thb: total, customer_email: data.customer.email.toLowerCase().trim() },
        settings: settingsMap,
        env,
      })
    } catch (err) {
      console.error('createIntent failed:', err)
      return Response.json({ error: 'Failed to initialize payment' }, { status: 500 })
    }

    return Response.json(
      {
        order_id: orderId,
        subtotal_thb: subtotal,
        shipping_thb: shipping,
        discount_thb: discountThb,
        total_thb: total,
        intent,
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

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validatePaymentProofBody(parsed.data)
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
        { error: 'Payment proof can only be submitted for orders awaiting payment', current_status: order.status },
        { status: 409 }
      )
    }

    try {
      await env.DB.prepare(
        `INSERT INTO payment_proofs (order_id, proof_type, proof_value) VALUES (?, 'reference', ?)`
      )
        .bind(orderId, data.proof_value)
        .run()

      return Response.json({ success: true }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
