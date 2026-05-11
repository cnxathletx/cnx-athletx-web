import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/account/orders', () => {
  it('returns 401 without authentication', async () => {
    const res = await workerFetch('/api/account/orders')
    expect(res.status).toBe(401)
  })

  it('returns empty orders for new user', async () => {
    const cookie = await loginAs('fresh@example.com')

    const res = await workerFetch('/api/account/orders', { cookie })
    expect(res.status).toBe(200)

    const data = await res.json() as { orders: unknown[]; pagination: { total: number } }
    expect(data.orders).toHaveLength(0)
    expect(data.pagination.total).toBe(0)
  })

  it('returns orders placed by authenticated user', async () => {
    const email = 'shopper@example.com'
    const cookie = await loginAs(email)

    // Place an order while logged in
    await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({ customer: { name: 'Shopper', email, phone: '+66899999999', address: { line1: '456 Test Road, Unit 5', district: 'San Sai', province: 'Chiang Mai', postal_code: '50210' } } }),
    })

    const res = await workerFetch('/api/account/orders', { cookie })
    const data = await res.json() as { orders: Array<{ id: string; status: string }>; pagination: { total: number } }
    expect(data.orders).toHaveLength(1)
    expect(data.orders[0].status).toBe('pending_payment')
    expect(data.pagination.total).toBe(1)
  })

  it('links guest orders to user after first login', async () => {
    const email = 'latejoin@example.com'

    // Place order as guest
    await workerFetch('/api/checkout', {
      body: checkoutBody({ customer: { name: 'Late Join', email, phone: '+66811111111', address: { line1: '789 Guest Street, Room 3', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' } } }),
    })

    // Now log in — verify endpoint backfills user_id on orders
    const cookie = await loginAs(email)

    const res = await workerFetch('/api/account/orders', { cookie })
    const data = await res.json() as { orders: Array<{ id: string }>; pagination: { total: number } }
    expect(data.orders).toHaveLength(1)
    expect(data.pagination.total).toBe(1)
  })
})

describe('GET /api/account/loyalty', () => {
  it('returns 401 without authentication', async () => {
    const res = await workerFetch('/api/account/loyalty')
    expect(res.status).toBe(401)
  })

  it('returns balance and recent ledger entries', async () => {
    const email = 'loyalty@example.com'
    const cookie = await loginAs(email)
    await workerFetch('/api/__test-loyalty-ledger', {
      method: 'POST',
      admin: true,
      body: { email, points_delta: 25, kind: 'manual_adjustment', reason: 'test seed' },
    })

    const res = await workerFetch('/api/account/loyalty', { cookie })
    expect(res.status).toBe(200)
    const data = await res.json() as { balance_points: number; entries: Array<{ points_delta: number; reason: string }> }
    expect(data.balance_points).toBe(25)
    expect(data.entries[0].points_delta).toBe(25)
    expect(data.entries[0].reason).toBe('test seed')
  })

  it('awards missing points for paid guest orders when the customer logs in later', async () => {
    const email = 'latepoints@example.com'
    const checkout = await workerFetch('/api/checkout', {
      body: checkoutBody({
        customer: {
          name: 'Late Points',
          email,
          phone: '+66812345678',
          address: { line1: '123 Test Street, Apt 4', district: 'Mueang', province: 'Chiang Mai', postal_code: '50200' },
        },
      }),
    })
    const { order_id } = await checkout.json() as { order_id: string }
    await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { method: 'POST', admin: true })

    const cookie = await loginAs(email)
    const summary = await workerFetch('/api/account/loyalty', { cookie })
    const data = await summary.json() as { balance_points: number }
    expect(data.balance_points).toBe(89)
  })
})

describe('PATCH /api/account/address', () => {
  it('returns 401 without authentication', async () => {
    const res = await workerFetch('/api/account/address', {
      method: 'PATCH',
      body: { line1: '123 Test', district: 'Mueang', province: 'CM', postal_code: '50200' },
    })
    expect(res.status).toBe(401)
  })

  it('saves address for authenticated user', async () => {
    const cookie = await loginAs('addr@example.com')

    const address = {
      line1: '123 Nimmanhaemin Road, Suite 7',
      line2: 'Soi 5',
      subdistrict: 'Suthep',
      district: 'Suthep',
      province: 'Chiang Mai',
      postal_code: '50200',
    }

    const res = await workerFetch('/api/account/address', {
      method: 'PATCH',
      cookie,
      body: address,
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { success: boolean; address: { line1: string; district: string } }
    expect(data.success).toBe(true)
    expect(data.address.line1).toBe('123 Nimmanhaemin Road, Suite 7')
    expect(data.address.district).toBe('Suthep')
  })

  it('retrieves saved address', async () => {
    const cookie = await loginAs('getaddr@example.com')

    await workerFetch('/api/account/address', {
      method: 'PATCH',
      cookie,
      body: { line1: '999 Huay Kaew Road, Building B', subdistrict: 'Chang Phueak', district: 'Mueang', province: 'Chiang Mai', postal_code: '50300' },
    })

    const res = await workerFetch('/api/account/address', { cookie })
    expect(res.status).toBe(200)

    const data = await res.json() as { address: { line1: string; postal_code: string } }
    expect(data.address.line1).toBe('999 Huay Kaew Road, Building B')
    expect(data.address.postal_code).toBe('50300')
  })

  it('returns null address for user without saved address', async () => {
    const cookie = await loginAs('noaddr@example.com')

    const res = await workerFetch('/api/account/address', { cookie })
    const data = await res.json() as { address: null }
    expect(data.address).toBeNull()
  })

  it('rejects invalid address (short line1)', async () => {
    const cookie = await loginAs('badaddr@example.com')

    const res = await workerFetch('/api/account/address', {
      method: 'PATCH',
      cookie,
      body: { line1: 'Hi', district: 'Mueang', province: 'CM', postal_code: '50200' },
    })
    expect(res.status).toBe(400)
  })

  it('rejects invalid postal code', async () => {
    const cookie = await loginAs('badzip@example.com')

    const res = await workerFetch('/api/account/address', {
      method: 'PATCH',
      cookie,
      body: { line1: '123 Valid Street Address', district: 'Mueang', province: 'CM', postal_code: '123' },
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/account/last-address', () => {
  it('returns saved address if set', async () => {
    const cookie = await loginAs('last@example.com')

    await workerFetch('/api/account/address', {
      method: 'PATCH',
      cookie,
      body: { line1: '555 Saved Address Lane, Floor 3', subdistrict: 'Suthep', district: 'Suthep', province: 'Chiang Mai', postal_code: '50200' },
    })

    const res = await workerFetch('/api/account/last-address', { cookie })
    expect(res.status).toBe(200)

    const data = await res.json() as { address: { line1: string } }
    expect(data.address.line1).toBe('555 Saved Address Lane, Floor 3')
  })

  it('falls back to latest order address', async () => {
    const email = 'fallback@example.com'
    const cookie = await loginAs(email)

    // Place order (no saved address set)
    await workerFetch('/api/checkout', {
      cookie,
      body: checkoutBody({ customer: { name: 'Fallback User', email, phone: '+66899999999', address: { line1: '777 Order Address Street', district: 'San Kamphaeng', province: 'Chiang Mai', postal_code: '50130' } } }),
    })

    const res = await workerFetch('/api/account/last-address', { cookie })
    const data = await res.json() as { address: { line1: string; district: string } }
    expect(data.address.line1).toBe('777 Order Address Street')
    expect(data.address.district).toBe('San Kamphaeng')
  })

  it('returns null when no address exists', async () => {
    const cookie = await loginAs('empty@example.com')

    const res = await workerFetch('/api/account/last-address', { cookie })
    const data = await res.json() as { address: null }
    expect(data.address).toBeNull()
  })
})

describe('PATCH /api/account/profile', () => {
  it('returns 401 without authentication', async () => {
    const res = await workerFetch('/api/account/profile', {
      method: 'PATCH',
      body: { name: 'Test' },
    })
    expect(res.status).toBe(401)
  })

  it('updates name and phone', async () => {
    const cookie = await loginAs('profile@example.com')

    const res = await workerFetch('/api/account/profile', {
      method: 'PATCH',
      cookie,
      body: { name: 'Updated Name', phone: '+66812345678' },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { user: { name: string; phone: string; email: string } }
    expect(data.user.name).toBe('Updated Name')
    expect(data.user.phone).toBe('+66812345678')
    expect(data.user.email).toBe('profile@example.com')
  })

  it('updates only name (partial update)', async () => {
    const cookie = await loginAs('partial@example.com')

    const res = await workerFetch('/api/account/profile', {
      method: 'PATCH',
      cookie,
      body: { name: 'Only Name' },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { user: { name: string } }
    expect(data.user.name).toBe('Only Name')
  })

  it('persists profile changes across requests', async () => {
    const cookie = await loginAs('persist@example.com')

    await workerFetch('/api/account/profile', {
      method: 'PATCH',
      cookie,
      body: { name: 'Persisted Name', phone: '+66800000000' },
    })

    const meRes = await workerFetch('/api/auth/me', { cookie })
    const meData = await meRes.json() as { user: { name: string; phone: string } }
    expect(meData.user.name).toBe('Persisted Name')
    expect(meData.user.phone).toBe('+66800000000')
  })
})
