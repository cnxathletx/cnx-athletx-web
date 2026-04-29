import type { RouterType } from 'itty-router'
import type { Env } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'
import { loadSettingsMap, validateSettingUpdate } from '../../services/settings'

export function registerAdminSettingsRoutes(router: RouterType) {
  router.get('/api/admin/settings', requireAdmin(async (_request, env) => {
    try {
      return Response.json({ settings: await loadSettingsMap(env) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

  router.patch('/api/admin/settings', requireAdmin(async (request, env, adminUser) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const body = parsed.data as Record<string, unknown>
    if (!body || typeof body !== 'object' || !body.settings || typeof body.settings !== 'object') {
      return Response.json({ error: 'settings object is required' }, { status: 400 })
    }

    const updates = body.settings as Record<string, unknown>
    const entries: [string, string][] = []

    for (const [key, value] of Object.entries(updates)) {
      if (typeof value !== 'string') {
        return Response.json({ error: `Value for ${key} must be a string` }, { status: 400 })
      }
      const valErr = validateSettingUpdate(key, value)
      if (valErr) {
        return Response.json({ error: valErr }, { status: 400 })
      }
      entries.push([key, value])
    }

    if (entries.length === 0) {
      return Response.json({ error: 'No settings provided' }, { status: 400 })
    }

    const now = nowIso()

    try {
      const statements = entries.map(([key, value]) =>
        env.DB.prepare(
          `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
        ).bind(key, value, now)
      )

      statements.push(
        env.DB.prepare(
          `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
           VALUES (?, 'settings_update', NULL, ?, ?)`
        ).bind(adminUser.email, JSON.stringify({ keys: entries.map(([k]) => k) }), now)
      )

      await env.DB.batch(statements)

      return Response.json({ success: true, settings: await loadSettingsMap(env) })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
