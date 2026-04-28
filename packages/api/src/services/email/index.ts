// Re-exports preserving the original public surface of services/email.ts so
// existing imports from '../services/email' keep working unchanged.

export { brand, type Brand } from './brand'
export {
  emailLayout,
  itemsTableHtml,
  orderTotalsHtml,
  renderInstructionsHtml,
  formatThb,
  type EmailItem,
} from './layout'
export {
  orderTemplates,
  adminTemplates,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
  type OrderTemplateCtx,
  type RenderedEmail,
  type AdminOrderAddress,
  type AdminNewOrderCtx,
  type AdminNewChatCtx,
  type MagicLinkCtx,
  type ReviewPromptCtx,
} from './templates'
export {
  sendOrderEmail,
  sendAdminNewOrderEmail,
  sendAdminNewChatEmail,
  sendMagicLinkEmail,
  sendReviewPromptEmail,
  fetchOrderEmailData,
  type OrderEmailData,
  type ShipmentData,
  type NewChatEmailData,
  type ReviewPromptEmailInput,
} from './send'

// --- Back-compat wrappers for existing email.test.ts ---

import { orderTemplates, adminTemplates, reviewPromptTemplate } from './templates'
import type {
  OrderTemplateCtx,
  AdminNewOrderCtx,
  ReviewPromptCtx,
} from './templates'
import type { OrderEmailData, ShipmentData } from './send'
import type { InstructionsBlock } from '../payments/types'
import type { Locale } from '../../lib/locale'

function legacyOrderInput(data: OrderEmailData): OrderTemplateCtx['order'] {
  return { ...data, locale: (data.locale ?? 'en') as Locale }
}

export function buildOrderCreatedEmail(
  order: OrderEmailData,
  instructions: InstructionsBlock | null
): string {
  return orderTemplates.order_created.en({
    order: legacyOrderInput(order),
    instructions,
  }).html
}

export function buildPaymentConfirmedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_confirmed.en({ order: legacyOrderInput(order) }).html
}

export function buildOrderShippedEmail(order: OrderEmailData, shipment: ShipmentData): string {
  return orderTemplates.order_shipped.en({ order: legacyOrderInput(order), shipment }).html
}

export function buildOrderCancelledEmail(order: OrderEmailData): string {
  return orderTemplates.order_cancelled.en({ order: legacyOrderInput(order) }).html
}

export function buildPaymentFailedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_failed.en({ order: legacyOrderInput(order) }).html
}

export function buildPaymentRefundedEmail(order: OrderEmailData): string {
  return orderTemplates.payment_refunded.en({ order: legacyOrderInput(order) }).html
}

export function buildAdminNewOrderEmail(
  order: OrderEmailData,
  address?: AdminNewOrderCtx['address'],
  discountCode?: string
): string {
  return adminTemplates.new_order.en({
    order: legacyOrderInput(order),
    address,
    discountCode,
  }).html
}

export interface BuiltEmail {
  subject: string
  html: string
}

export interface ReviewPromptEmailInputLegacy extends ReviewPromptCtx {
  customer_email: string
  locale: Locale | string
}

export function buildReviewPromptEmail(input: ReviewPromptEmailInputLegacy): BuiltEmail {
  const locale: Locale = input.locale === 'th' ? 'th' : 'en'
  return reviewPromptTemplate[locale]({
    customer_name: input.customer_name,
    product_lines: input.product_lines,
    review_url: input.review_url,
    order_id: input.order_id,
  })
}
