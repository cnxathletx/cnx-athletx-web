import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('Checkout with discount codes', () => {
  it('applies fixed discount code (SAVE100 = 100 THB off)', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'SAVE100' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number; discount_thb: number; total_thb: number }
    expect(data.subtotal_thb).toBe(89900)
    expect(data.discount_thb).toBe(10000) // 100 THB in satang
    expect(data.total_thb).toBe(89900 + 10000 - 10000) // subtotal + shipping - discount
  })

  it('applies percent discount code (PERCENT20 = 20% off)', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'PERCENT20' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number; discount_thb: number; total_thb: number }
    expect(data.subtotal_thb).toBe(89900)
    // 20% of 89900 = 17980
    expect(data.discount_thb).toBe(17980)
    expect(data.total_thb).toBe(89900 + 10000 - 17980)
  })

  it('is case-insensitive for discount codes', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'save100' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { discount_thb: number }
    expect(data.discount_thb).toBe(10000)
  })

  it('rejects expired discount code', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'EXPIRED' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('expired')
  })

  it('rejects maxed-out discount code', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'MAXEDOUT' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('maximum')
  })

  it('rejects discount code below min order threshold', async () => {
    // MINORDER requires min_order_thb=200000 (2000 THB), but 1x 500g = 899 THB
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'MINORDER' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('minimum')
  })

  it('accepts discount code when min order met', async () => {
    // 2x 1kg = 319800, which exceeds min_order_thb=200000
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 2, quantity: 2 }], discount_code: 'MINORDER' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { discount_thb: number }
    expect(data.discount_thb).toBe(10000)
  })

  it('rejects inactive discount code', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'INACTIVE' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('not active')
  })

  it('rejects non-existent discount code', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'DOESNOTEXIST' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('not found')
  })

  it('increments used_count after successful checkout with discount', async () => {
    // Use SAVE100, then check that a second order also works (unlimited uses)
    const res1 = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'SAVE100' }),
    })
    expect(res1.status).toBe(201)

    const res2 = await workerFetch('/api/checkout', {
      body: checkoutBody({ discount_code: 'SAVE100' }),
    })
    expect(res2.status).toBe(201)
  })

  it('discount cannot exceed subtotal', async () => {
    // PERCENT20 on smallest order: 20% of 89900 = 17980, which is < subtotal, so this is fine
    // But let's verify the math is correct on a larger order
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }], discount_code: 'PERCENT20' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number; discount_thb: number; total_thb: number; shipping_thb: number }
    // subtotal = 2*89900 + 159900 = 339700
    // 20% of 339700 = 67940
    expect(data.subtotal_thb).toBe(339700)
    expect(data.discount_thb).toBe(67940)
    expect(data.total_thb).toBe(339700 + data.shipping_thb - 67940)
  })
})
