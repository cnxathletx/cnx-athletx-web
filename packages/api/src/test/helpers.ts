import { unstable_dev, type Unstable_DevWorker } from 'wrangler'

let worker: Unstable_DevWorker | null = null

export async function startWorker(): Promise<Unstable_DevWorker> {
  if (worker) return worker
  worker = await unstable_dev('src/index.ts', {
    experimental: { disableExperimentalWarning: true },
    local: true,
    persist: false,
  })
  return worker
}

export async function stopWorker() {
  if (worker) {
    await worker.stop()
    worker = null
  }
}

/** Reset DB to clean schema + seed data */
export async function resetDb() {
  const res = await workerFetch('/api/__test-reset', { method: 'POST' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DB reset failed: ${res.status} — ${body}`)
  }
}

/** Send a request to the worker */
export async function workerFetch(
  path: string,
  options: { method?: string; body?: unknown; admin?: boolean; cookie?: string; headers?: Record<string, string> } = {}
): Promise<Response> {
  if (!worker) throw new Error('Worker not started — call startWorker() first')
  const headers: Record<string, string> = { ...options.headers }
  if (options.admin) {
    headers['X-Admin-Email'] = 'test-admin@cnxnature.com'
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie
  }
  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }
  const url = `http://${worker.address}:${worker.port}${path}`
  return worker.fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }) as unknown as Promise<Response>
}

/**
 * Log in as a test user via magic link flow.
 * Returns the session cookie string to pass in subsequent requests.
 */
export async function loginAs(email: string): Promise<string> {
  const linkRes = await workerFetch('/api/auth/request-link', { body: { email } })
  const linkData = await linkRes.json() as { dev_magic_link?: string }
  if (!linkData.dev_magic_link) throw new Error('No dev_magic_link in response — is RESEND_API_KEY unset?')

  const token = new URL(linkData.dev_magic_link).searchParams.get('token')!
  const verifyRes = await workerFetch('/api/auth/verify', { body: { token } })
  if (!verifyRes.ok) throw new Error(`Verify failed: ${verifyRes.status}`)

  const setCookie = verifyRes.headers.get('Set-Cookie')
  if (!setCookie) throw new Error('No Set-Cookie header in verify response')

  // Extract just the "session=<value>" part
  const match = setCookie.match(/session=([^;]+)/)
  if (!match) throw new Error('Could not parse session cookie')
  return `session=${match[1]}`
}

/** Build a valid checkout body */
export function checkoutBody(overrides: Record<string, unknown> = {}) {
  return {
    idempotency_key: `idem-${Date.now()}-${Math.random()}`,
    items: [{ product_id: 1, quantity: 1 }],
    customer: {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+66812345678',
      address: {
        line1: '123 Test Street, Apt 4',
        district: 'Mueang',
        province: 'Chiang Mai',
        postal_code: '50200',
      },
    },
    ...overrides,
  }
}
