import { describe, it, expect } from 'vitest'
import { formatMoney, satangToThb } from './money'

describe('formatMoney', () => {
  it('renders satang as THB with ฿ prefix', () => {
    expect(formatMoney(124000)).toBe('฿1,240')
    expect(formatMoney(89900)).toBe('฿899')
    expect(formatMoney(0)).toBe('฿0')
  })

  it('keeps non-integer THB values', () => {
    expect(formatMoney(12345)).toBe('฿123.45')
  })
})

describe('satangToThb', () => {
  it('divides by 100', () => {
    expect(satangToThb(100)).toBe(1)
    expect(satangToThb(124000)).toBe(1240)
  })
})
