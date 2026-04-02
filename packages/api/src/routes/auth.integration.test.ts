import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch, loginAs } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

describe('POST /api/auth/request-link', () => {
  it('returns success and dev_magic_link for valid email', async () => {
    const res = await workerFetch('/api/auth/request-link', { body: { email: 'user@example.com' } })
    expect(res.status).toBe(200)

    const data = await res.json() as { success: boolean; dev_magic_link?: string }
    expect(data.success).toBe(true)
    expect(data.dev_magic_link).toBeTruthy()
    expect(data.dev_magic_link).toContain('token=')
  })

  it('rejects invalid email', async () => {
    const res = await workerFetch('/api/auth/request-link', { body: { email: 'not-an-email' } })
    expect(res.status).toBe(400)
  })

  it('rejects missing email', async () => {
    const res = await workerFetch('/api/auth/request-link', { body: {} })
    expect(res.status).toBe(400)
  })

  it('rate-limits after 3 requests within 15 minutes', async () => {
    const email = 'ratelimit@example.com'
    await workerFetch('/api/auth/request-link', { body: { email } })
    await workerFetch('/api/auth/request-link', { body: { email } })
    await workerFetch('/api/auth/request-link', { body: { email } })

    const res = await workerFetch('/api/auth/request-link', { body: { email } })
    expect(res.status).toBe(429)
  })
})

describe('POST /api/auth/verify', () => {
  it('verifies magic link token and sets session cookie', async () => {
    // Request a magic link
    const linkRes = await workerFetch('/api/auth/request-link', { body: { email: 'verify@example.com' } })
    const linkData = await linkRes.json() as { dev_magic_link: string }
    const token = new URL(linkData.dev_magic_link).searchParams.get('token')!

    // Verify
    const res = await workerFetch('/api/auth/verify', { body: { token } })
    expect(res.status).toBe(200)

    const data = await res.json() as { user: { email: string; id: string } }
    expect(data.user.email).toBe('verify@example.com')
    expect(data.user.id).toBeTruthy()

    // Should set session cookie
    const setCookie = res.headers.get('Set-Cookie')
    expect(setCookie).toContain('session=')
    expect(setCookie).toContain('HttpOnly')
  })

  it('rejects invalid token', async () => {
    // Valid format (64 hex chars) but not in DB
    const res = await workerFetch('/api/auth/verify', { body: { token: 'a'.repeat(64) } })
    expect(res.status).toBe(401)
  })

  it('rejects already-used token', async () => {
    const linkRes = await workerFetch('/api/auth/request-link', { body: { email: 'reuse@example.com' } })
    const linkData = await linkRes.json() as { dev_magic_link: string }
    const token = new URL(linkData.dev_magic_link).searchParams.get('token')!

    // First verify succeeds
    const res1 = await workerFetch('/api/auth/verify', { body: { token } })
    expect(res1.status).toBe(200)

    // Second verify fails (token consumed)
    const res2 = await workerFetch('/api/auth/verify', { body: { token } })
    expect(res2.status).toBe(401)
  })

  it('creates user on first login', async () => {
    const cookie = await loginAs('newuser@example.com')

    const meRes = await workerFetch('/api/auth/me', { cookie })
    const meData = await meRes.json() as { user: { email: string } }
    expect(meData.user.email).toBe('newuser@example.com')
  })

  it('reuses existing user on subsequent login', async () => {
    const cookie1 = await loginAs('returning@example.com')
    const me1 = await workerFetch('/api/auth/me', { cookie: cookie1 })
    const data1 = await me1.json() as { user: { id: string } }

    // Log in again — same user ID
    const cookie2 = await loginAs('returning@example.com')
    const me2 = await workerFetch('/api/auth/me', { cookie: cookie2 })
    const data2 = await me2.json() as { user: { id: string } }

    expect(data2.user.id).toBe(data1.user.id)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user when authenticated', async () => {
    const cookie = await loginAs('me@example.com')

    const res = await workerFetch('/api/auth/me', { cookie })
    expect(res.status).toBe(200)

    const data = await res.json() as { user: { email: string } }
    expect(data.user.email).toBe('me@example.com')
  })

  it('returns null user when not authenticated', async () => {
    const res = await workerFetch('/api/auth/me')
    expect(res.status).toBe(200)

    const data = await res.json() as { user: null }
    expect(data.user).toBeNull()
  })

  it('returns null after logout', async () => {
    const cookie = await loginAs('logout@example.com')

    // Logout
    await workerFetch('/api/auth/logout', { method: 'POST', cookie })

    // Session should be invalidated
    const res = await workerFetch('/api/auth/me', { cookie })
    const data = await res.json() as { user: null }
    expect(data.user).toBeNull()
  })
})

describe('POST /api/auth/logout', () => {
  it('clears session cookie', async () => {
    const cookie = await loginAs('clear@example.com')

    const res = await workerFetch('/api/auth/logout', { method: 'POST', cookie })
    expect(res.status).toBe(200)

    const data = await res.json() as { success: boolean }
    expect(data.success).toBe(true)

    const setCookie = res.headers.get('Set-Cookie')
    expect(setCookie).toContain('Max-Age=0')
  })

  it('succeeds even without a session', async () => {
    const res = await workerFetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
  })
})
