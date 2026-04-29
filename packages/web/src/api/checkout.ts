import { ApiClientError, apiFetch, type ApiErrorDetails, type ApiErrorPayload } from './client'
import type {
  ApiOrder,
  CheckoutPayload,
  CheckoutResponse,
  SubmitPaymentProofResponse,
} from '../types/checkout'

export type {
  ApiOrder,
  ApiOrderItem,
  ApiPaymentProof,
  BankTransferInstructionsData,
  CheckoutPayload,
  CheckoutResponse,
  PaymentIntent,
  PromptPayInstructionsData,
  SubmitPaymentProofResponse,
} from '../types/checkout'

export class CheckoutError extends ApiClientError {
  constructor(message: string, status: number, details?: ApiErrorDetails[]) {
    super(message, status, details)
    this.name = 'CheckoutError'
  }
}

function checkoutError(payload: ApiErrorPayload, response: Response): CheckoutError {
  return new CheckoutError(payload.error || 'Request failed', response.status, payload.details)
}

export async function submitCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  return apiFetch('/api/checkout', {
    method: 'POST',
    body: payload,
    parseError: checkoutError,
  })
}

export async function fetchOrder(orderId: string): Promise<ApiOrder> {
  const data = await apiFetch<{ order: ApiOrder }>(`/api/orders/${encodeURIComponent(orderId)}`, {
    parseError: (payload, response) => {
      if (response.status === 404) return new Error('Order not found')
      return new Error(payload.error || 'Failed to fetch order')
    },
  })
  return data.order
}

export async function submitPaymentProof(orderId: string, proofValue: string): Promise<SubmitPaymentProofResponse> {
  return apiFetch(`/api/orders/${encodeURIComponent(orderId)}/payment-proof`, {
    method: 'POST',
    body: { proof_value: proofValue },
    parseError: checkoutError,
  })
}
