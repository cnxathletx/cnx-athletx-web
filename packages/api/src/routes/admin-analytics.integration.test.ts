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

    expect(data.visitors).toEqual({
      status: 'unconfigured',
      today: null,
      week: null,
      month: null,
    })
    expect(data.orders).toEqual({
      today: 2,
      week: 2,
      month: 2,
    })
  })
})
