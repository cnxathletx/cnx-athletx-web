import type { Env } from '../lib/types'
import { nowIso, escapeHtml } from '../lib/utils'

export interface EmailItem {
  name: string
  quantity: number
  line_total_thb: number
}

export interface OrderEmailData {
  order_id: string
  customer_name: string
  customer_email: string
  items: EmailItem[]
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
}

export interface PaymentInstructions {
  promptpay_number: string
  bank_name: string
  bank_account_name: string
  bank_account_number: string
}

export interface ShipmentData {
  carrier: string
  tracking_number: string
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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CNX AthletX <orders@cnxnature.com>',
      to: [to],
      subject,
      html,
    }),
  })

  return res.ok
}

export function formatThb(satang: number): string {
  return `฿${(satang / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #2E2B26; margin: 0; padding: 0; background: #F2EDE4;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
    <div style="background: #2E2B26; padding: 24px; text-align: center;">
      <img src="https://www.cnxnature.com/email-mark.png?v=3" alt="CNX AthletX" width="48" height="48" style="display: block; margin: 0 auto 8px; width: 48px; height: 48px; border: 0;">
      <h1 style="margin: 0; color: #E5DDD0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">CNX AthletX</h1>
    </div>
    <div style="padding: 32px 24px;">
      ${body}
    </div>
    <div style="background: #252320; padding: 20px 24px; text-align: center;">
      <p style="margin: 0; color: #8B8580; font-size: 12px;">CNX AthletX — Plant-Based Protein, Chiang Mai</p>
      <p style="margin: 4px 0 0; color: #8B8580; font-size: 12px;">Questions? Contact us at orders@cnxnature.com</p>
    </div>
  </div>
</body>
</html>`
}

export function itemsTableHtml(items: EmailItem[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #E8E2D8; font-size: 14px;">${escapeHtml(item.name)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #E8E2D8; font-size: 14px; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #E8E2D8; font-size: 14px; text-align: right;">${formatThb(item.line_total_thb)}</td>
        </tr>`
    )
    .join('')

  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="border-bottom: 2px solid #2E2B26;">
        <th style="padding: 8px 0; text-align: left; font-size: 13px; font-weight: 600;">Item</th>
        <th style="padding: 8px 0; text-align: center; font-size: 13px; font-weight: 600;">Qty</th>
        <th style="padding: 8px 0; text-align: right; font-size: 13px; font-weight: 600;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

export function orderTotalsHtml(order: OrderEmailData): string {
  let html = `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: #555;">Subtotal</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatThb(order.subtotal_thb)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: #555;">Shipping</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${order.shipping_thb === 0 ? 'Free' : formatThb(order.shipping_thb)}</td>
    </tr>`

  if (order.discount_thb > 0) {
    html += `<tr>
      <td style="padding: 4px 0; font-size: 14px; color: #8B9A7B;">Discount</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right; color: #8B9A7B;">-${formatThb(order.discount_thb)}</td>
    </tr>`
  }

  html += `<tr>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; border-top: 2px solid #2E2B26;">Total</td>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; text-align: right; border-top: 2px solid #2E2B26;">${formatThb(order.total_thb)}</td>
    </tr>
  </table>`

  return html
}

export function buildOrderCreatedEmail(order: OrderEmailData, payment: PaymentInstructions): string {
  let paymentHtml = `<div style="background: #F2EDE4; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: #2E2B26;">Payment Details</h3>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Amount:</strong> ${formatThb(order.total_thb)}</p>`

  if (payment.promptpay_number) {
    paymentHtml += `<p style="margin: 8px 0 4px; font-size: 14px;"><strong>PromptPay:</strong> ${escapeHtml(payment.promptpay_number)}</p>`
  }

  if (payment.bank_name) {
    paymentHtml += `<p style="margin: 8px 0 4px; font-size: 14px;"><strong>Bank:</strong> ${escapeHtml(payment.bank_name)}</p>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Account Name:</strong> ${escapeHtml(payment.bank_account_name)}</p>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Account Number:</strong> ${escapeHtml(payment.bank_account_number)}</p>`
  }

  paymentHtml += `<p style="margin: 12px 0 0; font-size: 13px; color: #555;">Please use your order ID as the transfer reference.</p>
  </div>`

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Order Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Hi ${escapeHtml(order.customer_name)}, thank you for your order.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}
    ${paymentHtml}

    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">Once you've completed the transfer, you can submit your payment proof on our website. We'll verify it and get your order packed.</p>`

  return emailLayout('Order Confirmed — CNX AthletX', body)
}

export function buildPaymentConfirmedEmail(order: OrderEmailData): string {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Payment Confirmed</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Hi ${escapeHtml(order.customer_name)}, we've verified your payment. Your order is now being prepared.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <div style="background: #8B9A7B; border-radius: 8px; padding: 16px 20px; margin: 24px 0; text-align: center;">
      <p style="margin: 0; color: #ffffff; font-size: 15px; font-weight: 600;">Your order is being packed and will ship soon.</p>
    </div>

    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">We'll send you another email with tracking information once your order ships.</p>`

  return emailLayout('Payment Confirmed — CNX AthletX', body)
}

export function buildOrderShippedEmail(order: OrderEmailData, shipment: ShipmentData): string {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Your Order Has Shipped</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Hi ${escapeHtml(order.customer_name)}, your order is on its way.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px; font-size: 16px; color: #2E2B26;">Shipping Details</h3>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Carrier:</strong> ${escapeHtml(shipment.carrier)}</p>
      <p style="margin: 0; font-size: 14px;"><strong>Tracking Number:</strong> ${escapeHtml(shipment.tracking_number)}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">Thank you for choosing CNX AthletX. We hope you enjoy your order!</p>`

  return emailLayout('Your Order Has Shipped — CNX AthletX', body)
}

export function buildOrderCancelledEmail(order: OrderEmailData): string {
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Order Cancelled</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Hi ${escapeHtml(order.customer_name)}, your order has been cancelled.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}

    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">If you believe this was a mistake or have any questions, please contact us at orders@cnxnature.com.</p>`

  return emailLayout('Order Cancelled — CNX AthletX', body)
}

