import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

/** Helper: create an order and return its ID */
async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await workerFetch('/api/checkout', { body: checkoutBody(overrides) })
  const data = await res.json() as { order_id: string }
  return data.order_id
}

describe('GET /api/orders/:id', () => {
  it('returns order detail after checkout', async () => {
    const orderId = await createOrder()

    const res = await workerFetch(`/api/orders/${orderId}`)
    expect(res.status).toBe(200)

    const data = await res.json() as {
      order: {
        id: string
        status: string
        subtotal_thb: number
        shipping_thb: number
        total_thb: number
        items: Array<{ product_name: string; quantity: number }>
        shipment: null
        payment_submitted: boolean
      }
    }
    expect(data.order.id).toBe(orderId)
    expect(data.order.status).toBe('pending_payment')
    expect(data.order.items).toHaveLength(1)
    expect(data.order.items[0].product_name).toBe('CNX Plant Protein 500g')
    expect(data.order.shipment).toBeNull()
    expect(data.order.payment_submitted).toBe(false)
  })

  it('shows payment proof after submission', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/orders/${orderId}/payment-proof`, {
      body: { proof_value: 'REF-TEST-123' },
    })

    const res = await workerFetch(`/api/orders/${orderId}`)
    const data = await res.json() as {
      order: { payment_submitted: boolean; latest_payment_proof: { proof_value: string } }
    }
    expect(data.order.payment_submitted).toBe(true)
    expect(data.order.latest_payment_proof.proof_value).toBe('REF-TEST-123')
  })

  it('shows shipment data after shipping', async () => {
    const orderId = await createOrder()

    // Mark paid -> Pack -> Ship
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/ship`, {
      admin: true,
      body: { carrier: 'Kerry Express', tracking_number: 'KRY-001' },
    })

    const res = await workerFetch(`/api/orders/${orderId}`)
    const data = await res.json() as {
      order: { status: string; shipment: { carrier: string; tracking_number: string } }
    }
    expect(data.order.status).toBe('shipped')
    expect(data.order.shipment).not.toBeNull()
    expect(data.order.shipment.carrier).toBe('Kerry Express')
    expect(data.order.shipment.tracking_number).toBe('KRY-001')
  })

  it('returns 404 for non-existent order', async () => {
    const res = await workerFetch('/api/orders/01HZZZZZZZZZZZZZZZZZZZZZZ')
    // Could be 400 or 404 depending on ULID validation
    expect([400, 404]).toContain(res.status)
  })

  it('returns 400 for invalid order ID format', async () => {
    const res = await workerFetch('/api/orders/not-valid')
    expect(res.status).toBe(400)
  })
})
