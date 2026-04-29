export const SUPPORTED_LOCALES = ['en', 'th'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES)

export function resolveQueryLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'en'
  const value = raw.toLowerCase()
  return SUPPORTED_SET.has(value) ? (value as Locale) : 'en'
}

interface RankedLang {
  tag: string
  q: number
}

export function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return 'en'

  const parts = header.split(',')
  const ranked: RankedLang[] = []

  for (const part of parts) {
    const segments = part.trim().split(';')
    const tag = segments[0]?.trim().toLowerCase()
    if (!tag) continue

    let q = 1.0
    for (let i = 1; i < segments.length; i++) {
      const s = segments[i].trim()
      if (s.startsWith('q=')) {
        const parsed = parseFloat(s.slice(2))
        if (Number.isFinite(parsed)) q = parsed
      }
    }

    ranked.push({ tag, q })
  }

  ranked.sort((a, b) => b.q - a.q)

  for (const { tag, q } of ranked) {
    if (q <= 0) continue
    const primary = tag.split('-')[0]
    if (SUPPORTED_SET.has(primary)) return primary as Locale
  }

  return 'en'
}
