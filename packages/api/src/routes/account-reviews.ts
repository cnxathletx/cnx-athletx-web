import type { RouterType } from 'itty-router'
import type { Env, ReviewableProductRow, ReviewRow, SubmitReviewBody, ValidationError } from '../lib/types'
import { nowIso } from '../lib/utils'
import { getSessionUser, parseJsonBody } from '../middleware/auth'

const SHIPPED_STATUSES = "('shipped','delivered')"

function validateSubmitBody(raw: unknown): { errors: ValidationError[]; data: SubmitReviewBody | null } {
  const errors: ValidationError[] = []
  if (!raw || typeof raw !== 'object') {
    errors.push({ field: 'body', message: 'Request body must be a JSON object' })
    return { errors, data: null }
  }
  const b = raw as Record<string, unknown>
  const productLineId = typeof b.productLineId === 'number' && Number.isInteger(b.productLineId) ? b.productLineId : null
  const rating = typeof b.rating === 'number' && Number.isInteger(b.rating) ? b.rating : null
  const locale = typeof b.locale === 'string' ? b.locale : null
  const body = b.body == null ? null : (typeof b.body === 'string' ? b.body : undefined)

  if (productLineId == null || productLineId <= 0) errors.push({ field: 'productLineId', message: 'productLineId must be a positive integer' })
  if (rating == null || rating < 1 || rating > 5) errors.push({ field: 'rating', message: 'rating must be an integer between 1 and 5' })
  if (locale !== 'en' && locale !== 'th') errors.push({ field: 'locale', message: 'locale must be "en" or "th"' })
  if (body === undefined) errors.push({ field: 'body', message: 'body must be a string or null' })
  if (typeof body === 'string' && body.length > 1000) errors.push({ field: 'body', message: 'body must not exceed 1000 characters' })

  if (errors.length > 0) return { errors, data: null }
  return { errors, data: { productLineId: productLineId!, rating: rating!, body: body ?? undefined, locale: locale as 'en' | 'th' } }
}

export function registerAccountReviewsRoutes(router: RouterType) {
  router.get('/api/account/reviewable-products', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    try {
      const { results } = await env.DB.prepare(
        `SELECT pl.id AS product_line_id,
                p.slug AS slug,
                pl.name AS name,
                o.id AS order_id,
                s.shipped_at AS shipped_at
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         JOIN product_lines pl ON pl.id = p.product_line_id
         LEFT JOIN shipments s ON s.order_id = o.id
         WHERE o.user_id = ?
           AND o.status IN ('shipped','delivered')
           AND NOT EXISTS (
             SELECT 1 FROM reviews r
             WHERE r.user_id = ? AND r.product_line_id = pl.id
           )
         GROUP BY pl.id
         ORDER BY pl.id ASC`
      ).bind(user.id, user.id).all<ReviewableProductRow>()

      return Response.json({
        items: results.map((row) => ({
          productLineId: row.product_line_id,
          slug: row.slug,
          name: row.name,
          orderId: row.order_id,
          shippedAt: row.shipped_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.get('/api/account/reviews', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    try {
      const { results } = await env.DB.prepare(
        `SELECT r.id, r.product_line_id, r.rating, r.body, r.locale, r.status,
                r.rejected_reason, r.created_at, r.moderated_at,
                pl.name AS product_line_name
         FROM reviews r
         JOIN product_lines pl ON pl.id = r.product_line_id
         WHERE r.user_id = ?
         ORDER BY r.created_at DESC`
      ).bind(user.id).all<ReviewRow & { product_line_name: string }>()

      return Response.json({
        reviews: results.map((r) => ({
          id: r.id,
          productLineId: r.product_line_id,
          productLineName: r.product_line_name,
          rating: r.rating,
          body: r.body,
          locale: r.locale,
          status: r.status,
          rejectedReason: r.rejected_reason,
          createdAt: r.created_at,
          moderatedAt: r.moderated_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.post('/api/account/reviews', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateSubmitBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    try {
      const lineExists = await env.DB.prepare(
        `SELECT id FROM product_lines WHERE id = ? LIMIT 1`
      ).bind(data.productLineId).first<{ id: number }>()
      if (!lineExists) return Response.json({ error: 'Product line not found' }, { status: 404 })

      const eligibility = await env.DB.prepare(
        `SELECT 1 AS ok
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.user_id = ?
           AND o.status IN ${SHIPPED_STATUSES}
           AND p.product_line_id = ?
         LIMIT 1`
      ).bind(user.id, data.productLineId).first<{ ok: number }>()

      if (!eligibility) {
        return Response.json({ error: 'You must have a shipped order containing this product to leave a review' }, { status: 403 })
      }

      const now = nowIso()
      try {
        await env.DB.prepare(
          `INSERT INTO reviews (user_id, product_line_id, rating, body, locale, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(user.id, data.productLineId, data.rating, data.body ?? null, data.locale, now, now).run()
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (/UNIQUE constraint failed/i.test(msg)) {
          return Response.json({ error: 'You have already submitted a review for this product' }, { status: 409 })
        }
        throw err
      }

      const inserted = await env.DB.prepare(
        `SELECT id, rating, body, locale, status, created_at
         FROM reviews
         WHERE user_id = ? AND product_line_id = ?
         LIMIT 1`
      ).bind(user.id, data.productLineId).first<ReviewRow>()

      return Response.json({
        review: {
          id: inserted!.id,
          rating: inserted!.rating,
          body: inserted!.body,
          locale: inserted!.locale,
          status: inserted!.status,
          createdAt: inserted!.created_at,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.delete('/api/account/reviews/:id', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    const url = new URL(request.url)
    const idStr = url.pathname.split('/').pop() || ''
    const id = parseInt(idStr, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: 'Review not found' }, { status: 404 })
    }

    try {
      const result = await env.DB.prepare(
        `DELETE FROM reviews WHERE id = ? AND user_id = ?`
      ).bind(id, user.id).run()

      const changes = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0
      if (changes === 0) {
        return Response.json({ error: 'Review not found' }, { status: 404 })
      }
      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
