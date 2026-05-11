import { describe, expect, it } from 'vitest'
import {
  calculateEarnedPoints,
  maxRedeemablePointsForSubtotal,
  normalizeRedeemPoints,
} from './loyalty'

describe('loyalty formulas', () => {
  it('earns 1 point per 10 THB from paid merchandise after discounts', () => {
    expect(calculateEarnedPoints({ subtotalThb: 89900, discountThb: 0 })).toBe(89)
    expect(calculateEarnedPoints({ subtotalThb: 89900, discountThb: 5000 })).toBe(84)
    expect(calculateEarnedPoints({ subtotalThb: 900, discountThb: 0 })).toBe(0)
  })

  it('caps redemption at 5 percent of subtotal and available balance', () => {
    expect(maxRedeemablePointsForSubtotal(200000)).toBe(100)
    expect(maxRedeemablePointsForSubtotal(89900)).toBe(44)
    expect(normalizeRedeemPoints({ requestedPoints: 999, availablePoints: 80, subtotalThb: 200000 })).toEqual({
      points: 80,
      discountThb: 8000,
    })
  })

  it('rejects negative or fractional point redemption', () => {
    expect(() => normalizeRedeemPoints({ requestedPoints: -1, availablePoints: 100, subtotalThb: 100000 })).toThrow('redeem_points must be a non-negative integer')
    expect(() => normalizeRedeemPoints({ requestedPoints: 1.5, availablePoints: 100, subtotalThb: 100000 })).toThrow('redeem_points must be a non-negative integer')
  })
})
