import type { RouterType } from 'itty-router'
import type { Env } from '../lib/types'

export function registerHealthRoutes(router: RouterType) {
  router.get('/api/health', () => {
    return Response.json({
      ok: true,
      service: 'cnx-athletx-api',
      timestamp: new Date().toISOString(),
    })
  })

  router.get('/api/health/db', async (_request: Request, env: Env) => {
    if (!env.DB) {
      return Response.json({ ok: false, error: 'D1 binding DB is not configured' }, { status: 500 })
    }

    const result = await env.DB.prepare('SELECT 1 AS ping').first<{ ping: number }>()

    return Response.json({
      ok: true,
      service: 'cnx-athletx-api',
      db: result?.ping === 1 ? 'connected' : 'unknown',
      timestamp: new Date().toISOString(),
    })
  })
}
