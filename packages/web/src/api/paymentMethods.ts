import { apiUrl } from './client'
import type { PaymentIntent } from './checkout'

export interface PaymentMethod {
  id: string
  name: { en: string; th: string }
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const res = await fetch(apiUrl('/api/payment-methods'))
  if (!res.ok) throw new Error(`Failed to fetch payment methods (${res.status})`)
  const data = (await res.json()) as { methods: PaymentMethod[] }
  return data.methods
}

export async function fetchOrderIntent(orderId: string): Promise<{ intent: PaymentIntent; status: string }> {
  const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderId)}/intent`), {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to fetch order intent (${res.status})`)
  return (await res.json()) as { intent: PaymentIntent; status: string }
}
