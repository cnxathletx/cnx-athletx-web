import { describe, it, expect } from 'vitest'
import { getCorsHeaders, corsify } from './cors'
import type { Env } from '../lib/types'

// --- Helpers ---

function makeEnv(overrides: Partial<Env> = {}): Env {
  return { DB: {} as D1Database, PRODUCT_IMAGES: {} as R2Bucket, ...overrides }
}

function makeRequest(url: string, origin?: string): Request {
  const headers: Record<string, string> = {}
  if (origin) headers['Origin'] = origin
  return new Request(url, { headers })
}

// --- getCorsHeaders ---

describe('getCorsHeaders', () => {
  it('returns only Vary when no Origin header', () => {
    const request = makeRequest('https://api.cnxnature.com/api/products')
    const headers = getCorsHeaders(request, makeEnv())
    expect(headers).toEqual({ Vary: 'Origin' })
  })

  it('returns only Vary for disallowed origin', () => {
    const request = makeRequest('https://api.cnxnature.com/api/products', 'https://evil.com')
    const headers = getCorsHeaders(request, makeEnv())
    expect(headers).toEqual({ Vary: 'Origin' })
  })

  it('allows local origin on local request', () => {
    const request = makeRequest('http://localhost:8787/api/products', 'http://localhost:5171')
    const headers = getCorsHeaders(request, makeEnv())
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5171')
    expect(headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(headers['Access-Control-Allow-Methods']).toContain('GET')
    expect(headers['Access-Control-Allow-Methods']).toContain('POST')
  })

  it('rejects local origin on non-local request', () => {
    const request = makeRequest('https://api.cnxnature.com/api/products', 'http://localhost:5171')
    const headers = getCorsHeaders(request, makeEnv())
    expect(headers).toEqual({ Vary: 'Origin' })
  })

  it('allows origin from ALLOWED_ORIGINS env', () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://www.cnxnature.com,https://cnxnature.com' })
    const request = makeRequest('https://api.cnxnature.com/api/products', 'https://www.cnxnature.com')
    const headers = getCorsHeaders(request, env)
    expect(headers['Access-Control-Allow-Origin']).toBe('https://www.cnxnature.com')
  })

  it('rejects origin not in ALLOWED_ORIGINS', () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://www.cnxnature.com' })
    const request = makeRequest('https://api.cnxnature.com/api/products', 'https://other.com')
    const headers = getCorsHeaders(request, env)
    expect(headers).toEqual({ Vary: 'Origin' })
  })
})

// --- corsify ---

describe('corsify', () => {
  it('appends CORS headers to response', () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://www.cnxnature.com' })
    const request = makeRequest('https://api.cnxnature.com/api/products', 'https://www.cnxnature.com')
    const original = new Response('ok', { status: 200, headers: { 'Content-Type': 'application/json' } })

    const corsified = corsify(original, request, env)
    expect(corsified.status).toBe(200)
    expect(corsified.headers.get('Access-Control-Allow-Origin')).toBe('https://www.cnxnature.com')
    expect(corsified.headers.get('Content-Type')).toBe('application/json')
    expect(corsified.headers.get('Vary')).toBe('Origin')
  })

  it('preserves original response status', () => {
    const request = makeRequest('https://api.cnxnature.com/api/test')
    const original = new Response(null, { status: 404 })
    const corsified = corsify(original, request, makeEnv())
    expect(corsified.status).toBe(404)
  })

  it('adds Vary header even when origin not allowed', () => {
    const request = makeRequest('https://api.cnxnature.com/api/test', 'https://evil.com')
    const original = new Response('ok')
    const corsified = corsify(original, request, makeEnv())
    expect(corsified.headers.get('Vary')).toBe('Origin')
    expect(corsified.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
