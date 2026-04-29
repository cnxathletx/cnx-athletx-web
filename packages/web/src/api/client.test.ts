import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiFetch } from './client'

const originalFetch = globalThis.fetch

function mockJsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = originalFetch
})

describe('apiFetch', () => {
  it('sends credentials by default and parses JSON responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiFetch<{ ok: boolean }>('/api/example')

    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/example', { credentials: 'include' })
  })

  it('serializes plain JSON bodies and preserves explicit init values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ saved: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/example', {
      method: 'PATCH',
      body: { name: 'CNX' },
      credentials: 'omit',
      headers: { 'X-Test': '1' },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/example', {
      method: 'PATCH',
      credentials: 'omit',
      headers: { 'X-Test': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CNX' }),
    })
  })

  it('returns null for empty successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch<null>('/api/empty')).resolves.toBeNull()
  })

  it('throws a normalized API error with details from JSON payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(
        {
          error: 'Validation failed',
          details: [{ field: 'email', message: 'Required' }],
          current_status: 'pending_payment',
        },
        { status: 400 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiFetch('/api/example')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'Validation failed',
      status: 400,
      details: [{ field: 'email', message: 'Required' }],
      currentStatus: 'pending_payment',
    })
  })

  it('allows callers to map error payloads to custom errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ error: 'Nope' }, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiFetch('/api/example', {
        parseError: (payload, response) => new ApiClientError(`mapped:${payload.error}`, response.status),
      }),
    ).rejects.toMatchObject({ message: 'mapped:Nope', status: 409 })
  })
})
