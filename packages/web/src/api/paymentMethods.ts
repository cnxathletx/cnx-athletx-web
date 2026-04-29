import { apiFetch } from './client'
import type { PaymentIntent } from '../types/checkout'
import type { PaymentMethod } from '../types/payment'

export type { PaymentMethod } from '../types/payment'

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const data = await apiFetch<{ methods: PaymentMethod[] }>('/api/payment-methods', {
    parseError: (_payload, response) => new Error(`Failed to fetch payment methods (${response.status})`),
  })
  return data.methods
}

export async function fetchOrderIntent(orderId: string): Promise<{ intent: PaymentIntent; status: string }> {
  return apiFetch(`/api/orders/${encodeURIComponent(orderId)}/intent`, {
    parseError: (_payload, response) => new Error(`Failed to fetch order intent (${response.status})`),
  })
}
