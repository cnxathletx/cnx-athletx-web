import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function createOrder(): Promise<void> {
  const res = await workerFetch('/api/checkout', { body: checkoutBody() })
  expect(res.status).toBe(201)
}

describe('GET /api/admin/reports/analytics', () => {
  it('requires admin auth', async () => {
    const res = await workerFetch('/api/admin/reports/analytics')
    expect(res.status).toBe(403)
  })

  it('returns visitor availability and order counts for the current periods', async () => {
    await createOrder()
    await createOrder()

    const res = await workerFetch('/api/admin/reports/analytics', { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as {
      visitors: {
        status: 'ok' | 'unconfigured' | 'error'
        today: number | null
        week: number | null
        month: number | null
      }
      orders: {
        today: number
        week: number
        month: number
      }
    }

    expect(['ok', 'unconfigured', 'error']).toContain(data.visitors.status)
    if (data.visitors.status === 'ok') {
      expect(typeof data.visitors.today).toBe('number')
      expect(typeof data.visitors.week).toBe('number')
      expect(typeof data.visitors.month).toBe('number')
    } else {
      expect(data.visitors.today).toBeNull()
      expect(data.visitors.week).toBeNull()
      expect(data.visitors.month).toBeNull()
    }
    expect(data.orders).toEqual({
      today: 2,
      week: 2,
      month: 2,
    })
  })
})
