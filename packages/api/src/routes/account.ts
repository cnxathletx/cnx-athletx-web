import type { RouterType } from 'itty-router'
import type { Env, AccountOrderRow, LastAddressRow, CountRow, UserRow, ValidationError } from '../lib/types'
import { nowIso } from '../lib/utils'
import { validateProfileBody } from '../lib/validation'
import { getSessionUser } from '../middleware/auth'

export function registerAccountRoutes(router: RouterType) {
  router.get('/api/account/orders', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) {
      return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
    }

    const url = new URL(request.url)
    const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10)
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '10', 10)
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 10
    const offset = (page - 1) * limit

    try {
      const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS count FROM orders WHERE user_id = ?`)
        .bind(user.id)
        .first<CountRow>()
      const total = totalRow?.count ?? 0

      const { results } = await env.DB.prepare(
        `SELECT o.id, o.status, o.total_thb, o.created_at,
                COUNT(oi.id) AS items_count,
                s.carrier, s.tracking_number
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN shipments s ON s.order_id = o.id
         WHERE o.user_id = ?
         GROUP BY o.id, o.status, o.total_thb, o.created_at, s.carrier, s.tracking_number
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`
      )
        .bind(user.id, limit, offset)
        .all<AccountOrderRow>()

      return Response.json({
        orders: results.map((row) => ({
          id: row.id,
          status: row.status,
          total_thb: row.total_thb,
          items_count: row.items_count,
          created_at: row.created_at,
          shipment: row.carrier && row.tracking_number ? { carrier: row.carrier, tracking_number: row.tracking_number } : null,
        })),
        pagination: { page, limit, total },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.get('/api/account/last-address', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) {
      return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
    }

    try {
      const userRow = await env.DB.prepare(`SELECT saved_address_json FROM users WHERE id = ? LIMIT 1`)
        .bind(user.id)
        .first<{ saved_address_json: string | null }>()

      if (userRow?.saved_address_json) {
        try {
          const address = JSON.parse(userRow.saved_address_json)
          return Response.json({ address })
        } catch {
          // Fall through to order-based address
        }
      }

      const latest = await env.DB.prepare(
        `SELECT shipping_address_line1, shipping_address_line2, district, province, postal_code
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
        .bind(user.id)
        .first<LastAddressRow>()

      if (!latest) {
        return Response.json({ address: null })
      }

      return Response.json({
        address: {
          line1: latest.shipping_address_line1,
          line2: latest.shipping_address_line2,
          district: latest.district,
          province: latest.province,
          postal_code: latest.postal_code,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.get('/api/account/address', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) {
      return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
    }

    try {
      const row = await env.DB.prepare(`SELECT saved_address_json FROM users WHERE id = ? LIMIT 1`)
        .bind(user.id)
        .first<{ saved_address_json: string | null }>()

      if (!row?.saved_address_json) {
        return Response.json({ address: null })
      }

      return Response.json({ address: JSON.parse(row.saved_address_json) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.patch('/api/account/address', async (request: Request, env: Env) => {
    const user = await getSessionUser(request, env)
    if (!user) {
      return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Request body must be a JSON object' }, { status: 400 })
    }

    const b = body as Record<string, unknown>
    const errors: ValidationError[] = []

    if (typeof b.line1 !== 'string' || b.line1.trim().length < 5 || b.line1.trim().length > 200) {
      errors.push({ field: 'line1', message: 'Address line 1 must be between 5 and 200 characters' })
    }
    if (b.line2 !== undefined && b.line2 !== null && b.line2 !== '' && typeof b.line2 !== 'string') {
      errors.push({ field: 'line2', message: 'Address line 2 must be a string' })
    }
    if (typeof b.district !== 'string' || b.district.trim().length < 1) {
      errors.push({ field: 'district', message: 'District is required' })
    }
    if (typeof b.province !== 'string' || b.province.trim().length < 1) {
      errors.push({ field: 'province', message: 'Province is required' })
    }
    if (typeof b.postal_code !== 'string' || !/^\d{5}$/.test(b.postal_code)) {
      errors.push({ field: 'postal_code', message: 'Postal code must be exactly 5 digits' })
    }

    if (errors.length > 0) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const address = {
      line1: (b.line1 as string).trim(),
      line2: b.line2 ? (b.line2 as string).trim() : null,
      district: (b.district as string).trim(),
      province: (b.province as string).trim(),
      postal_code: b.postal_code as string,
    }

    try {
      await env.DB.prepare(`UPDATE users SET saved_address_json = ?, updated_at = ? WHERE id = ?`)
        .bind(JSON.stringify(address), nowIso(), user.id)
        .run()

      return Response.json({ success: true, address })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })

  router.patch('/api/account/profile', async (request: Request, env: Env) => {
    const sessionUser = await getSessionUser(request, env)
    if (!sessionUser) {
      return Response.json({ error: 'Authentication required. Please log in.' }, { status: 401 })
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

    const { errors, data } = validateProfileBody(body)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const nextName = data.name ?? sessionUser.name
    const nextPhone = data.phone ?? sessionUser.phone

    try {
      await env.DB.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?`)
        .bind(nextName, nextPhone, nowIso(), sessionUser.id)
        .run()

      const user = await env.DB.prepare(`SELECT id, email, name, phone FROM users WHERE id = ? LIMIT 1`)
        .bind(sessionUser.id)
        .first<UserRow>()

      if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 })
      }

      return Response.json({ user })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
