import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/admin/products/:id/price-tiers', () => {
  it('returns empty array when none configured', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers', { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as { price_tiers: unknown[] }
    expect(data.price_tiers).toEqual([])
  })

  it('requires admin auth', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers')
    expect(res.status).toBe(403)
  })
})

describe('POST /api/admin/products/:id/price-tiers', () => {
  it('creates a tier and returns it', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    expect(res.status).toBe(201)

    const data = await res.json() as {
      success: boolean
      price_tier: { id: number; product_id: number; min_quantity: number; unit_price_thb: number }
    }
    expect(data.success).toBe(true)
    expect(data.price_tier.product_id).toBe(1)
    expect(data.price_tier.min_quantity).toBe(5)
    expect(data.price_tier.unit_price_thb).toBe(79900)
    expect(data.price_tier.id).toBeGreaterThan(0)
  })

  it('rejects min_quantity < 2', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 1, unit_price_thb: 79900 },
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ field: string }> }
    expect(data.details.some((d) => d.field === 'min_quantity')).toBe(true)
  })

  it('rejects unit_price_thb <= 0', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 0 },
    })
    expect(res.status).toBe(400)
  })

  it('rejects duplicate min_quantity for the same product', async () => {
    const ok = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    expect(ok.status).toBe(201)

    const dup = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 75000 },
    })
    expect(dup.status).toBe(409)
  })

  it('returns 404 for unknown product', async () => {
    const res = await workerFetch('/api/admin/products/999/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/products/:id/price-tiers/:tierId', () => {
  it('updates an existing tier', async () => {
    const createRes = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    const created = (await createRes.json() as { price_tier: { id: number } }).price_tier

    const patchRes = await workerFetch(`/api/admin/products/1/price-tiers/${created.id}`, {
      method: 'PATCH',
      admin: true,
      body: { min_quantity: 6, unit_price_thb: 74900 },
    })
    expect(patchRes.status).toBe(200)

    const data = await patchRes.json() as {
      price_tier: { min_quantity: number; unit_price_thb: number }
    }
    expect(data.price_tier.min_quantity).toBe(6)
    expect(data.price_tier.unit_price_thb).toBe(74900)
  })

  it('returns 404 when tier belongs to a different product', async () => {
    const createRes = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    const created = (await createRes.json() as { price_tier: { id: number } }).price_tier

    const res = await workerFetch(`/api/admin/products/2/price-tiers/${created.id}`, {
      method: 'PATCH',
      admin: true,
      body: { min_quantity: 6, unit_price_thb: 74900 },
    })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/admin/products/:id/price-tiers/:tierId', () => {
  it('removes the tier', async () => {
    const createRes = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    const created = (await createRes.json() as { price_tier: { id: number } }).price_tier

    const delRes = await workerFetch(`/api/admin/products/1/price-tiers/${created.id}`, {
      method: 'DELETE',
      admin: true,
    })
    expect(delRes.status).toBe(200)

    const listRes = await workerFetch('/api/admin/products/1/price-tiers', { admin: true })
    const listData = await listRes.json() as { price_tiers: unknown[] }
    expect(listData.price_tiers).toEqual([])
  })

  it('returns 404 when the tier does not exist', async () => {
    const res = await workerFetch('/api/admin/products/1/price-tiers/99999', {
      method: 'DELETE',
      admin: true,
    })
    expect(res.status).toBe(404)
  })
})
