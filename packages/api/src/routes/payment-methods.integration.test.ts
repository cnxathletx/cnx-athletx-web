import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, checkoutBody } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('GET /api/payment-methods', () => {
  it('returns enabled methods with localized displayNames', async () => {
    const res = await workerFetch('/api/payment-methods', { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { methods: Array<{ id: string; name: { en: string; th: string } }> }
    const ids = data.methods.map((m) => m.id).sort()
    expect(ids).toEqual(['bank_transfer', 'promptpay'])
    const promptpay = data.methods.find((m) => m.id === 'promptpay')!
    expect(promptpay.name.en).toBe('PromptPay')
    expect(promptpay.name.th).toBeTruthy()
  })

  it('omits methods that are disabled in settings', async () => {
    await workerFetch('/api/admin/settings', {
      method: 'PATCH',
      admin: true,
      body: { settings: { payment_methods_enabled: '["promptpay"]' } },
    })
    const res = await workerFetch('/api/payment-methods', { method: 'GET' })
    const data = await res.json() as { methods: Array<{ id: string }> }
    expect(data.methods.map((m) => m.id)).toEqual(['promptpay'])
  })

  it('omits methods missing required settings', async () => {
    await workerFetch('/api/admin/settings', {
      method: 'PATCH',
      admin: true,
      body: { settings: { promptpay_number: '' } },
    })
    const res = await workerFetch('/api/payment-methods', { method: 'GET' })
    const data = await res.json() as { methods: Array<{ id: string }> }
    expect(data.methods.map((m) => m.id)).toEqual(['bank_transfer'])
  })
})

describe('GET /api/orders/:id/intent', () => {
  it('returns intent for an existing promptpay order', async () => {
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'promptpay' }) })
    const { order_id } = await checkoutRes.json() as { order_id: string }
    const res = await workerFetch(`/api/orders/${order_id}/intent`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { intent: { kind: string; provider: string; instructions: Record<string, string> }; status: string }
    expect(data.intent.provider).toBe('promptpay')
    expect(data.intent.kind).toBe('instructions')
    expect(data.intent.instructions.promptpay_number).toBe('0812345678')
    expect(data.status).toBe('pending_payment')
  })

  it('returns intent for an existing bank_transfer order', async () => {
    const checkoutRes = await workerFetch('/api/checkout', { body: checkoutBody({ payment_method: 'bank_transfer' }) })
    const { order_id } = await checkoutRes.json() as { order_id: string }
    const res = await workerFetch(`/api/orders/${order_id}/intent`, { method: 'GET' })
    expect(res.status).toBe(200)
    const data = await res.json() as { intent: { provider: string; instructions: Record<string, string> } }
    expect(data.intent.provider).toBe('bank_transfer')
    expect(data.intent.instructions.bank_name).toBe('Kasikorn Bank')
  })

  it('returns 404 for unknown order', async () => {
    const res = await workerFetch('/api/orders/01HZZZZZZZZZZZZZZZZZZZZZZZ/intent', { method: 'GET' })
    expect(res.status).toBe(404)
  })
})
