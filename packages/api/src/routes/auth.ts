import type { RouterType } from 'itty-router'
import type { Env, CountRow, UserRow, MagicLinkRow } from '../lib/types'
import { nowIso, randomHex, sha256Hex } from '../lib/utils'
import { validateRequestLinkBody, validateVerifyBody } from '../lib/validation'
import { getSessionUser, buildSessionCookie, clearSessionCookie, parseCookie, parseJsonBody, SESSION_MAX_AGE_SECONDS } from '../middleware/auth'
import { getClientIp, rateLimitedResponse } from '../middleware/rate-limit'
import { enforcePolicyGlobalLimit, enforcePolicyLimit } from '../middleware/rate-limit-registry'
import { sendMagicLinkEmail } from '../services/email'
import { generateULID } from '../lib/ulid'
import { parseAcceptLanguage } from '../lib/locale'

const MAGIC_LINK_EXPIRY_MINUTES = 15
const MAGIC_LINK_RATE_LIMIT_MAX = 3

export function registerAuthRoutes(router: RouterType) {
  router.post('/api/auth/request-link', async (request: Request, env: Env) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateRequestLinkBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const now = nowIso()

    try {
      const ip = getClientIp(request)
      const ipLimit = await enforcePolicyLimit(env, 'magic_link', ip)
      if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec)

      const globalLimit = await enforcePolicyGlobalLimit(env, 'magic_link')
      if (!globalLimit.ok) return rateLimitedResponse(globalLimit.retryAfterSec)

      const rateLimit = await env.DB.prepare(
        `SELECT COUNT(*) AS count
         FROM magic_links
         WHERE email = ? AND julianday(created_at) > julianday('now', '-15 minutes')`
      )
        .bind(data.email)
        .first<CountRow>()

      if ((rateLimit?.count ?? 0) >= MAGIC_LINK_RATE_LIMIT_MAX) {
        return Response.json({ error: 'Too many login attempts. Please wait 15 minutes.' }, { status: 429 })
      }

      const token = randomHex(32)
      const tokenHash = await sha256Hex(token)
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000).toISOString()

      await env.DB.batch([
        env.DB.prepare(`UPDATE magic_links SET used_at = ? WHERE email = ? AND used_at IS NULL`).bind(now, data.email),
        env.DB.prepare(
          `INSERT INTO magic_links (email, token_hash, expires_at)
           VALUES (?, ?, ?)`
        ).bind(data.email, tokenHash, expiresAt),
      ])

      const callerOrigin = request.headers.get('Origin')
      const fallbackOrigin = new URL(request.url).origin
      const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : []
      const appOrigin = callerOrigin && allowedOrigins.includes(callerOrigin) ? callerOrigin : fallbackOrigin
      const magicLinkUrl = `${appOrigin}/auth/verify?token=${token}`

      const locale = parseAcceptLanguage(request.headers.get('Accept-Language'))
      await sendMagicLinkEmail(env, data.email, magicLinkUrl, MAGIC_LINK_EXPIRY_MINUTES, locale)

      const responseBody: { success: boolean; message: string; dev_magic_link?: string } = {
        success: true,
        message: 'If an account exists or can be created with this email, you will receive a login link.',
      }

      if (!env.RESEND_API_KEY && /localhost|127\.0\.0\.1/.test(appOrigin)) {
        responseBody.dev_magic_link = magicLinkUrl
      }

      return Response.json(responseBody)
    } catch {
      return Response.json({ error: 'Unable to send login link right now. Please try again.' }, { status: 500 })
    }
  })

  router.post('/api/auth/verify', async (request: Request, env: Env) => {
    const parsed = await parseJsonBody(request)
    if (!parsed.ok) return parsed.response

    const { errors, data } = validateVerifyBody(parsed.data)
    if (errors.length > 0 || !data) {
      return Response.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const now = nowIso()

    try {
      const tokenHash = await sha256Hex(data.token)
      const magicLink = await env.DB.prepare(
        `SELECT id, email
         FROM magic_links
         WHERE token_hash = ? AND used_at IS NULL AND julianday(expires_at) > julianday('now')
         LIMIT 1`
      )
        .bind(tokenHash)
        .first<MagicLinkRow>()

      if (!magicLink) {
        return Response.json({ error: 'Login link is invalid or expired. Please request a new one.' }, { status: 401 })
      }

      const consumeResult = await env.DB.prepare(
        `UPDATE magic_links
         SET used_at = ?
         WHERE id = ? AND used_at IS NULL`
      )
        .bind(now, magicLink.id)
        .run()

      if ((consumeResult.meta.changes ?? 0) !== 1) {
        return Response.json({ error: 'Login link is invalid or expired. Please request a new one.' }, { status: 401 })
      }

      const newUserId = generateULID()
      await env.DB.prepare(
        `INSERT INTO users (id, email, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO NOTHING`
      )
        .bind(newUserId, magicLink.email, now, now)
        .run()

      const user = await env.DB.prepare(`SELECT id, email, name, phone FROM users WHERE email = ? LIMIT 1`)
        .bind(magicLink.email)
        .first<UserRow>()

      if (!user) {
        return Response.json({ error: 'Failed to create user session' }, { status: 500 })
      }

      await env.DB.prepare(`UPDATE orders SET user_id = ? WHERE customer_email = ? AND user_id IS NULL`)
        .bind(user.id, magicLink.email)
        .run()

      const sessionToken = randomHex(32)
      const sessionTokenHash = await sha256Hex(sessionToken)
      const sessionExpiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
      await env.DB.prepare(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
        .bind(sessionTokenHash, user.id, sessionExpiresAt, now)
        .run()

      return Response.json(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
          },
        },
        {
          headers: {
            'Set-Cookie': buildSessionCookie(request, sessionToken),
          },
        }
      )
    } catch {
      return Response.json({ error: 'Unable to verify login link' }, { status: 500 })
    }
  })

  router.post('/api/auth/logout', async (request: Request, env: Env) => {
    const sessionToken = parseCookie(request.headers.get('Cookie'), 'session')

    if (sessionToken) {
      try {
        const tokenHash = await sha256Hex(sessionToken)
        await env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(tokenHash).run()
      } catch {
        // Best-effort session cleanup.
      }
    }

    return Response.json(
      { success: true },
      {
        headers: {
          'Set-Cookie': clearSessionCookie(request),
        },
      }
    )
  })

  router.get('/api/auth/me', async (request: Request, env: Env) => {
    try {
      const user = await getSessionUser(request, env)
      return Response.json({ user })
    } catch {
      return Response.json({ user: null })
    }
  })
}
