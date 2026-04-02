import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  isValidPhoneNumber,
  isValidOrderId,
  isValidProductSlug,
  isValidProductImageUrl,
  escapeHtml,
  bytesToHex,
  sha256Hex,
  nowIso,
} from './utils'

describe('nowIso', () => {
  it('returns a valid ISO 8601 string', () => {
    const result = nowIso()
    expect(new Date(result).toISOString()).toBe(result)
  })
})

describe('isValidEmail', () => {
  it.each([
    'user@example.com',
    'test.name@domain.co.th',
    'a+b@c.org',
  ])('accepts valid email: %s', (email) => {
    expect(isValidEmail(email)).toBe(true)
  })

  it.each([
    '',
    'notanemail',
    '@domain.com',
    'user@',
    'user @domain.com',
    'user@domain',
  ])('rejects invalid email: %s', (email) => {
    expect(isValidEmail(email)).toBe(false)
  })
})

describe('isValidPhoneNumber', () => {
  it.each([
    '0812345678',
    '+66812345678',
    '+12025551234',
    '+441234567890',
  ])('accepts valid phone: %s', (phone) => {
    expect(isValidPhoneNumber(phone)).toBe(true)
  })

  it.each([
    '',
    '123',
    '08123456789999',
    '+0123456789',
    'abcdefghij',
    '+66',
  ])('rejects invalid phone: %s', (phone) => {
    expect(isValidPhoneNumber(phone)).toBe(false)
  })
})

describe('isValidOrderId', () => {
  it('accepts a valid 26-char Crockford base32 ULID', () => {
    expect(isValidOrderId('01ARYZ6S41TSV4RRFFQ69G5FAV')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isValidOrderId('01aryz6s41tsv4rrffq69g5fav')).toBe(true)
  })

  it.each([
    '',
    '01ARYZ6S41TSV4RRFFQ69G5FA',   // 25 chars
    '01ARYZ6S41TSV4RRFFQ69G5FAVX', // 27 chars
    '01ARYZ6S41TSV4RRFFQ69G5FAI',  // contains I (excluded)
    '01ARYZ6S41TSV4RRFFQ69G5FAL',  // contains L (excluded)
    '01ARYZ6S41TSV4RRFFQ69G5FAO',  // contains O (excluded)
    '01ARYZ6S41TSV4RRFFQ69G5FAU',  // contains U (excluded)
  ])('rejects invalid order ID: %s', (id) => {
    expect(isValidOrderId(id)).toBe(false)
  })
})

describe('isValidProductSlug', () => {
  it.each([
    'protein-500g',
    'abc',
    'a-long-slug-with-numbers-123',
  ])('accepts valid slug: %s', (slug) => {
    expect(isValidProductSlug(slug)).toBe(true)
  })

  it.each([
    '',
    'ab',                            // too short
    'A',                             // uppercase
    'slug with spaces',
    'slug_underscore',
    'a'.repeat(101),                 // too long
  ])('rejects invalid slug: %s', (slug) => {
    expect(isValidProductSlug(slug)).toBe(false)
  })
})

describe('isValidProductImageUrl', () => {
  it('accepts root-relative paths', () => {
    expect(isValidProductImageUrl('/images/product.jpg')).toBe(true)
  })

  it('accepts https URLs', () => {
    expect(isValidProductImageUrl('https://cdn.example.com/img.png')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(isValidProductImageUrl('http://localhost/img.png')).toBe(true)
  })

  it('accepts base64 data URIs', () => {
    expect(isValidProductImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidProductImageUrl('')).toBe(false)
  })

  it('rejects paths with spaces', () => {
    expect(isValidProductImageUrl('/images/my file.jpg')).toBe(false)
  })

  it('rejects non-http protocols', () => {
    expect(isValidProductImageUrl('ftp://example.com/img.png')).toBe(false)
  })

  it('rejects random text', () => {
    expect(isValidProductImageUrl('not a url')).toBe(false)
  })
})

describe('bytesToHex', () => {
  it('converts empty array', () => {
    expect(bytesToHex(new Uint8Array([]))).toBe('')
  })

  it('converts bytes to lowercase hex', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff')
  })
})

describe('sha256Hex', () => {
  it('returns 64-char hex hash', async () => {
    const hash = await sha256Hex('hello')
    expect(hash).toHaveLength(64)
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true)
  })

  it('is deterministic', async () => {
    const a = await sha256Hex('test-value')
    const b = await sha256Hex('test-value')
    expect(a).toBe(b)
  })

  it('produces different hashes for different inputs', async () => {
    const a = await sha256Hex('input-a')
    const b = await sha256Hex('input-b')
    expect(a).not.toBe(b)
  })
})

describe('escapeHtml', () => {
  it('escapes &, <, >, "', () => {
    expect(escapeHtml('<b>"Foo" & Bar</b>')).toBe('&lt;b&gt;&quot;Foo&quot; &amp; Bar&lt;/b&gt;')
  })

  it('returns unchanged string with no special chars', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })
})
