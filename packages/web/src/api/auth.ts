import { apiUrl } from './client'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  phone: string | null
}

export interface AccountOrder {
  id: string
  status: string
  total_thb: number
  items_count: number
  created_at: string
  shipment: { carrier: string; tracking_number: string } | null
}

export interface AuthApiError {
  error: string
  details?: { field: string; message: string }[]
}

export class AuthApiErrorResponse extends Error {
  status: number
  details?: { field: string; message: string }[]

  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseAuthError(res: Response): Promise<never> {
  let payload: AuthApiError = { error: 'Request failed' }
  try {
    payload = (await res.json()) as AuthApiError
  } catch {
    // Ignore parsing failures.
  }
  throw new AuthApiErrorResponse(payload.error || 'Request failed', res.status, payload.details)
}

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string; dev_magic_link?: string }> {
  const res = await fetch(apiUrl('/api/auth/request-link'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  return (await res.json()) as { success: boolean; message: string; dev_magic_link?: string }
}

export async function verifyMagicLink(token: string): Promise<AuthUser> {
  const res = await fetch(apiUrl('/api/auth/verify'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  const data = (await res.json()) as { user: AuthUser }
  return data.user
}

export async function logoutApi(): Promise<void> {
  const res = await fetch(apiUrl('/api/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAuthError(res)
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(apiUrl('/api/auth/me'), {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  const data = (await res.json()) as { user: AuthUser | null }
  return data.user
}

export async function fetchAccountOrders(page = 1, limit = 10): Promise<{
  orders: AccountOrder[]
  pagination: { page: number; limit: number; total: number }
}> {
  const res = await fetch(apiUrl(`/api/account/orders?page=${page}&limit=${limit}`), {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  return (await res.json()) as {
    orders: AccountOrder[]
    pagination: { page: number; limit: number; total: number }
  }
}

export async function fetchLastAddress(): Promise<{
  line1: string
  line2: string | null
  district: string
  province: string
  postal_code: string
} | null> {
  const res = await fetch(apiUrl('/api/account/last-address'), {
    credentials: 'include',
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  const data = (await res.json()) as {
    address: {
      line1: string
      line2: string | null
      district: string
      province: string
      postal_code: string
    } | null
  }
  return data.address
}

export interface SavedAddress {
  line1: string
  line2: string | null
  district: string
  province: string
  postal_code: string
}

export async function fetchSavedAddress(): Promise<SavedAddress | null> {
  const res = await fetch(apiUrl('/api/account/address'), {
    credentials: 'include',
  })
  if (!res.ok) {
    await parseAuthError(res)
  }
  const data = (await res.json()) as { address: SavedAddress | null }
  return data.address
}

export async function updateAddress(payload: SavedAddress): Promise<SavedAddress> {
  const res = await fetch(apiUrl('/api/account/address'), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    await parseAuthError(res)
  }
  const data = (await res.json()) as { success: true; address: SavedAddress }
  return data.address
}

export async function updateProfile(payload: { name?: string; phone?: string }): Promise<AuthUser> {
  const res = await fetch(apiUrl('/api/account/profile'), {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    await parseAuthError(res)
  }

  const data = (await res.json()) as { user: AuthUser }
  return data.user
}
