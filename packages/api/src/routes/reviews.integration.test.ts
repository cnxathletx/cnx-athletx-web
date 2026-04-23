import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function placeShippedOrder(email: string): Promise<string> {
  const cookie = await loginAs(email)
  const checkoutRes = await workerFetch('/api/checkout', {
    cookie,
    body: checkoutBody({ customer: { name: 'Buyer', email, phone: '+66811111111', address: { line1: '1 Test Road', district: 'Mueang', province: 'CM', postal_code: '50200' } } }),
  })
  const { order_id } = await checkoutRes.json() as { order_id: string }
  await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order_id}/pack`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order_id}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK123' } })
  return cookie
}

async function seedApprovedReview(cookie: string, productLineId: number, rating: number, body: string | null = null) {
  const submitRes = await workerFetch('/api/account/reviews', {
    cookie,
    method: 'POST',
    body: { productLineId, rating, body, locale: 'en' },
  })
  if (!submitRes.ok) throw new Error(`seedApprovedReview: POST /api/account/reviews returned ${submitRes.status} (Task 6 not yet implemented?)`)
  const { review } = await submitRes.json() as { review: { id: number } }
  const approveRes = await workerFetch(`/api/admin/reviews/${review.id}/approve`, { admin: true, method: 'POST' })
  if (!approveRes.ok) throw new Error(`seedApprovedReview: POST /api/admin/reviews/${review.id}/approve returned ${approveRes.status} (Task 8 not yet implemented?)`)
  return review.id
}

describe('GET /api/products/:slug/reviews', () => {
  it('returns empty summary when no reviews exist', async () => {
    const res = await workerFetch('/api/products/plant-protein-500g/reviews')
    expect(res.status).toBe(200)
    const data = await res.json() as { summary: { avgRating: number | null; count: number; distribution: Record<string, number> }; reviews: unknown[]; total: number }
    expect(data.summary.count).toBe(0)
    expect(data.summary.avgRating).toBeNull()
    expect(data.reviews).toHaveLength(0)
    expect(data.total).toBe(0)
  })

  it('returns 404 for unknown slug', async () => {
    const res = await workerFetch('/api/products/no-such-product/reviews')
    expect(res.status).toBe(404)
  })

  it('only includes approved reviews', async () => {
    const cookie = await placeShippedOrder('approved@example.com')
    await seedApprovedReview(cookie, 1, 5, 'Great')

    // Pending submission from another user
    const cookie2 = await placeShippedOrder('pending@example.com')
    await workerFetch('/api/account/reviews', {
      cookie: cookie2, method: 'POST', body: { productLineId: 1, rating: 3, body: 'Pending', locale: 'en' },
    })

    const res = await workerFetch('/api/products/plant-protein-500g/reviews')
    const data = await res.json() as { summary: { count: number; avgRating: number }; reviews: Array<{ rating: number }> }
    expect(data.summary.count).toBe(1)
    expect(data.summary.avgRating).toBe(5)
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0].rating).toBe(5)
  })

  it('paginates reviews', async () => {
    // Seed 12 approved reviews
    for (let i = 0; i < 12; i++) {
      const cookie = await placeShippedOrder(`p${i}@example.com`)
      await seedApprovedReview(cookie, 1, ((i % 5) + 1))
    }
    const res = await workerFetch('/api/products/plant-protein-500g/reviews?page=2&pageSize=10')
    const data = await res.json() as { reviews: unknown[]; total: number; page: number }
    expect(data.total).toBe(12)
    expect(data.page).toBe(2)
    expect(data.reviews).toHaveLength(2)
  })

  it('aggregates at product-line level (both SKUs share rating)', async () => {
    const cookie = await placeShippedOrder('line@example.com')
    await seedApprovedReview(cookie, 1, 4)

    // Both 500g and 1000g SKUs share product_line_id=1 in seed data (only line: plant-protein)
    const res500 = await workerFetch('/api/products/plant-protein-500g/reviews')
    const data500 = await res500.json() as { summary: { count: number; avgRating: number } }
    const res1000 = await workerFetch('/api/products/plant-protein-1000g/reviews')
    const data1000 = await res1000.json() as { summary: { count: number; avgRating: number } }

    expect(data500.summary.count).toBe(1)
    expect(data1000.summary.count).toBe(1)
    expect(data500.summary.avgRating).toBe(data1000.summary.avgRating)
  })
})
