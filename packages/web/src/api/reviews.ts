import { ApiClientError, apiFetch, type ApiErrorDetails, type ApiErrorPayload } from './client'
import type {
  MyReview,
  PublicReviewsResponse,
  ReviewableProduct,
  SubmitReviewPayload,
} from '../types/reviews'

export type {
  MyReview,
  PublicReview,
  PublicReviewsResponse,
  ReviewableProduct,
  ReviewSummary,
  SubmitReviewPayload,
} from '../types/reviews'

export class ReviewApiError extends ApiClientError {
  constructor(message: string, status: number, details?: ApiErrorDetails[]) {
    super(message, status, details)
    this.name = 'ReviewApiError'
  }
}

function reviewError(payload: ApiErrorPayload, response: Response): ReviewApiError {
  return new ReviewApiError(payload.error || 'Request failed', response.status, payload.details)
}

export async function fetchProductReviews(slug: string, page = 1, pageSize = 10): Promise<PublicReviewsResponse> {
  return apiFetch(`/api/products/${encodeURIComponent(slug)}/reviews?page=${page}&pageSize=${pageSize}`, {
    parseError: reviewError,
  })
}

export async function fetchReviewableProducts(): Promise<ReviewableProduct[]> {
  const data = await apiFetch<{ items: ReviewableProduct[] }>('/api/account/reviewable-products', {
    parseError: reviewError,
  })
  return data.items
}

export async function fetchMyReviews(): Promise<MyReview[]> {
  const data = await apiFetch<{ reviews: MyReview[] }>('/api/account/reviews', {
    parseError: reviewError,
  })
  return data.reviews
}

export async function submitReview(payload: SubmitReviewPayload): Promise<MyReview> {
  const data = await apiFetch<{ review: MyReview }>('/api/account/reviews', {
    method: 'POST',
    body: payload,
    parseError: reviewError,
  })
  return data.review
}

export async function deleteMyReview(id: number): Promise<void> {
  await apiFetch<void>(`/api/account/reviews/${id}`, {
    method: 'DELETE',
    parseError: reviewError,
  })
}
