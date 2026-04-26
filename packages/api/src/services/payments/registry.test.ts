import { describe, it, expect } from 'vitest'
import { getProvider, listEnabledProviders, parseEnabledMethods } from './registry'

describe('payments registry', () => {
  it('getProvider resolves promptpay', () => {
    const p = getProvider('promptpay')
    expect(p?.id).toBe('promptpay')
  })

  it('getProvider resolves bank_transfer', () => {
    const p = getProvider('bank_transfer')
    expect(p?.id).toBe('bank_transfer')
  })

  it('getProvider returns null for unknown id', () => {
    expect(getProvider('unknown')).toBeNull()
    expect(getProvider('2c2p')).toBeNull()
  })

  it('parseEnabledMethods parses JSON array', () => {
    expect(parseEnabledMethods('["promptpay","bank_transfer"]')).toEqual(['promptpay', 'bank_transfer'])
  })

  it('parseEnabledMethods returns empty array for invalid JSON', () => {
    expect(parseEnabledMethods('not json')).toEqual([])
    expect(parseEnabledMethods(undefined)).toEqual([])
    expect(parseEnabledMethods('{"x":1}')).toEqual([])
  })

  it('listEnabledProviders filters to enabled + isEnabled', () => {
    const enabled = listEnabledProviders({
      payment_methods_enabled: '["promptpay","bank_transfer"]',
      promptpay_number: '0812345678',
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
    })
    expect(enabled.map((p) => p.id)).toEqual(['promptpay'])
  })

  it('listEnabledProviders empty when payment_methods_enabled missing', () => {
    expect(listEnabledProviders({ promptpay_number: '0812345678' })).toEqual([])
  })

  it('listEnabledProviders empty when method id not in registry', () => {
    expect(listEnabledProviders({ payment_methods_enabled: '["nonexistent"]' })).toEqual([])
  })
})
