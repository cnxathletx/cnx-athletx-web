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
        screenshots: Array<{ id: number; url: string; sort_order: number }>
      }>
    }
    expect(data.products).toHaveLength(2)
    expect(data.products[0].slug).toBe('plant-protein-500g')
    expect(data.products[0].active).toBe(true)
    expect(data.products[0].stock_count).toBe(100)
    expect(data.products[0].available_count).toBe(100)
    expect(Array.isArray(data.products[0].screenshots)).toBe(true)
    expect(data.products[0].screenshots).toHaveLength(0)
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

describe('Product screenshots', () => {
  const sampleUrl = '/images/screenshots/a.jpg'
  const otherUrl = '/images/screenshots/b.jpg'

  it('adds screenshots with incrementing sort_order and returns them on product fetch', async () => {
    const addA = await workerFetch('/api/admin/products/1/images', {
      admin: true,
      body: { url: sampleUrl },
    })
    expect(addA.status).toBe(201)

    const addB = await workerFetch('/api/admin/products/1/images', {
      admin: true,
      body: { url: otherUrl },
    })
    expect(addB.status).toBe(201)

    const listRes = await workerFetch('/api/admin/products', { admin: true })
    const list = await listRes.json() as {
      products: Array<{ id: number; screenshots: Array<{ id: number; url: string; sort_order: number }> }>
    }
    const target = list.products.find((p) => p.id === 1)!
    expect(target.screenshots).toHaveLength(2)
    expect(target.screenshots[0].url).toBe(sampleUrl)
    expect(target.screenshots[0].sort_order).toBe(0)
    expect(target.screenshots[1].url).toBe(otherUrl)
    expect(target.screenshots[1].sort_order).toBe(1)
  })

  it('rejects invalid url', async () => {
    const res = await workerFetch('/api/admin/products/1/images', {
      admin: true,
      body: { url: 'not a url' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent product', async () => {
    const res = await workerFetch('/api/admin/products/999/images', {
      admin: true,
      body: { url: sampleUrl },
    })
    expect(res.status).toBe(404)
  })

  it('reorders screenshots', async () => {
    const addA = await workerFetch('/api/admin/products/1/images', { admin: true, body: { url: sampleUrl } })
    const addB = await workerFetch('/api/admin/products/1/images', { admin: true, body: { url: otherUrl } })
    const a = (await addA.json() as { screenshots: Array<{ id: number }> }).screenshots[0]
    const b = (await addB.json() as { screenshots: Array<{ id: number }> }).screenshots[1]

    const reorderRes = await workerFetch('/api/admin/products/1/images/reorder', {
      method: 'PATCH',
      admin: true,
      body: { image_ids: [b.id, a.id] },
    })
    expect(reorderRes.status).toBe(200)

    const data = await reorderRes.json() as { screenshots: Array<{ id: number; sort_order: number }> }
    expect(data.screenshots[0].id).toBe(b.id)
    expect(data.screenshots[0].sort_order).toBe(0)
    expect(data.screenshots[1].id).toBe(a.id)
    expect(data.screenshots[1].sort_order).toBe(1)
  })

  it('rejects reorder with mismatched ids', async () => {
    await workerFetch('/api/admin/products/1/images', { admin: true, body: { url: sampleUrl } })

    const res = await workerFetch('/api/admin/products/1/images/reorder', {
      method: 'PATCH',
      admin: true,
      body: { image_ids: [9999] },
    })
    expect(res.status).toBe(400)
  })

  it('deletes a screenshot', async () => {
    const addRes = await workerFetch('/api/admin/products/1/images', { admin: true, body: { url: sampleUrl } })
    const added = (await addRes.json() as { screenshots: Array<{ id: number }> }).screenshots[0]

    const delRes = await workerFetch(`/api/admin/products/1/images/${added.id}`, {
      method: 'DELETE',
      admin: true,
    })
    expect(delRes.status).toBe(200)

    const data = await delRes.json() as { screenshots: unknown[] }
    expect(data.screenshots).toHaveLength(0)
  })

  it('returns 404 deleting a missing screenshot', async () => {
    const res = await workerFetch('/api/admin/products/1/images/9999', {
      method: 'DELETE',
      admin: true,
    })
    expect(res.status).toBe(404)
  })

  it('exposes screenshots on public product detail endpoint', async () => {
    await workerFetch('/api/admin/products/1/images', { admin: true, body: { url: sampleUrl } })

    const res = await workerFetch('/api/products/plant-protein-500g')
    const data = await res.json() as { product: { screenshots: Array<{ url: string }> } }
    expect(data.product.screenshots).toHaveLength(1)
    expect(data.product.screenshots[0].url).toBe(sampleUrl)
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

  it('marks waitlist rows notified when stock transitions from out of stock to available', async () => {
    await workerFetch('/api/admin/inventory/1', { admin: true, method: 'PATCH', body: { adjustment: -100 } })
    await workerFetch('/api/products/plant-protein-500g/waitlist', {
      body: { email: 'notify@example.com', marketing_consent: true },
    })

    const restock = await workerFetch('/api/admin/inventory/1', {
      admin: true,
      method: 'PATCH',
      body: { adjustment: 5 },
    })

    expect(restock.status).toBe(200)
    const restockData = await restock.json() as { waitlist_notified_count: number }
    expect(restockData.waitlist_notified_count).toBe(1)

    const waitlistRes = await workerFetch('/api/admin/waitlist?status=notified', { admin: true })
    expect(waitlistRes.status).toBe(200)
    const waitlistData = await waitlistRes.json() as {
      waitlist: Array<{ email: string; notified_at: string | null }>
    }
    const row = waitlistData.waitlist.find((item) => item.email === 'notify@example.com')
    expect(row?.notified_at).toBeTruthy()
  })
})
