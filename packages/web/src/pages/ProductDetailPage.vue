<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import {
  fetchProductBySlug,
  joinProductWaitlist,
  formatPrice,
  formatWeight,
  type ApiProduct,
  type ApiRelatedProduct,
  type ApiLabTestFile,
} from '../api/products'
import { useCartStore } from '../stores/cart'
import { pickUnitPrice, sortTiers, savingsPercent } from '../utils/pricing'
import { useHead } from '../composables/useHead'
import { useJsonLd } from '../composables/useJsonLd'
import ReviewSummary from '../components/reviews/ReviewSummary.vue'
import ReviewList from '../components/reviews/ReviewList.vue'
import { useProductReviews } from '../composables/useProductReviews'

const { t, locale } = useI18n({ useScope: 'global' })

const cart = useCartStore()

const route = useRoute()

const product = ref<ApiProduct | null>(null)
const relatedProduct = ref<ApiRelatedProduct | null>(null)
const loading = ref(true)
const error = ref('')
const quantity = ref(1)
const productImageError = ref(false)
const activeImageIndex = ref(0)
const lightboxOpen = ref(false)
const labTestOpen = ref(false)
const labTestIndex = ref(0)
const waitlistEmail = ref('')
const waitlistMarketingConsent = ref(false)
const waitlistLoading = ref(false)
const waitlistError = ref('')
const waitlistSuccess = ref(false)

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function openLightbox() {
  if (!activeImageUrl.value || productImageError.value) return
  lightboxOpen.value = true
  document.body.style.overflow = 'hidden'
}

function closeLightbox() {
  lightboxOpen.value = false
  document.body.style.overflow = ''
}

function lightboxPrev() {
  if (gallery.value.length < 2) return
  activeImageIndex.value = (activeImageIndex.value - 1 + gallery.value.length) % gallery.value.length
}

function lightboxNext() {
  if (gallery.value.length < 2) return
  activeImageIndex.value = (activeImageIndex.value + 1) % gallery.value.length
}

const labTestFiles = computed<ApiLabTestFile[]>(() => product.value?.lab_test_files ?? [])
const activeLabTestFile = computed<ApiLabTestFile | null>(() => labTestFiles.value[labTestIndex.value] ?? null)

function openLabTests(index: number) {
  if (labTestFiles.value.length === 0) return
  labTestIndex.value = Math.max(0, Math.min(index, labTestFiles.value.length - 1))
  labTestOpen.value = true
  document.body.style.overflow = 'hidden'
}

function closeLabTests() {
  labTestOpen.value = false
  document.body.style.overflow = ''
}

function labTestPrev() {
  if (labTestFiles.value.length < 2) return
  labTestIndex.value = (labTestIndex.value - 1 + labTestFiles.value.length) % labTestFiles.value.length
}

function labTestNext() {
  if (labTestFiles.value.length < 2) return
  labTestIndex.value = (labTestIndex.value + 1) % labTestFiles.value.length
}

function onKeydown(e: KeyboardEvent) {
  if (labTestOpen.value) {
    if (e.key === 'Escape') closeLabTests()
    else if (e.key === 'ArrowLeft') labTestPrev()
    else if (e.key === 'ArrowRight') labTestNext()
    return
  }
  if (!lightboxOpen.value) return
  if (e.key === 'Escape') closeLightbox()
  else if (e.key === 'ArrowLeft') lightboxPrev()
  else if (e.key === 'ArrowRight') lightboxNext()
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeydown)
  onUnmounted(() => {
    window.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  })
}

const gallery = computed<string[]>(() => {
  const p = product.value
  if (!p) return []
  const urls: string[] = []
  if (p.image_url) urls.push(p.image_url)
  for (const s of p.screenshots ?? []) {
    if (s.url && !urls.includes(s.url)) urls.push(s.url)
  }
  return urls
})
const activeImageUrl = computed(() => gallery.value[activeImageIndex.value] || product.value?.image_url || '')

