import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await workerFetch('/api/health')
    expect(res.status).toBe(200)

    const data = await res.json() as { ok: boolean; service: string; timestamp: string }
    expect(data.ok).toBe(true)
    expect(data.service).toBe('cnx-athletx-api')
    expect(data.timestamp).toBeTruthy()
  })
})

describe('GET /api/health/db', () => {
  it('returns db connected', async () => {
    const res = await workerFetch('/api/health/db')
    expect(res.status).toBe(200)

    const data = await res.json() as { ok: boolean; db: string }
    expect(data.ok).toBe(true)
    expect(data.db).toBe('connected')
  })
})

describe('CORS headers', () => {
  it('returns CORS headers for allowed origin', async () => {
    const res = await workerFetch('/api/health', {
      headers: { Origin: 'http://localhost:5171' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5171')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('does not return CORS allow for disallowed origin', async () => {
    const res = await workerFetch('/api/health', {
      headers: { Origin: 'https://evil.com' },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('returns Vary: Origin when no Origin header sent', async () => {
    const res = await workerFetch('/api/health')
    expect(res.headers.get('Vary')).toBe('Origin')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('Admin order pagination & search', () => {
  async function createOrder(email = 'test@example.com', name = 'Test User'): Promise<string> {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({
        customer: {
          name,
          email,
          phone: '+66812345678',
          address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    const data = await res.json() as { order_id: string }
    return data.order_id
  }

  it('paginates results', async () => {
    // Create 3 orders
    await createOrder()
    await createOrder()
    await createOrder()

    // Page 1, limit 2
    const res1 = await workerFetch('/api/admin/orders?page=1&limit=2', { admin: true })
    const data1 = await res1.json() as { orders: unknown[]; pagination: { page: number; limit: number; total: number } }
    expect(data1.orders).toHaveLength(2)
    expect(data1.pagination.total).toBe(3)
    expect(data1.pagination.page).toBe(1)
    expect(data1.pagination.limit).toBe(2)

    // Page 2, limit 2
    const res2 = await workerFetch('/api/admin/orders?page=2&limit=2', { admin: true })
    const data2 = await res2.json() as { orders: unknown[]; pagination: { page: number; total: number } }
    expect(data2.orders).toHaveLength(1)
    expect(data2.pagination.page).toBe(2)
  })

  it('searches orders by customer name', async () => {
    await createOrder('a@example.com', 'Alice Smith')
    await createOrder('b@example.com', 'Bob Jones')

    const res = await workerFetch('/api/admin/orders?q=Alice', { admin: true })
    const data = await res.json() as { orders: Array<{ customer_name: string }> }
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0].customer_name).toBe('Alice Smith')
  })

  it('searches orders by order ID', async () => {
    const orderId = await createOrder()
    await createOrder()

    // Search by partial order ID
    const partial = orderId.slice(0, 10)
    const res = await workerFetch(`/api/admin/orders?q=${partial}`, { admin: true })
    const data = await res.json() as { orders: Array<{ id: string }> }
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0].id).toBe(orderId)
  })

  it('combines status filter with search', async () => {
    const id1 = await createOrder('alice@example.com', 'Alice')
    await createOrder('bob@example.com', 'Bob')

    // Mark Alice's order as paid
    await workerFetch(`/api/admin/orders/${id1}/mark-paid`, { method: 'POST', admin: true })

    // Search paid orders for "Alice"
    const res = await workerFetch('/api/admin/orders?status=paid&q=Alice', { admin: true })
    const data = await res.json() as { orders: Array<{ id: string }>; pagination: { total: number } }
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0].id).toBe(id1)

    // Search paid orders for "Bob" — should be empty
    const res2 = await workerFetch('/api/admin/orders?status=paid&q=Bob', { admin: true })
    const data2 = await res2.json() as { orders: unknown[] }
    expect(data2.orders).toHaveLength(0)
  })

  it('returns empty results for non-matching search', async () => {
    await createOrder()

    const res = await workerFetch('/api/admin/orders?q=ZZZZNOTFOUND', { admin: true })
    const data = await res.json() as { orders: unknown[]; pagination: { total: number } }
    expect(data.orders).toHaveLength(0)
    expect(data.pagination.total).toBe(0)
  })
})
