import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'

const PUBLIC_KEYS = ['shipping_flat_rate', 'shipping_free_threshold'] as const

export function registerSettingsRoutes(router: RouterType) {
  router.get('/api/settings', async (_request: Request, env: Env) => {
    try {
      const placeholders = PUBLIC_KEYS.map(() => '?').join(',')
      const { results } = await env.DB
        .prepare(`SELECT key, value FROM site_settings WHERE key IN (${placeholders})`)
        .bind(...PUBLIC_KEYS)
        .all<{ key: string; value: string }>()

      const settings: Record<string, number> = {
        shipping_flat_rate: 10000,
        shipping_free_threshold: 0,
      }
      for (const row of results) {
        const parsed = parseInt(row.value, 10)
        if (!Number.isNaN(parsed)) settings[row.key] = parsed
      }

      return Response.json({ settings })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
