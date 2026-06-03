import type { RouterType } from 'itty-router'
import type {
  Env,
  ProductImageRow,
  PriceTierRow,
  LabTestFileRow,
  LabTestContentType,
  ProductWaitlistProductRow,
} from '../lib/types'
import { resolveQueryLocale, type Locale } from '../lib/locale'
import { validateProductWaitlistSignupBody } from '../lib/validation'
import { parseJsonBody } from '../middleware/auth'
import { getClientIp, rateLimitedResponse } from '../middleware/rate-limit'
import { enforcePolicyGlobalLimit, enforcePolicyLimit } from '../middleware/rate-limit-registry'

interface PublicProductRow {
  id: number
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  available_stock: number
  product_line_id: number | null
  nutrition_json: string | null
  ingredients: string | null
  how_to_use: string | null
  who_is_for: string | null
  regulatory_info: string | null
  product_line_name: string | null
  product_translations_json: string | null
  product_line_translations_json: string | null
}

interface PublicLabTestFile {
  id: number
  url: string
  content_type: LabTestContentType
  label: string
}

interface RelatedProductRow {
  id: number
  slug: string
  name: string
  price_thb: number
  weight_g: number
  image_url: string
  available_stock: number
  product_translations_json: string | null
}

function pickLocaleEntry(raw: string | null, locale: Locale): Record<string, string> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>
    const entry = parsed?.[locale]
    if (entry && typeof entry === 'object') return entry
  } catch {
    // ignore
  }
  return null
}

function applyTranslations(row: PublicProductRow, locale: Locale) {
  const productEntry = pickLocaleEntry(row.product_translations_json, locale)
  const productLineEntry = pickLocaleEntry(row.product_line_translations_json, locale)

  const pickProduct = (key: 'name' | 'description', base: string): string => {
    const t = productEntry?.[key]
    return typeof t === 'string' && t.trim() !== '' ? t : base
  }

  const pickProductLine = (
    key: 'nutrition_json' | 'ingredients' | 'how_to_use' | 'who_is_for' | 'regulatory_info',
    base: string | null,
  ): string | null => {
    const t = productLineEntry?.[key]
    return typeof t === 'string' && t.trim() !== '' ? t : base
  }

  const productLineName: string | null = (() => {
    const t = productLineEntry?.['name']
    return typeof t === 'string' && t.trim() !== '' ? t : row.product_line_name
  })()

  return {
    id: row.id,
    slug: row.slug,
    name: pickProduct('name', row.name),
    description: pickProduct('description', row.description),
    price_thb: row.price_thb,
    weight_g: row.weight_g,
    image_url: row.image_url,
    available_stock: row.available_stock,
    nutrition_json: pickProductLine('nutrition_json', row.nutrition_json),
    ingredients: pickProductLine('ingredients', row.ingredients),
    how_to_use: pickProductLine('how_to_use', row.how_to_use),
    who_is_for: pickProductLine('who_is_for', row.who_is_for),
    regulatory_info: pickProductLine('regulatory_info', row.regulatory_info),
    product_line_name: productLineName,
  }
}

function applyRelatedTranslation(row: RelatedProductRow, locale: Locale) {
  const entry = pickLocaleEntry(row.product_translations_json, locale)
  const name = (() => {
    const t = entry?.['name']
    return typeof t === 'string' && t.trim() !== '' ? t : row.name
  })()
  return {
    id: row.id,
    slug: row.slug,
    name,
    price_thb: row.price_thb,
    weight_g: row.weight_g,
    image_url: row.image_url,
    available_stock: row.available_stock,
  }
}

async function loadPriceTiersByProductIds(env: Env, productIds: number[]) {
  if (productIds.length === 0) return new Map<number, { min_quantity: number; unit_price_thb: number }[]>()
  const placeholders = productIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT id, product_id, min_quantity, unit_price_thb
     FROM price_tiers
     WHERE product_id IN (${placeholders})
     ORDER BY product_id ASC, min_quantity ASC`
  )
    .bind(...productIds)
    .all<PriceTierRow>()

  const map = new Map<number, { min_quantity: number; unit_price_thb: number }[]>()
  for (const row of results) {
    const list = map.get(row.product_id) ?? []
    list.push({ min_quantity: row.min_quantity, unit_price_thb: row.unit_price_thb })
    map.set(row.product_id, list)
  }
  return map
}

async function loadLabTestsByProductLineIds(env: Env, productLineIds: number[]) {
  const map = new Map<number, PublicLabTestFile[]>()
  if (productLineIds.length === 0) return map
  const uniqueIds = Array.from(new Set(productLineIds))
  const placeholders = uniqueIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT id, product_line_id, url, r2_key, content_type, label, sort_order, size_bytes, created_at
     FROM product_line_lab_tests
     WHERE product_line_id IN (${placeholders})
     ORDER BY product_line_id ASC, sort_order ASC, id ASC`
  )
    .bind(...uniqueIds)
    .all<LabTestFileRow>()
  for (const row of results) {
    const list = map.get(row.product_line_id) ?? []
    list.push({ id: row.id, url: row.url, content_type: row.content_type, label: row.label })
    map.set(row.product_line_id, list)
  }
  return map
}

