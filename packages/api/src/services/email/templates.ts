import { escapeHtml } from '../../lib/utils'
import type { InstructionsBlock } from '../payments/types'
import {
  emailLayout,
  itemsTableHtml,
  orderTotalsHtml,
  renderInstructionsHtml,
  formatThb,
} from './layout'
import { brand } from './brand'
import type { Locale } from '../../lib/locale'

export type { Locale }

export type OrderEvent =
  | 'order_created'
  | 'payment_confirmed'
  | 'order_shipped'
  | 'order_cancelled'
  | 'payment_failed'
  | 'payment_refunded'

export interface RenderedEmail {
  subject: string
  html: string
}

export interface OrderEmailItem {
  name: string
  quantity: number
  line_total_thb: number
}

export interface OrderRenderInput {
  order_id: string
  customer_name: string
  customer_email: string
  items: OrderEmailItem[]
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
  locale: Locale
}

export interface OrderTemplateCtx {
  order: OrderRenderInput
  instructions?: InstructionsBlock | null
  shipment?: { carrier: string; tracking_number: string }
}

type OrderRenderer = (ctx: OrderTemplateCtx) => RenderedEmail

const orderCreatedEn: OrderRenderer = ({ order, instructions }) => {
  const paymentHtml = instructions ? renderInstructionsHtml(instructions) : ''
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Order Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, thank you for your order.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}
    ${paymentHtml}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Once you've completed the transfer, you can submit your payment proof on our website. We'll verify it and get your order packed.</p>`

  return {
    subject: `Order Confirmed — ${order.order_id}`,
    html: emailLayout(`Order Confirmed — ${brand.name}`, body),
  }
}

const paymentConfirmedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Payment Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, we've verified your payment. Your order is now being prepared.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <div style="background: ${brand.palette.primary}; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 600;">Your order is being packed and will ship soon.</p>
    </div>

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">We'll send you another email with tracking information once your order ships.</p>`

  return {
    subject: `Payment Confirmed — ${order.order_id}`,
    html: emailLayout(`Payment Confirmed — ${brand.name}`, body),
  }
}

const orderShippedEn: OrderRenderer = ({ order, shipment }) => {
  if (!shipment) throw new Error('order_shipped requires shipment')
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Your Order Has Shipped</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, your order is on its way.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px; font-size: 16px; color: ${brand.palette.text};">Shipping Details</h3>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Carrier:</strong> ${escapeHtml(shipment.carrier)}</p>
      <p style="margin: 0; font-size: 14px;"><strong>Tracking Number:</strong> ${escapeHtml(shipment.tracking_number)}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Thank you for choosing ${escapeHtml(brand.name)}. We hope you enjoy your order!</p>`

  return {
    subject: `Your Order Has Shipped — ${order.order_id}`,
    html: emailLayout(`Your Order Has Shipped — ${brand.name}`, body),
  }
}

const orderCancelledEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Order Cancelled</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, your order has been cancelled.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">If you believe this was a mistake or have any questions, please contact us at ${escapeHtml(brand.contactEmail)}.</p>`

  return {
    subject: `Order Cancelled — ${order.order_id}`,
    html: emailLayout(`Order Cancelled — ${brand.name}`, body),
  }
}

const paymentFailedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.accent};">Payment Failed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, we couldn't confirm your payment for the order below.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">Please try the payment again from your order page, or contact us at <a href="mailto:contact@${brand.domain.replace(/^www\./, '')}" style="color: ${brand.palette.primary};">contact@${brand.domain.replace(/^www\./, '')}</a> for help.</p>`

  return {
    subject: `Payment Failed — ${order.order_id}`,
    html: emailLayout(`Payment Failed — ${brand.name}`, body),
  }
}

const paymentRefundedEn: OrderRenderer = ({ order }) => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Refund Issued</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Hi ${escapeHtml(order.customer_name)}, a refund of <strong>${formatThb(order.total_thb)}</strong> has been issued for the order below.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">The funds should appear in your account within 5–10 business days depending on your bank or card issuer.</p>`

  return {
    subject: `Refund Issued — ${order.order_id}`,
    html: emailLayout(`Refund Issued — ${brand.name}`, body),
  }
}

export const orderTemplates: Record<OrderEvent, Record<Locale, OrderRenderer>> = {
  order_created:     { en: orderCreatedEn,     th: (ctx) => orderCreatedEn(ctx) },
  payment_confirmed: { en: paymentConfirmedEn, th: (ctx) => paymentConfirmedEn(ctx) },
  order_shipped:     { en: orderShippedEn,     th: (ctx) => orderShippedEn(ctx) },
  order_cancelled:   { en: orderCancelledEn,   th: (ctx) => orderCancelledEn(ctx) },
  payment_failed:    { en: paymentFailedEn,    th: (ctx) => paymentFailedEn(ctx) },
  payment_refunded:  { en: paymentRefundedEn,  th: (ctx) => paymentRefundedEn(ctx) },
}

export interface AdminOrderAddress {
  line1: string
  line2?: string
  district: string
  province: string
  postal_code: string
}

