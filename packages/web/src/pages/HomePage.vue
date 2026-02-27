<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import GhostButton from '../components/ui/GhostButton.vue'
import { fetchProducts, formatPrice, formatWeight, type ApiProduct } from '../api/products'

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
              Plant-Based Power
            </span>
            <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
              Fuel Your Active Life
            </h1>
            <p class="text-lg text-muted max-w-lg leading-relaxed">
              Premium plant-based protein powder from Chiang Mai's athletic community. Clean
              ingredients, real results.
            </p>
            <RouterLink to="/shop">
              <PrimaryButton size="lg">Shop Now</PrimaryButton>
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
                <p class="text-sm text-muted/50">Product Image</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ SOCIAL PROOF BAR ============ -->
    <section class="bg-surface-alt">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8">
          <div class="flex flex-col items-center text-center space-y-2">
            <svg
              class="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">100% Plant-Based</span>
          </div>
          <div class="flex flex-col items-center text-center space-y-2">
            <svg
              class="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">Made in Thailand</span>
          </div>
          <div class="flex flex-col items-center text-center space-y-2">
            <svg
              class="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">Community Tested</span>
          </div>
          <div class="flex flex-col items-center text-center space-y-2">
            <svg
              class="w-8 h-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">Natural Ingredients</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ FEATURED PRODUCTS ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <h2 class="text-3xl sm:text-4xl font-bold text-foreground text-center mb-12">
          Our Products
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
              Our Story
            </span>
            <h2 class="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
              Born in Chiang Mai's Active Community
            </h2>
            <div class="space-y-4 text-muted leading-relaxed">
              <p>
                CNX AthletX started with a simple idea: clean, plant-based nutrition for people who
                move. Founded by athletes and wellness enthusiasts in the heart of Chiang Mai, we
                wanted a protein powder that matched our values — no fillers, no artificial
                sweeteners, just real ingredients.
              </p>
              <p>
                Every scoop is designed for the runners, climbers, yogis, and gym-goers who make
                this city one of Southeast Asia's most active communities.
              </p>
            </div>
            <GhostButton>Learn More</GhostButton>
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
                <p class="text-sm text-muted/50">Community Photo</p>
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
          Join the Community
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
                <p class="text-xs text-muted/40">Community Image {{ i }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ CTA BANNER ============ -->
    <section class="bg-primary">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 text-center space-y-6">
        <h2 class="text-3xl sm:text-4xl font-bold text-surface">
          Ready to fuel your next session?
        </h2>
        <RouterLink to="/shop">
          <PrimaryButton variant="inverse" size="lg">Shop Now</PrimaryButton>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
