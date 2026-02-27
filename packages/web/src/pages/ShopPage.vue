<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ProductCard from '../components/ui/ProductCard.vue'
import { fetchProducts, formatPrice, formatWeight, type ApiProduct } from '../api/products'

const products = ref<ApiProduct[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    products.value = await fetchProducts()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <!-- ============ HEADER ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h1 class="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">Shop</h1>
        <p class="mt-4 text-lg text-muted">Choose your plant-based protein powder</p>
      </div>
    </section>

    <!-- ============ PRODUCT GRID ============ -->
    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
        <!-- Loading State -->
        <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
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

        <!-- Error State -->
        <div v-else-if="error" class="text-center py-12 space-y-4">
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
          <p class="text-foreground font-semibold">Failed to load products</p>
          <p class="text-sm text-muted">{{ error }}</p>
          <button
            @click="$router.go(0)"
            class="text-primary font-semibold hover:underline underline-offset-4"
          >
            Try again
          </button>
        </div>

        <!-- Products -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
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
      </div>
    </section>

    <!-- ============ TRUST BAR ============ -->
    <section class="bg-surface-alt">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-8">
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
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">Free Shipping over ฿1,500</span>
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">100% Quality Guarantee</span>
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
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span class="text-sm font-semibold text-foreground">Secure Payment</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
