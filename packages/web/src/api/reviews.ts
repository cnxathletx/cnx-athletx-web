import { apiUrl } from './client'

export interface ReviewSummary {
  avgRating: number | null
  count: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface PublicReview {
  id: number
  rating: number
  body: string | null
  locale: 'en' | 'th'
  createdAt: string
}

export interface PublicReviewsResponse {
  summary: ReviewSummary
  reviews: PublicReview[]
  page: number
  pageSize: number
  total: number
}

export interface ReviewableProduct {
  productLineId: number
  slug: string
  name: string
  orderId: string
  shippedAt: string
}

export interface MyReview {
  id: number
  productLineId: number
  productLineName: string
  rating: number
  body: string | null
  locale: 'en' | 'th'
  status: 'pending' | 'approved' | 'rejected'
  rejectedReason: string | null
  createdAt: string
  moderatedAt: string | null
}

export interface SubmitReviewPayload {
  productLineId: number
  rating: number
  body?: string
  locale: 'en' | 'th'
}

export class ReviewApiError extends Error {
  status: number
  details?: { field: string; message: string }[]
  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

async function parseError(res: Response): Promise<never> {
  let payload: { error?: string; details?: { field: string; message: string }[] } = {}
  try { payload = (await res.json()) as typeof payload } catch { /* ignore */ }
  throw new ReviewApiError(payload.error ?? 'Request failed', res.status, payload.details)
}

export async function fetchProductReviews(slug: string, page = 1, pageSize = 10): Promise<PublicReviewsResponse> {
  const res = await fetch(apiUrl(`/api/products/${encodeURIComponent(slug)}/reviews?page=${page}&pageSize=${pageSize}`))
  if (!res.ok) await parseError(res)
  return (await res.json()) as PublicReviewsResponse
}

export async function fetchReviewableProducts(): Promise<ReviewableProduct[]> {
  const res = await fetch(apiUrl('/api/account/reviewable-products'), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { items: ReviewableProduct[] }
  return data.items
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const res = await fetch(apiUrl('/api/account/reviews'), { credentials: 'include' })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { reviews: MyReview[] }
  return data.reviews
}

export async function submitReview(payload: SubmitReviewPayload): Promise<MyReview> {
  const res = await fetch(apiUrl('/api/account/reviews'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { review: MyReview }
  return data.review
}

export async function deleteMyReview(id: number): Promise<void> {
  const res = await fetch(apiUrl(`/api/account/reviews/${id}`), {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) await parseError(res)
}
