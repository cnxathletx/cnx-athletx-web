import type { RouterType } from 'itty-router'
import type { Env, AdminProductRow, ProductImageRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import {
  validateCreateProductBody,
  validateUpdateProductBody,
  validateAddProductImageBody,
  validateReorderProductImagesBody,
} from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

async function loadProductScreenshots(env: Env, productId: number) {
  const { results } = await env.DB.prepare(
    `SELECT id, product_id, url, sort_order, created_at
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`
  )
    .bind(productId)
    .all<ProductImageRow>()
  return results.map((r) => ({ id: r.id, url: r.url, sort_order: r.sort_order }))
}

async function serializeAdminProduct(env: Env, row: AdminProductRow) {
  const screenshots = await loadProductScreenshots(env, row.id)
  return {
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
    translations_json: row.translations_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stock_count: row.stock_count,
    reserved_count: row.reserved_count,
    available_count: row.available_count,
    screenshots,
  }
}

export function registerAdminProductRoutes(router: RouterType) {
  router.get('/api/admin/products', requireAdmin(async (_request, env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.translations_json, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         ORDER BY p.id ASC`
      ).all<AdminProductRow>()

      const products = await Promise.all(results.map((row) => serializeAdminProduct(env, row)))
      return Response.json({ products })
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
        `INSERT INTO products (product_line_id, slug, name, description, price_thb, weight_g, image_url, active, translations_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(data.product_line_id, data.slug, data.name, data.description, data.price_thb, data.weight_g, data.image_url, data.active ? 1 : 0, data.translations_json, now, now)
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

      const row = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.translations_json, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ?
         LIMIT 1`
      )
        .bind(productId)
        .first<AdminProductRow>()

      if (!row) {
        return Response.json({ error: 'Product created but retrieval failed' }, { status: 500 })
      }

      return Response.json(
        { success: true, product: await serializeAdminProduct(env, row) },
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
    if (data.translations_json !== undefined) { setParts.push('translations_json = ?'); binds.push(data.translations_json) }

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

      const row = await env.DB.prepare(
        `SELECT p.id, p.product_line_id, p.slug, p.name, p.description, p.price_thb, p.weight_g, p.image_url, p.active, p.archived, p.translations_json, p.created_at, p.updated_at,
                i.stock_count, i.reserved_count, (i.stock_count - i.reserved_count) AS available_count
         FROM products p
         JOIN inventory i ON i.product_id = p.id
         WHERE p.id = ?
         LIMIT 1`
      )
        .bind(productId)
        .first<AdminProductRow>()

      if (!row) {
        return Response.json({ error: 'Product updated but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, product: await serializeAdminProduct(env, row) })
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

  router.post('/api/admin/products/:id/images', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const productId = parseInt(parts[parts.length - 2] || '', 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateAddProductImageBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const product = await env.DB.prepare(`SELECT id FROM products WHERE id = ? LIMIT 1`).bind(productId).first<{ id: number }>()
    if (!product) {
      return Response.json({ error: 'Product not found' }, { status: 404 })
    }

    try {
      const maxRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM product_images WHERE product_id = ?`
      )
        .bind(productId)
        .first<{ max_order: number }>()
      const nextOrder = (maxRow?.max_order ?? -1) + 1
      const now = nowIso()

      const insert = await env.DB.prepare(
        `INSERT INTO product_images (product_id, url, sort_order, created_at)
         VALUES (?, ?, ?, ?)`
      )
        .bind(productId, data.url, nextOrder, now)
        .run()

      const imageId = Number(insert.meta.last_row_id)

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_image_add', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_id: productId, image_id: imageId }), now)
        .run()

      const screenshots = await loadProductScreenshots(env, productId)
      return Response.json({ success: true, screenshots }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.delete('/api/admin/products/:id/images/:imageId', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const imageId = parseInt(parts[parts.length - 1] || '', 10)
    const productId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(imageId) || imageId < 1) {
      return Response.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM product_images WHERE id = ? AND product_id = ? LIMIT 1`
    )
      .bind(imageId, productId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Image not found' }, { status: 404 })
    }

    try {
      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM product_images WHERE id = ?`).bind(imageId),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'product_image_delete', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_id: productId, image_id: imageId }), now),
      ])

      const screenshots = await loadProductScreenshots(env, productId)
      return Response.json({ success: true, screenshots })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/products/:id/images/reorder', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const productId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productId) || productId < 1) {
      return Response.json({ error: 'Invalid product ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateReorderProductImagesBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const { results: existingRows } = await env.DB.prepare(
      `SELECT id FROM product_images WHERE product_id = ?`
    )
      .bind(productId)
      .all<{ id: number }>()

    const existingIds = new Set(existingRows.map((r) => r.id))
    if (existingIds.size !== data.image_ids.length) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'image_ids', message: 'image_ids must include every image for this product' }] },
        { status: 400 }
      )
    }
    for (const id of data.image_ids) {
      if (!existingIds.has(id)) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'image_ids', message: `image ${id} does not belong to this product` }] },
          { status: 400 }
        )
      }
    }

    try {
      const now = nowIso()
      const statements = data.image_ids.map((id, index) =>
        env.DB.prepare(`UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?`).bind(index, id, productId)
      )
      statements.push(
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'product_image_reorder', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_id: productId, image_ids: data.image_ids }), now)
      )
      await env.DB.batch(statements)

      const screenshots = await loadProductScreenshots(env, productId)
      return Response.json({ success: true, screenshots })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
