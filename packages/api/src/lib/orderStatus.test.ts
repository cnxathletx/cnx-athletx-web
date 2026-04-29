import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUS,
  ORDER_STATUSES,
  PAYMENT_PROOF_ORDER_STATUSES,
  REFUNDABLE_ORDER_STATUSES,
  REVENUE_ORDER_STATUSES,
  REVIEW_ELIGIBLE_ORDER_STATUSES,
  WEBHOOK_PRE_PAYMENT_SOURCE_STATUSES,
  allowedWebhookTransitionSources,
  canTransition,
  isOrderStatus,
  isPaymentProofOrderStatus,
  mapWebhookOutcomeToOrderStatus,
  orderStatusSqlList,
  parseOrderStatus,
} from './orderStatus'

describe('ORDER_STATUSES', () => {
  it('lists every DB-backed order status in canonical order', () => {
    expect(ORDER_STATUSES).toEqual([
      'pending_payment',
      'awaiting_gateway',
      'paid',
      'failed',
      'packed',
      'shipped',
      'delivered',
      'refunded',
      'cancelled',
    ])
  })

  it('exposes readable named constants', () => {
    expect(ORDER_STATUS.pendingPayment).toBe('pending_payment')
    expect(ORDER_STATUS.awaitingGateway).toBe('awaiting_gateway')
    expect(ORDER_STATUS.paid).toBe('paid')
    expect(ORDER_STATUS.failed).toBe('failed')
    expect(ORDER_STATUS.packed).toBe('packed')
    expect(ORDER_STATUS.shipped).toBe('shipped')
    expect(ORDER_STATUS.delivered).toBe('delivered')
    expect(ORDER_STATUS.refunded).toBe('refunded')
    expect(ORDER_STATUS.cancelled).toBe('cancelled')
  })
})

describe('order status parsing', () => {
  it('accepts known status strings', () => {
    expect(isOrderStatus('paid')).toBe(true)
    expect(parseOrderStatus('packed')).toBe('packed')
  })

  it('rejects unknown or non-string values without coercion', () => {
    expect(isOrderStatus('PAID')).toBe(false)
    expect(parseOrderStatus('PAID')).toBeNull()
    expect(parseOrderStatus(123)).toBeNull()
    expect(parseOrderStatus(null)).toBeNull()
  })
})

describe('canTransition', () => {
  it('allows current admin transitions', () => {
    expect(canTransition('pending_payment', 'paid')).toBe(true)
    expect(canTransition('paid', 'packed')).toBe(true)
    expect(canTransition('packed', 'shipped')).toBe(true)
    expect(canTransition('pending_payment', 'cancelled')).toBe(true)
    expect(canTransition('paid', 'cancelled')).toBe(true)
    expect(canTransition('packed', 'cancelled')).toBe(true)
  })

  it('allows webhook and future gateway transitions represented in the DB enum', () => {
    expect(canTransition('pending_payment', 'awaiting_gateway')).toBe(true)
    expect(canTransition('awaiting_gateway', 'paid')).toBe(true)
    expect(canTransition('awaiting_gateway', 'failed')).toBe(true)
    expect(canTransition('paid', 'refunded')).toBe(true)
    expect(canTransition('delivered', 'refunded')).toBe(true)
  })

  it('rejects invalid or terminal transitions', () => {
    expect(canTransition('pending_payment', 'packed')).toBe(false)
    expect(canTransition('shipped', 'cancelled')).toBe(false)
    expect(canTransition('cancelled', 'paid')).toBe(false)
    expect(canTransition('refunded', 'paid')).toBe(false)
    expect(canTransition('failed', 'paid')).toBe(false)
  })
})

describe('status groups', () => {
  it('keeps revenue and review groups behavior-compatible with current routes', () => {
    expect(REVENUE_ORDER_STATUSES).toEqual(['paid', 'packed', 'shipped', 'delivered'])
    expect(REVIEW_ELIGIBLE_ORDER_STATUSES).toEqual(['shipped', 'delivered'])
    expect(PAYMENT_PROOF_ORDER_STATUSES).toEqual(['pending_payment'])
    expect(isPaymentProofOrderStatus('pending_payment')).toBe(true)
    expect(isPaymentProofOrderStatus('paid')).toBe(false)
  })

  it('keeps webhook groups behavior-compatible with current routes', () => {
    expect(WEBHOOK_PRE_PAYMENT_SOURCE_STATUSES).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(REFUNDABLE_ORDER_STATUSES).toEqual(['paid', 'packed', 'shipped', 'delivered'])
    expect(allowedWebhookTransitionSources('paid')).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(allowedWebhookTransitionSources('failed')).toEqual(['pending_payment', 'awaiting_gateway'])
    expect(allowedWebhookTransitionSources('refunded')).toEqual(['paid', 'packed', 'shipped', 'delivered'])
    expect(mapWebhookOutcomeToOrderStatus('refunded')).toBe('refunded')
  })
})

describe('orderStatusSqlList', () => {
  it('renders a trusted static SQL IN list', () => {
    expect(orderStatusSqlList(REVENUE_ORDER_STATUSES)).toBe("('paid','packed','shipped','delivered')")
  })
})
