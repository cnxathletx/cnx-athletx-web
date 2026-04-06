import type { RouterType } from 'itty-router'
import type { Env, AdminProductRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { validateCreateProductBody, validateUpdateProductBody } from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

export function registerAdminProductRoutes(router: RouterType) {
  router.get('/api/admin/products', requireAdmin(async (_request, env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         ORDER BY p.id ASC`
      ).all<AdminProductRow>()

      return Response.json({
        products: results.map((row) => ({
          id: row.id,
          product_line_id: row.product_line_id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          price_thb: row.price_thb,
          weight_g: row.weight_g,
          image_url: row.image_url,
          active: !!row.active,
          archived: !!row.archived,
          created_at: row.created_at,
          updated_at: row.updated_at,
          stock_count: row.stock_count,
          reserved_count: row.reserved_count,
          available_count: row.available_count,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/products', requireAdmin(async (request, env, adminUser) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateCreateProductBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const now = nowIso()

    try {
      const insertProduct = await env.DB.prepare(
        `INSERT INTO products (product_line_id, slug, name, description, price_thb, weight_g, image_url, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(data.product_line_id, data.slug, data.name, data.description, data.price_thb, data.weight_g, data.image_url, data.active ? 1 : 0, now, now)
        .run()

      const productId = Number(insertProduct.meta.last_row_id)
      if (!Number.isInteger(productId) || productId < 1) {
        return Response.json({ error: 'Failed to create product' }, { status: 500 })
      }

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO inventory (product_id, stock_count, reserved_count, updated_at)
           VALUES (?, ?, 0, ?)`
        ).bind(productId, data.stock_count, now),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'product_create', NULL, ?, ?)`
        ).bind(
          adminUser.email,
          JSON.stringify({
            product_id: productId,
            slug: data.slug,
            name: data.name,
            price_thb: data.price_thb,
            weight_g: data.weight_g,
            active: data.active,
            stock_count: data.stock_count,
          }),
          now
        ),
      ])

      const product = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ?
         LIMIT 1`
      )
        .bind(productId)
        .first<AdminProductRow>()

      if (!product) {
        return Response.json({ error: 'Product created but retrieval failed' }, { status: 500 })
      }

      return Response.json(
        {
          success: true,
          product: {
            id: product.id,
            product_line_id: product.product_line_id,
            slug: product.slug,
            name: product.name,
            description: product.description,
            price_thb: product.price_thb,
            weight_g: product.weight_g,
            image_url: product.image_url,
            active: !!product.active,
            archived: !!product.archived,
            created_at: product.created_at,
            updated_at: product.updated_at,
            stock_count: product.stock_count,
            reserved_count: product.reserved_count,
            available_count: product.available_count,
          },
        },
        { status: 201 }
      )
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'slug', message: 'slug already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/products/:id', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const idRaw = url.pathname.split('/').pop() || ''
    const productId = parseInt(idRaw, 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpdateProductBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(`SELECT id FROM products WHERE id = ? LIMIT 1`).bind(productId).first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    const setParts: string[] = []
    const binds: Array<string | number | null> = []

    if (data.slug !== undefined) { setParts.push('slug = ?'); binds.push(data.slug) }
    if (data.name !== undefined) { setParts.push('name = ?'); binds.push(data.name) }
    if (data.description !== undefined) { setParts.push('description = ?'); binds.push(data.description) }
    if (data.price_thb !== undefined) { setParts.push('price_thb = ?'); binds.push(data.price_thb) }
    if (data.weight_g !== undefined) { setParts.push('weight_g = ?'); binds.push(data.weight_g) }
    if (data.image_url !== undefined) { setParts.push('image_url = ?'); binds.push(data.image_url) }
    if (data.active !== undefined) { setParts.push('active = ?'); binds.push(data.active ? 1 : 0) }
    if (data.archived !== undefined) { setParts.push('archived = ?'); binds.push(data.archived ? 1 : 0) }
    if (data.product_line_id !== undefined) { setParts.push('product_line_id = ?'); binds.push(data.product_line_id) }

    const now = nowIso()
    setParts.push('updated_at = ?')
    binds.push(now)
    binds.push(productId)

    try {
      await env.DB.prepare(`UPDATE products SET ${setParts.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run()

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_update', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_id: productId, changes: data }), now)
        .run()

      const product = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ?
         LIMIT 1`
      )
        .bind(productId)
        .first<AdminProductRow>()

      if (!product) {
        return Response.json({ error: 'Product updated but retrieval failed' }, { status: 500 })
      }

      return Response.json({
        success: true,
        product: {
          id: product.id,
          product_line_id: product.product_line_id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          price_thb: product.price_thb,
          weight_g: product.weight_g,
          image_url: product.image_url,
          active: !!product.active,
          created_at: product.created_at,
          updated_at: product.updated_at,
          stock_count: product.stock_count,
          reserved_count: product.reserved_count,
          available_count: product.available_count,
        },
      })
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'slug', message: 'slug already exists' }] },
          { status: 409 }
        )
      }
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
