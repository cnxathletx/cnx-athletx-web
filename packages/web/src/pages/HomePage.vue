<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import GhostButton from '../components/ui/GhostButton.vue'
import { fetchProducts, formatPrice, formatWeight, type ApiProduct } from '../api/products'
import { useHead } from '../composables/useHead'
import { useJsonLd } from '../composables/useJsonLd'

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
  logo: 'https://www.cnxnature.com/og-default.jpg',
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
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8">
          <!-- 100% Natural -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M7 12c1-4 4-6 5-6s4 2 5 6c-1 4-4 6-5 6s-4-2-5-6z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12" />
            </svg>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.natural') }}</span>
          </div>
          <!-- Vegan -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 8c-2 0-4.5 1-5 5-1.5-3-1-6.5 3-8" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 20c1-6 4-10 6-12 2 2 5 6 6 12" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 12v8" />
            </svg>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.vegan') }}</span>
          </div>
          <!-- Muscle Support -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 15c1-2 2-4 4-4s2 3 4 3 2-3 4-3 3 2 4 4" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 15h1M20 15h1" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 11c0-2 1-4 3-4M15 7c2 0 3 2 3 4" />
            </svg>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.muscleSupport') }}</span>
          </div>
          <!-- Gluten Free -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v18" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 6c2 1 2 3 4 3s2-2 4-3M8 10c2 1 2 3 4 3s2-2 4-3M8 14c2 1 2 3 4 3s2-2 4-3" />
              <line x1="4" y1="4" x2="20" y2="20" stroke-width="2" />
            </svg>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.glutenFree') }}</span>
          </div>
          <!-- Dairy Free -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 4h6l1 4v10a2 2 0 01-2 2h-4a2 2 0 01-2-2V8l1-4z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 11h6" />
              <line x1="5" y1="4" x2="19" y2="20" stroke-width="2" />
            </svg>
            <span class="text-sm font-semibold text-foreground">{{ t('home.socialProof.dairyFree') }}</span>
          </div>
          <!-- No Added Sugar -->
          <div class="flex flex-col items-center text-center space-y-2">
            <svg class="w-9 h-9 text-primary" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 10h4M10 14h2" />
              <line x1="5" y1="4" x2="19" y2="20" stroke-width="2" />
            </svg>
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
          <div class="aspect-[4/3] rounded-lg overflow-hidden bg-surface">
            <div
              class="w-full h-full bg-gradient-to-tr from-primary/10 via-sage/15 to-primary/5 flex items-center justify-center"
            >
              <div class="text-center space-y-3">
                <svg
                  class="w-20 h-20 mx-auto text-muted/30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p class="text-sm text-muted/50">{{ t('home.communityImage') }}</p>
              </div>
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
            v-for="i in 3"
            :key="i"
            class="aspect-[4/3] rounded-lg overflow-hidden bg-surface ring-1 ring-[var(--card-ring)]"
          >
            <div
              class="w-full h-full bg-gradient-to-br flex items-center justify-center"
              :class="[
                i === 1
                  ? 'from-primary/10 via-sage/5 to-transparent'
                  : i === 2
                    ? 'from-sage/10 via-primary/5 to-transparent'
                    : 'from-accent/5 via-sage/10 to-transparent',
              ]"
            >
              <div class="text-center space-y-2">
                <svg
                  class="w-12 h-12 mx-auto text-muted/25"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p class="text-xs text-muted/40">{{ t('home.communityImage') }} {{ i }}</p>
              </div>
            </div>
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
