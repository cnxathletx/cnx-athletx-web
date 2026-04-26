import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'
import { mapWebhookToOrderStatus, allowedFromStates } from './payments'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('POST /api/payments/:provider/webhook', () => {
  it('returns 404 when provider has no verifyWebhook (manual)', async () => {
    const res = await workerFetch('/api/payments/promptpay/webhook', { body: {} })
    expect(res.status).toBe(404)
  })

  it('returns 404 when provider unknown', async () => {
    const res = await workerFetch('/api/payments/no-such/webhook', { body: {} })
    expect(res.status).toBe(404)
  })
})

describe('webhook status helpers', () => {
  it('mapWebhookToOrderStatus passes outcome through', () => {
    expect(mapWebhookToOrderStatus('paid')).toBe('paid')
    expect(mapWebhookToOrderStatus('failed')).toBe('failed')
    expect(mapWebhookToOrderStatus('refunded')).toBe('refunded')
  })

  it('allowedFromStates gates paid/failed to pre-paid states', () => {
    expect(allowedFromStates('paid')).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(allowedFromStates('failed')).toEqual(['pending_payment', 'awaiting_gateway'])
  })

  it('allowedFromStates gates refunded to post-paid states', () => {
    expect(allowedFromStates('refunded')).toEqual(['paid', 'packed', 'shipped', 'delivered'])
  })
})
