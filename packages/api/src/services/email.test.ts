import { describe, it, expect } from 'vitest'
import {
  formatThb,
  emailLayout,
  itemsTableHtml,
  orderTotalsHtml,
  buildOrderCreatedEmail,
  buildPaymentConfirmedEmail,
  buildOrderShippedEmail,
  buildAdminNewOrderEmail,
  buildOrderCancelledEmail,
  buildPaymentFailedEmail,
  buildPaymentRefundedEmail,
  buildReviewPromptEmail,
  renderInstructionsHtml,
} from './email'
import type { OrderEmailData, PaymentInstructions, ShipmentData, EmailItem } from './email'

// --- Helpers ---

function makeOrderData(overrides: Partial<OrderEmailData> = {}): OrderEmailData {
  return {
    order_id: 'ORD-TEST-001',
    customer_name: 'John Doe',
    customer_email: 'john@example.com',
    items: [
      { name: 'Protein 500g', quantity: 2, line_total_thb: 179800 },
      { name: 'Protein 1kg', quantity: 1, line_total_thb: 149900 },
    ],
    subtotal_thb: 329700,
    shipping_thb: 5000,
    discount_thb: 0,
    total_thb: 334700,
    ...overrides,
  }
}

function makePayment(overrides: Partial<PaymentInstructions> = {}): PaymentInstructions {
  return {
    promptpay_number: '0812345678',
    bank_name: 'Bangkok Bank',
    bank_account_name: 'CNX AthletX Co Ltd',
    bank_account_number: '123-456-7890',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipmentData> = {}): ShipmentData {
  return {
    carrier: 'Kerry Express',
    tracking_number: 'KRY123456789',
    ...overrides,
  }
}

// --- formatThb ---

describe('formatThb', () => {
  it('formats satang to THB with ฿ symbol', () => {
    expect(formatThb(89900)).toBe('฿899.00')
  })

  it('formats zero', () => {
    expect(formatThb(0)).toBe('฿0.00')
  })

  it('formats large amounts with comma separators', () => {
    expect(formatThb(10000000)).toBe('฿100,000.00')
  })

  it('handles odd satang values', () => {
    expect(formatThb(99)).toBe('฿0.99')
  })
})

// --- emailLayout ---

describe('emailLayout', () => {
  it('wraps body in HTML document with header and footer', () => {
    const html = emailLayout('Test Title', '<p>Hello</p>')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Title</title>')
    expect(html).toContain('<p>Hello</p>')
    expect(html).toContain('CNX AthletX')
    expect(html).toContain('orders@cnxnature.com')
  })
})

// --- itemsTableHtml ---

describe('itemsTableHtml', () => {
  it('renders items in a table', () => {
    const items: EmailItem[] = [
      { name: 'Protein 500g', quantity: 2, line_total_thb: 179800 },
    ]
    const html = itemsTableHtml(items)
    expect(html).toContain('Protein 500g')
    expect(html).toContain('>2<')
    expect(html).toContain('฿1,798.00')
    expect(html).toContain('<table')
    expect(html).toContain('<thead>')
  })

  it('renders multiple items', () => {
    const items: EmailItem[] = [
      { name: 'Product A', quantity: 1, line_total_thb: 10000 },
      { name: 'Product B', quantity: 3, line_total_thb: 30000 },
    ]
    const html = itemsTableHtml(items)
    expect(html).toContain('Product A')
    expect(html).toContain('Product B')
  })

  it('escapes HTML in product names', () => {
    const items: EmailItem[] = [
      { name: '<script>alert("xss")</script>', quantity: 1, line_total_thb: 100 },
    ]
    const html = itemsTableHtml(items)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// --- orderTotalsHtml ---

describe('orderTotalsHtml', () => {
  it('renders subtotal, shipping, and total', () => {
    const html = orderTotalsHtml(makeOrderData())
    expect(html).toContain('Subtotal')
    expect(html).toContain('฿3,297.00')
    expect(html).toContain('Shipping')
    expect(html).toContain('฿50.00')
    expect(html).toContain('Total')
    expect(html).toContain('฿3,347.00')
  })

  it('shows "Free" when shipping is zero', () => {
    const html = orderTotalsHtml(makeOrderData({ shipping_thb: 0 }))
    expect(html).toContain('Free')
  })

  it('shows discount row when discount > 0', () => {
    const html = orderTotalsHtml(makeOrderData({ discount_thb: 5000 }))
    expect(html).toContain('Discount')
    expect(html).toContain('-฿50.00')
  })

  it('hides discount row when discount is 0', () => {
    const html = orderTotalsHtml(makeOrderData({ discount_thb: 0 }))
    expect(html).not.toContain('Discount')
  })
})

// --- buildOrderCreatedEmail ---

describe('buildOrderCreatedEmail', () => {
  it('contains order ID and customer name', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('John Doe')
    expect(html).toContain('Order Confirmed')
  })

  it('includes PromptPay number', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment())
    expect(html).toContain('PromptPay')
    expect(html).toContain('0812345678')
  })

  it('includes bank details', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment())
    expect(html).toContain('Bangkok Bank')
    expect(html).toContain('CNX AthletX Co Ltd')
    expect(html).toContain('123-456-7890')
  })

  it('omits PromptPay section when empty', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment({ promptpay_number: '' }))
    expect(html).not.toContain('PromptPay')
  })

  it('omits bank section when empty', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment({ bank_name: '' }))
    expect(html).not.toContain('Account Number')
  })

  it('escapes HTML in customer name', () => {
    const html = buildOrderCreatedEmail(
      makeOrderData({ customer_name: '<img src=x onerror=alert(1)>' }),
      makePayment()
    )
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('includes items table and totals', () => {
    const html = buildOrderCreatedEmail(makeOrderData(), makePayment())
    expect(html).toContain('Protein 500g')
    expect(html).toContain('Subtotal')
  })
})

