import type { RouterType } from 'itty-router'
import type { Env, AdminDiscountCodeRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { validateCreateDiscountBody, validateUpdateDiscountBody } from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

function formatRow(row: AdminDiscountCodeRow) {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: row.value,
    min_order_thb: row.min_order_thb,
    max_uses: row.max_uses,
    used_count: row.used_count,
    active: !!row.active,
    archived: !!row.archived,
    expires_at: row.expires_at,
    created_at: row.created_at,
  }
}

export function registerAdminDiscountRoutes(router: RouterType) {
  router.get('/api/admin/discount-codes', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const includeArchived = url.searchParams.get('include_archived') === '1'

    try {
      const sql = includeArchived
        ? `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, archived, expires_at, created_at
           FROM discount_codes
           ORDER BY archived ASC, created_at DESC`
        : `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, archived, expires_at, created_at
           FROM discount_codes
           WHERE archived = 0
           ORDER BY created_at DESC`

      const { results } = await env.DB.prepare(sql).all<AdminDiscountCodeRow>()

      return Response.json({ discount_codes: results.map(formatRow) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/discount-codes', requireAdmin(async (request, env, adminUser) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateCreateDiscountBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const now = nowIso()

    try {
      const result = await env.DB.prepare(
        `INSERT INTO discount_codes (code, type, value, min_order_thb, max_uses, used_count, active, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
        .bind(data.code, data.type, data.value, data.min_order_thb, data.max_uses, data.active ? 1 : 0, data.expires_at, now)
        .run()

      const id = Number(result.meta.last_row_id)

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'discount_create', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ discount_id: id, code: data.code, type: data.type, value: data.value }), now)
        .run()

      const row = await env.DB.prepare(
        `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, archived, expires_at, created_at
         FROM discount_codes WHERE id = ? LIMIT 1`
      )
        .bind(id)
        .first<AdminDiscountCodeRow>()

      if (!row) {
        return Response.json({ error: 'Discount created but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, discount_code: formatRow(row) }, { status: 201 })
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'code', message: 'Discount code already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/discount-codes/:id', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const idRaw = url.pathname.split('/').pop() || ''
    const discountId = parseInt(idRaw, 10)
    if (!Number.isInteger(discountId) || discountId < 1) {
      return Response.json({ error: 'Invalid discount code ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpdateDiscountBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(`SELECT id FROM discount_codes WHERE id = ? LIMIT 1`)
      .bind(discountId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Discount code not found' }, { status: 404 })
    }

    const setParts: string[] = []
    const binds: Array<string | number | null> = []

    if (data.code !== undefined) { setParts.push('code = ?'); binds.push(data.code) }
    if (data.type !== undefined) { setParts.push('type = ?'); binds.push(data.type) }
    if (data.value !== undefined) { setParts.push('value = ?'); binds.push(data.value) }
    if (data.min_order_thb !== undefined) { setParts.push('min_order_thb = ?'); binds.push(data.min_order_thb) }
    if ('max_uses' in data) { setParts.push('max_uses = ?'); binds.push(data.max_uses ?? null) }
    if (data.active !== undefined) { setParts.push('active = ?'); binds.push(data.active ? 1 : 0) }
    if (data.archived !== undefined) { setParts.push('archived = ?'); binds.push(data.archived ? 1 : 0) }
    if ('expires_at' in data) { setParts.push('expires_at = ?'); binds.push(data.expires_at ?? null) }

    binds.push(discountId)

    const now = nowIso()

    try {
      await env.DB.prepare(`UPDATE discount_codes SET ${setParts.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run()

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'discount_update', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ discount_id: discountId, changes: data }), now)
        .run()

      const row = await env.DB.prepare(
        `SELECT id, code, type, value, min_order_thb, max_uses, used_count, active, archived, expires_at, created_at
         FROM discount_codes WHERE id = ? LIMIT 1`
      )
        .bind(discountId)
        .first<AdminDiscountCodeRow>()

      if (!row) {
        return Response.json({ error: 'Discount updated but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, discount_code: formatRow(row) })
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'code', message: 'Discount code already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
