import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'

export function registerProductRoutes(router: RouterType) {
  router.get('/api/products', async (_request: Request, env: Env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url,
                (i.stock_count - i.reserved_count) AS available_stock,
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.name AS product_line_name
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN product_lines pl ON pl.id = p.product_line_id
         WHERE p.active = 1
         ORDER BY p.id ASC`
      ).all()

      return Response.json({ products: results })
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
                pl.nutrition_json, pl.ingredients, pl.how_to_use, pl.name AS product_line_name
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         LEFT JOIN product_lines pl ON pl.id = p.product_line_id
         WHERE p.slug = ? AND p.active = 1`
      )
        .bind(slug)
        .first()

      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      return Response.json({ product })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
