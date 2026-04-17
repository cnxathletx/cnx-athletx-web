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
