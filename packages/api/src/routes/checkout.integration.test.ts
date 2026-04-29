import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('POST /api/checkout', () => {
  it('creates an order with valid body', async () => {
    const res = await workerFetch('/api/checkout', { body: checkoutBody() })
    expect(res.status).toBe(201)

    const data = await res.json() as {
      order_id: string
      subtotal_thb: number
      shipping_thb: number
      discount_thb: number
      total_thb: number
      intent: { kind: string; provider: string; instructions: Record<string, string> }
    }
    expect(data.order_id).toBeTruthy()
    expect(data.subtotal_thb).toBe(89900) // 1x plant-protein-500g
    expect(data.shipping_thb).toBe(10000) // flat rate
    expect(data.discount_thb).toBe(0)
    expect(data.total_thb).toBe(99900)
    expect(data.intent.kind).toBe('instructions')
    expect(data.intent.provider).toBe('promptpay')
    expect(data.intent.instructions.promptpay_number).toBe('0812345678')
    expect(data.intent.instructions.amount_thb).toBe('999.00')
    expect(data.intent.instructions.qr_url).toBe('https://promptpay.io/0812345678/999.00.png')
  })

  it('creates order with multiple items', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 2 }, { product_id: 2, quantity: 1 }] }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number; total_thb: number }
    // 2x 89900 + 1x 159900 = 339700
    expect(data.subtotal_thb).toBe(339700)
    expect(data.total_thb).toBe(339700 + 10000) // + shipping
  })

  it('deduplicates repeated product IDs', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 1 }, { product_id: 1, quantity: 2 }] }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number }
    // Should merge into 3x plant-protein-500g = 3 * 89900
    expect(data.subtotal_thb).toBe(269700)
  })

  it('returns idempotent response for duplicate idempotency_key', async () => {
    const body = checkoutBody()
    const res1 = await workerFetch('/api/checkout', { body })
    expect(res1.status).toBe(201)
    const data1 = await res1.json() as { order_id: string; total_thb: number }

    // Same body (same idempotency key)
    const res2 = await workerFetch('/api/checkout', { body })
    expect(res2.status).toBe(200)
    const data2 = await res2.json() as { order_id: string; message: string }
    expect(data2.order_id).toBe(data1.order_id)
    expect(data2.message).toContain('idempotent')
  })

  it('reserves inventory on checkout', async () => {
    await workerFetch('/api/checkout', { body: checkoutBody({ items: [{ product_id: 1, quantity: 3 }] }) })

    // Check inventory via admin endpoint
    const invRes = await workerFetch('/api/admin/inventory', { admin: true })
    const invData = await invRes.json() as { inventory: Array<{ product_id: number; reserved_count: number; available_count: number }> }
    const product1 = invData.inventory.find((i) => i.product_id === 1)!
    expect(product1.reserved_count).toBe(3)
    expect(product1.available_count).toBe(97) // 100 - 3
  })

  it('rejects checkout when stock is insufficient', async () => {
    // First exhaust most stock with a large order
    await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 99 }] }),
    })

    // Now try to order more than remaining available (1 left)
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 5 }] }),
    })
    expect(res.status).toBe(422)

    const data = await res.json() as { error: string }
    expect(data.error).toContain('stock')
  })

  it('rejects invalid JSON body', async () => {
    const res = await workerFetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    // No body sent — should fail JSON parsing
    expect(res.status).toBe(400)
  })

  it('rejects checkout with missing required fields', async () => {
    const res = await workerFetch('/api/checkout', { body: { items: [] } })
    expect(res.status).toBe(400)

    const data = await res.json() as { error: string; details: Array<{ field: string }> }
    expect(data.error).toBe('Validation failed')
    expect(data.details.length).toBeGreaterThan(0)
  })

  it('rejects non-existent product ID', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 999, quantity: 1 }] }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details[0].message).toContain('999')
  })

  it('applies volume tier price when quantity meets threshold', async () => {
    // Configure: buy 5+ drops unit price from 89900 to 79900
    const tierRes = await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    expect(tierRes.status).toBe(201)

    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 5 }] }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { order_id: string; subtotal_thb: number; total_thb: number }
    // 5 * 79900 = 399500 (not 5 * 89900 = 449500)
    expect(data.subtotal_thb).toBe(399500)
    expect(data.total_thb).toBe(399500 + 10000) // + flat shipping
  })

  it('does not apply tier price when quantity is below threshold', async () => {
    await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })

    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 4 }] }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number }
    expect(data.subtotal_thb).toBe(4 * 89900)
  })

  it('applies the lowest eligible tier when multiple match', async () => {
    await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 5, unit_price_thb: 79900 },
    })
    await workerFetch('/api/admin/products/1/price-tiers', {
      admin: true,
      body: { min_quantity: 10, unit_price_thb: 69900 },
    })

    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ items: [{ product_id: 1, quantity: 10 }] }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { subtotal_thb: number }
    expect(data.subtotal_thb).toBe(10 * 69900)
  })

  it('rejects when payment_method missing', async () => {
    const body = checkoutBody()
    delete (body as Record<string, unknown>).payment_method
    const res = await workerFetch('/api/checkout', { body })
    expect(res.status).toBe(400)
    const data = await res.json() as { details: Array<{ field: string }> }
    expect(data.details.some((d) => d.field === 'payment_method')).toBe(true)
  })

  it('rejects payment_method not in registry', async () => {
    const res = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'bitcoin' }) })
    expect(res.status).toBe(400)
  })

  it('rejects payment_method not in enabled list', async () => {
    // Disable promptpay leaving only bank_transfer enabled
    await workerFetch('/api/admin/settings', {
      method: 'PATCH',
      admin: true,
      body: { settings: { payment_methods_enabled: '["bank_transfer"]' } },
    })
    const res = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'promptpay' }) })
    expect(res.status).toBe(400)
    const data = await res.json() as { details: Array<{ message: string }> }
    expect(data.details.some((d) => d.message.includes('disabled'))).toBe(true)
  })

  it('returns bank_transfer intent when chosen', async () => {
    const res = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'bank_transfer' }) })
    expect(res.status).toBe(201)
    const data = await res.json() as { intent: { kind: string; provider: string; instructions: Record<string, string> } }
    expect(data.intent.kind).toBe('instructions')
    expect(data.intent.provider).toBe('bank_transfer')
    expect(data.intent.instructions.bank_name).toBe('Kasikorn Bank')
    expect(data.intent.instructions.account_number).toBe('123-4-56789-0')
  })

  it('persists payment_method on the order row', async () => {
    const res = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'bank_transfer' }) })
    const data = await res.json() as { order_id: string }
    const orderRes = await workerFetch(`/api/admin/orders/${data.order_id}`, { admin: true })
    const orderJson = await orderRes.json() as { order: { payment_method?: string } }
    expect(orderJson.order.payment_method).toBe('bank_transfer')
  })

  it('persists locale=th when present in body', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ locale: 'th' }),
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { order_id: string }
    const orderRes = await workerFetch(`/api/admin/orders/${data.order_id}`, { admin: true })
    const orderJson = await orderRes.json() as { order: { locale?: string } }
    expect(orderJson.order.locale).toBe('th')
  })

  it('defaults locale to en when omitted', async () => {
    const res = await workerFetch('/api/checkout', { body: checkoutBody() })
    expect(res.status).toBe(201)

    const data = await res.json() as { order_id: string }
    const orderRes = await workerFetch(`/api/admin/orders/${data.order_id}`, { admin: true })
    const orderJson = await orderRes.json() as { order: { locale?: string } }
    expect(orderJson.order.locale).toBe('en')
  })

  it('rejects invalid locale value', async () => {
    const res = await workerFetch('/api/checkout', {
      body: checkoutBody({ locale: 'fr' }),
    })
    expect(res.status).toBe(400)

    const data = await res.json() as { details: Array<{ field: string }> }
    expect(data.details).toContainEqual(expect.objectContaining({ field: 'locale' }))
  })
})

