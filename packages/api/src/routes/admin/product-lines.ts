import type { RouterType } from 'itty-router'
import type { Env, ProductLineRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { validateCreateProductLineBody, validateUpdateProductLineBody } from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

export function registerAdminProductLineRoutes(router: RouterType) {
  router.get('/api/admin/product-lines', requireAdmin(async (_request, env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, slug, nutrition_json, ingredients, how_to_use, who_is_for, regulatory_info, translations_json, created_at, updated_at
         FROM product_lines
         ORDER BY id ASC`
      ).all<ProductLineRow>()

      return Response.json({ product_lines: results })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/product-lines', requireAdmin(async (request, env, adminUser) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateCreateProductLineBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const now = nowIso()

    try {
      const result = await env.DB.prepare(
        `INSERT INTO product_lines (name, slug, nutrition_json, ingredients, how_to_use, who_is_for, regulatory_info, translations_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(data.name, data.slug, data.nutrition_json, data.ingredients, data.how_to_use, data.who_is_for, data.regulatory_info, data.translations_json, now, now)
        .run()

      const id = Number(result.meta.last_row_id)

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_line_create', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_line_id: id, name: data.name, slug: data.slug }), now)
        .run()

      const productLine = await env.DB.prepare(
        `SELECT id, name, slug, nutrition_json, ingredients, how_to_use, who_is_for, regulatory_info, translations_json, created_at, updated_at
         FROM product_lines WHERE id = ? LIMIT 1`
      )
        .bind(id)
        .first<ProductLineRow>()

      if (!productLine) {
        return Response.json({ error: 'Product line created but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, product_line: productLine }, { status: 201 })
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

  router.patch('/api/admin/product-lines/:id', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const idRaw = url.pathname.split('/').pop() || ''
    const productLineId = parseInt(idRaw, 10)
    if (!Number.isInteger(productLineId) || productLineId < 1) {
      return Response.json({ error: 'Invalid product line ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpdateProductLineBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(`SELECT id FROM product_lines WHERE id = ? LIMIT 1`).bind(productLineId).first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Product line not found' }, { status: 404 })
    }

    const setParts: string[] = []
    const binds: Array<string | number> = []

    if (data.name !== undefined) { setParts.push('name = ?'); binds.push(data.name) }
    if (data.slug !== undefined) { setParts.push('slug = ?'); binds.push(data.slug) }
    if (data.nutrition_json !== undefined) { setParts.push('nutrition_json = ?'); binds.push(data.nutrition_json) }
    if (data.ingredients !== undefined) { setParts.push('ingredients = ?'); binds.push(data.ingredients) }
    if (data.how_to_use !== undefined) { setParts.push('how_to_use = ?'); binds.push(data.how_to_use) }
    if (data.who_is_for !== undefined) { setParts.push('who_is_for = ?'); binds.push(data.who_is_for) }
    if (data.regulatory_info !== undefined) { setParts.push('regulatory_info = ?'); binds.push(data.regulatory_info) }
    if (data.translations_json !== undefined) { setParts.push('translations_json = ?'); binds.push(data.translations_json) }

    const now = nowIso()
    setParts.push('updated_at = ?')
    binds.push(now)
    binds.push(productLineId)

    try {
      await env.DB.prepare(`UPDATE product_lines SET ${setParts.join(', ')} WHERE id = ?`)
        .bind(...binds)
        .run()

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_line_update', NULL, ?, ?)`
      )
        .bind(adminUser.email, JSON.stringify({ product_line_id: productLineId, changes: data }), now)
        .run()

      const productLine = await env.DB.prepare(
        `SELECT id, name, slug, nutrition_json, ingredients, how_to_use, who_is_for, regulatory_info, translations_json, created_at, updated_at
         FROM product_lines WHERE id = ? LIMIT 1`
      )
        .bind(productLineId)
        .first<ProductLineRow>()

      if (!productLine) {
        return Response.json({ error: 'Product line updated but retrieval failed' }, { status: 500 })
      }

      return Response.json({ success: true, product_line: productLine })
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
