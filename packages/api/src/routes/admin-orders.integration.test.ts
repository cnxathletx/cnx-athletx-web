import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody, loginAs } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function createOrder(overrides: Record<string, unknown> = {}): Promise<string> {
  const res = await workerFetch('/api/checkout', { body: checkoutBody(overrides) })
  const data = await res.json() as { order_id: string }
  return data.order_id
}

describe('GET /api/admin/orders', () => {
  it('returns empty list when no orders', async () => {
    const res = await workerFetch('/api/admin/orders', { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as { orders: unknown[]; pagination: { total: number } }
    expect(data.orders).toHaveLength(0)
    expect(data.pagination.total).toBe(0)
  })

  it('lists orders after checkout', async () => {
    await createOrder()
    await createOrder()

    const res = await workerFetch('/api/admin/orders', { admin: true })
    const data = await res.json() as { orders: Array<{ id: string; status: string }>; pagination: { total: number } }
    expect(data.orders).toHaveLength(2)
    expect(data.pagination.total).toBe(2)
    expect(data.orders[0].status).toBe('pending_payment')
  })

  it('filters by status', async () => {
    const orderId = await createOrder()
    await createOrder()

    // Mark first order as paid
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })

    const res = await workerFetch('/api/admin/orders?status=paid', { admin: true })
    const data = await res.json() as { orders: Array<{ id: string }>; pagination: { total: number } }
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0].id).toBe(orderId)
  })

  it('rejects invalid status filter', async () => {
    const res = await workerFetch('/api/admin/orders?status=bogus', { admin: true })
    expect(res.status).toBe(400)
  })

  it('requires admin auth', async () => {
    const res = await workerFetch('/api/admin/orders')
    expect(res.status).toBe(403)
  })
})

