import type { RouterType } from 'itty-router'
import type {
  Env,
  AdminOrderDetailRow,
  AdminOrderListRow,
  AdminOrderListCountRow,
  AdminOrderItemForStockRow,
  AdminPaymentProofRow,
  AdminAuditLogRow,
  AdminInventoryRow,
  AdminInventorySingleRow,
  AdminProductRow,
  OrderItemRow,
  ShipmentRow,
} from '../lib/types'
import { nowIso, isValidOrderId } from '../lib/utils'
import {
  parseAdminPagination,
  validateShipmentBody,
  validateInventoryUpdateBody,
  validateCreateProductBody,
  validateUpdateProductBody,
} from '../lib/validation'
import { getAdminUser } from '../middleware/auth'
import { sendOrderEmail, fetchOrderEmailData } from '../services/email'

export function registerAdminRoutes(router: RouterType) {
  // --- Admin Orders ---

  router.get('/api/admin/orders', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
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
    const adminUser = await getAdminUser(request, env)
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
    const adminUser = await getAdminUser(request, env)
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

      fetchOrderEmailData(env, orderId).then((emailData) => {
        if (emailData) sendOrderEmail(env, 'payment_confirmed', emailData)
      }).catch(() => {})

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.post('/api/admin/orders/:id/pack', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
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
    const adminUser = await getAdminUser(request, env)
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

      fetchOrderEmailData(env, orderId).then((emailData) => {
        if (emailData) sendOrderEmail(env, 'order_shipped', emailData, { shipment: { carrier: data.carrier, tracking_number: data.tracking_number } })
      }).catch(() => {})

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.post('/api/admin/orders/:id/cancel', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
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

  // --- Admin Inventory ---

  router.get('/api/admin/inventory', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
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
    const adminUser = await getAdminUser(request, env)
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

  // --- Admin Products ---

  router.get('/api/admin/products', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
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
    const adminUser = await getAdminUser(request, env)
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
        .bind(data.slug, data.name, data.description, data.price_thb, data.weight_g, data.image_url, data.active ? 1 : 0, now, now)
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
    const adminUser = await getAdminUser(request, env)
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

    if (data.slug !== undefined) { setParts.push('slug = ?'); binds.push(data.slug) }
    if (data.name !== undefined) { setParts.push('name = ?'); binds.push(data.name) }
    if (data.description !== undefined) { setParts.push('description = ?'); binds.push(data.description) }
    if (data.price_thb !== undefined) { setParts.push('price_thb = ?'); binds.push(data.price_thb) }
    if (data.weight_g !== undefined) { setParts.push('weight_g = ?'); binds.push(data.weight_g) }
    if (data.image_url !== undefined) { setParts.push('image_url = ?'); binds.push(data.image_url) }
    if (data.active !== undefined) { setParts.push('active = ?'); binds.push(data.active ? 1 : 0) }

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
}
