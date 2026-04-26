import type { RouterType } from 'itty-router'
import type { Env, SiteSettingsMap } from '../lib/types'
import { listEnabledProviders } from '../services/payments/registry'

export function registerPaymentMethodsRoutes(router: RouterType) {
  router.get('/api/payment-methods', async (_request: Request, env: Env) => {
    const settingsMap: SiteSettingsMap = {}
    try {
      const { results } = await env.DB.prepare(`SELECT key, value FROM site_settings`).all<{
        key: string
        value: string
      }>()
      for (const row of results) {
        settingsMap[row.key] = row.value
      }
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    const methods = listEnabledProviders(settingsMap).map((p) => ({
      id: p.id,
      name: p.displayName,
    }))

    return Response.json({ methods }, { headers: { 'Cache-Control': 'public, max-age=60' } })
  })
}
