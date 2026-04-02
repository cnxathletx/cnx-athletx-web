import { describe, it, expect } from 'vitest'
import { generateULID } from './ulid'

const CROCKFORD_BASE32 = /^[0-9A-HJKMNP-TV-Z]{26}$/

describe('generateULID', () => {
  it('returns a 26-character Crockford base32 string', () => {
    const id = generateULID()
    expect(id).toHaveLength(26)
    expect(CROCKFORD_BASE32.test(id)).toBe(true)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateULID()))
    expect(ids.size).toBe(100)
  })

  it('is lexicographically sortable by time', async () => {
    const first = generateULID()
    // small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 2))
    const second = generateULID()
    expect(first < second).toBe(true)
  })

  it('does not contain excluded characters I, L, O, U', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateULID()
      expect(id).not.toMatch(/[ILOU]/)
    }
  })
})
