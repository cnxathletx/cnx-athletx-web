import type { PaymentProvider } from './types'

export const promptpayProvider: PaymentProvider = {
  id: 'promptpay',
  displayName: { en: 'PromptPay', th: 'พร้อมเพย์' },

  isEnabled(settings) {
    const num = settings.promptpay_number
    return typeof num === 'string' && num.trim() !== ''
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
}