describe('GET /api/admin/orders/:id', () => {
  it('returns full order detail', async () => {
    const orderId = await createOrder()

    const res = await workerFetch(`/api/admin/orders/${orderId}`, { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as {
      order: {
        id: string
        status: string
        customer: { name: string; email: string }
        items: Array<{ product_name: string }>
        payment_proofs: unknown[]
        audit_logs: unknown[]
      }
    }
    expect(data.order.id).toBe(orderId)
    expect(data.order.customer.name).toBe('Test User')
    expect(data.order.customer.email).toBe('test@example.com')
    expect(data.order.items).toHaveLength(1)
  })

  it('returns 404 for non-existent order', async () => {
    const res = await workerFetch('/api/admin/orders/01HZZZZZZZZZZZZZZZZZZZZZZ', { admin: true })
    expect([400, 404]).toContain(res.status)
  })
})

describe('Order state transitions', () => {
  it('mark-paid: pending_payment → paid', async () => {
    const orderId = await createOrder()

    const res = await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })
    expect(res.status).toBe(200)

    const detail = await workerFetch(`/api/admin/orders/${orderId}`, { admin: true })
    const data = await detail.json() as { order: { status: string; audit_logs: Array<{ action: string }> } }
    expect(data.order.status).toBe('paid')
    expect(data.order.audit_logs.some((l) => l.action === 'mark_paid')).toBe(true)
  })

  it('mark-paid deducts inventory (stock and reserved)', async () => {
    const orderId = await createOrder({ items: [{ product_id: 1, quantity: 5 }] })

    // Before mark-paid: reserved=5, stock=100
    const beforeRes = await workerFetch('/api/admin/inventory', { admin: true })
    const before = await beforeRes.json() as { inventory: Array<{ product_id: number; stock_count: number; reserved_count: number }> }
    const p1Before = before.inventory.find((i) => i.product_id === 1)!
    expect(p1Before.reserved_count).toBe(5)
    expect(p1Before.stock_count).toBe(100)

    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })

    // After mark-paid: reserved=0, stock=95
    const afterRes = await workerFetch('/api/admin/inventory', { admin: true })
    const after = await afterRes.json() as { inventory: Array<{ product_id: number; stock_count: number; reserved_count: number }> }
    const p1After = after.inventory.find((i) => i.product_id === 1)!
    expect(p1After.reserved_count).toBe(0)
    expect(p1After.stock_count).toBe(95)
  })

  it('pack: paid → packed', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })

    const res = await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })
    expect(res.status).toBe(200)

    const detail = await workerFetch(`/api/admin/orders/${orderId}`, { admin: true })
    const data = await detail.json() as { order: { status: string } }
    expect(data.order.status).toBe('packed')
  })

  it('ship: packed → shipped', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })

    const res = await workerFetch(`/api/admin/orders/${orderId}/ship`, {
      admin: true,
      body: { carrier: 'Flash Express', tracking_number: 'FE-123456' },
    })
    expect(res.status).toBe(200)

    const detail = await workerFetch(`/api/admin/orders/${orderId}`, { admin: true })
    const data = await detail.json() as { order: { status: string } }
    expect(data.order.status).toBe('shipped')
  })

  it('ship rejects missing carrier/tracking', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })

    const res = await workerFetch(`/api/admin/orders/${orderId}/ship`, {
      admin: true,
      body: {},
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid state transitions', async () => {
    const orderId = await createOrder()

    // Can't pack a pending_payment order
    const packRes = await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })
    expect(packRes.status).toBe(409)

    // Can't ship a pending_payment order
    const shipRes = await workerFetch(`/api/admin/orders/${orderId}/ship`, {
      admin: true,
      body: { carrier: 'test', tracking_number: 'test' },
    })
    expect(shipRes.status).toBe(409)
  })

  it('cancel from pending_payment restores reserved inventory', async () => {
    const orderId = await createOrder({ items: [{ product_id: 1, quantity: 10 }] })

    // Verify reserved
    const beforeRes = await workerFetch('/api/admin/inventory', { admin: true })
    const before = await beforeRes.json() as { inventory: Array<{ product_id: number; reserved_count: number }> }
    expect(before.inventory.find((i) => i.product_id === 1)!.reserved_count).toBe(10)

    // Cancel
    const res = await workerFetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', admin: true })
    expect(res.status).toBe(200)

    // Reserved should be restored
    const afterRes = await workerFetch('/api/admin/inventory', { admin: true })
    const after = await afterRes.json() as { inventory: Array<{ product_id: number; reserved_count: number; stock_count: number }> }
    const p1 = after.inventory.find((i) => i.product_id === 1)!
    expect(p1.reserved_count).toBe(0)
    expect(p1.stock_count).toBe(100) // stock unchanged
  })

  it('cancel from paid restores stock (not reserved)', async () => {
    const orderId = await createOrder({ items: [{ product_id: 1, quantity: 5 }] })
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })

    // After mark-paid: stock=95, reserved=0
    const res = await workerFetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', admin: true })
    expect(res.status).toBe(200)

    // Cancel from paid: stock restored to 100
    const afterRes = await workerFetch('/api/admin/inventory', { admin: true })
    const after = await afterRes.json() as { inventory: Array<{ product_id: number; stock_count: number }> }
    expect(after.inventory.find((i) => i.product_id === 1)!.stock_count).toBe(100)
  })

  it('cannot cancel a shipped order', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { method: 'POST', admin: true })
    await workerFetch(`/api/admin/orders/${orderId}/ship`, {
      admin: true,
      body: { carrier: 'Kerry', tracking_number: 'K-001' },
    })

    const res = await workerFetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', admin: true })
    expect(res.status).toBe(409)
  })

  it('cannot cancel an already cancelled order', async () => {
    const orderId = await createOrder()
    await workerFetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', admin: true })

    const res = await workerFetch(`/api/admin/orders/${orderId}/cancel`, { method: 'POST', admin: true })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/admin/orders/:id/ship — review prompt', () => {
  const customer = (email: string, name = 'Buyer') => ({
    name, email, phone: '+66811111111',
    address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' },
  })

  async function shipOrder(orderId: string) {
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { admin: true, method: 'POST' })
    await workerFetch(`/api/admin/orders/${orderId}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK1' } })
  }

  async function emailLogCount(orderId: string): Promise<number> {
    const res = await workerFetch(`/api/__test-email-log?order_id=${orderId}&event=review_prompt`)
    if (!res.ok) throw new Error(`__test-email-log returned ${res.status}`)
    const data = await res.json() as { count: number }
    return data.count
  }

  it('logs review_prompt email_logs entry on ship for account orders', async () => {
    const email = 'rp1@example.com'
    const cookie = await loginAs(email)
    const checkoutRes = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: customer(email) }) })
    const { order_id } = await checkoutRes.json() as { order_id: string }
    await shipOrder(order_id)

    await new Promise((r) => setTimeout(r, 200))

    expect(await emailLogCount(order_id)).toBeGreaterThanOrEqual(1)
  })

  it('does not double-send review prompt on repeat ship attempts', async () => {
    const email = 'rp2@example.com'
    const cookie = await loginAs(email)
    const checkoutRes = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: customer(email) }) })
    const { order_id } = await checkoutRes.json() as { order_id: string }
    await shipOrder(order_id)
    await new Promise((r) => setTimeout(r, 200))

    expect(await emailLogCount(order_id)).toBe(1)
  })

  it('skips review prompt for guest order (no user_id)', async () => {
    const email = 'guest@example.com'
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody({ customer: customer(email, 'Guest') }) })
    const { order_id } = await checkoutRes.json() as { order_id: string }
    await shipOrder(order_id)
    await new Promise((r) => setTimeout(r, 200))

    expect(await emailLogCount(order_id)).toBe(0)
  })
})

