import { apiUrl } from './client'

export interface CheckoutPayload {
  items: { product_id: number; quantity: number }[]
  customer: {
    name: string
    email: string
    phone: string
    address: {
      line1: string
      line2: string
      district: string
      province: string
      postal_code: string
    }
  }
  idempotency_key: string
  discount_code?: string
  payment_method: string
  locale?: 'en' | 'th'
}

export type PaymentIntent =
  | {
      kind: 'instructions'
      provider: string
      instructions: Record<string, unknown>
    }
  | {
      kind: 'redirect'
      provider: string
      url: string
      expires_at?: string
    }
  | {
      kind: 'sdk'
      provider: string
      client_token: string
      provider_data: unknown
    }

export interface PromptPayInstructionsData {
  promptpay_number: string
  qr_url: string
  amount_thb: string
}

export interface BankTransferInstructionsData {
  bank_name: string
  account_name: string
  account_number: string
  amount_thb: string
}

export interface CheckoutResponse {
  order_id: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  intent: PaymentIntent
  message?: string
}

export interface ApiOrderItem {
  product_name: string
  quantity: number
  line_total_thb: number
}

export interface ApiPaymentProof {
  proof_type: 'reference' | 'image_url'
  proof_value: string
  submitted_at: string
}

export interface ApiOrder {
  id: string
  status: string
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  locale: 'en' | 'th'
  created_at: string
  items: ApiOrderItem[]
  shipment: { carrier: string; tracking_number: string; shipped_at: string } | null
  payment_submitted: boolean
  latest_payment_proof: ApiPaymentProof | null
}

export interface ApiError {
  error: string
  details?: { field: string; message: string }[]
  current_status?: string
}

export async function submitCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  const res = await fetch(apiUrl('/api/checkout'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    const err = data as ApiError
    throw new CheckoutError(err.error, res.status, err.details)
  }

  return data as CheckoutResponse
}

export async function fetchOrder(orderId: string): Promise<ApiOrder> {
  const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderId)}`), {
    credentials: 'include',
  })

  if (res.status === 404) throw new Error('Order not found')
  if (!res.ok) throw new Error('Failed to fetch order')

  const data = (await res.json()) as { order: ApiOrder }
  return data.order
}

export interface SubmitPaymentProofResponse {
  success: boolean
  message: string
}

export async function submitPaymentProof(orderId: string, proofValue: string): Promise<SubmitPaymentProofResponse> {
  const res = await fetch(apiUrl(`/api/orders/${encodeURIComponent(orderId)}/payment-proof`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof_value: proofValue }),
  })

  const data = (await res.json()) as SubmitPaymentProofResponse | ApiError

  if (!res.ok) {
    const err = data as ApiError
    throw new CheckoutError(err.error, res.status, err.details)
  }

  return data as SubmitPaymentProofResponse
}

export class CheckoutError extends Error {
  status: number
  details?: { field: string; message: string }[]

  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}
