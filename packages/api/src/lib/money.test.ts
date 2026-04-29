import { describe, expect, it } from 'vitest'
import { formatMoney, formatThb, fromSatang, toSatang } from './money'

describe('API money helpers', () => {
  it('rounds major currency units to satang', () => {
    expect(toSatang(899)).toBe(89900)
    expect(toSatang(123.456)).toBe(12346)
  })

  it('converts satang back to major currency units', () => {
    expect(fromSatang(89900)).toBe(899)
    expect(fromSatang(12345)).toBe(123.45)
  })

  it('formats money with explicit locale and currency', () => {
    expect(formatMoney(89900, { locale: 'en-US', currency: 'THB', minimumFractionDigits: 2 })).toBe('฿899.00')
    expect(formatMoney(123456, { locale: 'en-US', currency: 'USD', minimumFractionDigits: 2 })).toBe('$1,234.56')
  })

  it('keeps formatThb as the email-safe THB formatter', () => {
    expect(formatThb(89900)).toBe('฿899.00')
    expect(formatThb(99)).toBe('฿0.99')
  })
})
