import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'
import { listEnabledProviders } from '../services/payments/registry'
import { loadSettingsMap } from '../services/settings'

export function registerPaymentMethodsRoutes(router: RouterType) {
  router.get('/api/payment-methods', async (_request: Request, env: Env) => {
    let settingsMap
    try {
      settingsMap = await loadSettingsMap(env)
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
