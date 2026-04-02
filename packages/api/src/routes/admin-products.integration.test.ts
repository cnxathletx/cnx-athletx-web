import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/admin/products', () => {
  it('returns all products with inventory', async () => {
    const res = await workerFetch('/api/admin/products', { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as {
      products: Array<{
        id: number; slug: string; name: string; active: boolean
        stock_count: number; reserved_count: number; available_count: number
      }>
    }
    expect(data.products).toHaveLength(2)
    expect(data.products[0].slug).toBe('plant-protein-500g')
    expect(data.products[0].active).toBe(true)
    expect(data.products[0].stock_count).toBe(100)
    expect(data.products[0].available_count).toBe(100)
  })
})

describe('POST /api/admin/products', () => {
  it('creates a new product', async () => {
    const res = await workerFetch('/api/admin/products', {
      admin: true,
      body: {
        slug: 'bcaa-30-servings',
        name: 'BCAA 30 Servings',
        description: 'Branch chain amino acids supplement.',
        price_thb: 69900,
        weight_g: 300,
        image_url: '/images/products/bcaa.jpg',
        active: true,
        stock_count: 50,
      },
    })
    expect(res.status).toBe(201)

    const data = await res.json() as {
      success: boolean
      product: { id: number; slug: string; stock_count: number; available_count: number }
    }
    expect(data.success).toBe(true)
    expect(data.product.slug).toBe('bcaa-30-servings')
    expect(data.product.stock_count).toBe(50)
    expect(data.product.available_count).toBe(50)
  })

  it('rejects duplicate slug', async () => {
    const res = await workerFetch('/api/admin/products', {
      admin: true,
      body: {
        slug: 'plant-protein-500g', // already exists in seed
        name: 'Duplicate Product',
        description: 'This is a duplicate product for testing purposes.',
        price_thb: 10000,
        weight_g: 100,
        image_url: '/images/test.jpg',
        active: true,
        stock_count: 10,
      },
    })
    expect(res.status).toBe(409)

    const data = await res.json() as { details: Array<{ field: string }> }
    expect(data.details[0].field).toBe('slug')
  })

  it('rejects missing required fields', async () => {
    const res = await workerFetch('/api/admin/products', {
      admin: true,
      body: { slug: 'test' },
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/products/:id', () => {
  it('updates product name', async () => {
    const res = await workerFetch('/api/admin/products/1', {
      method: 'PATCH',
      admin: true,
      body: { name: 'Updated Protein 500g' },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { success: boolean; product: { name: string } }
    expect(data.success).toBe(true)
    expect(data.product.name).toBe('Updated Protein 500g')
  })

  it('updates product price', async () => {
    const res = await workerFetch('/api/admin/products/1', {
      method: 'PATCH',
      admin: true,
      body: { price_thb: 79900 },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { product: { price_thb: number } }
    expect(data.product.price_thb).toBe(79900)
  })

  it('deactivates a product', async () => {
    const res = await workerFetch('/api/admin/products/1', {
      method: 'PATCH',
      admin: true,
      body: { active: false },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { product: { active: boolean } }
    expect(data.product.active).toBe(false)

    // Deactivated product should not appear in public listing
    const publicRes = await workerFetch('/api/products')
    const publicData = await publicRes.json() as { products: Array<{ slug: string }> }
    expect(publicData.products).toHaveLength(1) // only the 1kg one remains
    expect(publicData.products[0].slug).toBe('plant-protein-1000g')
  })

  it('returns 404 for non-existent product', async () => {
    const res = await workerFetch('/api/admin/products/999', {
      method: 'PATCH',
      admin: true,
      body: { name: 'nope' },
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/inventory', () => {
  it('returns inventory for all products', async () => {
    const res = await workerFetch('/api/admin/inventory', { admin: true })
    expect(res.status).toBe(200)

    const data = await res.json() as {
      inventory: Array<{ product_id: number; stock_count: number; available_count: number }>
    }
    expect(data.inventory).toHaveLength(2)
    expect(data.inventory[0].stock_count).toBe(100)
  })
})

describe('PATCH /api/admin/inventory/:productId', () => {
  it('adds stock', async () => {
    const res = await workerFetch('/api/admin/inventory/1', {
      method: 'PATCH',
      admin: true,
      body: { adjustment: 50, notes: 'Restocking' },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { success: boolean; inventory: { stock_count: number; available_count: number } }
    expect(data.success).toBe(true)
    expect(data.inventory.stock_count).toBe(150)
    expect(data.inventory.available_count).toBe(150)
  })

  it('reduces stock', async () => {
    const res = await workerFetch('/api/admin/inventory/1', {
      method: 'PATCH',
      admin: true,
      body: { adjustment: -30, notes: 'Damaged goods' },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { inventory: { stock_count: number } }
    expect(data.inventory.stock_count).toBe(70)
  })

  it('does not go below zero', async () => {
    const res = await workerFetch('/api/admin/inventory/1', {
      method: 'PATCH',
      admin: true,
      body: { adjustment: -200 },
    })
    expect(res.status).toBe(200)

    const data = await res.json() as { inventory: { stock_count: number } }
    expect(data.inventory.stock_count).toBe(0) // MAX(stock_count + adjustment, 0)
  })

  it('returns 404 for non-existent product', async () => {
    const res = await workerFetch('/api/admin/inventory/999', {
      method: 'PATCH',
      admin: true,
      body: { adjustment: 10 },
    })
    expect(res.status).toBe(404)
  })
})
