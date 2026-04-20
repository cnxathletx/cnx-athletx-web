import type { RouterType } from 'itty-router'
import type { AdminPriceTierRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { validateUpsertPriceTierBody } from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

function formatTier(row: AdminPriceTierRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    min_quantity: row.min_quantity,
    unit_price_thb: row.unit_price_thb,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function registerAdminPriceTierRoutes(router: RouterType) {
  // GET /api/admin/products/:id/price-tiers
  router.get('/api/admin/products/:id/price-tiers', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    // path: /api/admin/products/:id/price-tiers
    const parts = url.pathname.split('/')
    const productId = parseInt(parts[parts.length - 2] || '', 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    try {
      const { results } = await env.DB.prepare(
        `SELECT id, product_id, min_quantity, unit_price_thb, created_at, updated_at
         FROM price_tiers WHERE product_id = ?
         ORDER BY min_quantity ASC`
      )
        .bind(productId)
        .all<AdminPriceTierRow>()

      return Response.json({ price_tiers: results.map(formatTier) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  // POST /api/admin/products/:id/price-tiers
  router.post('/api/admin/products/:id/price-tiers', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const productId = parseInt(parts[parts.length - 2] || '', 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpsertPriceTierBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const product = await env.DB.prepare(`SELECT id FROM products WHERE id = ? LIMIT 1`).bind(productId).first<{ id: number }>()
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const now = nowIso()

    try {
      const insert = await env.DB.prepare(
        `INSERT INTO price_tiers (product_id, min_quantity, unit_price_thb, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
        .bind(productId, data.min_quantity, data.unit_price_thb, now, now)
        .run()

      const tierId = Number(insert.meta.last_row_id)

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'price_tier_create', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_id: productId, tier_id: tierId, min_quantity: data.min_quantity, unit_price_thb: data.unit_price_thb }), now)
        .run()

      const row = await env.DB.prepare(
        `SELECT id, product_id, min_quantity, unit_price_thb, created_at, updated_at
         FROM price_tiers WHERE id = ? LIMIT 1`
      )
        .bind(tierId)
        .first<AdminPriceTierRow>()

      if (!row) {
        return Response.json({ error: 'Tier created but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, price_tier: formatTier(row) }, { status: 201 })
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'min_quantity', message: 'A tier for this quantity already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  // PATCH /api/admin/products/:id/price-tiers/:tierId
  router.patch('/api/admin/products/:id/price-tiers/:tierId', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const tierId = parseInt(parts[parts.length - 1] || '', 10)
    const productId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(tierId) || tierId < 1) {
      return Response.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpsertPriceTierBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM price_tiers WHERE id = ? AND product_id = ? LIMIT 1`
    )
      .bind(tierId, productId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Price tier not found' }, { status: 404 })
    }

    const now = nowIso()

    try {
      await env.DB.prepare(
        `UPDATE price_tiers SET min_quantity = ?, unit_price_thb = ?, updated_at = ? WHERE id = ?`
      )
        .bind(data.min_quantity, data.unit_price_thb, now, tierId)
        .run()

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'price_tier_update', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_id: productId, tier_id: tierId, min_quantity: data.min_quantity, unit_price_thb: data.unit_price_thb }), now)
        .run()

      const row = await env.DB.prepare(
        `SELECT id, product_id, min_quantity, unit_price_thb, created_at, updated_at
         FROM price_tiers WHERE id = ? LIMIT 1`
      )
        .bind(tierId)
        .first<AdminPriceTierRow>()

      if (!row) {
        return Response.json({ error: 'Tier updated but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, price_tier: formatTier(row) })
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'min_quantity', message: 'A tier for this quantity already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  // DELETE /api/admin/products/:id/price-tiers/:tierId
  router.delete('/api/admin/products/:id/price-tiers/:tierId', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const tierId = parseInt(parts[parts.length - 1] || '', 10)
    const productId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(tierId) || tierId < 1) {
      return Response.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM price_tiers WHERE id = ? AND product_id = ? LIMIT 1`
    )
      .bind(tierId, productId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Price tier not found' }, { status: 404 })
    }

    const now = nowIso()
    try {
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM price_tiers WHERE id = ?`).bind(tierId),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'price_tier_delete', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_id: productId, tier_id: tierId }), now),
      ])
      return Response.json({ success: true })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
