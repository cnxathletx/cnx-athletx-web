<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import GhostButton from '../components/ui/GhostButton.vue'
import { fetchProducts, formatPrice, formatWeight, type ApiProduct } from '../api/products'
import { useHead } from '../composables/useHead'
import { useJsonLd } from '../composables/useJsonLd'

const storyImageModules = import.meta.glob('../assets/photos/our-story/*.{jpeg,jpg,png,webp}', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>
const storyImages = Object.entries(storyImageModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url)
const storyIndex = ref(0)
let storyTimer: ReturnType<typeof setInterval> | null = null

const communityImageModules = import.meta.glob(
  '../assets/photos/join-the-community/*.{jpeg,jpg,png,webp}',
  { eager: true, import: 'default', query: '?url' },
) as Record<string, string>
const communityImages = Object.entries(communityImageModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url)
const communitySlots = ref<number[]>(
  Array.from({ length: 3 }, (_, i) => Math.min(i, Math.max(0, communityImages.length - 1))),
)
const communityTimeouts: ReturnType<typeof setTimeout>[] = []
const communityTimers: ReturnType<typeof setInterval>[] = []

function rotateCommunitySlot(slot: number) {
  if (communityImages.length <= 3) return
  const taken = new Set(communitySlots.value)
  const pool: number[] = []
  for (let i = 0; i < communityImages.length; i++) {
    if (!taken.has(i)) pool.push(i)
  }
  if (pool.length === 0) return
  const next = pool[Math.floor(Math.random() * pool.length)]
  const updated = [...communitySlots.value]
  updated[slot] = next
  communitySlots.value = updated
}

const { t } = useI18n({ useScope: 'global' })

useHead({
  title: undefined, // Just "CNX AthletX" for homepage
  description: 'Plant-based protein powder from Chiang Mai, Thailand. Clean athletic everyday health.',
  ogType: 'website',
  canonicalPath: '/',
})

useJsonLd(() => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'CNX AthletX',
  url: 'https://www.cnxnature.com',
  logo: 'https://www.cnxnature.com/og-image.png',
  description: 'Plant-based protein powder from Chiang Mai, Thailand.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Chiang Mai',
    addressCountry: 'TH',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'contact@cnxnature.com',
    contactType: 'customer service',
  },
}))

const products = ref<ApiProduct[]>([])
const productsLoaded = ref(false)

onMounted(async () => {
  try {
    products.value = await fetchProducts()
  } catch {
    // Silently fall back to empty — home page still renders other sections
  } finally {
    productsLoaded.value = true
  }

  if (storyImages.length > 1) {
    storyTimer = setInterval(() => {
      storyIndex.value = (storyIndex.value + 1) % storyImages.length
    }, 4000)
  }

  if (communityImages.length > 3) {
    for (let slot = 0; slot < 3; slot++) {
      const startDelay = slot * 1600
      const timeout = setTimeout(() => {
        rotateCommunitySlot(slot)
        const timer = setInterval(() => rotateCommunitySlot(slot), 5000)
        communityTimers.push(timer)
      }, startDelay)
      communityTimeouts.push(timeout)
    }
  }
})

onBeforeUnmount(() => {
  if (storyTimer) clearInterval(storyTimer)
  communityTimeouts.forEach(clearTimeout)
  communityTimers.forEach(clearInterval)
})
</script>

