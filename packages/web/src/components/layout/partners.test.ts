import { describe, expect, it, vi } from 'vitest'
import {
  buildInitialPartnerSlots,
  buildStaticPartnerTiles,
  rotatePartnerSlot,
  type Partner,
} from './partners'

const partners: Partner[] = Array.from({ length: 7 }, (_, i) => ({
  name: `Partner ${i + 1}`,
  image: `/partner-${i + 1}.png`,
  href: `https://partner-${i + 1}.example`,
}))

describe('partner tile helpers', () => {
  it('fills six static tiles with randomized partners and placeholders when there are fewer partners', () => {
    const random = vi.fn(() => 0)
    const tiles = buildStaticPartnerTiles([partners[0]], 6, random)

    expect(tiles).toHaveLength(6)
    expect(tiles[0]).toEqual({ placeholderIndex: 2 })
    expect(tiles[5]).toEqual(partners[0])
  })

  it('rotates a visible partner slot to a partner that is not already shown when there are more than six partners', () => {
    const random = vi.fn(() => 0)
    const slots = buildInitialPartnerSlots(7, 6, () => 0.99)
    const rotated = rotatePartnerSlot(slots, 2, 7, random)

    expect(slots).toHaveLength(6)
    expect(rotated).toEqual([0, 1, 6, 3, 4, 5])
    expect(new Set(rotated).size).toBe(6)
  })
})