describe('POST /api/orders/:id/payment-proof', () => {
  it('submits payment proof for pending order', async () => {
    // Create an order first
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody() })
    const { order_id } = await checkoutRes.json() as { order_id: string }

    const res = await workerFetch(`/api/orders/${order_id}/payment-proof`, {
      body: { proof_value: 'REF-12345678' },
    })
    expect(res.status).toBe(201)

    const data = await res.json() as { success: boolean }
    expect(data.success).toBe(true)
  })

  it('returns 404 for non-existent order', async () => {
    // Valid ULID format but doesn't exist
    const res = await workerFetch('/api/orders/01HZZZZZZZZZZZZZZZZZZZZZZ/payment-proof', {
      body: { proof_value: 'REF-12345678' },
    })
    // Should be 404 or 400 depending on format
    expect([400, 404]).toContain(res.status)
  })

  it('rejects proof for non-pending order', async () => {
    // Create order then mark as paid
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody() })
    const { order_id } = await checkoutRes.json() as { order_id: string }

    await workerFetch(`/api/admin/orders/${order_id}/mark-paid`, { method: 'POST', admin: true })

    const res = await workerFetch(`/api/orders/${order_id}/payment-proof`, {
      body: { proof_value: 'REF-12345678' },
    })
    expect(res.status).toBe(409)
  })
})