export interface AdminNewOrderCtx {
  order: OrderRenderInput
  address?: AdminOrderAddress
  discountCode?: string
}

const adminNewOrderEn = ({ order, address, discountCode }: AdminNewOrderCtx): RenderedEmail => {
  let customerHtml = `<div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: ${brand.palette.text};">Customer</h3>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(order.customer_email)}</p>`

  if (address) {
    customerHtml += `<h3 style="margin: 16px 0 12px; font-size: 16px; color: ${brand.palette.text};">Shipping Address</h3>
    <p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line1)}</p>`
    if (address.line2) {
      customerHtml += `<p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line2)}</p>`
    }
    customerHtml += `<p style="margin: 0; font-size: 14px;">${escapeHtml(address.district)}, ${escapeHtml(address.province)} ${escapeHtml(address.postal_code)}</p>`
  }

  customerHtml += `</div>`

  const discountHtml = discountCode
    ? `<p style="margin: 0 0 4px; font-size: 14px;"><strong>Discount Code:</strong> ${escapeHtml(discountCode)}</p>`
    : ''

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">New Order Received</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">A new order has been placed and is awaiting payment.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: ${brand.palette.muted};">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${customerHtml}
    ${discountHtml}
    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}`

  return {
    subject: `New Order — ${order.order_id}`,
    html: emailLayout(`New Order — ${brand.name}`, body),
  }
}

export interface AdminNewChatCtx {
  guest_name: string
  guest_email: string
  initial_message: string
  created_at: string
}

const adminNewChatEn = (data: AdminNewChatCtx): RenderedEmail => {
  const adminUrl = `https://${brand.domain}/admin/chat`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">New Chat Started</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">A visitor has started a new support conversation.</p>

    <div style="background: ${brand.palette.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>From:</strong> ${escapeHtml(data.guest_name)}</p>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(data.guest_email)}</p>
      <p style="margin: 0 0 12px; font-size: 13px; color: ${brand.palette.muted};"><strong>Started:</strong> ${escapeHtml(data.created_at)}</p>
      <p style="margin: 12px 0 4px; font-size: 13px; color: ${brand.palette.muted};"><strong>First message:</strong></p>
      <div style="background: ${brand.palette.surface}; border-radius: 6px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(data.initial_message)}</div>
    </div>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${adminUrl}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Open Chat Dashboard
      </a>
    </p>`

  return {
    subject: `New chat from ${data.guest_name}`,
    html: emailLayout(`New Chat — ${brand.name}`, body),
  }
}

export const adminTemplates = {
  new_order: { en: adminNewOrderEn },
  new_chat:  { en: adminNewChatEn },
}

export interface MagicLinkCtx {
  magicLinkUrl: string
  expiryMinutes: number
}

const magicLinkEn = ({ magicLinkUrl, expiryMinutes }: MagicLinkCtx): RenderedEmail => {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: ${brand.palette.text};">Log in to ${escapeHtml(brand.name)}</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: ${brand.palette.muted};">Click the button below to log in. This link expires in ${expiryMinutes} minutes.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Log In
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${brand.palette.muted};">If you did not request this link, you can safely ignore this email.</p>
    <p style="margin: 8px 0 0; font-size: 12px; color: #777; word-break: break-all;">${magicLinkUrl}</p>`

  return {
    subject: `Log in to ${brand.name}`,
    html: emailLayout(`Log In — ${brand.name}`, body),
  }
}

export const magicLinkTemplate: Record<Locale, (ctx: MagicLinkCtx) => RenderedEmail> = {
  en: magicLinkEn,
  th: (ctx) => magicLinkEn(ctx),
}

export interface ReviewPromptCtx {
  customer_name: string
  product_lines: { name: string }[]
  review_url: string
  order_id: string
}

const reviewPromptEn = (input: ReviewPromptCtx): RenderedEmail => {
  const lineList = input.product_lines
    .map((p) => `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`)
    .join('')

  const subject = `How was your ${brand.name} protein?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">Thanks for your order, ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${brand.palette.muted};">We hope you're enjoying what you received. Your feedback helps other customers.</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Write a Review</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">Order ID: ${escapeHtml(input.order_id)}</p>`

  return { subject, html: emailLayout(subject, body) }
}

const reviewPromptTh = (input: ReviewPromptCtx): RenderedEmail => {
  const lineList = input.product_lines
    .map((p) => `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`)
    .join('')

  const subject = `โปรตีน ${brand.name} เป็นอย่างไรบ้าง?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">ขอบคุณที่สั่งซื้อ ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: ${brand.palette.muted};">เราหวังว่าคุณจะพอใจกับสินค้าที่ได้รับ</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: ${brand.palette.primary}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">เขียนรีวิว</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">หมายเลขคำสั่งซื้อ: ${escapeHtml(input.order_id)}</p>`

  return { subject, html: emailLayout(subject, body) }
}

export const reviewPromptTemplate: Record<Locale, (ctx: ReviewPromptCtx) => RenderedEmail> = {
  en: reviewPromptEn,
  th: reviewPromptTh,
}
