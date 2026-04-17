import type { RouterType } from 'itty-router'
import type { Env, ProductImageRow } from '../lib/types'

interface PublicProductRow {
  id: number
  slug: string
  name: string
  description: string
  price_thb: number
  weight_g: number
  image_url: string
  available_stock: number
  nutrition_json: string | null
  ingredients: string | null
  how_to_use: string | null
  who_is_for: string | null
  regulatory_info: string | null
  product_line_name: string | null
  product_translations_json: string | null
  product_line_translations_json: string | null
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

const SUPPORTED_LOCALES = ['en', 'th'] as const
type Locale = (typeof SUPPORTED_LOCALES)[number]

function resolveLocale(request: Request): Locale {
  const url = new URL(request.url)
  const raw = (url.searchParams.get('locale') || '').toLowerCase()
  if ((SUPPORTED_LOCALES as readonly string[]).includes(raw)) return raw as Locale
  return 'en'
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
      const locale = resolveLocale(request)
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
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

      const screenshotMap = await loadScreenshotsByProductIds(env, results.map((r) => r.id))
      const products = results.map((r) => ({ ...applyTranslations(r, locale), screenshots: screenshotMap.get(r.id) ?? [] }))

      return Response.json({ products })
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

    const locale = resolveLocale(request)

    try {
      const product = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
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

      const [screenshotMap, relatedRow] = await Promise.all([
        loadScreenshotsByProductIds(env, [product.id]),
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

      return Response.json({
        product: { ...applyTranslations(product, locale), screenshots: screenshotMap.get(product.id) ?? [] },
        related,
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
