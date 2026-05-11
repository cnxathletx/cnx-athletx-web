import { ApiClientError, apiFetch, type ApiErrorDetails, type ApiErrorPayload } from './client'
import type { AccountOrder, AuthUser, LoyaltySummary, SavedAddress } from '../types/auth'

export type { AccountOrder, AuthUser, LoyaltySummary, SavedAddress } from '../types/auth'

export class AuthApiErrorResponse extends ApiClientError {
  constructor(message: string, status: number, details?: ApiErrorDetails[]) {
    super(message, status, details)
    this.name = 'AuthApiErrorResponse'
  }
}

function authError(payload: ApiErrorPayload, response: Response): AuthApiErrorResponse {
  return new AuthApiErrorResponse(payload.error || 'Request failed', response.status, payload.details)
}

export async function requestMagicLink(email: string): Promise<{ success: boolean; message: string; dev_magic_link?: string }> {
  return apiFetch('/api/auth/request-link', {
    method: 'POST',
    body: { email },
    parseError: authError,
  })
}

export async function verifyMagicLink(token: string): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/auth/verify', {
    method: 'POST',
    body: { token },
    parseError: authError,
  })
  return data.user
}

export async function logoutApi(): Promise<void> {
  await apiFetch<void>('/api/auth/logout', {
    method: 'POST',
    parseError: authError,
  })
}

export async function fetchMe(): Promise<AuthUser | null> {
  const data = await apiFetch<{ user: AuthUser | null }>('/api/auth/me', { parseError: authError })
  return data.user
}

export async function fetchAccountOrders(page = 1, limit = 10): Promise<{
  orders: AccountOrder[]
  pagination: { page: number; limit: number; total: number }
}> {
  return apiFetch(`/api/account/orders?page=${page}&limit=${limit}`, { parseError: authError })
}

export async function fetchLoyaltySummary(): Promise<LoyaltySummary> {
  return apiFetch('/api/account/loyalty', { parseError: authError })
}

export async function fetchLastAddress(): Promise<{
  line1: string
  line2: string | null
  subdistrict: string
  district: string
  province: string
  postal_code: string
} | null> {
  const data = await apiFetch<{
    address: {
      line1: string
      line2: string | null
      district: string
      province: string
      postal_code: string
    } | null
  }>('/api/account/last-address', { parseError: authError })
  return data.address
}

export async function fetchSavedAddress(): Promise<SavedAddress | null> {
  const data = await apiFetch<{ address: SavedAddress | null }>('/api/account/address', { parseError: authError })
  return data.address
}

export async function updateAddress(payload: SavedAddress): Promise<SavedAddress> {
  const data = await apiFetch<{ success: true; address: SavedAddress }>('/api/account/address', {
    method: 'PATCH',
    body: payload,
    parseError: authError,
  })
  return data.address
}

export async function updateProfile(payload: { name?: string; phone?: string }): Promise<AuthUser> {
  const data = await apiFetch<{ user: AuthUser }>('/api/account/profile', {
    method: 'PATCH',
    body: payload,
    parseError: authError,
  })
  return data.user
}
