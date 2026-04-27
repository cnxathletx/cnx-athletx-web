import type { PaymentProvider } from './types'

const REQUIRED = ['bank_name', 'bank_account_name', 'bank_account_number'] as const

function formatThbAmount(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const bankTransferProvider: PaymentProvider = {
  id: 'bank_transfer',
  displayName: { en: 'Bank transfer', th: 'โอนเงินผ่านธนาคาร' },
  requiredSettingKeys: REQUIRED,

  isEnabled(settings) {
    return REQUIRED.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
  },

  async createIntent({ order, settings }) {
    for (const k of REQUIRED) {
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

  renderInstructions({ order, settings }) {
    if (!REQUIRED.every((k) => settings[k] && settings[k].trim() !== '')) return null
    return {
      title: 'Payment Details',
      rows: [
        { label: 'Amount', value: formatThbAmount(order.total_thb) },
        { label: 'Bank', value: settings.bank_name },
        { label: 'Account Name', value: settings.bank_account_name },
        { label: 'Account Number', value: settings.bank_account_number },
      ],
      footnote: 'Please use your order ID as the transfer reference.',
    }
  },
}
