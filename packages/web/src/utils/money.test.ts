import { describe, it, expect } from 'vitest'
import { formatMoney, fromSatang, satangToThb, toSatang } from './money'

describe('formatMoney', () => {
  it('renders satang as THB with ฿ prefix', () => {
    expect(formatMoney(124000)).toBe('฿1,240')
    expect(formatMoney(89900)).toBe('฿899')
    expect(formatMoney(0)).toBe('฿0')
  })

  it('keeps non-integer THB values', () => {
    expect(formatMoney(12345)).toBe('฿123.45')
  })

  it('supports explicit locale and currency options', () => {
    expect(formatMoney(89900, { locale: 'en-US', currency: 'THB', minimumFractionDigits: 2 })).toBe('฿899.00')
    expect(formatMoney(123456, { locale: 'en-US', currency: 'USD', minimumFractionDigits: 2 })).toBe('$1,234.56')
  })
})

describe('satangToThb', () => {
  it('divides by 100', () => {
    expect(satangToThb(100)).toBe(1)
    expect(satangToThb(124000)).toBe(1240)
  })
})

describe('toSatang/fromSatang', () => {
  it('rounds decimal major-unit amounts to integer minor units', () => {
    expect(toSatang(899)).toBe(89900)
    expect(toSatang(123.456)).toBe(12346)
  })

  it('converts satang back to THB', () => {
    expect(fromSatang(89900)).toBe(899)
    expect(fromSatang(12345)).toBe(123.45)
  })
})
