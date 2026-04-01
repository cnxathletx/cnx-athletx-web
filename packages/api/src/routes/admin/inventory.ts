import type { RouterType } from 'itty-router'
import type { Env, AdminInventoryRow, AdminInventorySingleRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { validateInventoryUpdateBody } from '../../lib/validation'
import { getAdminUser } from '../../middleware/auth'

export function registerAdminInventoryRoutes(router: RouterType) {
  router.get('/api/admin/inventory', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
    if (!adminUser) {
      return Response.json({ error: 'Admin authentication required' }, { status: 403 })
    }

    try {
      const { results } = await env.DB.prepare(
        `SELECT p.id AS product_id, p.slug, p.name, p.price_thb, p.active,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         ORDER BY p.id ASC`
      ).all<AdminInventoryRow>()

      return Response.json({
        inventory: results.map((row) => ({
          product_id: row.product_id,
          slug: row.slug,
          name: row.name,
          price_thb: row.price_thb,
          active: !!row.active,
          stock_count: row.stock_count,
          reserved_count: row.reserved_count,
          available_count: row.available_count,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.patch('/api/admin/inventory/:productId', async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
    if (!adminUser) {
      return Response.json({ error: 'Admin authentication required' }, { status: 403 })
    }

    const url = new URL(request.url)
    const productIdRaw = url.pathname.split('/').pop() || ''
    const productId = parseInt(productIdRaw, 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid productId' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json(
        { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
        { status: 400 }
      )
    }

    const { errors, data } = validateInventoryUpdateBody(body)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    try {
      const product = await env.DB.prepare(`SELECT id, name FROM products WHERE id = ? LIMIT 1`)
        .bind(productId)
        .first<{ id: number; name: string }>()
      if (!product) {
        return Response.json({ error: 'Product not found' }, { status: 404 })
      }

      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE inventory
           SET stock_count = MAX(stock_count + ?, 0),
               updated_at = ?
           WHERE product_id = ?`
        ).bind(data.adjustment, now, productId),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'inventory_adjust', NULL, ?, ?)`
        ).bind(
          adminUser.email,
          JSON.stringify({ product_id: productId, product_name: product.name, adjustment: data.adjustment, notes: data.notes ?? null }),
          now
        ),
      ])

      const inventory = await env.DB.prepare(
        `SELECT stock_count, reserved_count
         FROM inventory
         WHERE product_id = ? LIMIT 1`
      )
        .bind(productId)
        .first<AdminInventorySingleRow>()

      if (!inventory) {
        return Response.json({ error: 'Inventory row not found' }, { status: 404 })
      }

      return Response.json({
        success: true,
        inventory: {
          product_id: productId,
          stock_count: inventory.stock_count,
          reserved_count: inventory.reserved_count,
          available_count: inventory.stock_count - inventory.reserved_count,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
