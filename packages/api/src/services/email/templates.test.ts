import { describe, it, expect } from 'vitest'
import {
  orderTemplates,
  adminTemplates,
  backInStockTemplate,
  magicLinkTemplate,
  reviewPromptTemplate,
  type OrderEvent,
  type OrderRenderInput,
} from './templates'
import { brand } from './brand'
import type { InstructionsBlock } from '../payments/types'

const ORDER_EVENTS: OrderEvent[] = [
  'order_created',
  'payment_confirmed',
  'order_shipped',
  'order_cancelled',
  'payment_failed',
  'payment_refunded',
]

function makeOrder(overrides: Partial<OrderRenderInput> = {}): OrderRenderInput {
  return {
    order_id: 'ORD-T-001',
    customer_name: 'Jane',
    customer_email: 'j@example.com',
    items: [{ name: 'Protein 500g', quantity: 1, line_total_thb: 89900 }],
    subtotal_thb: 89900,
    shipping_thb: 0,
    discount_thb: 0,
    total_thb: 89900,
    locale: 'en',
    ...overrides,
  }
}

const promptpayBlock: InstructionsBlock = {
  title: 'Payment Details',
  rows: [{ label: 'PromptPay', value: '0812345678' }],
}

describe('orderTemplates', () => {
  for (const event of ORDER_EVENTS) {
    for (const locale of ['en', 'th'] as const) {
      it(`${event} / ${locale} renders subject + html with brand and order id`, () => {
        const renderer = orderTemplates[event][locale]
        const out = renderer({
          order: makeOrder({ locale }),
          instructions: event === 'order_created' ? promptpayBlock : null,
          shipment: event === 'order_shipped'
            ? { carrier: 'Kerry', tracking_number: 'KRY1' }
            : undefined,
        })
        expect(out.subject).toBeTruthy()
        expect(out.html).toContain(brand.name)
        expect(out.html).toContain('ORD-T-001')
      })
    }
  }
})

describe('adminTemplates.new_order.en', () => {
  it('renders with order id and customer info', () => {
    const out = adminTemplates.new_order.en({
      order: makeOrder(),
      address: {
        line1: '123 Test',
        district: 'Mueang',
        province: 'Chiang Mai',
        postal_code: '50200',
      },
    })
    expect(out.subject).toContain('ORD-T-001')
    expect(out.html).toContain('123 Test')
    expect(out.html).toContain('j@example.com')
  })
})

describe('magicLinkTemplate', () => {
  for (const locale of ['en', 'th'] as const) {
    it(`${locale} renders subject and includes magic link url`, () => {
      const out = magicLinkTemplate[locale]({
        magicLinkUrl: 'https://www.cnxnature.com/auth/verify?token=abc',
        expiryMinutes: 15,
      })
      expect(out.subject).toBeTruthy()
      expect(out.html).toContain('https://www.cnxnature.com/auth/verify?token=abc')
    })
  }
})

describe('reviewPromptTemplate', () => {
  const baseInput = {
    customer_name: 'Buyer',
    product_lines: [{ name: 'AthletX Protein' }],
    review_url: 'https://www.cnxnature.com/account?tab=reviews',
    order_id: '01H123',
  }

  it('en renders with English subject', () => {
    const out = reviewPromptTemplate.en(baseInput)
    expect(out.subject).toMatch(/How was/i)
    expect(out.html).toContain('AthletX Protein')
    expect(out.html).toContain(baseInput.review_url)
  })

  it('th renders with Thai subject', () => {
    const out = reviewPromptTemplate.th(baseInput)
    expect(out.subject).toContain('โปรตีน')
    expect(out.html).toContain(baseInput.review_url)
  })
})

describe('backInStockTemplate', () => {
  it('renders escaped product name and product URL', () => {
    const out = backInStockTemplate.en({
      product_name: '<Protein>',
      product_url: 'https://www.cnxnature.com/product/plant-protein-500g?x=<bad>',
    })

    expect(out.subject).toContain('<Protein>')
    expect(out.html).toContain('&lt;Protein&gt;')
    expect(out.html).not.toContain('<Protein>')
    expect(out.html).toContain('https://www.cnxnature.com/product/plant-protein-500g?x=&lt;bad&gt;')
  })
})