async function loadScreenshotsByProductIds(env: Env, productIds: number[]) {
  if (productIds.length === 0) return new Map<number, { id: number; url: string; sort_order: number }[]>()
  const placeholders = productIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT id, product_id, url, sort_order, created_at
     FROM product_images
     WHERE product_id IN (${placeholders})
     ORDER BY product_id ASC, sort_order ASC, id ASC`
  )
    .bind(...productIds)
    .all<ProductImageRow>()

  const map = new Map<number, { id: number; url: string; sort_order: number }[]>()
  for (const row of results) {
    const list = map.get(row.product_id) ?? []
    list.push({ id: row.id, url: row.url, sort_order: row.sort_order })
    map.set(row.product_id, list)
  }
  return map
}

export function registerProductRoutes(router: RouterType) {
  router.get('/api/products', async (request: Request, env: Env) => {
    try {
      const locale = resolveQueryLocale(new URL(request.url).searchParams.get('locale'))
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
                p.product_line_id,
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.who_is_for, pl.regulatory_info,
                pl.name AS product_line_name,
                p.translations_json AS product_translations_json,
                pl.translations_json AS product_line_translations_json
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN product_lines pl ON pl.id = p.product_line_id
         WHERE p.active = 1 AND p.archived = 0
         ORDER BY p.id ASC`
      ).all<PublicProductRow>()

      const productIds = results.map((r) => r.id)
      const productLineIds = results
        .map((r) => r.product_line_id)
        .filter((id): id is number => typeof id === 'number' && id > 0)
      const [screenshotMap, tierMap, labTestMap] = await Promise.all([
        loadScreenshotsByProductIds(env, productIds),
        loadPriceTiersByProductIds(env, productIds),
        loadLabTestsByProductLineIds(env, productLineIds),
      ])
      const products = results.map((r) => ({
        ...applyTranslations(r, locale),
        screenshots: screenshotMap.get(r.id) ?? [],
        price_tiers: tierMap.get(r.id) ?? [],
        lab_test_files: r.product_line_id ? labTestMap.get(r.product_line_id) ?? [] : [],
      }))

      return Response.json(
        { products },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      )
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.post('/api/products/:slug/waitlist', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const slug = parts[parts.length - 2] || ''

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const key = getClientIp(request)
    const ipLimit = await enforcePolicyLimit(env, 'waitlist_signup', key)
    if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec)

    const globalLimit = await enforcePolicyGlobalLimit(env, 'waitlist_signup')
    if (!globalLimit.ok) return rateLimitedResponse(globalLimit.retryAfterSec)

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateProductWaitlistSignupBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const locale = resolveQueryLocale(url.searchParams.get('locale'))

    try {
      const product = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, (i.stock_count - i.reserved_count) AS available_stock
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.slug = ? AND p.active = 1 AND p.archived = 0
         LIMIT 1`
      )
        .bind(slug)
        .first<ProductWaitlistProductRow>()

      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      if (product.available_stock > 0) {
        return Response.json({ error: 'Product is in stock' }, { status: 409 })
      }

      const now = new Date().toISOString()
      const existing = await env.DB.prepare(
        `SELECT id FROM product_waitlist_signups
         WHERE product_id = ? AND email = ? AND notified_at IS NULL
         LIMIT 1`
      )
        .bind(product.id, data.email)
        .first<{ id: number }>()

      if (existing) {
        await env.DB.prepare(
          `UPDATE product_waitlist_signups
           SET marketing_consent = ?, locale = ?, updated_at = ?
           WHERE id = ?`
        )
          .bind(data.marketing_consent ? 1 : 0, locale, now, existing.id)
          .run()
        return Response.json({ success: true })
      }

      await env.DB.prepare(
        `INSERT INTO product_waitlist_signups
           (product_id, email, locale, marketing_consent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(product.id, data.email, locale, data.marketing_consent ? 1 : 0, now, now)
        .run()

      return Response.json({ success: true }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.get('/api/products/:slug', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const slug = url.pathname.split('/').pop() || ''

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const locale = resolveQueryLocale(new URL(request.url).searchParams.get('locale'))

    try {
      const product = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
                p.product_line_id,
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.who_is_for, pl.regulatory_info,
                pl.name AS product_line_name,
                p.translations_json AS product_translations_json,
                pl.translations_json AS product_line_translations_json
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN product_lines pl ON pl.id = p.product_line_id
         WHERE p.slug = ? AND p.active = 1 AND p.archived = 0`
      )
        .bind(slug)
        .first<PublicProductRow>()

      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      const [screenshotMap, tierMap, labTestMap, relatedRow] = await Promise.all([
        loadScreenshotsByProductIds(env, [product.id]),
        loadPriceTiersByProductIds(env, [product.id]),
        loadLabTestsByProductLineIds(env, product.product_line_id ? [product.product_line_id] : []),
        env.DB.prepare(
          `SELECT p.id, p.slug, p.name, p.price_thb, p.weight_g, p.image_url,
                  (i.stock_count - i.reserved_count) AS available_stock,
                  p.translations_json AS product_translations_json
           FROM products p
           JOIN inventory i ON i.product_id = p.id
           WHERE p.slug != ? AND p.active = 1 AND p.archived = 0
           ORDER BY p.id ASC
           LIMIT 1`,
        )
          .bind(slug)
          .first<RelatedProductRow>(),
      ])

      const related = relatedRow ? applyRelatedTranslation(relatedRow, locale) : null

      return Response.json(
        {
          product: {
            ...applyTranslations(product, locale),
            screenshots: screenshotMap.get(product.id) ?? [],
            price_tiers: tierMap.get(product.id) ?? [],
            lab_test_files: product.product_line_id ? labTestMap.get(product.product_line_id) ?? [] : [],
          },
          related,
        },
        { headers: { 'Cache-Control': 'public, max-age=600' } },
      )
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
