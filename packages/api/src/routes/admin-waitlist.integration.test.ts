import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/admin/waitlist', () => {
  it('requires admin authentication', async () => {
    const res = await workerFetch('/api/admin/waitlist')
    expect(res.status).toBe(403)
  })

  it('lists active waitlist rows with product fields', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })
    await workerFetch('/api/products/plant-protein-500g/waitlist?locale=th', {
      body: { email: 'admin-list@example.com', marketing_consent: true },
    })

    const res = await workerFetch('/api/admin/waitlist?status=active', { admin: true })

    expect(res.status).toBe(200)
    const data = await res.json() as {
      waitlist: Array<{
        product_slug: string
        product_name: string
        email: string
        locale: string
        marketing_consent: boolean
        notified_at: string | null
      }>
    }
    expect(data.waitlist).toHaveLength(1)
    expect(data.waitlist[0]).toMatchObject({
      product_slug: 'plant-protein-500g',
      product_name: 'CNX Plant Protein 500g',
      email: 'admin-list@example.com',
      locale: 'th',
      marketing_consent: true,
      notified_at: null,
    })
  })

  it('rejects invalid status', async () => {
    const res = await workerFetch('/api/admin/waitlist?status=bad', { admin: true })
    expect(res.status).toBe(400)
  })
})
