import { ref, watch } from 'vue'
import { fetchProductReviews, type ReviewSummary, type PublicReview } from '../api/reviews'

export function useProductReviews(slug: () => string) {
  const summary = ref<ReviewSummary>({ avgRating: null, count: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } })
  const reviews = ref<PublicReview[]>([])
  const page = ref(1)
  const pageSize = 10
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const data = await fetchProductReviews(slug(), page.value, pageSize)
      summary.value = data.summary
      reviews.value = data.reviews
      total.value = data.total
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load reviews'
    } finally {
      loading.value = false
    }
  }

  function setPage(next: number) {
    page.value = next
    void load()
  }

  watch(slug, () => { page.value = 1; void load() }, { immediate: true })

  return { summary, reviews, page, pageSize, total, loading, error, setPage, refresh: load }
}
