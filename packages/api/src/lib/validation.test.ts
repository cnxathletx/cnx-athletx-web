import { describe, it, expect } from 'vitest'
import {
  validateRequestLinkBody,
  validateVerifyBody,
  validateProfileBody,
  validateCheckoutBody,
  validatePaymentProofBody,
  validateShipmentBody,
  validateInventoryUpdateBody,
  validateCreateProductBody,
  validateUpdateProductBody,
  parseAdminPagination,
} from './validation'

// --- Helpers ---

function validCheckoutBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: 'abc-123',
    items: [{ product_id: 1, quantity: 2 }],
    customer: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+66812345678',
      address: {
        line1: '123 Main Street',
        district: 'Mueang',
        province: 'Chiang Mai',
        postal_code: '50200',
      },
    },
    payment_method: 'promptpay',
    ...overrides,
  }
}

function validCreateProductBody(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'protein-500g',
    name: 'Protein 500g',
    description: 'A great plant-based protein powder in a 500g bag.',
    price_thb: 89900,
    weight_g: 500,
    image_url: 'https://cdn.example.com/img.png',
    stock_count: 100,
    ...overrides,
  }
}

// --- validateRequestLinkBody ---

describe('validateRequestLinkBody', () => {
  it('accepts valid email', () => {
    const { errors, data } = validateRequestLinkBody({ email: 'user@example.com' })
    expect(errors).toEqual([])
    expect(data).toEqual({ email: 'user@example.com' })
  })

  it('trims and lowercases email', () => {
    const { data } = validateRequestLinkBody({ email: '  User@Example.COM  ' })
    expect(data?.email).toBe('user@example.com')
  })

  it('rejects non-object body', () => {
    const { errors, data } = validateRequestLinkBody(null)
    expect(data).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('body')
  })

  it('rejects invalid email', () => {
    const { errors } = validateRequestLinkBody({ email: 'bad' })
    expect(errors[0].field).toBe('email')
  })
})

// --- validateVerifyBody ---

describe('validateVerifyBody', () => {
  const validToken = 'a'.repeat(64)

  it('accepts valid 64-char hex token', () => {
    const { errors, data } = validateVerifyBody({ token: validToken })
    expect(errors).toEqual([])
    expect(data?.token).toBe(validToken)
  })

  it('rejects short token', () => {
    const { errors } = validateVerifyBody({ token: 'abc123' })
    expect(errors[0].field).toBe('token')
  })

  it('rejects non-hex token', () => {
    const { errors } = validateVerifyBody({ token: 'g'.repeat(64) })
    expect(errors[0].field).toBe('token')
  })

  it('rejects non-object body', () => {
    const { errors } = validateVerifyBody('string')
    expect(errors[0].field).toBe('body')
  })
})

// --- validateProfileBody ---

describe('validateProfileBody', () => {
  it('accepts name only', () => {
    const { errors, data } = validateProfileBody({ name: 'John' })
    expect(errors).toEqual([])
    expect(data).toEqual({ name: 'John', phone: undefined })
  })

  it('accepts phone only', () => {
    const { errors, data } = validateProfileBody({ phone: '+66812345678' })
    expect(errors).toEqual([])
    expect(data).toEqual({ name: undefined, phone: '+66812345678' })
  })

  it('rejects empty body (no name or phone)', () => {
    const { errors } = validateProfileBody({})
    expect(errors[0].field).toBe('body')
  })

  it('rejects name too short', () => {
    const { errors } = validateProfileBody({ name: 'A' })
    expect(errors[0].field).toBe('name')
  })

  it('rejects invalid phone', () => {
    const { errors } = validateProfileBody({ phone: '123' })
    expect(errors[0].field).toBe('phone')
  })
})

// --- validateCheckoutBody ---

