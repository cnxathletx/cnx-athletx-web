import type { Env, SiteSettingsMap } from '../lib/types'

export interface TypedSettings {
  shipping_flat_rate: number
  shipping_free_threshold: number
  payment_deadline_hours: number
  payment_methods_enabled: string[]
}

export const DEFAULT_SETTINGS: TypedSettings = {
  shipping_flat_rate: 10000,
  shipping_free_threshold: 0,
  payment_deadline_hours: 24,
  payment_methods_enabled: [],
}

const RATE_LIMIT_SETTING_KEYS = [
  'rate_limit_checkout_per_ip_max',
  'rate_limit_checkout_per_ip_window_sec',
  'rate_limit_checkout_global_max',
  'rate_limit_checkout_global_window_sec',
  'rate_limit_magic_link_per_ip_max',
  'rate_limit_magic_link_per_ip_window_sec',
  'rate_limit_magic_link_global_max',
  'rate_limit_magic_link_global_window_sec',
  'rate_limit_chat_create_per_ip_max',
  'rate_limit_chat_create_per_ip_window_sec',
  'rate_limit_chat_create_global_max',
  'rate_limit_chat_create_global_window_sec',
] as const

export const ALLOWED_SETTING_KEYS = [
  'shipping_flat_rate',
  'shipping_free_threshold',
  'promptpay_number',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'payment_deadline_hours',
  'payment_methods_enabled',
  ...RATE_LIMIT_SETTING_KEYS,
] as const

const ALLOWED_SETTING_KEY_SET = new Set<string>(ALLOWED_SETTING_KEYS)

export type SettingKey = (typeof ALLOWED_SETTING_KEYS)[number]

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseEnabledPaymentMethods(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

export function parseSettings(map: SiteSettingsMap): TypedSettings {
  return {
    shipping_flat_rate: parseNonNegativeInt(map.shipping_flat_rate, DEFAULT_SETTINGS.shipping_flat_rate),
    shipping_free_threshold: parseNonNegativeInt(map.shipping_free_threshold, DEFAULT_SETTINGS.shipping_free_threshold),
    payment_deadline_hours: parsePositiveInt(map.payment_deadline_hours, DEFAULT_SETTINGS.payment_deadline_hours),
    payment_methods_enabled: parseEnabledPaymentMethods(map.payment_methods_enabled),
  }
}

export async function loadSettingsMap(env: Env): Promise<SiteSettingsMap> {
  const { results } = await env.DB.prepare(`SELECT key, value FROM site_settings`).all<{
    key: string
    value: string
  }>()

  const settingsMap: SiteSettingsMap = {}
  for (const row of results) {
    settingsMap[row.key] = row.value
  }
  return settingsMap
}

export async function loadSettings(env: Env): Promise<TypedSettings> {
  return parseSettings(await loadSettingsMap(env))
}

function validateIntegerString(key: string, value: string, positive: boolean): string | null {
  const parsed = Number(value)
  const valid = Number.isInteger(parsed) && (positive ? parsed > 0 : parsed >= 0)
  if (valid) return null
  return `${key} must be a ${positive ? 'positive' : 'non-negative'} integer string`
}

export function validateSettingUpdate(key: string, value: string): string | null {
  if (!ALLOWED_SETTING_KEY_SET.has(key)) {
    return `Unknown setting: ${key}`
  }

  if (key === 'shipping_flat_rate' || key === 'shipping_free_threshold') {
    return validateIntegerString(key, value, false)
  }

  if (key === 'payment_deadline_hours') {
    return validateIntegerString(key, value, true)
  }

  if ((RATE_LIMIT_SETTING_KEYS as readonly string[]).includes(key)) {
    return validateIntegerString(key, value, true)
  }

  if (key === 'payment_methods_enabled') {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      return 'payment_methods_enabled must be a JSON array of strings'
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      return 'payment_methods_enabled must be a JSON array of strings'
    }
  }

  return null
}