// --- buildPaymentConfirmedEmail ---

describe('buildPaymentConfirmedEmail', () => {
  it('contains order ID and confirmation message', () => {
    const html = buildPaymentConfirmedEmail(makeOrderData())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('Payment Confirmed')
    expect(html).toContain('being packed')
  })

  it('includes items and totals', () => {
    const html = buildPaymentConfirmedEmail(makeOrderData())
    expect(html).toContain('Protein 500g')
    expect(html).toContain('Total')
  })

  it('escapes customer name', () => {
    const html = buildPaymentConfirmedEmail(makeOrderData({ customer_name: 'A & B <Co>' }))
    expect(html).toContain('A &amp; B &lt;Co&gt;')
  })
})

// --- buildOrderShippedEmail ---

describe('buildOrderShippedEmail', () => {
  it('contains order ID and shipping info', () => {
    const html = buildOrderShippedEmail(makeOrderData(), makeShipment())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('Has Shipped')
    expect(html).toContain('Kerry Express')
    expect(html).toContain('KRY123456789')
  })

  it('includes items and totals', () => {
    const html = buildOrderShippedEmail(makeOrderData(), makeShipment())
    expect(html).toContain('Protein 500g')
    expect(html).toContain('Total')
  })

  it('escapes HTML in carrier and tracking number', () => {
    const html = buildOrderShippedEmail(
      makeOrderData(),
      makeShipment({ carrier: '<b>Bad</b>', tracking_number: '"><script>' })
    )
    expect(html).not.toContain('<b>Bad</b>')
    expect(html).toContain('&lt;b&gt;Bad&lt;/b&gt;')
    expect(html).not.toContain('<script>')
  })
})

// --- buildOrderCancelledEmail ---

describe('buildOrderCancelledEmail', () => {
  it('contains order ID and cancellation message', () => {
    const html = buildOrderCancelledEmail(makeOrderData())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('Order Cancelled')
    expect(html).toContain('has been cancelled')
  })

  it('includes items and totals', () => {
    const html = buildOrderCancelledEmail(makeOrderData())
    expect(html).toContain('Protein 500g')
    expect(html).toContain('Total')
  })

  it('includes contact info for questions', () => {
    const html = buildOrderCancelledEmail(makeOrderData())
    expect(html).toContain('orders@cnxnature.com')
  })

  it('escapes customer name', () => {
    const html = buildOrderCancelledEmail(makeOrderData({ customer_name: '<b>Bad</b>' }))
    expect(html).not.toContain('<b>Bad</b>')
    expect(html).toContain('&lt;b&gt;Bad&lt;/b&gt;')
  })
})

// --- buildPaymentFailedEmail ---

