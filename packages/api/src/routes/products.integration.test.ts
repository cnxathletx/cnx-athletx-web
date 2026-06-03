import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/products', () => {
  it('returns list of active products', async () => {
    const res = await workerFetch('/api/products')
    expect(res.status).toBe(200)

    const data = await res.json() as { products: Array<{ slug: string; price_thb: number }> }
    expect(data.products).toHaveLength(2)
    expect(data.products[0].slug).toBe('plant-protein-500g')
    expect(data.products[0].price_thb).toBe(89900)
  })
})

describe('GET /api/products/:slug', () => {
  it('returns product detail by slug', async () => {
    const res = await workerFetch('/api/products/plant-protein-500g')
    expect(res.status).toBe(200)

    const data = await res.json() as { product: { slug: string; name: string; price_thb: number } }
    expect(data.product.slug).toBe('plant-protein-500g')
    expect(data.product.name).toBe('CNX Plant Protein 500g')
  })

  it('embeds a sibling product under `related`', async () => {
    const res = await workerFetch('/api/products/plant-protein-500g')
    expect(res.status).toBe(200)

    const data = await res.json() as {
      related: { slug: string; name: string; price_thb: number } | null
    }
    expect(data.related).not.toBeNull()
    expect(data.related!.slug).not.toBe('plant-protein-500g')
  })

  it('returns related: null when the requested product is the only one', async () => {
    const res = await workerFetch('/api/products/plant-protein-1000g')
    expect(res.status).toBe(200)

    const data = await res.json() as {
      related: { slug: string } | null
    }
    expect(data.related).not.toBeNull()
    expect(data.related!.slug).toBe('plant-protein-500g')
  })

  it('returns 404 for non-existent slug', async () => {
    const res = await workerFetch('/api/products/does-not-exist')
    expect(res.status).toBe(404)
  })
})

describe('POST /api/products/:slug/waitlist', () => {
  it('creates a waitlist signup for an out-of-stock product', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })

    const res = await workerFetch('/api/products/plant-protein-500g/waitlist?locale=th', {
      body: { email: ' Notify@Example.COM ', marketing_consent: true },
    })

    expect(res.status).toBe(201)
    const data = await res.json() as { success: true }
    expect(data.success).toBe(true)
  })

  it('rejects waitlist signup while product is in stock', async () => {
    const res = await workerFetch('/api/products/plant-protein-500g/waitlist', {
      body: { email: 'stock@example.com', marketing_consent: false },
    })

    expect(res.status).toBe(409)
    const data = await res.json() as { error: string }
    expect(data.error).toBe('Product is in stock')
  })
})

describe('price_tiers in public product APIs', () => {
  it('exposes empty price_tiers array when none configured', async () => {
    const res = await workerFetch('/api/products')
    const data = await res.json() as { products: Array<{ slug: string; price_tiers: unknown[] }> }
    const p500 = data.products.find((p) => p.slug === 'plant-protein-500g')!
    expect(Array.isArray(p500.price_tiers)).toBe(true)
    expect(p500.price_tiers).toHaveLength(0)
  })

  it('returns configured tiers sorted by min_quantity in list and detail endpoints', async () => {
    // Create tiers in reverse order to verify ordering
    const r1 = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 10, unit_price_thb: 69900 },
    })
    expect(r1.status).toBe(201)
    const r2 = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    expect(r2.status).toBe(201)

    const listRes = await workerFetch('/api/products')
    const listData = await listRes.json() as {
      products: Array<{ slug: string; price_tiers: Array<{ min_quantity: number; unit_price_thb: number }> }>
    }
    const p500 = listData.products.find((p) => p.slug === 'plant-protein-500g')!
    expect(p500.price_tiers).toHaveLength(2)
    expect(p500.price_tiers[0].min_quantity).toBe(5)
    expect(p500.price_tiers[0].unit_price_thb).toBe(79900)
    expect(p500.price_tiers[1].min_quantity).toBe(10)
    expect(p500.price_tiers[1].unit_price_thb).toBe(69900)

    const detailRes = await workerFetch('/api/products/plant-protein-500g')
    const detailData = await detailRes.json() as {
      product: { price_tiers: Array<{ min_quantity: number; unit_price_thb: number }> }
    }
    expect(detailData.product.price_tiers).toHaveLength(2)
    expect(detailData.product.price_tiers[0].min_quantity).toBe(5)
  })
})
