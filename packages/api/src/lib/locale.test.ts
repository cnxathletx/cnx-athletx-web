import { describe, it, expect } from 'vitest'
import { parseAcceptLanguage, resolveQueryLocale, SUPPORTED_LOCALES } from './locale'

describe('SUPPORTED_LOCALES', () => {
  it('exposes en and th', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'th'])
  })
})

describe('parseAcceptLanguage', () => {
  it('returns en when header is null', () => {
    expect(parseAcceptLanguage(null)).toBe('en')
  })

  it('returns en when header is empty', () => {
    expect(parseAcceptLanguage('')).toBe('en')
  })

  it('returns th when th appears first', () => {
    expect(parseAcceptLanguage('th-TH,en;q=0.5')).toBe('th')
  })

  it('returns th when th has higher q than en', () => {
    expect(parseAcceptLanguage('en;q=0.5,th;q=0.9')).toBe('th')
  })

  it('returns en when en has higher q than th', () => {
    expect(parseAcceptLanguage('en-US,en;q=0.9,th;q=0.5')).toBe('en')
  })

  it('returns en for unsupported languages', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9')).toBe('en')
  })

  it('handles bare th without region', () => {
    expect(parseAcceptLanguage('th')).toBe('th')
  })

  it('treats malformed q values as default 1.0', () => {
    expect(parseAcceptLanguage('th;q=garbage,en')).toBe('th')
  })
})

describe('resolveQueryLocale', () => {
  it('returns en when query param is missing', () => {
    expect(resolveQueryLocale(null)).toBe('en')
  })

  it('returns th when query param is th', () => {
    expect(resolveQueryLocale('th')).toBe('th')
  })

  it('lowercases input', () => {
    expect(resolveQueryLocale('TH')).toBe('th')
  })

  it('returns en for unsupported value', () => {
    expect(resolveQueryLocale('jp')).toBe('en')
  })
})