describe('buildPaymentFailedEmail', () => {
  it('contains order ID and failure heading', () => {
    const html = buildPaymentFailedEmail(makeOrderData())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('Payment Failed')
  })

  it('includes contact email for help', () => {
    const html = buildPaymentFailedEmail(makeOrderData())
    expect(html).toContain('contact@cnxnature.com')
  })

  it('escapes customer name', () => {
    const html = buildPaymentFailedEmail(makeOrderData({ customer_name: '<b>X</b>' }))
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})

// --- buildPaymentRefundedEmail ---

describe('buildPaymentRefundedEmail', () => {
  it('contains order ID and refund amount', () => {
    const html = buildPaymentRefundedEmail(makeOrderData({ total_thb: 50000 }))
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('Refund Issued')
    expect(html).toContain('฿500.00')
  })

  it('escapes customer name', () => {
    const html = buildPaymentRefundedEmail(makeOrderData({ customer_name: '<b>X</b>' }))
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;')
  })
})

// --- buildAdminNewOrderEmail ---

describe('buildAdminNewOrderEmail', () => {
  it('contains order ID and "New Order" heading', () => {
    const html = buildAdminNewOrderEmail(makeOrderData())
    expect(html).toContain('ORD-TEST-001')
    expect(html).toContain('New Order Received')
  })

  it('includes customer name, email, and phone', () => {
    const html = buildAdminNewOrderEmail(makeOrderData())
    expect(html).toContain('John Doe')
    expect(html).toContain('john@example.com')
  })

  it('includes items table and totals', () => {
    const html = buildAdminNewOrderEmail(makeOrderData())
    expect(html).toContain('Protein 500g')
    expect(html).toContain('Protein 1kg')
    expect(html).toContain('Subtotal')
    expect(html).toContain('฿3,347.00')
  })

  it('includes shipping address', () => {
    const order = makeOrderData()
    const html = buildAdminNewOrderEmail(order, {
      line1: '123 Test Street',
      district: 'Mueang',
      province: 'Chiang Mai',
      postal_code: '50200',
    })
    expect(html).toContain('123 Test Street')
    expect(html).toContain('Mueang')
    expect(html).toContain('Chiang Mai')
    expect(html).toContain('50200')
  })

  it('shows discount code when present', () => {
    const html = buildAdminNewOrderEmail(
      makeOrderData({ discount_thb: 10000 }),
      undefined,
      'SAVE100'
    )
    expect(html).toContain('SAVE100')
    expect(html).toContain('Discount')
  })

  it('escapes HTML in customer name', () => {
    const html = buildAdminNewOrderEmail(
      makeOrderData({ customer_name: '<script>alert("xss")</script>' })
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses emailLayout wrapper', () => {
    const html = buildAdminNewOrderEmail(makeOrderData())
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('CNX AthletX')
  })
})

// --- buildReviewPromptEmail ---

describe('buildReviewPromptEmail', () => {
  const baseInput = {
    order_id: '01H123',
    customer_name: 'Buyer',
    customer_email: 'b@example.com',
    product_lines: [{ name: 'AthletX Protein' }],
    review_url: 'https://www.cnxnature.com/account?tab=reviews',
  }

  it('renders English subject + body containing product line name', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'en' })
    expect(out.subject).toContain('How was')
    expect(out.html).toContain('AthletX Protein')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('renders Thai locale', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'th' })
    expect(out.subject).toContain('โปรตีน')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('falls back to en for unknown locale', () => {
    const out = buildReviewPromptEmail({ ...baseInput, locale: 'fr' as 'en' })
    expect(out.subject).toContain('How was')
  })
})

// --- renderInstructionsHtml ---

describe('renderInstructionsHtml', () => {
  const baseRows = [
    { label: 'Amount', value: '฿1,699.00' },
    { label: 'PromptPay', value: '0812345678' },
  ]

  it('renders title and rows', () => {
    const html = renderInstructionsHtml({ title: 'Payment Details', rows: baseRows })
    expect(html).toContain('Payment Details')
    expect(html).toContain('<strong>Amount:</strong>')
    expect(html).toContain('฿1,699.00')
    expect(html).toContain('<strong>PromptPay:</strong>')
    expect(html).toContain('0812345678')
  })

  it('escapes html in values and footnote', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: [{ label: 'X', value: '<script>x</script>' }],
      footnote: '<b>watch out</b>',
    })
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;watch out&lt;/b&gt;')
    expect(html).not.toContain('<script>x</script>')
  })

  it('renders qrImageUrl when provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      qrImageUrl: 'https://promptpay.io/0812345678/1699.00.png',
    })
    expect(html).toContain('<img')
    expect(html).toContain('src="https://promptpay.io/0812345678/1699.00.png"')
    expect(html).toContain('alt="PromptPay QR"')
  })

  it('omits qrImageUrl block when not provided', () => {
    const html = renderInstructionsHtml({ title: 'Payment Details', rows: baseRows })
    expect(html).not.toContain('<img')
  })

  it('renders cta link when ctaUrl + ctaLabel provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      ctaUrl: 'https://example.test/pay',
      ctaLabel: 'Pay now',
    })
    expect(html).toContain('href="https://example.test/pay"')
    expect(html).toContain('Pay now')
  })

  it('renders mono row with monospace font', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: [{ label: 'Account Number', value: '123-4-56789-0', mono: true }],
    })
    expect(html).toMatch(/font-family:\s*monospace/i)
    expect(html).toContain('123-4-56789-0')
  })

  it('renders footnote when provided', () => {
    const html = renderInstructionsHtml({
      title: 'Payment Details',
      rows: baseRows,
      footnote: 'Please use your order ID as the transfer reference.',
    })
    expect(html).toContain('Please use your order ID as the transfer reference.')
  })
})
