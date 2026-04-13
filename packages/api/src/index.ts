import { Router } from 'itty-router'
import type { Env } from './lib/types'
import { getCorsHeaders, corsify } from './middleware/cors'
import { registerHealthRoutes } from './routes/health'
import { registerProductRoutes } from './routes/products'
import { registerAuthRoutes } from './routes/auth'
import { registerAccountRoutes } from './routes/account'
import { registerCheckoutRoutes } from './routes/checkout'
import { registerOrderRoutes } from './routes/orders'
import { registerChatRoutes } from './routes/chat'
import { registerAdminRoutes } from './routes/admin'

const router = Router()

// Preflight
router.options('*', (request: Request, env: Env) => new Response(null, { status: 204, headers: getCorsHeaders(request, env) }))

// Register all routes
registerHealthRoutes(router)
registerProductRoutes(router)
registerAuthRoutes(router)
registerAccountRoutes(router)
registerCheckoutRoutes(router)
registerOrderRoutes(router)
registerChatRoutes(router)
registerAdminRoutes(router)

// 404
router.all('*', () => new Response('Not Found', { status: 404 }))

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const instance = router as unknown as {
      fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
      handle?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
    }

    let response: Response

    if (instance.fetch) {
      response = await instance.fetch(request, env, ctx)
    } else if (instance.handle) {
      response = await instance.handle(request, env, ctx)
    } else {
      response = new Response('Router method is unavailable', { status: 500 })
    }

    return corsify(response, request, env)
  },
}
