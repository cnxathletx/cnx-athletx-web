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

export async function getAdminUser(request: Request, env: Env): Promise<AdminUser | null> {
  const adminEmails = getAdminEmails(env)

  // 1. CF Access header
  const cfAccessEmail = request.headers.get('Cf-Access-Authenticated-User-Email')?.trim()?.toLowerCase()
  if (cfAccessEmail && adminEmails.includes(cfAccessEmail)) {
    return { email: cfAccessEmail }
  }

  // 2. Customer session — check if logged-in user is admin
  const sessionUser = await getSessionUser(request, env)
  if (sessionUser && adminEmails.includes(sessionUser.email.toLowerCase())) {
    return { email: sessionUser.email.toLowerCase() }
  }

  // 3. Local dev fallback
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
