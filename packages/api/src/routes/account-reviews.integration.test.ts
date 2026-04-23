import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function placeOrder(email: string, body = checkoutBody()): Promise<{ cookie: string; orderId: string }> {
  const cookie = await loginAs(email)
  const customerOverride = { ...((body as any).customer ?? {}), email }
  const res = await workerFetch('/api/checkout', { cookie, body: { ...body, customer: customerOverride } })
  const { order_id } = await res.json() as { order_id: string }
  return { cookie, orderId: order_id }
}

async function transitionTo(orderId: string, status: 'paid' | 'packed' | 'shipped') {
  if (status === 'paid' || status === 'packed' || status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/mark-paid`, { admin: true, method: 'POST' })
  }
  if (status === 'packed' || status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/pack`, { admin: true, method: 'POST' })
  }
  if (status === 'shipped') {
    await workerFetch(`/api/admin/orders/${orderId}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK1' } })
  }
}

describe('GET /api/account/reviewable-products', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviewable-products')
    expect(res.status).toBe(401)
  })

  it('returns empty when no shipped orders', async () => {
    const cookie = await loginAs('noorder@example.com')
    const res = await workerFetch('/api/account/reviewable-products', { cookie })
    const data = await res.json() as { items: unknown[] }
    expect(data.items).toEqual([])
  })

  it('returns reviewable line for shipped order', async () => {
    const { cookie, orderId } = await placeOrder('elig@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviewable-products', { cookie })
    const data = await res.json() as { items: Array<{ productLineId: number; slug: string }> }
    expect(data.items.length).toBeGreaterThan(0)
    expect(data.items[0]).toHaveProperty('productLineId')
    expect(data.items[0]).toHaveProperty('slug')
  })

  it('hides line once review submitted', async () => {
    const { cookie, orderId } = await placeOrder('hidden@example.com')
    await transitionTo(orderId, 'shipped')
    const before = await workerFetch('/api/account/reviewable-products', { cookie }).then((r) => r.json() as Promise<{ items: Array<{ productLineId: number }> }>)
    const lineId = before.items[0].productLineId
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: lineId, rating: 5, locale: 'en' } })
    const after = await workerFetch('/api/account/reviewable-products', { cookie }).then((r) => r.json() as Promise<{ items: Array<{ productLineId: number }> }>)
    expect(after.items.find((i) => i.productLineId === lineId)).toBeUndefined()
  })
})

describe('POST /api/account/reviews', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviews', { method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(401)
  })

  it('403 when user has no order in line', async () => {
    const cookie = await loginAs('noeligible@example.com')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(403)
  })

  it('403 when user only has paid (not shipped) order', async () => {
    const { cookie, orderId } = await placeOrder('onlypaid@example.com')
    await transitionTo(orderId, 'paid')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    expect(res.status).toBe(403)
  })

  it('200 happy path inserts as pending', async () => {
    const { cookie, orderId } = await placeOrder('happy@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, body: 'Great', locale: 'en' } })
    expect(res.status).toBe(200)
    const data = await res.json() as { review: { status: string; rating: number } }
    expect(data.review.status).toBe('pending')
    expect(data.review.rating).toBe(5)
  })

  it('409 on duplicate', async () => {
    const { cookie, orderId } = await placeOrder('dup@example.com')
    await transitionTo(orderId, 'shipped')
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    expect(res.status).toBe(409)
  })

  it('400 invalid rating', async () => {
    const { cookie, orderId } = await placeOrder('badrating@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 6, locale: 'en' } })
    expect(res.status).toBe(400)
  })

  it('400 oversize body', async () => {
    const { cookie, orderId } = await placeOrder('big@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, body: 'x'.repeat(1001), locale: 'en' } })
    expect(res.status).toBe(400)
  })

  it('400 invalid locale', async () => {
    const { cookie, orderId } = await placeOrder('badloc@example.com')
    await transitionTo(orderId, 'shipped')
    const res = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'fr' } })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/account/reviews', () => {
  it('401 without auth', async () => {
    const res = await workerFetch('/api/account/reviews')
    expect(res.status).toBe(401)
  })

  it('returns own reviews with status', async () => {
    const { cookie, orderId } = await placeOrder('mine@example.com')
    await transitionTo(orderId, 'shipped')
    await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    const res = await workerFetch('/api/account/reviews', { cookie })
    const data = await res.json() as { reviews: Array<{ rating: number; status: string }> }
    expect(data.reviews).toHaveLength(1)
    expect(data.reviews[0].status).toBe('pending')
  })
})

describe('DELETE /api/account/reviews/:id', () => {
  it('owner can delete', async () => {
    const { cookie, orderId } = await placeOrder('del@example.com')
    await transitionTo(orderId, 'shipped')
    const submit = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await submit.json() as { review: { id: number } }
    const res = await workerFetch(`/api/account/reviews/${review.id}`, { cookie, method: 'DELETE' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/account/reviews', { cookie }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(list.reviews).toHaveLength(0)
  })

  it('404 when not owned by user', async () => {
    const { cookie: a, orderId: oa } = await placeOrder('a@example.com')
    await transitionTo(oa, 'shipped')
    const submit = await workerFetch('/api/account/reviews', { cookie: a, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await submit.json() as { review: { id: number } }

    const cookieB = await loginAs('b@example.com')
    const res = await workerFetch(`/api/account/reviews/${review.id}`, { cookie: cookieB, method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('user can resubmit after delete', async () => {
    const { cookie, orderId } = await placeOrder('resub@example.com')
    await transitionTo(orderId, 'shipped')
    const first = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 5, locale: 'en' } })
    const { review } = await first.json() as { review: { id: number } }
    await workerFetch(`/api/account/reviews/${review.id}`, { cookie, method: 'DELETE' })
    const second = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId: 1, rating: 4, locale: 'en' } })
    expect(second.status).toBe(200)
  })
})
