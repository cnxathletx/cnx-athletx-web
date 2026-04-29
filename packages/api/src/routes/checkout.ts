import type { RouterType } from 'itty-router'
import type {
  Env,
  ProductRow,
  ExistingOrderRow,
  ValidationError,
  OrderStatusOnlyRow,
  PaymentProofBody,
  PriceTierRow,
} from '../lib/types'
import { isValidOrderId } from '../lib/utils'
import { validateCheckoutBody, validatePaymentProofBody } from '../lib/validation'
import { getSessionUser, parseJsonBody } from '../middleware/auth'
import { getClientIp, rateLimitedResponse } from '../middleware/rate-limit'
import { enforcePolicyGlobalLimit, enforcePolicyLimit } from '../middleware/rate-limit-registry'
import { sendOrderEmail, sendAdminNewOrderEmail } from '../services/email'
import type { EmailItem } from '../services/email'
import { generateULID } from '../lib/ulid'
import { ORDER_STATUS, isPaymentProofOrderStatus } from '../lib/orderStatus'
import { pickUnitPrice, type PriceTier } from '../lib/pricing'
import { getProvider, listEnabledProviders } from '../services/payments/registry'
import type { PaymentIntent, SiteSettingsMap } from '../lib/types'
import { loadSettingsMap, parseSettings, type TypedSettings } from '../services/settings'
import { applyDiscountCode, type AppliedDiscount } from '../services/discounts'
import {
  inventoryFailureDetail,
  inventoryReservationFailure,
  releaseInventory,
  reserveInventory,
  rollbackReservedInventory,
} from '../services/inventory'

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
    const ipLimit = await enforcePolicyLimit(env, 'checkout', ip)
    if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec)

    const globalLimit = await enforcePolicyGlobalLimit(env, 'checkout')
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
    let settings: TypedSettings
    let settingsMap: SiteSettingsMap
    try {
      settingsMap = await loadSettingsMap(env)
      settings = parseSettings(settingsMap)
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
    let discount: AppliedDiscount
    try {
      const appliedDiscount = await applyDiscountCode(env, data.discount_code, subtotal)
      if (!appliedDiscount.ok) {
        return Response.json(
          { error: 'Validation failed', details: [appliedDiscount.detail] },
          { status: appliedDiscount.status },
        )
      }
      discount = appliedDiscount
    } catch {
      return Response.json({ error: 'Database error validating discount code' }, { status: 500 })
    }

    // --- Final total ---
    const discountThb = discount.discountThb
    const total = subtotal + shipping - discountThb

    // --- Generate order ID ---
    const orderId = generateULID()
    const now = new Date().toISOString()
    const orderLocale: 'en' | 'th' = data.locale === 'th' ? 'th' : 'en'

    // --- Phase 1: Reserve inventory with conditional updates ---
    const inventoryStatements = reserveInventory(env, mergedItems, now)
    const reserveStatements: D1PreparedStatement[] = [...inventoryStatements, ...discount.commit]

    try {
      const reserveResults = await env.DB.batch(reserveStatements)
      const inventoryFailure = inventoryReservationFailure(mergedItems, reserveResults)
      if (inventoryFailure) {
        const rollbacks = rollbackReservedInventory(env, mergedItems, now, reserveResults, inventoryFailure.index)
        if (rollbacks.length > 0) await env.DB.batch(rollbacks).catch(() => {})

        return Response.json(
          {
            error: 'Insufficient stock',
            details: [inventoryFailureDetail(inventoryFailure)],
          },
          { status: 422 }
        )
      }

      if (discount.discountCodeRow) {
        const discountResult = reserveResults[mergedItems.length]
        if (discountResult?.meta?.changes === 0) {
          const rollbacks = releaseInventory(env, mergedItems, now)
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
          status, locale, idempotency_key, discount_code, payment_method,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        ORDER_STATUS.pendingPayment,
        orderLocale,
        data.idempotency_key,
        discount.discountCodeRow ? discount.discountCodeRow.code : null,
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
      const rollbacks: D1PreparedStatement[] = [
        ...releaseInventory(env, mergedItems, now),
        ...discount.rollback,
      ]
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
      locale: orderLocale,
    }

    const instructions = provider.renderInstructions({
      order: { id: orderId, total_thb: total, customer_email: data.customer.email.toLowerCase().trim() },
      settings: settingsMap,
    })

    ctx.waitUntil(
      sendOrderEmail(env, 'order_created', orderEmailData, { instructions }).catch((err) =>
        console.error('order_created email failed:', err)
      )
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
        discount.discountCodeRow?.code
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

    if (!isPaymentProofOrderStatus(order.status)) {
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