const productTitle = computed(() => product.value?.name || 'Product')
const productDescription = computed(() =>
  product.value
    ? `${product.value.name} — Plant-based protein powder. ${formatPrice(product.value.price_thb)}. Free shipping available.`
    : 'Plant-based protein powder from CNX AthletX.'
)
const productCanonical = computed(() => product.value ? `/product/${product.value.slug}` : '')
const productImage = computed(() => product.value?.image_url || '')

useHead({
  title: productTitle,
  description: productDescription,
  ogType: 'product',
  ogImage: productImage,
  canonicalPath: productCanonical,
})

useJsonLd(() => {
  const p = product.value
  if (!p) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description,
    image: p.image_url
      ? [p.image_url.startsWith('/') ? `https://www.cnxnature.com${p.image_url}` : p.image_url]
      : undefined,
    sku: p.slug,
    url: `https://www.cnxnature.com/product/${p.slug}`,
    brand: { '@type': 'Brand', name: 'CNX AthletX' },
    offers: {
      '@type': 'Offer',
      price: (p.price_thb / 100).toFixed(2),
      priceCurrency: 'THB',
      availability: p.available_stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `https://www.cnxnature.com/product/${p.slug}`,
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'TH' },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'TH',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      },
    },
  }
})

const activeTab = ref<'nutrition' | 'ingredients' | 'howToUse' | 'whoIsFor' | 'regulatoryInfo'>('nutrition')

const tabs = computed(() => [
  { key: 'nutrition' as const, label: t('product.nutritionFacts') },
  { key: 'ingredients' as const, label: t('product.ingredients') },
  { key: 'howToUse' as const, label: t('product.howToUse') },
  { key: 'whoIsFor' as const, label: t('product.whoIsFor') },
  { key: 'regulatoryInfo' as const, label: t('product.regulatoryInfo') },
])

type NutritionRow = { label: string; value: string; sub?: boolean }

const nutritionFacts = computed<NutritionRow[]>(() => {
  const raw = product.value?.nutrition_json
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string' && typeof r.value === 'string')
        .map((r) => ({ label: r.label, value: r.value, sub: r.sub === true }))
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, string>).map(([label, value]) => ({
        label,
        value: String(value),
        sub: false,
      }))
    }
    return []
  } catch {
    return []
  }
})

const ingredientsText = computed(() => product.value?.ingredients || '')
const ingredientRows = computed<{ label: string; sub: boolean }[]>(() => {
  const raw = product.value?.ingredients
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string')
        .map((r) => ({ label: r.label, sub: r.sub === true }))
    }
  } catch {
    // legacy plain-text format
  }
  return []
})
const howToUseText = computed(() => product.value?.how_to_use || '')
const whoIsForText = computed(() => product.value?.who_is_for || '')
const regulatoryInfoText = computed(() => product.value?.regulatory_info || '')

const sortedTiers = computed(() => product.value ? sortTiers(product.value.price_tiers ?? []) : [])
const hasTiers = computed(() => sortedTiers.value.length > 0)
const currentUnitPrice = computed(() => {
  if (!product.value) return 0
  return pickUnitPrice(product.value.price_thb, sortedTiers.value, quantity.value)
})
const currentLineTotal = computed(() => currentUnitPrice.value * quantity.value)
const currentSavingsPct = computed(() =>
  product.value ? savingsPercent(product.value.price_thb, currentUnitPrice.value) : 0,
)

const hasProductLineData = computed(() =>
  nutritionFacts.value.length > 0 ||
  ingredientsText.value ||
  howToUseText.value ||
  whoIsForText.value ||
  regulatoryInfoText.value
)

async function loadProduct(slug: string) {
  loading.value = true
  error.value = ''
  quantity.value = 1
  activeTab.value = 'nutrition'
  productImageError.value = false
  activeImageIndex.value = 0
  waitlistEmail.value = ''
  waitlistMarketingConsent.value = false
  waitlistError.value = ''
  waitlistSuccess.value = false
  closeLightbox()

  try {
    const detail = await fetchProductBySlug(slug)
    product.value = detail.product
    relatedProduct.value = detail.related
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
    product.value = null
  } finally {
    loading.value = false
  }
}

