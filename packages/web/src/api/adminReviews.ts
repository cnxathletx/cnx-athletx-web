import { apiUrl } from './client'

export interface AdminReview {
  id: number
  user_id: string
  user_email: string
  product_line_id: number
  product_line_name: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejected_reason: string | null
  created_at: string
  moderated_at: string | null
  moderated_by: string | null
}

export interface AdminReviewsResponse {
  reviews: AdminReview[]
  pagination: { page: number; limit: number; total: number }
}

export type AdminReviewStatus = 'pending' | 'approved' | 'rejected'

async function parseError(res: Response): Promise<never> {
  let payload: { error?: string } = {}
  try { payload = (await res.json()) as typeof payload } catch { /* ignore */ }
  throw new Error(payload.error ?? `Request failed: ${res.status}`)
}

export async function fetchAdminReviews(status: AdminReviewStatus | '' = 'pending', page = 1): Promise<AdminReviewsResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('page', String(page))
  const res = await fetch(apiUrl(`/api/admin/reviews?${params.toString()}`), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  return (await res.json()) as AdminReviewsResponse
}

export async function approveReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}/approve`), { method: 'POST', credentials: 'include' })
  if (!res.ok) await parseError(res)
}

export async function rejectReview(id: number, reason?: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}/reject`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason ?? '' }),
  })
  if (!res.ok) await parseError(res)
}

export async function deleteAdminReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/admin/reviews/${id}`), { method: 'DELETE', credentials: 'include' })
  if (!res.ok) await parseError(res)
}
