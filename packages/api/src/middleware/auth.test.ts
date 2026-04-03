import { describe, it, expect, vi } from 'vitest'
import {
  parseCookie,
  buildSessionCookie,
  clearSessionCookie,
  parseJsonBody,
  requireAdmin,
  getAdminUser,
  SESSION_MAX_AGE_SECONDS,
} from './auth'
import type { Env } from '../lib/types'

// --- Helpers ---

function makeRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

function makeSameSiteRequest(headers: Record<string, string> = {}): Request {
  return makeRequest('https://api.cnxnature.com/api/test', {
    Origin: 'https://www.cnxnature.com',
    ...headers,
  })
}

function makeCrossSiteRequest(headers: Record<string, string> = {}): Request {
  return makeRequest('https://api.cnxnature.com/api/test', {
    Origin: 'https://evil.com',
    ...headers,
  })
}

function makeLocalRequest(headers: Record<string, string> = {}): Request {
  return makeRequest('http://localhost:8787/api/test', headers)
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ...overrides,
  }
}

// --- parseCookie ---

describe('parseCookie', () => {
  it('returns null for null header', () => {
    expect(parseCookie(null, 'session')).toBeNull()
  })

  it('returns null when cookie name not found', () => {
    expect(parseCookie('other=abc', 'session')).toBeNull()
  })

  it('extracts a cookie value', () => {
    expect(parseCookie('session=abc123', 'session')).toBe('abc123')
  })

  it('extracts from multiple cookies', () => {
    expect(parseCookie('foo=bar; session=tok123; baz=qux', 'session')).toBe('tok123')
  })

  it('trims whitespace around cookies', () => {
    expect(parseCookie('  session=tok ;  other=x', 'session')).toBe('tok')
  })

  it('returns null for empty value', () => {
    expect(parseCookie('session=', 'session')).toBeNull()
  })

  it('does not match partial cookie names', () => {
    expect(parseCookie('my_session=abc', 'session')).toBeNull()
  })
})

// --- buildSessionCookie ---

describe('buildSessionCookie', () => {
  it('sets SameSite=Lax for same-site requests', () => {
    const cookie = buildSessionCookie(makeSameSiteRequest(), 'mytoken')
    expect(cookie).toContain('session=mytoken')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`)
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).not.toContain('Secure')
  })

  it('sets SameSite=None; Secure for cross-site requests', () => {
    const cookie = buildSessionCookie(makeCrossSiteRequest(), 'mytoken')
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
  })

  it('uses Lax when no Origin header', () => {
    const cookie = buildSessionCookie(makeRequest('https://api.cnxnature.com/test'), 'tok')
    expect(cookie).toContain('SameSite=Lax')
  })
})

// --- clearSessionCookie ---

describe('clearSessionCookie', () => {
  it('sets Max-Age=0 and empty value', () => {
    const cookie = clearSessionCookie(makeSameSiteRequest())
    expect(cookie).toContain('session=')
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly')
  })

  it('sets SameSite=None; Secure for cross-site', () => {
    const cookie = clearSessionCookie(makeCrossSiteRequest())
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
  })
})

// --- parseJsonBody ---

describe('parseJsonBody', () => {
  it('parses valid JSON body', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const result = await parseJsonBody(request)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ name: 'test' })
    }
  })

  it('returns error response for invalid JSON', async () => {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      body: 'not json {{{',
      headers: { 'Content-Type': 'application/json' },
    })
    const result = await parseJsonBody(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      const body = await result.response.json() as { error: string }
      expect(body.error).toBe('Invalid JSON body')
    }
  })
})

// --- getAdminUser ---

describe('getAdminUser', () => {
  it('authenticates via Cf-Access-Authenticated-User-Email header', async () => {
    const request = makeLocalRequest({
      'Cf-Access-Authenticated-User-Email': 'jdelaire@gmail.com',
    })
    const result = await getAdminUser(request, makeEnv())
    expect(result).toEqual({ email: 'jdelaire@gmail.com' })
  })

  it('rejects non-admin email via CF Access header', async () => {
    const request = makeRequest('https://api.cnxnature.com/api/admin/orders', {
      'Cf-Access-Authenticated-User-Email': 'random@user.com',
    })
    const result = await getAdminUser(request, makeEnv())
    expect(result).toBeNull()
  })

  it('is case-insensitive for CF Access email', async () => {
    const request = makeLocalRequest({
      'Cf-Access-Authenticated-User-Email': 'JDelaire@Gmail.COM',
    })
    const result = await getAdminUser(request, makeEnv())
    expect(result).toEqual({ email: 'jdelaire@gmail.com' })
  })

  it('uses ADMIN_EMAILS env var when set', async () => {
    const request = makeLocalRequest({
      'Cf-Access-Authenticated-User-Email': 'custom@admin.com',
    })
    const result = await getAdminUser(request, makeEnv({ ADMIN_EMAILS: 'custom@admin.com, other@admin.com' }))
    expect(result).toEqual({ email: 'custom@admin.com' })
  })

  it('falls back to local-admin on localhost with no headers', async () => {
    const request = makeLocalRequest()
    const result = await getAdminUser(request, makeEnv())
    expect(result).toEqual({ email: 'local-admin@cnxnature.com' })
  })

  it('uses X-Admin-Email header on localhost', async () => {
    const request = makeLocalRequest({ 'X-Admin-Email': 'dev@test.com' })
    const result = await getAdminUser(request, makeEnv())
    expect(result).toEqual({ email: 'dev@test.com' })
  })

  it('returns null for non-local, non-admin request with no session', async () => {
    const request = makeRequest('https://api.cnxnature.com/api/admin/orders')
    const result = await getAdminUser(request, makeEnv())
    expect(result).toBeNull()
  })
})

// --- requireAdmin ---

describe('requireAdmin', () => {
  it('calls handler with adminUser on localhost', async () => {
    const handler = vi.fn(async (_req, _env, adminUser) => {
      return Response.json({ admin: adminUser.email })
    })

    const wrapped = requireAdmin(handler)
    const fakeCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
    const response = await wrapped(makeLocalRequest(), makeEnv(), fakeCtx)

    expect(handler).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    const body = await response.json() as { admin: string }
    expect(body.admin).toBe('local-admin@cnxnature.com')
  })

  it('returns 403 when not admin', async () => {
    const handler = vi.fn()
    const wrapped = requireAdmin(handler)
    const fakeCtx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext

    const request = makeRequest('https://api.cnxnature.com/api/admin/orders')
    const response = await wrapped(request, makeEnv(), fakeCtx)

    expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(403)
    const body = await response.json() as { error: string }
    expect(body.error).toBe('Admin authentication required')
  })
})
