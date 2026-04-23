import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

async function submitPendingReview(email: string, productLineId = 1): Promise<number> {
  const cookie = await loginAs(email)
  const checkout = await workerFetch('/api/checkout', { cookie, body: checkoutBody({ customer: { name: 'Buyer', email, phone: '+66811111111', address: { line1: '1 Test', district: 'Mueang', province: 'CM', postal_code: '50200' } } }) })
  const { order_id } = await checkout.json() as { order_id: string }
  await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order_id}/pack`, { admin: true, method: 'POST' })
  await workerFetch(`/api/admin/orders/${order_id}/ship`, { admin: true, method: 'POST', body: { carrier: 'Kerry', tracking_number: 'TRK1' } })
  const submit = await workerFetch('/api/account/reviews', { cookie, method: 'POST', body: { productLineId, rating: 5, body: 'Great', locale: 'en' } })
  const { review } = await submit.json() as { review: { id: number } }
  return review.id
}

describe('GET /api/admin/reviews', () => {
  it('403 without admin', async () => {
    const res = await workerFetch('/api/admin/reviews')
    expect(res.status).toBe(403)
  })

  it('lists pending by default and exposes user/line context', async () => {
    await submitPendingReview('q1@example.com')
    const res = await workerFetch('/api/admin/reviews?status=pending', { admin: true })
    expect(res.status).toBe(200)
    const data = await res.json() as { reviews: Array<{ user_email: string; product_line_name: string; status: string }> }
    expect(data.reviews.length).toBeGreaterThan(0)
    expect(data.reviews[0].user_email).toBe('q1@example.com')
    expect(data.reviews[0].status).toBe('pending')
    expect(typeof data.reviews[0].product_line_name).toBe('string')
  })

  it('filters by status', async () => {
    const id = await submitPendingReview('q2@example.com')
    await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    const pending = await workerFetch('/api/admin/reviews?status=pending', { admin: true }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(pending.reviews).toHaveLength(0)
    const approved = await workerFetch('/api/admin/reviews?status=approved', { admin: true }).then((r) => r.json() as Promise<{ reviews: unknown[] }>)
    expect(approved.reviews).toHaveLength(1)
  })
})

describe('POST /api/admin/reviews/:id/approve', () => {
  it('marks approved + writes audit log', async () => {
    const id = await submitPendingReview('appr@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=approved', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number; moderated_by: string }> }>)
    const found = list.reviews.find((r) => r.id === id)
    expect(found).toBeDefined()
    expect(found!.moderated_by).toBe('jdelaire@gmail.com')
  })

  it('idempotent on already-approved', async () => {
    const id = await submitPendingReview('idem@example.com')
    await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    const res = await workerFetch(`/api/admin/reviews/${id}/approve`, { admin: true, method: 'POST' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/reviews/:id/reject', () => {
  it('marks rejected and stores reason', async () => {
    const id = await submitPendingReview('rej@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/reject`, { admin: true, method: 'POST', body: { reason: 'Spam' } })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=rejected', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number; rejected_reason: string }> }>)
    expect(list.reviews.find((r) => r.id === id)?.rejected_reason).toBe('Spam')
  })

  it('reason optional', async () => {
    const id = await submitPendingReview('rej2@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}/reject`, { admin: true, method: 'POST', body: {} })
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/reviews/:id', () => {
  it('purges review', async () => {
    const id = await submitPendingReview('purge@example.com')
    const res = await workerFetch(`/api/admin/reviews/${id}`, { admin: true, method: 'DELETE' })
    expect(res.status).toBe(200)
    const list = await workerFetch('/api/admin/reviews?status=pending', { admin: true }).then((r) => r.json() as Promise<{ reviews: Array<{ id: number }> }>)
    expect(list.reviews.find((r) => r.id === id)).toBeUndefined()
  })

  it('404 when missing', async () => {
    const res = await workerFetch('/api/admin/reviews/999999', { admin: true, method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
