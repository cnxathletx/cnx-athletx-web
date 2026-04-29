import { describe, expect, it } from 'vitest'
import { RATE_LIMITS, getRateLimitPolicy } from './rate-limit-registry'

describe('rate-limit registry', () => {
  it('defines named policies for checkout, magic links, and chat creation', () => {
    expect(RATE_LIMITS.checkout).toMatchObject({
      scope: 'checkout',
      perIp: { max: 30, windowSec: 60 * 60 },
      global: { max: 1000, windowSec: 60 * 60 },
    })
    expect(RATE_LIMITS.magic_link.scope).toBe('magic_link')
    expect(RATE_LIMITS.chat_create.scope).toBe('chat_create')
  })

  it('returns an immutable policy copy', () => {
    const policy = getRateLimitPolicy('checkout')
    policy.perIp.max = 1
    expect(getRateLimitPolicy('checkout').perIp.max).toBe(30)
  })

  it('applies valid site setting overrides', () => {
    expect(getRateLimitPolicy('checkout', {
      rate_limit_checkout_per_ip_max: '10',
      rate_limit_checkout_per_ip_window_sec: '20',
      rate_limit_checkout_global_max: '30',
      rate_limit_checkout_global_window_sec: '40',
    })).toEqual({
      scope: 'checkout',
      perIp: { max: 10, windowSec: 20 },
      global: { max: 30, windowSec: 40 },
    })
  })

  it('ignores invalid site setting overrides', () => {
    expect(getRateLimitPolicy('chat_create', {
      rate_limit_chat_create_per_ip_max: '0',
      rate_limit_chat_create_global_window_sec: 'bad',
    })).toEqual(RATE_LIMITS.chat_create)
  })
})