describe('validateCheckoutBody', () => {
  it('accepts a valid checkout body', () => {
    const { errors, data } = validateCheckoutBody(validCheckoutBody())
    expect(errors).toEqual([])
    expect(data).toBeTruthy()
  })

  it('rejects missing idempotency_key', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ idempotency_key: '' }))
    expect(errors.some((e) => e.field === 'idempotency_key')).toBe(true)
  })

  it('rejects empty items array', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ items: [] }))
    expect(errors.some((e) => e.field === 'items')).toBe(true)
  })

  it('rejects items with invalid product_id', () => {
    const { errors } = validateCheckoutBody(
      validCheckoutBody({ items: [{ product_id: -1, quantity: 1 }] })
    )
    expect(errors.some((e) => e.field.includes('product_id'))).toBe(true)
  })

  it('rejects items with quantity > 100', () => {
    const { errors } = validateCheckoutBody(
      validCheckoutBody({ items: [{ product_id: 1, quantity: 101 }] })
    )
    expect(errors.some((e) => e.field.includes('quantity'))).toBe(true)
  })

  it('rejects missing customer', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ customer: undefined }))
    expect(errors.some((e) => e.field === 'customer')).toBe(true)
  })

  it('rejects invalid customer email', () => {
    const body = validCheckoutBody()
    ;(body.customer as Record<string, unknown>).email = 'bad'
    const { errors } = validateCheckoutBody(body)
    expect(errors.some((e) => e.field === 'customer.email')).toBe(true)
  })

  it('rejects invalid postal code', () => {
    const body = validCheckoutBody()
    ;((body.customer as Record<string, unknown>).address as Record<string, unknown>).postal_code = '123'
    const { errors } = validateCheckoutBody(body)
    expect(errors.some((e) => e.field === 'customer.address.postal_code')).toBe(true)
  })

  it('accepts optional discount_code', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ discount_code: 'SAVE10' }))
    expect(errors).toEqual([])
  })

  it('rejects non-string discount_code', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ discount_code: 123 }))
    expect(errors.some((e) => e.field === 'discount_code')).toBe(true)
  })

  it('accepts payment_method=promptpay', () => {
    const { errors, data } = validateCheckoutBody(validCheckoutBody({ payment_method: 'promptpay' }))
    expect(errors).toEqual([])
    expect(data?.payment_method).toBe('promptpay')
  })

  it('accepts payment_method=bank_transfer', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ payment_method: 'bank_transfer' }))
    expect(errors).toEqual([])
  })

  it('rejects when payment_method missing', () => {
    const body = validCheckoutBody()
    delete (body as Record<string, unknown>).payment_method
    const { errors } = validateCheckoutBody(body)
    expect(errors.some((e) => e.field === 'payment_method')).toBe(true)
  })

  it('rejects payment_method not in registry', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ payment_method: 'bitcoin' }))
    expect(errors.some((e) => e.field === 'payment_method')).toBe(true)
  })

  it('rejects non-string payment_method', () => {
    const { errors } = validateCheckoutBody(validCheckoutBody({ payment_method: 123 }))
    expect(errors.some((e) => e.field === 'payment_method')).toBe(true)
  })
})

// --- validatePaymentProofBody ---

describe('validatePaymentProofBody', () => {
  it('accepts valid proof_value', () => {
    const { errors, data } = validatePaymentProofBody({ proof_value: 'REF-12345' })
    expect(errors).toEqual([])
    expect(data?.proof_value).toBe('REF-12345')
  })

  it('rejects proof_value too short', () => {
    const { errors } = validatePaymentProofBody({ proof_value: 'ab' })
    expect(errors[0].field).toBe('proof_value')
  })

  it('rejects proof_value too long', () => {
    const { errors } = validatePaymentProofBody({ proof_value: 'x'.repeat(101) })
    expect(errors[0].field).toBe('proof_value')
  })
})

// --- validateShipmentBody ---

describe('validateShipmentBody', () => {
  it('accepts valid shipment data', () => {
    const { errors, data } = validateShipmentBody({ carrier: 'Kerry Express', tracking_number: 'KRY123456' })
    expect(errors).toEqual([])
    expect(data).toEqual({ carrier: 'Kerry Express', tracking_number: 'KRY123456' })
  })

  it('rejects carrier too short', () => {
    const { errors } = validateShipmentBody({ carrier: 'K', tracking_number: 'KRY123456' })
    expect(errors[0].field).toBe('carrier')
  })

  it('rejects tracking_number too short', () => {
    const { errors } = validateShipmentBody({ carrier: 'Kerry', tracking_number: 'AB' })
    expect(errors[0].field).toBe('tracking_number')
  })
})

// --- validateInventoryUpdateBody ---

describe('validateInventoryUpdateBody', () => {
  it('accepts positive adjustment', () => {
    const { errors, data } = validateInventoryUpdateBody({ adjustment: 10 })
    expect(errors).toEqual([])
    expect(data?.adjustment).toBe(10)
  })

  it('accepts negative adjustment', () => {
    const { errors, data } = validateInventoryUpdateBody({ adjustment: -5 })
    expect(errors).toEqual([])
    expect(data?.adjustment).toBe(-5)
  })

  it('rejects zero adjustment', () => {
    const { errors } = validateInventoryUpdateBody({ adjustment: 0 })
    expect(errors[0].field).toBe('adjustment')
  })

  it('rejects non-integer adjustment', () => {
    const { errors } = validateInventoryUpdateBody({ adjustment: 1.5 })
    expect(errors[0].field).toBe('adjustment')
  })

  it('rejects adjustment exceeding 100000', () => {
    const { errors } = validateInventoryUpdateBody({ adjustment: 100001 })
    expect(errors[0].field).toBe('adjustment')
  })

  it('accepts optional notes', () => {
    const { data } = validateInventoryUpdateBody({ adjustment: 10, notes: 'Restock' })
    expect(data?.notes).toBe('Restock')
  })

  it('rejects notes over 500 chars', () => {
    const { errors } = validateInventoryUpdateBody({ adjustment: 10, notes: 'x'.repeat(501) })
    expect(errors[0].field).toBe('notes')
  })
})

