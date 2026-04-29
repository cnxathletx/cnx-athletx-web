import type { PaymentProvider } from './types'
import { formatThb } from '../../lib/money'

const REQUIRED = ['promptpay_number'] as const

export const promptpayProvider: PaymentProvider = {
  id: 'promptpay',
  displayName: { en: 'PromptPay', th: 'พร้อมเพย์' },
  requiredSettingKeys: REQUIRED,

  isEnabled(settings) {
    return REQUIRED.every((k) => typeof settings[k] === 'string' && settings[k].trim() !== '')
  },

  async createIntent({ order, settings }) {
    const num = settings.promptpay_number
    if (!num || num.trim() === '') {
      throw new Error('promptpay_number setting is required')
    }
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      kind: 'instructions',
      provider: 'promptpay',
      instructions: {
        promptpay_number: num,
        amount_thb: amountThb,
        qr_url: `https://promptpay.io/${num}/${amountThb}.png`,
      },
    }
  },

  renderInstructions({ order, settings }) {
    const num = settings.promptpay_number
    if (!num || num.trim() === '') return null
    const amountThb = (order.total_thb / 100).toFixed(2)
    return {
      title: 'Payment Details',
      rows: [
        { label: 'Amount', value: formatThb(order.total_thb) },
        { label: 'PromptPay', value: num },
      ],
      qrImageUrl: `https://promptpay.io/${num}/${amountThb}.png`,
      footnote: 'Please use your order ID as the transfer reference.',
    }
  },
}
