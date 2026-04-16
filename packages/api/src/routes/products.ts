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
  router.get('/api/products', async (_request: Request, env: Env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.who_is_for, pl.regulatory_info, pl.name AS product_line_name
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN product_lines pl ON pl.id = p.product_line_id
         WHERE p.active = 1 AND p.archived = 0
         ORDER BY p.id ASC`
      ).all<PublicProductRow>()

      const screenshotMap = await loadScreenshotsByProductIds(env, results.map((r) => r.id))
      const products = results.map((r) => ({ ...r, screenshots: screenshotMap.get(r.id) ?? [] }))

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

    try {
      const product = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.who_is_for, pl.regulatory_info, pl.name AS product_line_name
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

      const screenshotMap = await loadScreenshotsByProductIds(env, [product.id])
      return Response.json({ product: { ...product, screenshots: screenshotMap.get(product.id) ?? [] } })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