// --- validateCreateProductBody ---

describe('validateCreateProductBody', () => {
  it('accepts valid product', () => {
    const { errors, data } = validateCreateProductBody(validCreateProductBody())
    expect(errors).toEqual([])
    expect(data?.slug).toBe('protein-500g')
    expect(data?.active).toBe(true) // default
  })

  it('rejects invalid slug', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ slug: 'AB' }))
    expect(errors.some((e) => e.field === 'slug')).toBe(true)
  })

  it('rejects name too short', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ name: 'A' }))
    expect(errors.some((e) => e.field === 'name')).toBe(true)
  })

  it('rejects description too short', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ description: 'short' }))
    expect(errors.some((e) => e.field === 'description')).toBe(true)
  })

  it('rejects zero price', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ price_thb: 0 }))
    expect(errors.some((e) => e.field === 'price_thb')).toBe(true)
  })

  it('rejects negative weight', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ weight_g: -1 }))
    expect(errors.some((e) => e.field === 'weight_g')).toBe(true)
  })

  it('rejects invalid image URL', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ image_url: 'not a url' }))
    expect(errors.some((e) => e.field === 'image_url')).toBe(true)
  })

  it('rejects negative stock_count', () => {
    const { errors } = validateCreateProductBody(validCreateProductBody({ stock_count: -1 }))
    expect(errors.some((e) => e.field === 'stock_count')).toBe(true)
  })
})

// --- validateUpdateProductBody ---

describe('validateUpdateProductBody', () => {
  it('accepts partial update with name only', () => {
    const { errors, data } = validateUpdateProductBody({ name: 'New Name' })
    expect(errors).toEqual([])
    expect(data?.name).toBe('New Name')
  })

  it('accepts partial update with active only', () => {
    const { errors, data } = validateUpdateProductBody({ active: false })
    expect(errors).toEqual([])
    expect(data?.active).toBe(false)
  })

  it('rejects empty body (no updatable fields)', () => {
    const { errors } = validateUpdateProductBody({})
    expect(errors[0].field).toBe('body')
  })

  it('rejects unknown-only fields', () => {
    const { errors } = validateUpdateProductBody({ unknown_field: 'value' })
    expect(errors[0].field).toBe('body')
  })

  it('rejects invalid slug type', () => {
    const { errors } = validateUpdateProductBody({ slug: 123 })
    expect(errors[0].field).toBe('slug')
  })

  it('rejects invalid price', () => {
    const { errors } = validateUpdateProductBody({ price_thb: -100 })
    expect(errors[0].field).toBe('price_thb')
  })

  it('rejects non-boolean active', () => {
    const { errors } = validateUpdateProductBody({ active: 'yes' })
    expect(errors[0].field).toBe('active')
  })

  it('lowercases and trims slug', () => {
    const { data } = validateUpdateProductBody({ slug: '  My-Slug  ' })
    // "my-slug" is valid lowercase
    expect(data?.slug).toBe('my-slug')
  })
})

// --- parseAdminPagination ---

describe('parseAdminPagination', () => {
  function makeUrl(params: Record<string, string> = {}) {
    const url = new URL('https://api.example.com/admin/orders')
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    return url
  }

  it('returns defaults with no params', () => {
    const result = parseAdminPagination(makeUrl())
    expect(result).toEqual({ page: 1, limit: 20, offset: 0 })
  })

  it('parses page and limit', () => {
    const result = parseAdminPagination(makeUrl({ page: '3', limit: '10' }))
    expect(result).toEqual({ page: 3, limit: 10, offset: 20 })
  })

  it('caps limit at 100', () => {
    const result = parseAdminPagination(makeUrl({ limit: '500' }))
    expect(result.limit).toBe(100)
  })

  it('defaults invalid page to 1', () => {
    const result = parseAdminPagination(makeUrl({ page: '-1' }))
    expect(result.page).toBe(1)
  })

  it('defaults invalid limit to 20', () => {
    const result = parseAdminPagination(makeUrl({ limit: '0' }))
    expect(result.limit).toBe(20)
  })
})
