import type { RouterType } from 'itty-router'
import type { Env, OrderRow, OrderItemRow, ShipmentRow, PaymentProofRow } from '../lib/types'
import { isValidOrderId } from '../lib/utils'

export function registerOrderRoutes(router: RouterType) {
  router.get('/api/orders/:id', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const id = url.pathname.split('/').pop() || ''

    if (!isValidOrderId(id)) {
      return Response.json({ error: 'Invalid order ID format' }, { status: 400 })
    }

    try {
      const order = await env.DB.prepare(
        `SELECT id, status, subtotal_thb, shipping_thb, discount_thb, total_thb, created_at
         FROM orders WHERE id = ? LIMIT 1`
      )
        .bind(id.toUpperCase())
        .first<OrderRow>()

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
        .bind(id.toUpperCase())
        .all<OrderItemRow>()

      const shipment = await env.DB.prepare(
        `SELECT carrier, tracking_number, shipped_at
         FROM shipments WHERE order_id = ? LIMIT 1`
      )
        .bind(id.toUpperCase())
        .first<ShipmentRow>()

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
}
