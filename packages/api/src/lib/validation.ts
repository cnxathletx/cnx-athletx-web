import { isValidEmail, isValidPhoneNumber, isValidProductSlug, isValidProductImageUrl } from './utils'
import type {
  ValidationError,
  RequestLinkBody,
  VerifyLinkBody,
  UpdateProfileBody,
  CheckoutBody,
  PaymentProofBody,
  AdminShipmentBody,
  AdminInventoryUpdateBody,
  AdminCreateProductBody,
  AdminUpdateProductBody,
  AdminCreateDiscountBody,
  AdminUpdateDiscountBody,
  AdminCreateProductLineBody,
  AdminUpdateProductLineBody,
  CreateChatConversationBody,
  PostChatMessageBody,
  AdminUpdateChatStatusBody,
} from './types'

const CHAT_MESSAGE_MIN = 1
const CHAT_MESSAGE_MAX = 2000
const VISITOR_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/

export function validateRequestLinkBody(body: unknown): { errors: ValidationError[]; data: RequestLinkBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''

  if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'email must be a valid email address' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { email } }
}

export function validateVerifyBody(body: unknown): { errors: ValidationError[]; data: VerifyLinkBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const token = typeof b.token === 'string' ? b.token.trim().toLowerCase() : ''

  if (!/^[a-f0-9]{64}$/.test(token)) {
    errors.push({ field: 'token', message: 'token must be a 64-character hex string' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { token } }
}

export function validateProfileBody(body: unknown): { errors: ValidationError[]; data: UpdateProfileBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const hasName = b.name !== undefined
  const hasPhone = b.phone !== undefined

  if (!hasName && !hasPhone) {
    errors.push({ field: 'body', message: 'At least one of name or phone must be provided' })
  }

  let name: string | undefined
  if (hasName) {
    if (typeof b.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a string' })
    } else {
      const trimmed = b.name.trim()
      if (trimmed.length < 2 || trimmed.length > 100) {
        errors.push({ field: 'name', message: 'name must be between 2 and 100 characters' })
      } else {
        name = trimmed
      }
    }
  }

  let phone: string | undefined
  if (hasPhone) {
    if (typeof b.phone !== 'string') {
      errors.push({ field: 'phone', message: 'phone must be a string' })
    } else {
      const trimmed = b.phone.trim()
      if (!isValidPhoneNumber(trimmed)) {
        errors.push({ field: 'phone', message: 'phone must be a valid phone number' })
      } else {
        phone = trimmed
      }
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { name, phone } }
}

export function validateCheckoutBody(body: unknown): { errors: ValidationError[]; data: CheckoutBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>

  if (!b.idempotency_key || typeof b.idempotency_key !== 'string' || b.idempotency_key.trim() === '') {
    errors.push({ field: 'idempotency_key', message: 'idempotency_key is required' })
  }

  if (!Array.isArray(b.items)) {
    errors.push({ field: 'items', message: 'items must be an array' })
  } else if (b.items.length < 1 || b.items.length > 10) {
    errors.push({ field: 'items', message: 'items must contain between 1 and 10 entries' })
  } else {
    for (let i = 0; i < b.items.length; i++) {
      const item = b.items[i] as Record<string, unknown>
      if (!item || typeof item !== 'object') {
        errors.push({ field: `items[${i}]`, message: 'Each item must be an object' })
        continue
      }
      if (typeof item.product_id !== 'number' || !Number.isInteger(item.product_id) || item.product_id < 1) {
        errors.push({ field: `items[${i}].product_id`, message: 'product_id must be a positive integer' })
      }
      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        errors.push({ field: `items[${i}].quantity`, message: 'quantity must be an integer between 1 and 100' })
      }
    }
  }

  if (!b.customer || typeof b.customer !== 'object') {
    errors.push({ field: 'customer', message: 'customer is required' })
  } else {
    const c = b.customer as Record<string, unknown>

    if (typeof c.name !== 'string' || c.name.trim().length < 2 || c.name.trim().length > 100) {
      errors.push({ field: 'customer.name', message: 'name must be between 2 and 100 characters' })
    }

    if (typeof c.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
      errors.push({ field: 'customer.email', message: 'email must be a valid email address' })
    }

    if (typeof c.phone !== 'string' || !isValidPhoneNumber(c.phone)) {
      errors.push({
        field: 'customer.phone',
        message: 'phone must be a valid phone number (e.g. +66812345678)',
      })
    }

    if (!c.address || typeof c.address !== 'object') {
      errors.push({ field: 'customer.address', message: 'address is required' })
    } else {
      const a = c.address as Record<string, unknown>

      if (typeof a.line1 !== 'string' || a.line1.trim().length < 5 || a.line1.trim().length > 200) {
        errors.push({ field: 'customer.address.line1', message: 'line1 must be between 5 and 200 characters' })
      }

      if (typeof a.district !== 'string' || a.district.trim() === '') {
        errors.push({ field: 'customer.address.district', message: 'district is required' })
      }

      if (typeof a.province !== 'string' || a.province.trim() === '') {
        errors.push({ field: 'customer.address.province', message: 'province is required' })
      }

      if (typeof a.postal_code !== 'string' || !/^\d{5}$/.test(a.postal_code)) {
        errors.push({ field: 'customer.address.postal_code', message: 'postal_code must be exactly 5 digits' })
      }
    }
  }

  if (b.discount_code !== undefined && b.discount_code !== null) {
    if (typeof b.discount_code !== 'string') {
      errors.push({ field: 'discount_code', message: 'discount_code must be a string' })
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: b as unknown as CheckoutBody }
}

export function validatePaymentProofBody(body: unknown): { errors: ValidationError[]; data: PaymentProofBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const proofValue = typeof b.proof_value === 'string' ? b.proof_value.trim() : ''

  if (proofValue.length < 5 || proofValue.length > 100) {
    errors.push({
      field: 'proof_value',
      message: 'proof_value must be a string between 5 and 100 characters',
    })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { proof_value: proofValue } }
}

export function validateShipmentBody(body: unknown): { errors: ValidationError[]; data: AdminShipmentBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const carrier = typeof b.carrier === 'string' ? b.carrier.trim() : ''
  const tracking = typeof b.tracking_number === 'string' ? b.tracking_number.trim() : ''

  if (carrier.length < 2 || carrier.length > 100) {
    errors.push({ field: 'carrier', message: 'carrier must be between 2 and 100 characters' })
  }

  if (tracking.length < 3 || tracking.length > 100) {
    errors.push({ field: 'tracking_number', message: 'tracking_number must be between 3 and 100 characters' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { carrier, tracking_number: tracking } }
}

export function validateInventoryUpdateBody(body: unknown): { errors: ValidationError[]; data: AdminInventoryUpdateBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const adjustment = typeof b.adjustment === 'number' ? b.adjustment : Number.NaN
  const notes = typeof b.notes === 'string' ? b.notes.trim() : undefined

  if (!Number.isInteger(adjustment) || adjustment === 0 || Math.abs(adjustment) > 100000) {
    errors.push({ field: 'adjustment', message: 'adjustment must be a non-zero integer between -100000 and 100000' })
  }

  if (notes && notes.length > 500) {
    errors.push({ field: 'notes', message: 'notes must be 500 characters or fewer' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { adjustment, notes } }
}

export function validateCreateProductBody(body: unknown): { errors: ValidationError[]; data: AdminCreateProductBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : ''
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  const price = typeof b.price_thb === 'number' ? b.price_thb : Number.NaN
  const weight = typeof b.weight_g === 'number' ? b.weight_g : Number.NaN
  const imageUrl = typeof b.image_url === 'string' ? b.image_url.trim() : ''
  const active = typeof b.active === 'boolean' ? b.active : true
  const stockCount = typeof b.stock_count === 'number' ? b.stock_count : 0
  const productLineId = b.product_line_id === null || b.product_line_id === undefined ? null : (typeof b.product_line_id === 'number' ? b.product_line_id : Number.NaN)

  if (!isValidProductSlug(slug)) {
    errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
  }
  if (name.length < 2 || name.length > 120) {
    errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
  }
  if (description.length < 10 || description.length > 5000) {
    errors.push({ field: 'description', message: 'description must be between 10 and 5000 characters' })
  }
  if (!Number.isInteger(price) || price <= 0 || price > 100000000) {
    errors.push({ field: 'price_thb', message: 'price_thb must be a positive integer up to 100000000' })
  }
  if (!Number.isInteger(weight) || weight <= 0 || weight > 50000) {
    errors.push({ field: 'weight_g', message: 'weight_g must be a positive integer up to 50000' })
  }
  if (imageUrl.length < 2 || imageUrl.length > 2000000) {
    errors.push({ field: 'image_url', message: 'image_url must be between 2 and 2000000 characters' })
  } else if (!isValidProductImageUrl(imageUrl)) {
    errors.push({
      field: 'image_url',
      message: 'image_url must be an absolute URL, root-relative path, or data image URL',
    })
  }
  if (!Number.isInteger(stockCount) || stockCount < 0 || stockCount > 1000000) {
    errors.push({ field: 'stock_count', message: 'stock_count must be an integer between 0 and 1000000' })
  }
  if (productLineId !== null && (!Number.isInteger(productLineId) || productLineId < 1)) {
    errors.push({ field: 'product_line_id', message: 'product_line_id must be a positive integer or null' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: {
      slug,
      name,
      description,
      price_thb: price,
      weight_g: weight,
      image_url: imageUrl,
      active,
      stock_count: stockCount,
      product_line_id: productLineId,
    },
  }
}

export function validateUpdateProductBody(body: unknown): { errors: ValidationError[]; data: AdminUpdateProductBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const allowed = ['slug', 'name', 'description', 'price_thb', 'weight_g', 'image_url', 'active', 'archived', 'product_line_id']
  const provided = allowed.filter((key) => key in b)

  if (provided.length === 0) {
    return { errors: [{ field: 'body', message: 'At least one updatable product field is required' }], data: null }
  }

  const data: AdminUpdateProductBody = {}

  if ('slug' in b) {
    if (typeof b.slug !== 'string') {
      errors.push({ field: 'slug', message: 'slug must be a string' })
    } else {
      const slug = b.slug.trim().toLowerCase()
      if (!isValidProductSlug(slug)) {
        errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
      } else {
        data.slug = slug
      }
    }
  }

  if ('name' in b) {
    if (typeof b.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a string' })
    } else {
      const name = b.name.trim()
      if (name.length < 2 || name.length > 120) {
        errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
      } else {
        data.name = name
      }
    }
  }

  if ('description' in b) {
    if (typeof b.description !== 'string') {
      errors.push({ field: 'description', message: 'description must be a string' })
    } else {
      const description = b.description.trim()
      if (description.length < 10 || description.length > 5000) {
        errors.push({ field: 'description', message: 'description must be between 10 and 5000 characters' })
      } else {
        data.description = description
      }
    }
  }

  if ('price_thb' in b) {
    if (typeof b.price_thb !== 'number' || !Number.isInteger(b.price_thb) || b.price_thb <= 0 || b.price_thb > 100000000) {
      errors.push({ field: 'price_thb', message: 'price_thb must be a positive integer up to 100000000' })
    } else {
      data.price_thb = b.price_thb
    }
  }

  if ('weight_g' in b) {
    if (typeof b.weight_g !== 'number' || !Number.isInteger(b.weight_g) || b.weight_g <= 0 || b.weight_g > 50000) {
      errors.push({ field: 'weight_g', message: 'weight_g must be a positive integer up to 50000' })
    } else {
      data.weight_g = b.weight_g
    }
  }

  if ('image_url' in b) {
    if (typeof b.image_url !== 'string') {
      errors.push({ field: 'image_url', message: 'image_url must be a string' })
    } else {
      const imageUrl = b.image_url.trim()
      if (imageUrl.length < 2 || imageUrl.length > 2000000) {
        errors.push({ field: 'image_url', message: 'image_url must be between 2 and 2000000 characters' })
      } else if (!isValidProductImageUrl(imageUrl)) {
        errors.push({
          field: 'image_url',
          message: 'image_url must be an absolute URL, root-relative path, or data image URL',
        })
      } else {
        data.image_url = imageUrl
      }
    }
  }

  if ('active' in b) {
    if (typeof b.active !== 'boolean') {
      errors.push({ field: 'active', message: 'active must be boolean' })
    } else {
      data.active = b.active
    }
  }

  if ('archived' in b) {
    if (typeof b.archived !== 'boolean') {
      errors.push({ field: 'archived', message: 'archived must be boolean' })
    } else {
      data.archived = b.archived
    }
  }

  if ('product_line_id' in b) {
    if (b.product_line_id !== null && (typeof b.product_line_id !== 'number' || !Number.isInteger(b.product_line_id) || b.product_line_id < 1)) {
      errors.push({ field: 'product_line_id', message: 'product_line_id must be a positive integer or null' })
    } else {
      data.product_line_id = b.product_line_id as number | null
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data }
}

export function validateCreateDiscountBody(body: unknown): { errors: ValidationError[]; data: AdminCreateDiscountBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
  const type = typeof b.type === 'string' ? b.type : ''
  const value = typeof b.value === 'number' ? b.value : Number.NaN
  const minOrder = typeof b.min_order_thb === 'number' ? b.min_order_thb : 0
  const maxUses = b.max_uses === null || b.max_uses === undefined ? null : (typeof b.max_uses === 'number' ? b.max_uses : Number.NaN)
  const active = typeof b.active === 'boolean' ? b.active : true
  const expiresAt = b.expires_at === null || b.expires_at === undefined ? null : (typeof b.expires_at === 'string' ? b.expires_at.trim() : '')

  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
    errors.push({ field: 'code', message: 'code must be 2-30 uppercase alphanumeric characters, hyphens, or underscores' })
  }

  if (type !== 'fixed' && type !== 'percent') {
    errors.push({ field: 'type', message: 'type must be "fixed" or "percent"' })
  }

  if (!Number.isInteger(value) || value <= 0) {
    errors.push({ field: 'value', message: 'value must be a positive integer' })
  } else if (type === 'percent' && value > 100) {
    errors.push({ field: 'value', message: 'percent value must be between 1 and 100' })
  } else if (type === 'fixed' && value > 100000000) {
    errors.push({ field: 'value', message: 'fixed value must not exceed 100000000 satang' })
  }

  if (!Number.isInteger(minOrder) || minOrder < 0) {
    errors.push({ field: 'min_order_thb', message: 'min_order_thb must be a non-negative integer' })
  }

  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    errors.push({ field: 'max_uses', message: 'max_uses must be a positive integer or null' })
  }

  if (expiresAt !== null && expiresAt !== '' && isNaN(Date.parse(expiresAt))) {
    errors.push({ field: 'expires_at', message: 'expires_at must be a valid ISO date string or null' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: {
      code,
      type: type as 'fixed' | 'percent',
      value,
      min_order_thb: minOrder,
      max_uses: maxUses,
      active,
      expires_at: expiresAt || null,
    },
  }
}

export function validateUpdateDiscountBody(body: unknown): { errors: ValidationError[]; data: AdminUpdateDiscountBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const allowed = ['code', 'type', 'value', 'min_order_thb', 'max_uses', 'active', 'archived', 'expires_at']
  const provided = allowed.filter((key) => key in b)

  if (provided.length === 0) {
    return { errors: [{ field: 'body', message: 'At least one updatable field is required' }], data: null }
  }

  const data: AdminUpdateDiscountBody = {}

  if ('code' in b) {
    const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : ''
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
      errors.push({ field: 'code', message: 'code must be 2-30 uppercase alphanumeric characters, hyphens, or underscores' })
    } else {
      data.code = code
    }
  }

  if ('type' in b) {
    if (b.type !== 'fixed' && b.type !== 'percent') {
      errors.push({ field: 'type', message: 'type must be "fixed" or "percent"' })
    } else {
      data.type = b.type
    }
  }

  if ('value' in b) {
    if (typeof b.value !== 'number' || !Number.isInteger(b.value) || b.value <= 0) {
      errors.push({ field: 'value', message: 'value must be a positive integer' })
    } else {
      data.value = b.value
    }
  }

  if ('min_order_thb' in b) {
    if (typeof b.min_order_thb !== 'number' || !Number.isInteger(b.min_order_thb) || b.min_order_thb < 0) {
      errors.push({ field: 'min_order_thb', message: 'min_order_thb must be a non-negative integer' })
    } else {
      data.min_order_thb = b.min_order_thb
    }
  }

  if ('max_uses' in b) {
    if (b.max_uses !== null && (typeof b.max_uses !== 'number' || !Number.isInteger(b.max_uses) || b.max_uses < 1)) {
      errors.push({ field: 'max_uses', message: 'max_uses must be a positive integer or null' })
    } else {
      data.max_uses = b.max_uses as number | null
    }
  }

  if ('active' in b) {
    if (typeof b.active !== 'boolean') {
      errors.push({ field: 'active', message: 'active must be boolean' })
    } else {
      data.active = b.active
    }
  }

  if ('archived' in b) {
    if (typeof b.archived !== 'boolean') {
      errors.push({ field: 'archived', message: 'archived must be boolean' })
    } else {
      data.archived = b.archived
    }
  }

  if ('expires_at' in b) {
    if (b.expires_at !== null && (typeof b.expires_at !== 'string' || isNaN(Date.parse(b.expires_at)))) {
      errors.push({ field: 'expires_at', message: 'expires_at must be a valid ISO date string or null' })
    } else {
      data.expires_at = b.expires_at as string | null
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data }
}

export function validateCreateProductLineBody(body: unknown): { errors: ValidationError[]; data: AdminCreateProductLineBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const slug = typeof b.slug === 'string' ? b.slug.trim().toLowerCase() : ''
  const nutritionJson = typeof b.nutrition_json === 'string' ? b.nutrition_json.trim() : '{}'
  const ingredients = typeof b.ingredients === 'string' ? b.ingredients.trim() : ''
  const howToUse = typeof b.how_to_use === 'string' ? b.how_to_use.trim() : ''

  if (name.length < 2 || name.length > 120) {
    errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
  }
  if (!isValidProductSlug(slug)) {
    errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
  }
  try {
    JSON.parse(nutritionJson)
  } catch {
    errors.push({ field: 'nutrition_json', message: 'nutrition_json must be valid JSON' })
  }
  if (ingredients.length > 5000) {
    errors.push({ field: 'ingredients', message: 'ingredients must be 5000 characters or fewer' })
  }
  if (howToUse.length > 5000) {
    errors.push({ field: 'how_to_use', message: 'how_to_use must be 5000 characters or fewer' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: { name, slug, nutrition_json: nutritionJson, ingredients, how_to_use: howToUse },
  }
}

export function validateUpdateProductLineBody(body: unknown): { errors: ValidationError[]; data: AdminUpdateProductLineBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const allowed = ['name', 'slug', 'nutrition_json', 'ingredients', 'how_to_use']
  const provided = allowed.filter((key) => key in b)

  if (provided.length === 0) {
    return { errors: [{ field: 'body', message: 'At least one updatable field is required' }], data: null }
  }

  const data: AdminUpdateProductLineBody = {}

  if ('name' in b) {
    if (typeof b.name !== 'string') {
      errors.push({ field: 'name', message: 'name must be a string' })
    } else {
      const name = b.name.trim()
      if (name.length < 2 || name.length > 120) {
        errors.push({ field: 'name', message: 'name must be between 2 and 120 characters' })
      } else {
        data.name = name
      }
    }
  }

  if ('slug' in b) {
    if (typeof b.slug !== 'string') {
      errors.push({ field: 'slug', message: 'slug must be a string' })
    } else {
      const slug = b.slug.trim().toLowerCase()
      if (!isValidProductSlug(slug)) {
        errors.push({ field: 'slug', message: 'slug must be 3-100 chars and contain only a-z, 0-9, or hyphen' })
      } else {
        data.slug = slug
      }
    }
  }

  if ('nutrition_json' in b) {
    if (typeof b.nutrition_json !== 'string') {
      errors.push({ field: 'nutrition_json', message: 'nutrition_json must be a string' })
    } else {
      try {
        JSON.parse(b.nutrition_json)
        data.nutrition_json = b.nutrition_json.trim()
      } catch {
        errors.push({ field: 'nutrition_json', message: 'nutrition_json must be valid JSON' })
      }
    }
  }

  if ('ingredients' in b) {
    if (typeof b.ingredients !== 'string') {
      errors.push({ field: 'ingredients', message: 'ingredients must be a string' })
    } else {
      const ingredients = b.ingredients.trim()
      if (ingredients.length > 5000) {
        errors.push({ field: 'ingredients', message: 'ingredients must be 5000 characters or fewer' })
      } else {
        data.ingredients = ingredients
      }
    }
  }

  if ('how_to_use' in b) {
    if (typeof b.how_to_use !== 'string') {
      errors.push({ field: 'how_to_use', message: 'how_to_use must be a string' })
    } else {
      const howToUse = b.how_to_use.trim()
      if (howToUse.length > 5000) {
        errors.push({ field: 'how_to_use', message: 'how_to_use must be 5000 characters or fewer' })
      } else {
        data.how_to_use = howToUse
      }
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data }
}

export function validateCreateChatConversationBody(
  body: unknown,
  hasSession: boolean,
): { errors: ValidationError[]; data: CreateChatConversationBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const visitorId = typeof b.visitor_id === 'string' ? b.visitor_id.trim() : ''
  const initialMessage = typeof b.initial_message === 'string' ? b.initial_message.trim() : ''
  const guestName = typeof b.guest_name === 'string' ? b.guest_name.trim() : ''
  const guestEmail = typeof b.guest_email === 'string' ? b.guest_email.trim().toLowerCase() : ''

  if (!VISITOR_ID_REGEX.test(visitorId)) {
    errors.push({ field: 'visitor_id', message: 'visitor_id must be 8-64 chars of [a-zA-Z0-9_-]' })
  }

  if (initialMessage.length < CHAT_MESSAGE_MIN || initialMessage.length > CHAT_MESSAGE_MAX) {
    errors.push({
      field: 'initial_message',
      message: `initial_message must be between ${CHAT_MESSAGE_MIN} and ${CHAT_MESSAGE_MAX} characters`,
    })
  }

  if (!hasSession) {
    if (guestName.length < 2 || guestName.length > 100) {
      errors.push({ field: 'guest_name', message: 'guest_name must be between 2 and 100 characters' })
    }
    if (!isValidEmail(guestEmail)) {
      errors.push({ field: 'guest_email', message: 'guest_email must be a valid email address' })
    }
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return {
    errors: [],
    data: {
      visitor_id: visitorId,
      initial_message: initialMessage,
      guest_name: hasSession ? undefined : guestName,
      guest_email: hasSession ? undefined : guestEmail,
    },
  }
}

export function validatePostChatMessageBody(
  body: unknown,
): { errors: ValidationError[]; data: PostChatMessageBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  const messageBody = typeof b.body === 'string' ? b.body.trim() : ''

  if (messageBody.length < CHAT_MESSAGE_MIN || messageBody.length > CHAT_MESSAGE_MAX) {
    errors.push({
      field: 'body',
      message: `body must be between ${CHAT_MESSAGE_MIN} and ${CHAT_MESSAGE_MAX} characters`,
    })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { body: messageBody } }
}

export function validateUpdateChatStatusBody(
  body: unknown,
): { errors: ValidationError[]; data: AdminUpdateChatStatusBody | null } {
  const errors: ValidationError[] = []

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }], data: null }
  }

  const b = body as Record<string, unknown>
  if (b.status !== 'open' && b.status !== 'closed') {
    errors.push({ field: 'status', message: 'status must be "open" or "closed"' })
  }

  if (errors.length > 0) {
    return { errors, data: null }
  }

  return { errors: [], data: { status: b.status as 'open' | 'closed' } }
}

export function parseAdminPagination(url: URL): { page: number; limit: number; offset: number } {
  const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20
  return { page, limit, offset: (page - 1) * limit }
}
