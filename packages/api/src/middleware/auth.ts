import type { Env, SessionUser, AdminUser, SessionRow } from '../lib/types'
import { sha256Hex } from '../lib/utils'

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  const target = `${name}=`
  const part = cookieHeader
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(target))
  if (!part) return null
  const value = part.slice(target.length)
  return value.length > 0 ? value : null
}

function isCrossSite(request: Request): boolean {
  const reqUrl = new URL(request.url)
  const callerOrigin = request.headers.get('Origin')
  if (!callerOrigin) return false
  try {
    const callerHost = new URL(callerOrigin).hostname
    const apiHost = reqUrl.hostname
    const callerParts = callerHost.split('.')
    const apiParts = apiHost.split('.')
    const callerBase = callerParts.slice(-2).join('.')
    const apiBase = apiParts.slice(-2).join('.')
    return callerBase !== apiBase
  } catch {
    return false
  }
}

export function buildSessionCookie(request: Request, token: string): string {
  const sameSite = isCrossSite(request) ? 'None' : 'Lax'
  const secureFlag = sameSite === 'None' ? '; Secure' : ''
  return `session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=${sameSite}${secureFlag}`
}

export function clearSessionCookie(request: Request): string {
  const sameSite = isCrossSite(request) ? 'None' : 'Lax'
  const secureFlag = sameSite === 'None' ? '; Secure' : ''
  return `session=; HttpOnly; Path=/; Max-Age=0; SameSite=${sameSite}${secureFlag}`
}

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const sessionToken = parseCookie(request.headers.get('Cookie'), 'session')
  if (!sessionToken) return null

  try {
    const tokenHash = await sha256Hex(sessionToken)
    const row = await env.DB.prepare(
      `SELECT u.id AS user_id, u.email, u.name, u.phone
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND julianday(s.expires_at) > julianday('now')
       LIMIT 1`
    )
      .bind(tokenHash)
      .first<SessionRow>()

    if (!row) return null
    return { id: row.user_id, email: row.email, name: row.name, phone: row.phone }
  } catch {
    return null
  }
}

const DEFAULT_ADMIN_EMAILS = ['jdelaire@gmail.com', 'athletx.cnx@gmail.com']

function getAdminEmails(env: Env): string[] {
  if (env.ADMIN_EMAILS) {
    return env.ADMIN_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  }
  return DEFAULT_ADMIN_EMAILS
}

export type AdminHandler = (request: Request, env: Env, adminUser: AdminUser) => Promise<Response>

export function requireAdmin(handler: AdminHandler): (request: Request, env: Env) => Promise<Response> {
  return async (request: Request, env: Env) => {
    const adminUser = await getAdminUser(request, env)
    if (!adminUser) {
      return Response.json({ error: 'Admin authentication required' }, { status: 403 })
    }
    return handler(request, env, adminUser)
  }
}

export function parseJsonBody(request: Request): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  return request.json().then(
    (data) => ({ ok: true as const, data }),
    () => ({
      ok: false as const,
      response: Response.json(
        { error: 'Invalid JSON body', details: [{ field: 'body', message: 'Request body must be valid JSON' }] },
        { status: 400 }
      ),
    })
  )
}

async function getEmailFromCfAccessJwt(request: Request, env: Env): Promise<string | null> {
  if (!env.CF_ACCESS_TEAM || !env.CF_ACCESS_AUD) return null

  const jwt = parseCookie(request.headers.get('Cookie'), 'CF_Authorization')
  if (!jwt) return null

  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null

    // Fetch CF Access public keys
    const certsUrl = `https://${env.CF_ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`
    const certsRes = await fetch(certsUrl)
    if (!certsRes.ok) return null
    const { keys } = (await certsRes.json()) as { keys: JsonWebKey[] }

    // Decode JWT header to find key ID
    const header = JSON.parse(atob(parts[0])) as { kid: string; alg: string }
    const jwk = keys.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid)
    if (!jwk) return null

    // Import key and verify signature
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const sig = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data)
    if (!valid) return null

    // Verify claims
    const payload = JSON.parse(atob(parts[1])) as { aud?: string[]; email?: string; exp?: number }
    if (!payload.aud?.includes(env.CF_ACCESS_AUD)) return null
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload.email?.trim().toLowerCase() || null
  } catch {
    return null
  }
}

export async function getAdminUser(request: Request, env: Env): Promise<AdminUser | null> {
  const adminEmails = getAdminEmails(env)

  // 1. CF Access header (set when request goes through CF Access proxy)
  const cfAccessEmail = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim()?.toLowerCase()
  if (cfAccessEmail && adminEmails.includes(cfAccessEmail)) {
    return { email: cfAccessEmail }
  }

  // 2. CF Access JWT cookie (sent cross-subdomain from Pages → API)
  const jwtEmail = await getEmailFromCfAccessJwt(request, env)
  if (jwtEmail && adminEmails.includes(jwtEmail)) {
    return { email: jwtEmail }
  }

  // 3. Customer session — check if logged-in user is admin
  const sessionUser = await getSessionUser(request, env)
  if (sessionUser && adminEmails.includes(sessionUser.email.toLowerCase())) {
    return { email: sessionUser.email.toLowerCase() }
  }

  // 4. Local dev fallback
  const isLocal =
    new URL(request.url).hostname === 'localhost' ||
    new URL(request.url).hostname === '127.0.0.1'
  if (!isLocal) return null

  const localHeader = request.headers.get('X-Admin-Email')?.trim()?.toLowerCase()
  if (localHeader) {
    return { email: localHeader.toLowerCase() }
  }

  return { email: 'local-admin@cnxnature.com' }
}
