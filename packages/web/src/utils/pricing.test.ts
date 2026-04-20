import { describe, it, expect } from 'vitest'
import { pickUnitPrice, sortTiers, nextTier, savingsPercent, type PriceTier } from './pricing'

describe('pickUnitPrice', () => {
  it('returns base when no tiers match', () => {
    const tiers: PriceTier[] = [{ min_quantity: 5, unit_price_thb: 79900 }]
    expect(pickUnitPrice(89900, tiers, 1)).toBe(89900)
  })

  it('returns lowest applicable tier price', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 3, unit_price_thb: 84900 },
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(pickUnitPrice(89900, tiers, 6)).toBe(79900)
    expect(pickUnitPrice(89900, tiers, 10)).toBe(69900)
  })

  it('ignores tiers above base (defensive)', () => {
    const tiers: PriceTier[] = [{ min_quantity: 2, unit_price_thb: 99900 }]
    expect(pickUnitPrice(89900, tiers, 5)).toBe(89900)
  })
})

describe('sortTiers', () => {
  it('sorts by min_quantity ascending', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 10, unit_price_thb: 69900 },
      { min_quantity: 3, unit_price_thb: 84900 },
      { min_quantity: 5, unit_price_thb: 79900 },
    ]
    expect(sortTiers(tiers).map((t) => t.min_quantity)).toEqual([3, 5, 10])
  })
})

describe('nextTier', () => {
  it('returns the lowest unreached tier', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 3, unit_price_thb: 84900 },
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(nextTier(tiers, 1)).toEqual({ min_quantity: 3, unit_price_thb: 84900 })
    expect(nextTier(tiers, 4)).toEqual({ min_quantity: 5, unit_price_thb: 79900 })
    expect(nextTier(tiers, 7)).toEqual({ min_quantity: 10, unit_price_thb: 69900 })
  })

  it('returns null when quantity at or beyond highest tier', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(nextTier(tiers, 10)).toBeNull()
    expect(nextTier(tiers, 99)).toBeNull()
  })

  it('returns null for empty tier list', () => {
    expect(nextTier([], 5)).toBeNull()
  })
})

describe('savingsPercent', () => {
  it('returns rounded integer percent savings', () => {
    expect(savingsPercent(100000, 90000)).toBe(10)
    expect(savingsPercent(89900, 79900)).toBe(11)
  })

  it('returns 0 when base price is zero or negative', () => {
    expect(savingsPercent(0, 0)).toBe(0)
    expect(savingsPercent(-1, 100)).toBe(0)
  })
})