export interface AdminOrderAddress {
  line1: string
  line2?: string
  district: string
  province: string
  postal_code: string
}

export function buildAdminNewOrderEmail(
  order: OrderEmailData,
  address?: AdminOrderAddress,
  discountCode?: string
): string {
  let customerHtml = `<div style="background: #F2EDE4; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: #2E2B26;">Customer</h3>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
    <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(order.customer_email)}</p>`

  if (address) {
    customerHtml += `<h3 style="margin: 16px 0 12px; font-size: 16px; color: #2E2B26;">Shipping Address</h3>
    <p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line1)}</p>`
    if (address.line2) {
      customerHtml += `<p style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(address.line2)}</p>`
    }
    customerHtml += `<p style="margin: 0; font-size: 14px;">${escapeHtml(address.district)}, ${escapeHtml(address.province)} ${escapeHtml(address.postal_code)}</p>`
  }

  customerHtml += `</div>`

  let discountHtml = ''
  if (discountCode) {
    discountHtml = `<p style="margin: 0 0 4px; font-size: 14px;"><strong>Discount Code:</strong> ${escapeHtml(discountCode)}</p>`
  }

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">New Order Received</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">A new order has been placed and is awaiting payment.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #555;">Order ID</p>
      <p style="margin: 4px 0 0; font-size: 16px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${order.order_id}</p>
    </div>

    ${customerHtml}
    ${discountHtml}
    ${itemsTableHtml(order.items)}
    ${orderTotalsHtml(order)}`

  return emailLayout('New Order — CNX AthletX', body)
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

  const subject = `New Order — ${order.order_id}`
  const html = buildAdminNewOrderEmail(order, address, discountCode)

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

/** Fire-and-forget: sends email and logs result, never throws */
export async function sendOrderEmail(
  env: Env,
  event: 'order_created' | 'payment_confirmed' | 'order_shipped' | 'order_cancelled',
  order: OrderEmailData,
  extra?: { payment?: PaymentInstructions; shipment?: ShipmentData }
): Promise<void> {
  try {
    let subject: string
    let html: string

    switch (event) {
      case 'order_created':
        subject = `Order Confirmed — ${order.order_id}`
        html = buildOrderCreatedEmail(order, extra!.payment!)
        break
      case 'payment_confirmed':
        subject = `Payment Confirmed — ${order.order_id}`
        html = buildPaymentConfirmedEmail(order)
        break
      case 'order_shipped':
        subject = `Your Order Has Shipped — ${order.order_id}`
        html = buildOrderShippedEmail(order, extra!.shipment!)
        break
      case 'order_cancelled':
        subject = `Order Cancelled — ${order.order_id}`
        html = buildOrderCancelledEmail(order)
        break
    }

    const ok = await sendResendEmail(env, order.customer_email, subject, html)
    await logEmail(env, order.order_id, event, order.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, order.order_id, event, order.customer_email, 'failed', message)
  }
}

/** Fetch order data needed for email templates */
export async function fetchOrderEmailData(env: Env, orderId: string): Promise<OrderEmailData | null> {
  const order = await env.DB.prepare(
    `SELECT id, customer_name, customer_email, subtotal_thb, shipping_thb, discount_thb, total_thb
     FROM orders WHERE id = ? LIMIT 1`
  ).bind(orderId).first<{
    id: string; customer_name: string; customer_email: string
    subtotal_thb: number; shipping_thb: number; discount_thb: number; total_thb: number
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
  }
}

export interface NewChatEmailData {
  conversation_id: string
  guest_name: string
  guest_email: string
  initial_message: string
  created_at: string
}

export function buildAdminNewChatEmail(data: NewChatEmailData): string {
  const adminUrl = 'https://www.cnxnature.com/admin/chat'
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">New Chat Started</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">A visitor has started a new support conversation.</p>

    <div style="background: #F2EDE4; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>From:</strong> ${escapeHtml(data.guest_name)}</p>
      <p style="margin: 0 0 4px; font-size: 14px;"><strong>Email:</strong> ${escapeHtml(data.guest_email)}</p>
      <p style="margin: 0 0 12px; font-size: 13px; color: #555;"><strong>Started:</strong> ${escapeHtml(data.created_at)}</p>
      <p style="margin: 12px 0 4px; font-size: 13px; color: #555;"><strong>First message:</strong></p>
      <div style="background: #ffffff; border-radius: 6px; padding: 12px 16px; font-size: 14px; white-space: pre-wrap;">${escapeHtml(data.initial_message)}</div>
    </div>

    <p style="text-align: center; margin: 30px 0;">
      <a href="${adminUrl}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Open Chat Dashboard
      </a>
    </p>`

  return emailLayout('New Chat — CNX AthletX', body)
}

