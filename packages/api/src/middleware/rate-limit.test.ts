import { describe, it, expect } from 'vitest'
import { getClientIp } from './rate-limit'

describe('getClientIp', () => {
  it('returns CF-Connecting-IP when present', () => {
    const req = new Request('https://api.cnxnature.com/x', {
      headers: { 'CF-Connecting-IP': '203.0.113.42' },
    })
    expect(getClientIp(req)).toBe('203.0.113.42')
  })

  it('trims whitespace', () => {
    const req = new Request('https://api.cnxnature.com/x', {
      headers: { 'CF-Connecting-IP': '  203.0.113.42  ' },
    })
    expect(getClientIp(req)).toBe('203.0.113.42')
  })

  it('falls back to "unknown" without header', () => {
    const req = new Request('https://api.cnxnature.com/x')
    expect(getClientIp(req)).toBe('unknown')
  })

  it('ignores X-Forwarded-For (client-spoofable)', () => {
    const req = new Request('https://api.cnxnature.com/x', {
      headers: { 'X-Forwarded-For': '198.51.100.1' },
    })
    expect(getClientIp(req)).toBe('unknown')
  })
})
