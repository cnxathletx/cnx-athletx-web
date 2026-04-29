export const ORDER_STATUS = {
  pendingPayment: 'pending_payment',
  awaitingGateway: 'awaiting_gateway',
  paid: 'paid',
  failed: 'failed',
  packed: 'packed',
  shipped: 'shipped',
  delivered: 'delivered',
  refunded: 'refunded',
  cancelled: 'cancelled',
} as const

export const ORDER_STATUSES = [
  ORDER_STATUS.pendingPayment,
  ORDER_STATUS.awaitingGateway,
  ORDER_STATUS.paid,
  ORDER_STATUS.failed,
  ORDER_STATUS.packed,
  ORDER_STATUS.shipped,
  ORDER_STATUS.delivered,
  ORDER_STATUS.refunded,
  ORDER_STATUS.cancelled,
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export type WebhookOrderOutcome =
  | typeof ORDER_STATUS.paid
  | typeof ORDER_STATUS.failed
  | typeof ORDER_STATUS.refunded

const ORDER_STATUS_SET: ReadonlySet<string> = new Set(ORDER_STATUSES)

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [ORDER_STATUS.pendingPayment]: [
    ORDER_STATUS.awaitingGateway,
    ORDER_STATUS.paid,
    ORDER_STATUS.failed,
    ORDER_STATUS.cancelled,
  ],
  [ORDER_STATUS.awaitingGateway]: [
    ORDER_STATUS.paid,
    ORDER_STATUS.failed,
    ORDER_STATUS.cancelled,
  ],
  [ORDER_STATUS.paid]: [
    ORDER_STATUS.packed,
    ORDER_STATUS.refunded,
    ORDER_STATUS.cancelled,
  ],
  [ORDER_STATUS.failed]: [],
  [ORDER_STATUS.packed]: [
    ORDER_STATUS.shipped,
    ORDER_STATUS.refunded,
    ORDER_STATUS.cancelled,
  ],
  [ORDER_STATUS.shipped]: [
    ORDER_STATUS.delivered,
    ORDER_STATUS.refunded,
  ],
  [ORDER_STATUS.delivered]: [
    ORDER_STATUS.refunded,
  ],
  [ORDER_STATUS.refunded]: [],
  [ORDER_STATUS.cancelled]: [],
}

export const PAYMENT_PROOF_ORDER_STATUSES = [
  ORDER_STATUS.pendingPayment,
] as const satisfies readonly OrderStatus[]

export const REVENUE_ORDER_STATUSES = [
  ORDER_STATUS.paid,
  ORDER_STATUS.packed,
  ORDER_STATUS.shipped,
  ORDER_STATUS.delivered,
] as const satisfies readonly OrderStatus[]

export const REVIEW_ELIGIBLE_ORDER_STATUSES = [
  ORDER_STATUS.shipped,
  ORDER_STATUS.delivered,
] as const satisfies readonly OrderStatus[]

export const WEBHOOK_PRE_PAYMENT_SOURCE_STATUSES = [
  ORDER_STATUS.pendingPayment,
  ORDER_STATUS.awaitingGateway,
] as const satisfies readonly OrderStatus[]

export const REFUNDABLE_ORDER_STATUSES = [
  ORDER_STATUS.paid,
  ORDER_STATUS.packed,
  ORDER_STATUS.shipped,
  ORDER_STATUS.delivered,
] as const satisfies readonly OrderStatus[]

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && ORDER_STATUS_SET.has(value)
}

export function parseOrderStatus(value: unknown): OrderStatus | null {
  return isOrderStatus(value) ? value : null
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to)
}

export function isPaymentProofOrderStatus(status: OrderStatus): boolean {
  return (PAYMENT_PROOF_ORDER_STATUSES as readonly OrderStatus[]).includes(status)
}

export function mapWebhookOutcomeToOrderStatus(outcome: WebhookOrderOutcome): WebhookOrderOutcome {
  return outcome
}

export function allowedWebhookTransitionSources(outcome: WebhookOrderOutcome): readonly OrderStatus[] {
  return outcome === ORDER_STATUS.refunded
    ? REFUNDABLE_ORDER_STATUSES
    : WEBHOOK_PRE_PAYMENT_SOURCE_STATUSES
}

export function orderStatusSqlList(statuses: readonly OrderStatus[]): string {
  return `(${statuses.map((status) => `'${status}'`).join(',')})`
}
