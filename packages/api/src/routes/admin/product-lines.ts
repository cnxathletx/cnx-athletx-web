import type { RouterType } from 'itty-router'
import type { Env, ProductLineRow, LabTestFileRow } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import {
  validateCreateProductLineBody,
  validateUpdateProductLineBody,
  validateAddLabTestFileBody,
  validateUpdateLabTestFileBody,
  validateReorderLabTestFilesBody,
} from '../../lib/validation'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

async function loadLabTestFiles(env: Env, productLineId: number) {
  const { results } = await env.DB.prepare(
    `SELECT id, product_line_id, url, r2_key, content_type, label, sort_order, size_bytes, created_at
     FROM product_line_lab_tests
     WHERE product_line_id = ?
     ORDER BY sort_order ASC, id ASC`
  )
    .bind(productLineId)
    .all<LabTestFileRow>()
  return results.map((r) => ({
    id: r.id,
    url: r.url,
    content_type: r.content_type,
    label: r.label,
    sort_order: r.sort_order,
    size_bytes: r.size_bytes,
  }))
}

export function registerAdminProductLineRoutes(router: RouterType) {
  router.get('/api/admin/product-lines', requireAdmin(async (_request, env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, slug, nutrition_json, ingredients, how_to_use, who_is_for, regulatory_info, translations_json, created_at, updated_at
         FROM product_lines
         ORDER BY id ASC`
      ).all<ProductLineRow>()

      const productLines = await Promise.all(
        results.map(async (pl) => ({
          ...pl,
          lab_test_files: await loadLabTestFiles(env, pl.id),
        }))
      )

      return Response.json({ product_lines: productLines })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.post('/api/admin/product-lines/:id/lab-test-files', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const productLineId = parseInt(parts[parts.length - 2] || '', 10)
    if (!Number.isInteger(productLineId) || productLineId < 1) {
      return Response.json({ error: 'Invalid product line ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateAddLabTestFileBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(`SELECT id FROM product_lines WHERE id = ? LIMIT 1`)
      .bind(productLineId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Product line not found' }, { status: 404 })
    }

    try {
      const maxRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM product_line_lab_tests WHERE product_line_id = ?`
      )
        .bind(productLineId)
        .first<{ max_order: number }>()
      const nextOrder = (maxRow?.max_order ?? -1) + 1
      const now = nowIso()

      const insert = await env.DB.prepare(
        `INSERT INTO product_line_lab_tests (product_line_id, url, r2_key, content_type, label, sort_order, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(productLineId, data.url, data.r2_key, data.content_type, data.label ?? '', nextOrder, data.size_bytes, now)
        .run()

      const fileId = Number(insert.meta.last_row_id)

      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'lab_test_file_add', NULL, ?, ?)`
      )
        .bind(
          adminUser.email,
          JSON.stringify({ product_line_id: productLineId, file_id: fileId, r2_key: data.r2_key }),
          now
        )
        .run()

      const lab_test_files = await loadLabTestFiles(env, productLineId)
      return Response.json({ success: true, lab_test_files }, { status: 201 })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/product-lines/:id/lab-test-files/reorder', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const productLineId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productLineId) || productLineId < 1) {
      return Response.json({ error: 'Invalid product line ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateReorderLabTestFilesBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const { results: existingRows } = await env.DB.prepare(
      `SELECT id FROM product_line_lab_tests WHERE product_line_id = ?`
    )
      .bind(productLineId)
      .all<{ id: number }>()

    const existingIds = new Set(existingRows.map((r) => r.id))
    if (existingIds.size !== data.file_ids.length) {
      return Response.json(
        { error: 'Validation failed', details: [{ field: 'file_ids', message: 'file_ids must include every lab test file for this product line' }] },
        { status: 400 }
      )
    }
    for (const id of data.file_ids) {
      if (!existingIds.has(id)) {
        return Response.json(
          { error: 'Validation failed', details: [{ field: 'file_ids', message: `file ${id} does not belong to this product line` }] },
          { status: 400 }
        )
      }
    }

    try {
      const now = nowIso()
      const statements = data.file_ids.map((id, index) =>
        env.DB.prepare(`UPDATE product_line_lab_tests SET sort_order = ? WHERE id = ? AND product_line_id = ?`).bind(index, id, productLineId)
      )
      statements.push(
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'lab_test_file_reorder', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_line_id: productLineId, file_ids: data.file_ids }), now)
      )
      await env.DB.batch(statements)

      const lab_test_files = await loadLabTestFiles(env, productLineId)
      return Response.json({ success: true, lab_test_files })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/product-lines/:id/lab-test-files/:fileId', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const fileId = parseInt(parts[parts.length - 1] || '', 10)
    const productLineId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productLineId) || productLineId < 1 || !Number.isInteger(fileId) || fileId < 1) {
      return Response.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateUpdateLabTestFileBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM product_line_lab_tests WHERE id = ? AND product_line_id = ? LIMIT 1`
    )
      .bind(fileId, productLineId)
      .first<{ id: number }>()
    if (!existing) {
      return Response.json({ error: 'Lab test file not found' }, { status: 404 })
    }

    try {
      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(`UPDATE product_line_lab_tests SET label = ? WHERE id = ?`).bind(data.label, fileId),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'lab_test_file_update', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_line_id: productLineId, file_id: fileId, label: data.label }), now),
      ])

      const lab_test_files = await loadLabTestFiles(env, productLineId)
      return Response.json({ success: true, lab_test_files })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.delete('/api/admin/product-lines/:id/lab-test-files/:fileId', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const fileId = parseInt(parts[parts.length - 1] || '', 10)
    const productLineId = parseInt(parts[parts.length - 3] || '', 10)
    if (!Number.isInteger(productLineId) || productLineId < 1 || !Number.isInteger(fileId) || fileId < 1) {
      return Response.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const existing = await env.DB.prepare(
      `SELECT id, r2_key FROM product_line_lab_tests WHERE id = ? AND product_line_id = ? LIMIT 1`
    )
      .bind(fileId, productLineId)
      .first<{ id: number; r2_key: string }>()
    if (!existing) {
      return Response.json({ error: 'Lab test file not found' }, { status: 404 })
    }

    try {
      const now = nowIso()
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM product_line_lab_tests WHERE id = ?`).bind(fileId),
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'lab_test_file_delete', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ product_line_id: productLineId, file_id: fileId, r2_key: existing.r2_key }), now),
      ])

      try {
        await env.PRODUCT_IMAGES.delete(existing.r2_key)
      } catch {
        // Best-effort R2 cleanup
      }

      const lab_test_files = await loadLabTestFiles(env, productLineId)
      return Response.json({ success: true, lab_test_files })
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
