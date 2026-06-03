import type { Env } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import type { Locale } from '../../lib/locale'
import { brand } from './brand'
import {
  orderTemplates,
  adminTemplates,
  backInStockTemplate,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
  type OrderRenderInput,
  type AdminOrderAddress,
} from './templates'
import type { InstructionsBlock } from '../payments/types'

const RESEND_TIMEOUT_MS = 5000

export interface OrderEmailData extends OrderRenderInput {}

export interface ShipmentData {
  carrier: string
  tracking_number: string
}

export interface NewChatEmailData {
  conversation_id: string
  guest_name: string
  guest_email: string
  initial_message: string
  created_at: string
}

export interface ReviewPromptEmailInput {
  order_id: string
  customer_name: string
  customer_email: string
  product_lines: { name: string }[]
  review_url: string
  locale: Locale
}

export interface BackInStockEmailInput {
  customer_email: string
  product_name: string
  product_url: string
  locale: Locale
}

async function resendFetch(input: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), RESEND_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function logEmail(
  env: Env,
  orderId: string | null,
  event: string,
  recipientEmail: string,
  status: 'sent' | 'failed',
  error?: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO email_logs (order_id, event, recipient_email, status, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(orderId, event, recipientEmail, status, error ?? null, nowIso()).run()
  } catch {
    // Best effort
  }
}

async function sendResendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  try {
    const res = await resendFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: brand.fromAddress,
        to: [to],
        subject,
        html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Fire-and-forget: sends order-related email and logs result, never throws */
export async function sendOrderEmail(
  env: Env,
  event: OrderEvent,
  order: OrderEmailData,
  extra?: { instructions?: InstructionsBlock | null; shipment?: ShipmentData }
): Promise<void> {
  try {
    const renderer = orderTemplates[event][order.locale]
    const { subject, html } = renderer({
      order,
      instructions: extra?.instructions ?? null,
      shipment: extra?.shipment,
    })
    const ok = await sendResendEmail(env, order.customer_email, subject, html)
    await logEmail(env, order.order_id, event, order.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, order.order_id, event, order.customer_email, 'failed', message)
  }
}

/** Fire-and-forget: sends admin notification for new orders, never throws */
export async function sendAdminNewOrderEmail(
  env: Env,
  order: OrderEmailData,
  address?: AdminOrderAddress,
  discountCode?: string
): Promise<void> {
  if (!env.ADMIN_EMAILS) return
  const emails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return

  const { subject, html } = adminTemplates.new_order.en({ order, address, discountCode })

  for (const adminEmail of emails) {
    try {
      const ok = await sendResendEmail(env, adminEmail, subject, html)
      await logEmail(env, order.order_id, 'admin_new_order', adminEmail, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await logEmail(env, order.order_id, 'admin_new_order', adminEmail, 'failed', message)
    }
  }
}

/** Fire-and-forget: notifies admins of new chat conversation, never throws */
export async function sendAdminNewChatEmail(env: Env, data: NewChatEmailData): Promise<void> {
  if (!env.ADMIN_EMAILS) return
  const emails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return

  const { subject, html } = adminTemplates.new_chat.en(data)

  for (const adminEmail of emails) {
    try {
      const ok = await sendResendEmail(env, adminEmail, subject, html)
      await logEmail(env, null, 'admin_new_chat', adminEmail, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await logEmail(env, null, 'admin_new_chat', adminEmail, 'failed', message)
    }
  }
}

/** Throws on failure — caller (auth route) needs to know if the email made it */
export async function sendMagicLinkEmail(
  env: Env,
  toEmail: string,
  magicLinkUrl: string,
  expiryMinutes: number,
  locale: Locale = 'en'
): Promise<void> {
  if (!env.RESEND_API_KEY) return

  const { subject, html } = magicLinkTemplate[locale]({ magicLinkUrl, expiryMinutes })

  let emailRes: Response
  try {
    emailRes = await resendFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: brand.fromAddress,
        to: [toEmail],
        subject,
        html,
      }),
    })
  } catch {
    throw new Error('Failed to send magic link email')
  }

  if (!emailRes.ok) {
    throw new Error('Failed to send magic link email')
  }
}

/** Fire-and-forget review prompt email; idempotent via email_logs lookup. */
export async function sendReviewPromptEmail(env: Env, input: ReviewPromptEmailInput): Promise<void> {
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM email_logs WHERE order_id = ? AND event = 'review_prompt' AND status = 'sent' LIMIT 1`
    ).bind(input.order_id).first<{ id: number }>()
    if (existing) return
  } catch {
    return
  }

  try {
    const { subject, html } = reviewPromptTemplate[input.locale]({
      customer_name: input.customer_name,
      product_lines: input.product_lines,
      review_url: input.review_url,
      order_id: input.order_id,
    })
    const ok = await sendResendEmail(env, input.customer_email, subject, html)
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, 'failed', message)
  }
}

export async function sendBackInStockEmail(env: Env, input: BackInStockEmailInput): Promise<boolean> {
  try {
    const { subject, html } = backInStockTemplate[input.locale]({
      product_name: input.product_name,
      product_url: input.product_url,
    })
    if (!env.RESEND_API_KEY) {
      await logEmail(env, null, 'back_in_stock', input.customer_email, 'sent')
      return true
    }
    const ok = await sendResendEmail(env, input.customer_email, subject, html)
    await logEmail(env, null, 'back_in_stock', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
    return ok
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, null, 'back_in_stock', input.customer_email, 'failed', message)
    return false
  }
}

/** Fetch order data needed for email templates */
export async function fetchOrderEmailData(env: Env, orderId: string): Promise<OrderEmailData | null> {
  const order = await env.DB.prepare(
    `SELECT id, customer_name, customer_email, subtotal_thb, shipping_thb, discount_thb, total_thb, locale
     FROM orders WHERE id = ? LIMIT 1`
  ).bind(orderId).first<{
    id: string
    customer_name: string
    customer_email: string
    subtotal_thb: number
    shipping_thb: number
    discount_thb: number
    total_thb: number
    locale: Locale
  }>()

  if (!order) return null

  const { results: items } = await env.DB.prepare(
    `SELECT p.name, oi.quantity, oi.line_total_thb
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`
  ).bind(orderId).all<{ name: string; quantity: number; line_total_thb: number }>()

  return {
    order_id: order.id,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    items: items.map((i) => ({ name: i.name, quantity: i.quantity, line_total_thb: i.line_total_thb })),
    subtotal_thb: order.subtotal_thb,
    shipping_thb: order.shipping_thb,
    discount_thb: order.discount_thb,
    total_thb: order.total_thb,
    locale: order.locale,
  }
}
