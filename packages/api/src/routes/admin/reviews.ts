import type { RouterType } from 'itty-router'
import type { Env, AdminReviewListRow, RejectReviewBody, CountRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'
import { parseAdminPagination } from '../../lib/validation'

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected'])

function reviewIdFromPath(request: Request, position: number): number | null {
  const url = new URL(request.url)
  const id = parseInt(url.pathname.split('/')[position] || '', 10)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function registerAdminReviewsRoutes(router: RouterType) {
  router.get('/api/admin/reviews', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const status = (url.searchParams.get('status') ?? '').trim()
    if (status && !ALLOWED_STATUS.has(status)) {
      return Response.json({ error: 'Invalid status filter' }, { status: 400 })
    }
    const { page, limit, offset } = parseAdminPagination(url)

    const whereParts: string[] = ['1=1']
    const binds: Array<string | number> = []
    if (status) { whereParts.push('r.status = ?'); binds.push(status) }
    const whereClause = whereParts.join(' AND ')

    try {
      const totalRow = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM reviews r WHERE ${whereClause}`
      ).bind(...binds).first<CountRow>()
      const total = totalRow?.count ?? 0

      const { results } = await env.DB.prepare(
        `SELECT r.id, r.user_id, u.email AS user_email,
                r.product_line_id, pl.name AS product_line_name,
                r.rating, r.body, r.locale, r.status, r.rejected_reason,
                r.created_at, r.moderated_at, r.moderated_by
         FROM reviews r
         JOIN users u ON u.id = r.user_id
         JOIN product_lines pl ON pl.id = r.product_line_id
         WHERE ${whereClause}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ? OFFSET ?`
      ).bind(...binds, limit, offset).all<AdminReviewListRow>()

      return Response.json({
        reviews: results,
        pagination: { page, limit, total },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/reviews/:id/approve', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })
      if (existing.status === 'approved') return Response.json({ success: true })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE reviews SET status='approved', rejected_reason=NULL, moderated_at=?, moderated_by=?, updated_at=? WHERE id = ?`
        ).bind(now, adminUser.email, now, id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.approve', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, from: existing.status, to: 'approved' }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/reviews/:id/reject', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response
    const data = (parsed.data ?? {}) as RejectReviewBody
    const reason = typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim().slice(0, 500) : null

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })
      if (existing.status === 'rejected') return Response.json({ success: true })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE reviews SET status='rejected', rejected_reason=?, moderated_at=?, moderated_by=?, updated_at=? WHERE id = ?`
        ).bind(reason, now, adminUser.email, now, id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.reject', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, from: existing.status, to: 'rejected', reason }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.delete('/api/admin/reviews/:id', requireAdmin(async (request, env, adminUser) => {
    const id = reviewIdFromPath(request, 4)
    if (id == null) return Response.json({ error: 'Review not found' }, { status: 404 })

    try {
      const existing = await env.DB.prepare(`SELECT status FROM reviews WHERE id = ? LIMIT 1`).bind(id).first<{ status: string }>()
      if (!existing) return Response.json({ error: 'Review not found' }, { status: 404 })

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM reviews WHERE id = ?`).bind(id),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'review.delete', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ review_id: id, prior_status: existing.status }), now),
      ])

      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
