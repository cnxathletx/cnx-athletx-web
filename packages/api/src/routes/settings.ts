import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'
import { loadSettings } from '../services/settings'

export function registerSettingsRoutes(router: RouterType) {
  router.get('/api/settings', async (_request: Request, env: Env) => {
    try {
      const settings = await loadSettings(env)

      return Response.json({
        settings: {
          shipping_flat_rate: settings.shipping_flat_rate,
          shipping_free_threshold: settings.shipping_free_threshold,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  })
}
