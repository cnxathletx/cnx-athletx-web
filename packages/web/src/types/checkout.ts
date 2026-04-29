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

export interface SubmitPaymentProofResponse {
  success: boolean
  message: string
}