<template>
  <div>
    <!-- ============ HERO ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Text Column -->
          <div class="space-y-6">
            <span
              class="inline-flex items-center bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1"
            >
              {{ t('home.badge') }}
            </span>
            <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
              {{ t('home.heroTitle') }}
            </h1>
            <p class="text-lg text-muted max-w-lg leading-relaxed">
              {{ t('home.heroSubtitle') }}
            </p>
            <RouterLink to="/shop">
              <PrimaryButton size="lg">{{ t('home.shopNow') }}</PrimaryButton>
            </RouterLink>
          </div>

          <!-- Image Column -->
          <div class="aspect-[4/3] rounded-lg overflow-hidden bg-surface-alt">
            <div
              class="w-full h-full bg-gradient-to-br from-primary/15 via-sage/10 to-accent/10 flex items-center justify-center"
            >
              <div class="text-center space-y-3">
                <svg
                  class="w-24 h-24 mx-auto text-muted/30"
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
                <p class="text-sm text-muted/50">{{ t('home.productImage') }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ SOCIAL PROOF BAR ============ -->
    <section class="bg-surface-alt">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-10">
          <!-- 100% Natural — Leaf -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M20 4c0 9-5 15-13 16-1 0-3-1-3-3 0-8 6-13 16-13z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 20c4-5 9-9 15-13" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.natural') }}</span>
          </div>

          <!-- Vegan — Sprout -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 21v-9" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 12c0-3-2-5-6-5 0 4 2 6 6 6z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 11c0-4 3-7 8-7 0 5-3 8-8 8z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 21h8" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.vegan') }}</span>
          </div>

          <!-- Muscle Support — Dumbbell -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2 9v6" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M22 9v6" />
                <rect x="3" y="7" width="3" height="10" rx="1" />
                <rect x="18" y="7" width="3" height="10" rx="1" />
                <rect x="6" y="9" width="2" height="6" rx="0.5" />
                <rect x="16" y="9" width="2" height="6" rx="0.5" />
                <line x1="8" y1="12" x2="16" y2="12" stroke-width="2.25" stroke-linecap="round" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.muscleSupport') }}</span>
          </div>

          <!-- Gluten Free — Wheat with strike -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v18" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.5-1.5-3-2-4.5-1.5C8 8 9.5 9 12 9" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c1.5-1.5 3-2 4.5-1.5C16 8 14.5 9 12 9" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 13c-1.5-1.5-3-2-4.5-1.5C8 13 9.5 14 12 14" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 13c1.5-1.5 3-2 4.5-1.5C16 13 14.5 14 12 14" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18c-1.5-1.5-3-2-4.5-1.5C8 18 9.5 19 12 19" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18c1.5-1.5 3-2 4.5-1.5C16 18 14.5 19 12 19" />
                <line x1="4" y1="4" x2="20" y2="20" stroke-width="2.25" stroke-linecap="round" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.glutenFree') }}</span>
          </div>

          <!-- Dairy Free — Milk carton with strike -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 3h6v3l1.5 3v10a2 2 0 01-2 2h-5a2 2 0 01-2-2V9L9 6V3z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 6h6" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 13h4" />
                <line x1="4" y1="4" x2="20" y2="20" stroke-width="2.25" stroke-linecap="round" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.dairyFree') }}</span>
          </div>

          <!-- No Added Sugar — Sugar cubes with strike -->
          <div class="group flex flex-col items-center text-center space-y-3">
            <div class="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-200 group-hover:bg-primary/15 group-hover:-translate-y-0.5">
              <svg class="w-8 h-8 text-primary" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <rect x="3" y="13" width="8" height="8" rx="1" />
                <rect x="13" y="13" width="8" height="8" rx="1" />
                <rect x="8" y="3" width="8" height="8" rx="1" />
                <line x1="4" y1="4" x2="20" y2="20" stroke-width="2.25" stroke-linecap="round" />
              </svg>
            </div>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.noAddedSugar') }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ FEATURED PRODUCTS ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h2 class="text-3xl sm:text-4xl font-bold text-foreground text-center mb-12">
          {{ t('home.ourProducts') }}
        </h2>
        <div v-if="productsLoaded && products.length" class="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <ProductCard
            v-for="product in products"
            :key="product.id"
            :product-id="product.id"
            :name="product.name"
            :slug="product.slug"
            :weight="formatWeight(product.weight_g)"
            :price-formatted="formatPrice(product.price_thb)"
            :price-satang="product.price_thb"
            :image-url="product.image_url"
            :in-stock="product.available_stock > 0"
          />
        </div>
        <!-- Loading skeleton -->
        <div v-else-if="!productsLoaded" class="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
          <div
            v-for="i in 2"
            :key="i"
            class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] overflow-hidden animate-pulse"
          >
            <div class="aspect-[4/3] bg-sand" />
            <div class="p-6 space-y-4">
              <div class="h-6 bg-sand rounded w-3/4" />
              <div class="h-6 bg-sand rounded w-1/4" />
              <div class="h-8 bg-sand rounded w-1/3" />
              <div class="h-12 bg-sand rounded" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ BRAND STORY ============ -->
    <section class="bg-surface-alt">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Text Column -->
          <div class="space-y-6">
            <span class="text-xs font-medium uppercase tracking-[0.05em] text-primary">
              {{ t('home.ourStory') }}
            </span>
            <h2 class="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              {{ t('home.brandStoryTitle') }}
            </h2>
            <div class="space-y-4 text-muted leading-relaxed">
              <p>{{ t('home.brandStoryP1') }}</p>
              <p>{{ t('home.brandStoryP2') }}</p>
            </div>
            <RouterLink to="/about">
              <GhostButton>{{ t('home.learnMore') }}</GhostButton>
            </RouterLink>
          </div>

          <!-- Image Column -->
          <div
            class="relative aspect-[4/3] rounded-lg overflow-hidden bg-surface ring-1 ring-[var(--card-ring)]"
          >
            <transition name="story-fade" mode="default">
              <img
                :key="storyImages[storyIndex]"
                :src="storyImages[storyIndex]"
                :alt="t('home.brandStoryTitle')"
                class="absolute inset-0 w-full h-full object-cover"
                decoding="async"
              />
            </transition>
            <div
              v-if="storyImages.length > 1"
              class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5"
            >
              <button
                v-for="(_, i) in storyImages"
                :key="i"
                type="button"
                class="h-1.5 rounded-full transition-all"
                :class="i === storyIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75'"
                :aria-label="`Show image ${i + 1}`"
                @click="storyIndex = i"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ COMMUNITY ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h2 class="text-3xl sm:text-4xl font-bold text-foreground text-center mb-12">
          {{ t('home.communityTitle') }}
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="(slotIdx, i) in communitySlots"
            :key="i"
            class="relative aspect-[4/3] rounded-lg overflow-hidden bg-surface ring-1 ring-[var(--card-ring)]"
          >
            <transition name="story-fade" mode="default">
              <img
                :key="communityImages[slotIdx]"
                :src="communityImages[slotIdx]"
                :alt="t('home.communityTitle')"
                class="absolute inset-0 w-full h-full object-cover"
                decoding="async"
                loading="lazy"
              />
            </transition>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ CTA BANNER ============ -->
    <section class="bg-primary">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 text-center space-y-6">
        <h2 class="text-3xl sm:text-4xl font-bold text-background">
          {{ t('home.ctaTitle') }}
        </h2>
        <RouterLink to="/shop">
          <PrimaryButton variant="inverse" size="lg">{{ t('home.ctaButton') }}</PrimaryButton>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.story-fade-enter-active,
.story-fade-leave-active {
  transition: opacity 800ms ease-in-out;
}
.story-fade-enter-from,
.story-fade-leave-to {
  opacity: 0;
}
</style>