/** Fire-and-forget: notifies admins of new chat conversation, never throws */
export async function sendAdminNewChatEmail(env: Env, data: NewChatEmailData): Promise<void> {
  if (!env.ADMIN_EMAILS) return

  const emails = env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return

  const subject = `New chat from ${data.guest_name}`
  const html = buildAdminNewChatEmail(data)

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

export async function sendMagicLinkEmail(env: Env, toEmail: string, magicLinkUrl: string, expiryMinutes: number): Promise<void> {
  if (!env.RESEND_API_KEY) return

  const body = `<h2 style="margin: 0 0 8px; font-size: 20px; color: #2E2B26;">Log in to CNX AthletX</h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #555;">Click the button below to log in. This link expires in ${expiryMinutes} minutes.</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${magicLinkUrl}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Log In
      </a>
    </p>
    <p style="margin: 24px 0 0; font-size: 14px; color: #555;">If you did not request this link, you can safely ignore this email.</p>
    <p style="margin: 8px 0 0; font-size: 12px; color: #777; word-break: break-all;">${magicLinkUrl}</p>`

  const html = emailLayout('Log In — CNX AthletX', body)

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'CNX AthletX <orders@cnxnature.com>',
      to: [toEmail],
      subject: 'Log in to CNX AthletX',
      html,
    }),
  })

  if (!emailRes.ok) {
    throw new Error('Failed to send magic link email')
  }
}

export interface ReviewPromptEmailInput {
  order_id: string
  customer_name: string
  customer_email: string
  product_lines: { name: string }[]
  review_url: string
  locale: 'en' | 'th'
}

export interface BuiltEmail {
  subject: string
  html: string
}

export function buildReviewPromptEmail(input: ReviewPromptEmailInput): BuiltEmail {
  const locale = input.locale === 'th' ? 'th' : 'en'

  const lineList = input.product_lines.map((p) =>
    `<li style="font-size: 14px; margin: 4px 0;">${escapeHtml(p.name)}</li>`
  ).join('')

  if (locale === 'th') {
    const subject = `โปรตีน CNX AthletX เป็นอย่างไรบ้าง?`
    const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">ขอบคุณที่สั่งซื้อ ${escapeHtml(input.customer_name)}</h2>
      <p style="margin: 0 0 16px; font-size: 15px; color: #555;">เราหวังว่าคุณจะพอใจกับสินค้าที่ได้รับ</p>
      <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${input.review_url}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">เขียนรีวิว</a>
      </p>
      <p style="margin: 24px 0 0; font-size: 13px; color: #777;">หมายเลขคำสั่งซื้อ: ${escapeHtml(input.order_id)}</p>`
    return { subject, html: emailLayout(subject, body) }
  }

  const subject = `How was your CNX AthletX protein?`
  const body = `<h2 style="margin: 0 0 8px; font-size: 20px;">Thanks for your order, ${escapeHtml(input.customer_name)}</h2>
    <p style="margin: 0 0 16px; font-size: 15px; color: #555;">We hope you're enjoying what you received. Your feedback helps other customers.</p>
    <ul style="padding-left: 20px; margin: 0 0 24px;">${lineList}</ul>
    <p style="text-align: center; margin: 30px 0;">
      <a href="${input.review_url}" style="display: inline-block; background-color: #8B9A7B; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600;">Write a Review</a>
    </p>
    <p style="margin: 24px 0 0; font-size: 13px; color: #777;">Order ID: ${escapeHtml(input.order_id)}</p>`
  return { subject, html: emailLayout(subject, body) }
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
    const built = buildReviewPromptEmail(input)
    const ok = await sendResendEmail(env, input.customer_email, built.subject, built.html)
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, ok ? 'sent' : 'failed', ok ? undefined : 'Resend API returned non-OK')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(env, input.order_id, 'review_prompt', input.customer_email, 'failed', message)
  }
}
