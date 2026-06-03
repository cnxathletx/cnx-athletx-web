import type { RouterType } from 'itty-router'
import type { AdminWaitlistRow } from '../../lib/types'
import { requireAdmin } from '../../middleware/auth'

type WaitlistStatus = 'active' | 'notified' | 'all'

function parseStatus(raw: string | null): WaitlistStatus | null {
  if (!raw) return 'active'
  if (raw === 'active' || raw === 'notified' || raw === 'all') return raw
  return null
}

export function registerAdminWaitlistRoutes(router: RouterType) {
  router.get('/api/admin/waitlist', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const status = parseStatus(url.searchParams.get('status'))
    if (!status) {
      return Response.json({ error: 'Invalid status' }, { status: 400 })
    }

    const where = status === 'active'
      ? 'AND w.notified_at IS NULL'
      : status === 'notified'
        ? 'AND w.notified_at IS NOT NULL'
        : ''
    const order = status === 'notified'
      ? 'w.notified_at DESC, w.created_at DESC'
      : 'w.created_at DESC'

    try {
      const { results } = await env.DB.prepare(
        `SELECT w.id, w.product_id, p.slug AS product_slug, p.name AS product_name,
                w.email, w.locale, w.marketing_consent, w.notified_at, w.created_at, w.updated_at
         FROM product_waitlist_signups w
         JOIN products p ON p.id = w.product_id
         WHERE p.archived = 0 ${where}
         ORDER BY ${order}`
      ).all<AdminWaitlistRow>()

      return Response.json({
        waitlist: results.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          product_slug: row.product_slug,
          product_name: row.product_name,
          email: row.email,
          locale: row.locale,
          marketing_consent: row.marketing_consent === 1,
          notified_at: row.notified_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
