import type { RouterType } from 'itty-router'
import type { Env, PublicReviewRow, ReviewSummaryRow, ReviewDistributionRow, CountRow } from '../lib/types'

export function registerReviewsRoutes(router: RouterType) {
  router.get('/api/products/:slug/reviews', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const slug = parts[parts.length - 2] || ''

    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json({ error: 'Invalid slug format' }, { status: 400 })
    }

    const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10)
    const pageSizeRaw = parseInt(url.searchParams.get('pageSize') ?? '10', 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 50) : 10
    const offset = (page - 1) * pageSize

    try {
      const product = await env.DB.prepare(
        `SELECT product_line_id FROM products WHERE slug = ? AND archived = 0 LIMIT 1`
      ).bind(slug).first<{ product_line_id: number | null }>()

      if (!product || product.product_line_id == null) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      const lineId = product.product_line_id

      const summary = await env.DB.prepare(
        `SELECT AVG(rating) AS avg_rating, COUNT(*) AS count
         FROM reviews WHERE product_line_id = ? AND status = 'approved'`
      ).bind(lineId).first<ReviewSummaryRow>()

      const { results: distRows } = await env.DB.prepare(
        `SELECT rating, COUNT(*) AS count
         FROM reviews WHERE product_line_id = ? AND status = 'approved'
         GROUP BY rating`
      ).bind(lineId).all<ReviewDistributionRow>()

      const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
      for (const row of distRows) distribution[String(row.rating)] = row.count

      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM reviews WHERE product_line_id = ? AND status = 'approved'`
      ).bind(lineId).first<CountRow>()
      const total = totalRow?.count ?? 0

      const { results: reviews } = await env.DB.prepare(
        `SELECT id, rating, body, locale, created_at
         FROM reviews
         WHERE product_line_id = ? AND status = 'approved'
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`
      ).bind(lineId, pageSize, offset).all<PublicReviewRow>()

      return new Response(JSON.stringify({
        summary: {
          avgRating: summary?.avg_rating ?? null,
          count: summary?.count ?? 0,
          distribution,
        },
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          body: r.body,
          locale: r.locale,
          createdAt: r.created_at,
        })),
        page,
        pageSize,
        total,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