function increment() {
  if (quantity.value < 10) quantity.value++
}

function decrement() {
  if (quantity.value > 1) quantity.value--
}

async function submitWaitlist() {
  const email = waitlistEmail.value.trim().toLowerCase()
  waitlistError.value = ''
  waitlistSuccess.value = false

  if (!emailPattern.test(email)) {
    waitlistError.value = t('product.waitlistInvalidEmail')
    return
  }

  waitlistLoading.value = true
  try {
    await joinProductWaitlist(productSlug.value, {
      email,
      marketing_consent: waitlistMarketingConsent.value,
    })
    waitlistEmail.value = email
    waitlistSuccess.value = true
  } catch {
    waitlistError.value = t('product.waitlistError')
  } finally {
    waitlistLoading.value = false
  }
}

watch(
  () => route.params.slug as string,
  (slug) => {
    if (slug) loadProduct(slug)
  },
  { immediate: true }
)

watch(locale, () => {
  const slug = route.params.slug as string
  if (slug) loadProduct(slug)
})

const productSlug = computed(() => (route.params.slug as string) ?? '')
const {
  summary: reviewSummary,
  reviews: productReviews,
  page: reviewPage,
  pageSize: reviewPageSize,
  total: reviewTotal,
  loading: reviewsLoading,
  error: reviewsError,
  setPage: setReviewPage,
} = useProductReviews(() => productSlug.value)
</script>

