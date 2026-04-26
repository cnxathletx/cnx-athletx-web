import type { PaymentProvider } from './types'

const REQUIRED_KEYS = ['bank_name', 'bank_account_name', 'bank_account_number'] as const

export const bankTransferProvider: PaymentProvider = {
  id: 'bank_transfer',
  displayName: { en: 'Bank transfer', th: 'โอนเงินผ่านธนาคาร' },

  isEnabled(settings) {
    return REQUIRED_KEYS.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
  },

  async createIntent({ order, settings }) {
    for (const k of REQUIRED_KEYS) {
      if (!settings[k] || settings[k].trim() === '') {
        throw new Error(`bank-transfer setting "${k}" is required`)
      }
    }
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      kind: 'instructions',
      provider: 'bank_transfer',
      instructions: {
        bank_name: settings.bank_name,
        account_name: settings.bank_account_name,
        account_number: settings.bank_account_number,
        amount_thb: amountThb,
      },
    }
  },
}
