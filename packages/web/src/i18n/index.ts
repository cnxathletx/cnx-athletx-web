import { createI18n } from 'vue-i18n'
import en from './en.json'
import th from './th.json'

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
