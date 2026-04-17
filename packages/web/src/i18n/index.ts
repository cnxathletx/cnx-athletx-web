import { createI18n } from 'vue-i18n'
import { registerMessageCompiler, compile, registerMessageResolver, resolveValue, registerLocaleFallbacker, fallbackWithLocaleChain } from '@intlify/core-base'
import en from './en.json'

// vue-i18n's entry registers these as side-effects, but tree-shaking strips them.
// Register explicitly so the message compiler survives production builds.
registerMessageCompiler(compile)
registerMessageResolver(resolveValue)
registerLocaleFallbacker(fallbackWithLocaleChain)

export const SUPPORTED_LOCALES = ['en', 'th'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const LOCALE_LABELS: Record<SupportedLocale, string> = { en: 'English', th: 'ไทย' }

const STORAGE_KEY = 'cnx-locale'

function getSavedLocale(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
}

const startupLocale = getSavedLocale()

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en },
})

const loadedLocales = new Set<string>(['en'])

async function loadLocaleMessages(locale: string) {
  if (loadedLocales.has(locale)) return
  if (locale === 'th') {
    const messages = (await import('./th.json')).default
    i18n.global.setLocaleMessage('th', messages)
    loadedLocales.add('th')
  }
}

export async function setLocale(locale: string) {
  await loadLocaleMessages(locale)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(i18n.global.locale as any).value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
  document.documentElement.lang = locale
}

// Apply saved locale after i18n is created (non-blocking if English)
if (startupLocale !== 'en') {
  void setLocale(startupLocale)
}

export default i18n
