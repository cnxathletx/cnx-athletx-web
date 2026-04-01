import type { Env } from '../lib/types'

const LOCAL_ORIGINS = new Set(['http://localhost:5171', 'http://localhost:5173', 'http://127.0.0.1:5171', 'http://127.0.0.1:5173'])

function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')
}

function isAllowedOrigin(origin: string, request: Request, env: Env): boolean {
  if (LOCAL_ORIGINS.has(origin)) {
    return isLocalRequest(request)
  }
  if (env.ALLOWED_ORIGINS) {
    for (const o of env.ALLOWED_ORIGINS.split(',')) {
      if (o.trim() === origin) return true
    }
  }
  return false
}

export function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin')

  if (!origin || !isAllowedOrigin(origin, request, env)) {
    return { Vary: 'Origin' }
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }
}

export function corsify(response: Response, request: Request, env: Env): Response {
  const corsHeaders = getCorsHeaders(request, env)
  const newHeaders = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  })
}
