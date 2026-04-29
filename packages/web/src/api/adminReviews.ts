import { apiFetch } from './client'
import type { AdminReview, AdminReviewsResponse, AdminReviewStatus } from '../types/admin'

export type { AdminReview, AdminReviewsResponse, AdminReviewStatus } from '../types/admin'

export async function fetchAdminReviews(status: AdminReviewStatus | '' = 'pending', page = 1): Promise<AdminReviewsResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('page', String(page))
  return apiFetch(`/api/admin/reviews?${params.toString()}`, {
    parseError: (payload, response) => new Error(payload.error ?? `Request failed: ${response.status}`),
  })
}

export async function approveReview(id: number): Promise<void> {
  await apiFetch<void>(`/api/admin/reviews/${id}/approve`, {
    method: 'POST',
    parseError: (payload, response) => new Error(payload.error ?? `Request failed: ${response.status}`),
  })
}

export async function rejectReview(id: number, reason?: string): Promise<void> {
  await apiFetch<void>(`/api/admin/reviews/${id}/reject`, {
    method: 'POST',
    body: { reason: reason ?? '' },
    parseError: (payload, response) => new Error(payload.error ?? `Request failed: ${response.status}`),
  })
}

export async function deleteAdminReview(id: number): Promise<void> {
  await apiFetch<void>(`/api/admin/reviews/${id}`, {
    method: 'DELETE',
    parseError: (payload, response) => new Error(payload.error ?? `Request failed: ${response.status}`),
  })
}
