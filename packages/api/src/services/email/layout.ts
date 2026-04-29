import { escapeHtml } from '../../lib/utils'
import { formatThb } from '../../lib/money'
import type { InstructionsBlock } from '../payments/types'
import { brand } from './brand'

export interface EmailItem {
  name: string
  quantity: number
  line_total_thb: number
}

export { formatThb } from '../../lib/money'

export function emailLayout(title: string, body: string): string {
  const p = brand.palette
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: ${p.text}; margin: 0; padding: 0; background: ${p.bg};">
  <div style="max-width: 600px; margin: 0 auto; background: ${p.surface};">
    <div style="background: ${p.headerBg}; padding: 24px; text-align: center;">
      <img src="${brand.logoUrl}" alt="${escapeHtml(brand.name)}" width="48" height="48" style="display: block; margin: 0 auto 8px; width: 48px; height: 48px; border: 0;">
      <h1 style="margin: 0; color: ${p.headerFg}; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">${escapeHtml(brand.name)}</h1>
    </div>
    <div style="padding: 32px 24px;">
      ${body}
    </div>
    <div style="background: ${p.footerBg}; padding: 20px 24px; text-align: center;">
      <p style="margin: 0; color: ${p.footerFg}; font-size: 12px;">${escapeHtml(brand.name)} — ${escapeHtml(brand.tagline)}</p>
      <p style="margin: 4px 0 0; color: ${p.footerFg}; font-size: 12px;">Questions? Contact us at ${escapeHtml(brand.contactEmail)}</p>
    </div>
  </div>
</body>
</html>`
}

export function itemsTableHtml(items: EmailItem[]): string {
  const p = brand.palette
  const rows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px;">${escapeHtml(item.name)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid ${p.border}; font-size: 14px; text-align: right;">${formatThb(item.line_total_thb)}</td>
        </tr>`
    )
    .join('')

  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="border-bottom: 2px solid ${p.text};">
        <th style="padding: 8px 0; text-align: left; font-size: 13px; font-weight: 600;">Item</th>
        <th style="padding: 8px 0; text-align: center; font-size: 13px; font-weight: 600;">Qty</th>
        <th style="padding: 8px 0; text-align: right; font-size: 13px; font-weight: 600;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

export interface OrderTotalsInput {
  subtotal_thb: number
  shipping_thb: number
  discount_thb: number
  total_thb: number
}

export function orderTotalsHtml(order: OrderTotalsInput): string {
  const p = brand.palette
  let html = `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.muted};">Subtotal</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatThb(order.subtotal_thb)}</td>
    </tr>
    <tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.muted};">Shipping</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right;">${order.shipping_thb === 0 ? 'Free' : formatThb(order.shipping_thb)}</td>
    </tr>`

  if (order.discount_thb > 0) {
    html += `<tr>
      <td style="padding: 4px 0; font-size: 14px; color: ${p.primary};">Discount</td>
      <td style="padding: 4px 0; font-size: 14px; text-align: right; color: ${p.primary};">-${formatThb(order.discount_thb)}</td>
    </tr>`
  }

  html += `<tr>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; border-top: 2px solid ${p.text};">Total</td>
      <td style="padding: 8px 0; font-size: 16px; font-weight: 700; text-align: right; border-top: 2px solid ${p.text};">${formatThb(order.total_thb)}</td>
    </tr>
  </table>`

  return html
}

export function renderInstructionsHtml(block: InstructionsBlock): string {
  const p = brand.palette
  const rows = block.rows
    .map((r) => {
      const valueStyle = r.mono ? ' style="font-family: monospace;"' : ''
      return `<p style="margin: 8px 0 4px; font-size: 14px;"><strong>${escapeHtml(r.label)}:</strong> <span${valueStyle}>${escapeHtml(r.value)}</span></p>`
    })
    .join('')

  const qr = block.qrImageUrl
    ? `<p style="margin: 12px 0; text-align: center;"><img src="${block.qrImageUrl}" alt="PromptPay QR" style="display: inline-block; max-width: 220px; height: auto; border: 0;"></p>`
    : ''

  const cta = block.ctaUrl && block.ctaLabel
    ? `<p style="text-align: center; margin: 18px 0 6px;"><a href="${block.ctaUrl}" style="display: inline-block; background-color: ${p.primary}; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">${escapeHtml(block.ctaLabel)}</a></p>`
    : ''

  const footnote = block.footnote
    ? `<p style="margin: 12px 0 0; font-size: 13px; color: ${p.muted};">${escapeHtml(block.footnote)}</p>`
    : ''

  return `<div style="background: ${p.panel}; border-radius: 8px; padding: 20px; margin: 24px 0;">
    <h3 style="margin: 0 0 12px; font-size: 16px; color: ${p.text};">${escapeHtml(block.title)}</h3>
    ${rows}
    ${qr}
    ${cta}
    ${footnote}
  </div>`
}