<template>
  <!-- Loading State -->
  <div v-if="loading" class="bg-background">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
        <div class="aspect-square rounded-lg bg-surface" />
        <div class="space-y-6">
          <div class="h-10 bg-surface rounded w-3/4" />
          <div class="h-6 bg-surface rounded w-1/4" />
          <div class="h-12 bg-surface rounded w-1/3" />
          <div class="space-y-2">
            <div class="h-4 bg-surface rounded" />
            <div class="h-4 bg-surface rounded w-5/6" />
            <div class="h-4 bg-surface rounded w-2/3" />
          </div>
          <div class="h-14 bg-surface rounded" />
        </div>
      </div>
    </div>
  </div>

  <!-- Error State -->
  <div v-else-if="error" class="bg-background">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-24 text-center space-y-4">
      <svg
        class="w-12 h-12 mx-auto text-error"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      <h1 class="text-3xl font-bold text-foreground">
        {{ error === 'Product not found' ? t('product.productNotFound') : t('product.errorLoading') }}
      </h1>
      <p class="text-muted">{{ error }}</p>
      <RouterLink to="/shop">
        <PrimaryButton>{{ t('common.backToShop') }}</PrimaryButton>
      </RouterLink>
    </div>
  </div>

  <!-- Product Content -->
  <div v-else-if="product">
    <!-- Breadcrumb -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-4">
        <nav class="flex items-center space-x-2 text-sm text-muted">
          <RouterLink to="/" class="hover:text-foreground transition-colors">{{ t('nav.home') }}</RouterLink>
          <span>/</span>
          <RouterLink to="/shop" class="hover:text-foreground transition-colors">{{ t('nav.shop') }}</RouterLink>
          <span>/</span>
          <span class="text-foreground font-medium">
            {{ product.name }} {{ formatWeight(product.weight_g) }}
          </span>
        </nav>
      </div>
    </section>

    <!-- Product Section -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <!-- Image Column -->
          <div class="space-y-3">
            <div class="aspect-square rounded-lg overflow-hidden bg-surface ring-1 ring-[var(--card-ring)]">
              <img
                v-if="activeImageUrl && !productImageError"
                :src="activeImageUrl"
                :alt="product.name"
                width="800"
                height="800"
                fetchpriority="high"
                decoding="async"
                class="w-full h-full object-cover cursor-zoom-in"
                @click="openLightbox"
                @error="productImageError = true"
              />
              <div
                v-else
                class="w-full h-full bg-gradient-to-br from-primary/15 via-sage/10 to-accent/5 flex items-center justify-center"
              >
                <div class="text-center space-y-3">
                  <svg
                    class="w-32 h-32 mx-auto text-muted/25"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1"
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                  <p class="text-sm text-muted/40">{{ t('product.productImage') }}</p>
                </div>
              </div>
            </div>

            <div v-if="gallery.length > 1" class="grid grid-cols-5 gap-2">
              <button
                v-for="(url, i) in gallery"
                :key="url + i"
                type="button"
                class="aspect-square rounded-md overflow-hidden ring-1 transition-all"
                :class="i === activeImageIndex ? 'ring-2 ring-primary' : 'ring-[var(--card-ring)] hover:ring-primary/60'"
                :aria-label="`Show image ${i + 1}`"
                @click="activeImageIndex = i; productImageError = false"
              >
                <img
                  :src="url"
                  :alt="`${product.name} image ${i + 1}`"
                  width="160"
                  height="160"
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-cover"
                />
              </button>
            </div>
          </div>

          <!-- Info Column -->
          <div class="space-y-6">
            <div class="space-y-3">
              <h1 class="text-3xl sm:text-4xl font-bold text-foreground">{{ product.name }}</h1>
              <AppBadge :label="formatWeight(product.weight_g)" />
            </div>

            <div class="space-y-1">
              <div class="flex items-baseline gap-3 flex-wrap">
                <p class="text-4xl font-bold text-foreground">{{ formatPrice(currentUnitPrice) }}</p>
                <p
                  v-if="currentSavingsPct > 0"
                  class="text-sm text-muted line-through"
                >
                  {{ formatPrice(product.price_thb) }}
                </p>
                <span
                  v-if="currentSavingsPct > 0"
                  class="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
                >
                  {{ t('product.savePercent', { percent: currentSavingsPct }) }}
                </span>
              </div>
              <p v-if="quantity > 1" class="text-sm text-muted">
                {{ t('product.perUnit') }} &middot; {{ t('product.lineTotal', { total: formatPrice(currentLineTotal) }) }}
              </p>
            </div>

            <!-- Price Tier Ladder -->
            <div
              v-if="hasTiers"
              class="rounded-md border border-sand bg-surface-alt p-4 space-y-2"
              data-testid="price-tier-ladder"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ t('product.volumeDiscounts') }}
              </p>
              <ul class="space-y-1.5">
                <li
                  v-for="tier in sortedTiers"
                  :key="tier.min_quantity"
                  class="flex items-center justify-between text-sm"
                  :class="quantity >= tier.min_quantity ? 'text-foreground font-semibold' : 'text-muted'"
                >
                  <span>
                    {{ t('product.tierLabel', { count: tier.min_quantity }) }}
                  </span>
                  <span class="flex items-center gap-2">
                    <span>{{ formatPrice(tier.unit_price_thb) }} {{ t('common.each') }}</span>
                    <span
                      class="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                    >
                      -{{ savingsPercent(product.price_thb, tier.unit_price_thb) }}%
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            <p class="text-muted leading-relaxed">{{ product.description }}</p>

            <div v-if="product.available_stock > 0" class="space-y-6">
              <!-- Quantity Selector -->
              <div class="flex items-center space-x-4">
                <span class="text-sm font-medium text-muted">{{ t('product.quantity') }}</span>
                <div class="flex items-center space-x-3">
                  <button
                    @click="decrement"
                    :disabled="quantity <= 1"
                    class="w-10 h-10 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-surface-alt transition-colors disabled:opacity-50"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <span class="text-lg font-semibold text-foreground w-8 text-center">
                    {{ quantity }}
                  </span>
                  <button
                    @click="increment"
                    :disabled="quantity >= 10"
                    class="w-10 h-10 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-surface-alt transition-colors disabled:opacity-50"
                  >
                    <svg
                      class="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Add to Cart -->
              <PrimaryButton
                full-width
                @click="cart.addItem({ productId: product.id, slug: product.slug, name: product.name, weightLabel: formatWeight(product.weight_g), priceSatang: product.price_thb, imageUrl: product.image_url, priceTiers: sortedTiers }, quantity)"
              >
                {{ t('product.addToCart') }}
              </PrimaryButton>
            </div>

            <form
              v-else
              class="rounded-md border border-sand bg-surface-alt p-4 space-y-4"
              @submit.prevent="submitWaitlist"
            >
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-foreground">{{ t('product.waitlistTitle') }}</h2>
                <label class="block text-sm font-medium text-muted" for="waitlist-email">
                  {{ t('product.waitlistEmailLabel') }}
                </label>
                <input
                  id="waitlist-email"
                  v-model="waitlistEmail"
                  type="email"
                  :placeholder="t('product.waitlistEmailPlaceholder')"
                  class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  :disabled="waitlistLoading || waitlistSuccess"
                />
              </div>

              <label class="flex items-start gap-3 text-sm text-muted">
                <input
                  v-model="waitlistMarketingConsent"
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-sand text-primary focus:ring-primary"
                  :disabled="waitlistLoading || waitlistSuccess"
                />
                <span>{{ t('product.waitlistMarketingConsent') }}</span>
              </label>

              <PrimaryButton full-width :disabled="waitlistLoading || waitlistSuccess">
                {{ t('product.waitlistSubmit') }}
              </PrimaryButton>

              <p v-if="waitlistError" class="text-sm text-error">{{ waitlistError }}</p>
              <p v-if="waitlistSuccess" class="text-sm text-success">{{ t('product.waitlistSuccess') }}</p>
            </form>

            <!-- Stock Indicator -->
            <p
              v-if="product.available_stock > 0"
              class="text-sm text-success flex items-center gap-1.5"
            >
              <span class="w-2 h-2 rounded-full bg-success inline-block" />
              {{ t('product.inStock') }}
            </p>
            <p v-else class="text-sm text-error flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-error inline-block" />
              {{ t('product.outOfStock') }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Details Tabs -->
    <section v-if="hasProductLineData" class="bg-surface">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div class="border-b border-sand">
          <nav class="flex space-x-8 -mb-px overflow-x-auto">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              @click="activeTab = tab.key"
              :class="[
                'py-4 px-1 text-sm font-semibold transition-colors whitespace-nowrap border-b-2',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-foreground hover:border-sand',
              ]"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <div class="pt-8">
          <div v-if="activeTab === 'nutrition'" class="max-w-md">
            <div class="space-y-3">
              <div
                v-for="(row, i) in nutritionFacts"
                :key="i"
                class="flex justify-between py-2 border-b border-sand last:border-0"
              >
                <span :class="['text-sm text-muted', row.sub && 'italic pl-6']">{{ row.label }}</span>
                <span :class="['text-sm font-semibold text-foreground', row.sub && 'italic']">{{ row.value }}</span>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'ingredients'" class="max-w-2xl">
            <ul v-if="ingredientRows.length > 0" class="space-y-1.5">
              <li
                v-for="(row, i) in ingredientRows"
                :key="i"
                :class="['text-foreground leading-relaxed', row.sub && 'italic pl-6 text-sm text-muted']"
              >
                {{ row.label }}
              </li>
            </ul>
            <p v-else class="text-foreground leading-relaxed whitespace-pre-line">{{ ingredientsText }}</p>
          </div>

          <div v-if="activeTab === 'howToUse'" class="max-w-2xl">
            <p class="text-foreground leading-relaxed whitespace-pre-line">{{ howToUseText }}</p>
          </div>

          <div v-if="activeTab === 'whoIsFor'" class="max-w-2xl">
            <p class="text-foreground leading-relaxed whitespace-pre-line">{{ whoIsForText }}</p>
          </div>

          <div v-if="activeTab === 'regulatoryInfo'" class="max-w-2xl">
            <p class="text-foreground leading-relaxed whitespace-pre-line">{{ regulatoryInfoText }}</p>
            <button
              v-if="labTestFiles.length > 0"
              type="button"
              class="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline focus:outline-none focus:underline"
              @click="openLabTests(0)"
            >
              {{ t('product.labTestsLink', { count: labTestFiles.length }) }}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Customer Reviews -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 class="text-2xl font-bold text-foreground mb-6">{{ t('reviews.title') }}</h2>
        <ReviewSummary :summary="reviewSummary" />
        <div v-if="reviewsLoading" class="mt-4 text-sm text-muted">…</div>
        <p v-else-if="reviewsError" class="mt-4 text-sm text-accent">{{ reviewsError }}</p>
        <ReviewList
          v-else
          class="mt-6"
          :reviews="productReviews"
          :page="reviewPage"
          :page-size="reviewPageSize"
          :total="reviewTotal"
          @page="setReviewPage"
        />
      </div>
    </section>

    <!-- Related Product -->
    <section v-if="relatedProduct" class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 class="text-2xl font-bold text-foreground mb-8">{{ t('product.alsoAvailable') }}</h2>
        <div class="max-w-sm">
          <ProductCard
            :product-id="relatedProduct.id"
            :name="relatedProduct.name"
            :slug="relatedProduct.slug"
            :weight="formatWeight(relatedProduct.weight_g)"
            :price-formatted="formatPrice(relatedProduct.price_thb)"
            :price-satang="relatedProduct.price_thb"
            :image-url="relatedProduct.image_url"
            :in-stock="relatedProduct.available_stock > 0"
          />
        </div>
      </div>
    </section>

    <!-- Lightbox -->
    <div
      v-if="lightboxOpen"
      class="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Product image viewer"
      @click.self="closeLightbox"
    >
      <button
        type="button"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Close image viewer"
        @click="closeLightbox"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <button
        v-if="gallery.length > 1"
        type="button"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Previous image"
        @click="lightboxPrev"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <img
        :src="activeImageUrl"
        :alt="product.name"
        class="max-w-full max-h-full object-contain select-none"
        @click.stop
      />

      <button
        v-if="gallery.length > 1"
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Next image"
        @click="lightboxNext"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Lab Test Files Viewer -->
    <div
      v-if="labTestOpen && activeLabTestFile"
      class="fixed inset-0 z-50 bg-black/90 flex flex-col p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      :aria-label="t('product.labTestsViewerLabel')"
      @click.self="closeLabTests"
    >
      <button
        type="button"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
        :aria-label="t('product.labTestsClose')"
        @click="closeLabTests"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <button
        v-if="labTestFiles.length > 1"
        type="button"
        class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
        :aria-label="t('product.labTestsPrev')"
        @click="labTestPrev"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div class="flex-1 min-h-0 flex items-center justify-center" @click.self="closeLabTests">
        <iframe
          v-if="activeLabTestFile.content_type === 'application/pdf'"
          :key="activeLabTestFile.id"
          :src="activeLabTestFile.url"
          :title="activeLabTestFile.label || 'Lab test PDF'"
          class="w-full h-full bg-white rounded-md max-w-5xl"
        />
        <img
          v-else
          :src="activeLabTestFile.url"
          :alt="activeLabTestFile.label || 'Lab test image'"
          class="max-w-full max-h-full object-contain select-none"
          @click.stop
        />
      </div>

      <button
        v-if="labTestFiles.length > 1"
        type="button"
        class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors z-10"
        :aria-label="t('product.labTestsNext')"
        @click="labTestNext"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <div class="mt-2 flex items-center justify-center gap-3 text-white text-sm">
        <span class="text-white/60">{{ labTestIndex + 1 }} / {{ labTestFiles.length }}</span>
        <a
          :href="activeLabTestFile.url"
          target="_blank"
          rel="noopener"
          class="text-white/80 hover:text-white underline text-xs"
        >
          {{ t('product.labTestsOpenNewTab') }}
        </a>
      </div>
    </div>
  </div>
</template>
