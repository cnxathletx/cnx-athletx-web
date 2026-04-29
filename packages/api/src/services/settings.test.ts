import { describe, expect, it } from 'vitest'
import type { Env } from '../lib/types'
import {
  ALLOWED_SETTING_KEYS,
  loadSettings,
  loadSettingsMap,
  parseEnabledPaymentMethods,
  parseSettings,
  validateSettingUpdate,
} from './settings'

function envWithSettings(rows: Array<{ key: string; value: string }>): Env {
  return {
    DB: {
      prepare(sql: string) {
        return {
          bind(..._values: unknown[]) {
            return this
          },
          async all<T>() {
            return { results: rows as T[] }
          },
        }
      },
    },
  } as unknown as Env
}

describe('settings service', () => {
  it('parses typed settings with defaults', () => {
    expect(parseSettings({})).toEqual({
      shipping_flat_rate: 10000,
      shipping_free_threshold: 0,
      payment_deadline_hours: 24,
      payment_methods_enabled: [],
    })
  })

  it('uses numeric fallbacks when stored values are invalid', () => {
    expect(parseSettings({
      shipping_flat_rate: 'not-a-number',
      shipping_free_threshold: '-10',
      payment_deadline_hours: '0',
    })).toMatchObject({
      shipping_flat_rate: 10000,
      shipping_free_threshold: 0,
      payment_deadline_hours: 24,
    })
  })

  it('parses enabled payment methods from a JSON string', () => {
    expect(parseEnabledPaymentMethods('["promptpay","bank_transfer",42]')).toEqual(['promptpay', 'bank_transfer'])
    expect(parseEnabledPaymentMethods('bad json')).toEqual([])
    expect(parseEnabledPaymentMethods(undefined)).toEqual([])
  })

  it('loads raw settings maps from D1', async () => {
    const map = await loadSettingsMap(envWithSettings([
      { key: 'shipping_flat_rate', value: '12000' },
      { key: 'payment_methods_enabled', value: '["promptpay"]' },
    ]))

    expect(map).toEqual({
      shipping_flat_rate: '12000',
      payment_methods_enabled: '["promptpay"]',
    })
  })

  it('loads typed settings from D1', async () => {
    const settings = await loadSettings(envWithSettings([
      { key: 'shipping_flat_rate', value: '12000' },
      { key: 'payment_deadline_hours', value: '48' },
      { key: 'payment_methods_enabled', value: '["promptpay"]' },
    ]))

    expect(settings).toEqual({
      shipping_flat_rate: 12000,
      shipping_free_threshold: 0,
      payment_deadline_hours: 48,
      payment_methods_enabled: ['promptpay'],
    })
  })

  it('owns the admin-editable setting key registry', () => {
    expect(ALLOWED_SETTING_KEYS).toContain('shipping_flat_rate')
    expect(ALLOWED_SETTING_KEYS).toContain('payment_methods_enabled')
    expect(ALLOWED_SETTING_KEYS).not.toContain('unknown')
  })

  it('validates admin setting updates', () => {
    expect(validateSettingUpdate('payment_methods_enabled', '["promptpay"]')).toBeNull()
    expect(validateSettingUpdate('payment_methods_enabled', '{}')).toBe('payment_methods_enabled must be a JSON array of strings')
    expect(validateSettingUpdate('shipping_flat_rate', '10000')).toBeNull()
    expect(validateSettingUpdate('shipping_flat_rate', '-1')).toBe('shipping_flat_rate must be a non-negative integer string')
    expect(validateSettingUpdate('payment_deadline_hours', '0')).toBe('payment_deadline_hours must be a positive integer string')
    expect(validateSettingUpdate('rate_limit_checkout_per_ip_max', '10')).toBeNull()
    expect(validateSettingUpdate('rate_limit_checkout_per_ip_max', '0')).toBe('rate_limit_checkout_per_ip_max must be a positive integer string')
    expect(validateSettingUpdate('unknown', 'x')).toBe('Unknown setting: unknown')
  })
})
