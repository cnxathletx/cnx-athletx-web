import { createI18n } from 'vue-i18n'
import { registerMessageCompiler, compile, registerMessageResolver, resolveValue, registerLocaleFallbacker, fallbackWithLocaleChain } from '@intlify/core-base'
import en from './en.json'
import th from './th.json'

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

const i18n = createI18n({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: 'en',
  messages: { en, th },
})

export function setLocale(locale: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(i18n.global.locale as any).value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // ignore
  }
  document.documentElement.lang = locale
}

export default i18n
