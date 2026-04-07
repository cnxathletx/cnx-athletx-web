import type { RouterType } from 'itty-router'
import type {
  Env,
  AdminOrderDetailRow,
  AdminOrderListRow,
  AdminOrderListCountRow,
  AdminOrderItemForStockRow,
  AdminPaymentProofRow,
  AdminAuditLogRow,
  OrderItemRow,
  ShipmentRow,
} from '../../lib/types'
import { nowIso, isValidOrderId } from '../../lib/utils'
import { parseAdminPagination, validateShipmentBody } from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'
import { sendOrderEmail, fetchOrderEmailData } from '../../services/email'

export function registerAdminOrderRoutes(router: RouterType) {
  router.get('/api/admin/orders', requireAdmin(async (request, env) => {
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
  }))

  router.get('/api/admin/orders/:id', requireAdmin(async (request, env) => {
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
  }))

  router.post('/api/admin/orders/:id/mark-paid', requireAdmin(async (request, env, adminUser, ctx) => {
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

      ctx.waitUntil(
        fetchOrderEmailData(env, orderId).then((emailData) => {
          if (emailData) return sendOrderEmail(env, 'payment_confirmed', emailData)
        }).catch((err) => console.error('payment_confirmed email failed:', err))
      )

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/orders/:id/pack', requireAdmin(async (request, env, adminUser, ctx) => {
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
  }))

  router.post('/api/admin/orders/:id/ship', requireAdmin(async (request, env, adminUser, ctx) => {
    const url = new URL(request.url)
    const id = url.pathname.split('/')[4] || ''
    if (!isValidOrderId(id)) {
      return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
    }
    const orderId = id.toUpperCase()

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateShipmentBody(parsed.data)
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

      ctx.waitUntil(
        fetchOrderEmailData(env, orderId).then((emailData) => {
          if (emailData) return sendOrderEmail(env, 'order_shipped', emailData, { shipment: { carrier: data.carrier, tracking_number: data.tracking_number } })
        }).catch((err) => console.error('order_shipped email failed:', err))
      )

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/orders/:id/cancel', requireAdmin(async (request, env, adminUser, ctx) => {
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

      ctx.waitUntil(
        fetchOrderEmailData(env, orderId).then((emailData) => {
          if (emailData) return sendOrderEmail(env, 'order_cancelled', emailData)
        }).catch((err) => console.error('order_cancelled email failed:', err))
      )

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
