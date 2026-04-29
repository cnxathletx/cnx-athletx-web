export interface MoneyFormatOptions {
  locale?: string
  currency?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  THB: '฿',
  USD: '$',
}

export function toSatang(amount: number): number {
  return Math.round(amount * 100)
}

export function fromSatang(satang: number): number {
  return satang / 100
}

export function formatMoney(satang: number, options: MoneyFormatOptions = {}): string {
  const currency = options.currency ?? 'THB'
  const locale = options.locale ?? 'en-US'
  const amount = fromSatang(satang)
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  })
  return `${CURRENCY_SYMBOLS[currency] ?? `${currency} `}${formatted}`
}

export function formatThb(satang: number): string {
  return formatMoney(satang, {
    locale: 'en-US',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
