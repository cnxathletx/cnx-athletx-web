import type { Env } from '../lib/types'

export type LimitResult = { ok: true } | { ok: false; retryAfterSec: number }

export interface LimitOptions {
  scope: string
  key: string
  max: number
  windowSec: number
}

interface CountRow {
  count: number
}

export function getClientIp(request: Request): string {
  // CF-Connecting-IP is set by the Cloudflare edge and cannot be spoofed by clients.
  // Falls back to 'unknown' in local dev / tests where the header is absent.
  const ip = request.headers.get('CF-Connecting-IP')
  return ip && ip.trim().length > 0 ? ip.trim() : 'unknown'
}

async function bumpAndCheck(
  env: Env,
  scope: string,
  key: string,
  max: number,
  windowSec: number,
): Promise<LimitResult> {
  const nowSec = Math.floor(Date.now() / 1000)
  const bucketSec = Math.floor(nowSec / windowSec) * windowSec
  const windowStart = new Date(bucketSec * 1000).toISOString()
  const retryAfterSec = bucketSec + windowSec - nowSec

  try {
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (scope, key, window_start, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(scope, key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(scope, key, windowStart)
      .first<CountRow>()

    const count = row?.count ?? 1
    if (count > max) return { ok: false, retryAfterSec }
    return { ok: true }
  } catch {
    // Fail-open on storage errors so a transient D1 issue can't lock everyone out.
    return { ok: true }
  }
}

export function enforceLimit(env: Env, opts: LimitOptions): Promise<LimitResult> {
  return bumpAndCheck(env, opts.scope, opts.key, opts.max, opts.windowSec)
}

export function enforceGlobalLimit(
  env: Env,
  scope: string,
  max: number,
  windowSec: number,
): Promise<LimitResult> {
  return bumpAndCheck(env, `${scope}:global`, '_', max, windowSec)
}

export function rateLimitedResponse(retryAfterSec: number, message = 'Too many requests. Please try again later.'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, retryAfterSec)),
    },
  })
}
