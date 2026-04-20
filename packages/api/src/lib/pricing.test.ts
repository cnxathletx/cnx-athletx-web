import { describe, it, expect } from 'vitest'
import { pickUnitPrice, sortTiers, type PriceTier } from './pricing'

describe('pickUnitPrice', () => {
  it('returns base price when tier list is empty', () => {
    expect(pickUnitPrice(89900, [], 5)).toBe(89900)
  })

  it('returns base price when quantity is below any tier', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(pickUnitPrice(89900, tiers, 4)).toBe(89900)
  })

  it('applies the lowest matching tier when quantity crosses one threshold', () => {
    const tiers: PriceTier[] = [{ min_quantity: 5, unit_price_thb: 79900 }]
    expect(pickUnitPrice(89900, tiers, 5)).toBe(79900)
    expect(pickUnitPrice(89900, tiers, 7)).toBe(79900)
  })

  it('picks the lowest price among multiple eligible tiers', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(pickUnitPrice(89900, tiers, 12)).toBe(69900)
  })

  it('is order-independent', () => {
    const a: PriceTier[] = [
      { min_quantity: 10, unit_price_thb: 69900 },
      { min_quantity: 5, unit_price_thb: 79900 },
    ]
    const b: PriceTier[] = [
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 10, unit_price_thb: 69900 },
    ]
    expect(pickUnitPrice(89900, a, 10)).toBe(pickUnitPrice(89900, b, 10))
  })

  it('ignores tiers priced higher than base (defensive)', () => {
    const tiers: PriceTier[] = [{ min_quantity: 5, unit_price_thb: 99900 }]
    expect(pickUnitPrice(89900, tiers, 10)).toBe(89900)
  })

  it('handles inverted ladder gracefully — still picks lowest', () => {
    const tiers: PriceTier[] = [
      { min_quantity: 5, unit_price_thb: 69900 },
      { min_quantity: 10, unit_price_thb: 79900 },
    ]
    expect(pickUnitPrice(89900, tiers, 10)).toBe(69900)
  })
})

describe('sortTiers', () => {
  it('sorts ascending by min_quantity without mutating input', () => {
    const input: PriceTier[] = [
      { min_quantity: 10, unit_price_thb: 69900 },
      { min_quantity: 5, unit_price_thb: 79900 },
      { min_quantity: 20, unit_price_thb: 59900 },
    ]
    const sorted = sortTiers(input)
    expect(sorted.map((t) => t.min_quantity)).toEqual([5, 10, 20])
    expect(input[0].min_quantity).toBe(10)
  })
})
