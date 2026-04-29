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
