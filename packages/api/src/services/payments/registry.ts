import type { SiteSettingsMap } from '../../lib/types'
import type { PaymentProvider } from './types'
import { promptpayProvider } from './promptpay'
import { bankTransferProvider } from './bank-transfer'

const ALL: PaymentProvider[] = [promptpayProvider, bankTransferProvider]

export function getProvider(id: string): PaymentProvider | null {
  return ALL.find((p) => p.id === id) ?? null
}

export function parseEnabledMethods(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

export function listEnabledProviders(settings: SiteSettingsMap): PaymentProvider[] {
  const enabledIds = new Set(parseEnabledMethods(settings.payment_methods_enabled))
  return ALL.filter((p) => enabledIds.has(p.id) && p.isEnabled(settings))
}
