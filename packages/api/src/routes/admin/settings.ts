import type { RouterType } from 'itty-router'
import type { Env } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { requireAdmin, parseJsonBody } from '../../middleware/auth'

interface SettingRow {
  key: string
  value: string
}

const ALLOWED_KEYS = new Set([
  'shipping_flat_rate',
  'shipping_free_threshold',
  'promptpay_number',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'payment_deadline_hours',
])

export function registerAdminSettingsRoutes(router: RouterType) {
  router.get('/api/admin/settings', requireAdmin(async (_request, env) => {
    try {
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings ORDER BY key ASC`
      ).all<SettingRow>()

      const settings: Record<string, string> = {}
      for (const row of results) {
        settings[row.key] = row.value
      }

      return Response.json({ settings })
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
      if (!ALLOWED_KEYS.has(key)) {
        return Response.json({ error: `Unknown setting: ${key}` }, { status: 400 })
      }
      if (typeof value !== 'string') {
        return Response.json({ error: `Value for ${key} must be a string` }, { status: 400 })
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

      // Return fresh settings
      const { results } = await env.DB.prepare(
        `SELECT key, value FROM site_settings ORDER BY key ASC`
      ).all<SettingRow>()

      const settings: Record<string, string> = {}
      for (const row of results) {
        settings[row.key] = row.value
      }

      return Response.json({ success: true, settings })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
