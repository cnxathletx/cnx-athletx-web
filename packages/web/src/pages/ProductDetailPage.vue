<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import {
  fetchProductBySlug,
  fetchProducts,
  formatPrice,
  formatWeight,
  type ApiProduct,
} from '../api/products'
import { useCartStore } from '../stores/cart'

const cart = useCartStore()

const route = useRoute()

const product = ref<ApiProduct | null>(null)
const relatedProduct = ref<ApiProduct | null>(null)
const loading = ref(true)
const error = ref('')
const quantity = ref(1)
const productImageError = ref(false)

const activeTab = ref<'nutrition' | 'ingredients' | 'howToUse'>('nutrition')

const tabs = [
  { key: 'nutrition' as const, label: 'Nutrition Facts' },
  { key: 'ingredients' as const, label: 'Ingredients' },
  { key: 'howToUse' as const, label: 'How to Use' },
]

// Static product detail data (will come from API in later phases)
const nutritionFacts: Record<string, string> = {
  'Serving Size': '30g (1 scoop)',
  Calories: '120',
  Protein: '25g',
  Carbohydrates: '3g',
  Fat: '1.5g',
  Fiber: '2g',
  Sodium: '150mg',
}

const ingredientsText =
  'Pea protein isolate, brown rice protein concentrate, natural vanilla flavoring, coconut MCT powder, sea salt, stevia leaf extract.'

const howToUseText =
  'Mix one scoop (30g) with 250-300ml of cold water, plant milk, or your favorite smoothie. Shake or blend well. Best consumed within 30 minutes after training. Can also be added to oatmeal, pancakes, or baked goods.'

async function loadProduct(slug: string) {
  loading.value = true
  error.value = ''
  quantity.value = 1
  activeTab.value = 'nutrition'
  productImageError.value = false

  try {
    product.value = await fetchProductBySlug(slug)

    // Fetch related product
    const allProducts = await fetchProducts()
    relatedProduct.value = allProducts.find((p) => p.slug !== slug) || null
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

function addCurrentProductToCart() {
  if (!product.value) return

  cart.addItem(
    {
      productId: product.value.id,
      slug: product.value.slug,
      name: product.value.name,
      weightLabel: formatWeight(product.value.weight_g),
      priceSatang: product.value.price_thb,
      imageUrl: product.value.image_url,
    },
    quantity.value,
  )
}

watch(
  () => route.params.slug as string,
  (slug) => {
    if (slug) loadProduct(slug)
  },
  { immediate: true }
)
</script>

<template>
  <!-- Loading State -->
  <div v-if="loading" class="bg-background">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
        <div class="aspect-square rounded-[2rem] bg-surface" />
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
      <h1 class="brand-title text-3xl text-foreground">
        {{ error === 'Product not found' ? 'Product Not Found' : 'Error Loading Product' }}
      </h1>
      <p class="text-muted">{{ error }}</p>
      <RouterLink to="/shop">
        <PrimaryButton>Back to Shop</PrimaryButton>
      </RouterLink>
    </div>
  </div>

  <!-- Product Content -->
  <div v-else-if="product">
    <!-- Breadcrumb -->
    <section class="border-b border-[var(--grid-line)] bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-4">
        <nav class="flex items-center space-x-2 text-sm text-muted">
          <RouterLink to="/" class="hover:text-foreground transition-colors">Home</RouterLink>
          <span>/</span>
          <RouterLink to="/shop" class="hover:text-foreground transition-colors">Shop</RouterLink>
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
          <div
            class="brand-panel brand-landscape aspect-square overflow-hidden rounded-[2rem]"
          >
            <img
              v-if="product.image_url && !productImageError"
              :src="product.image_url"
              :alt="product.name"
              class="w-full h-full object-cover"
              @error="productImageError = true"
            />
            <div
              v-else
              class="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/6 via-transparent to-accent/10"
            >
              <div class="text-center space-y-3">
                <svg
                  class="mx-auto h-32 w-32 text-primary/25"
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
                <p class="text-sm text-muted/40">Product Image</p>
              </div>
            </div>
          </div>

          <!-- Info Column -->
          <div class="space-y-6">
            <div class="space-y-3">
              <span class="brand-kicker text-accent">Performance Formula</span>
              <h1 class="brand-title text-4xl text-foreground sm:text-5xl">{{ product.name }}</h1>
              <AppBadge :label="formatWeight(product.weight_g)" />
            </div>

            <p class="font-brand text-4xl font-bold uppercase tracking-[0.04em] text-foreground">
              {{ formatPrice(product.price_thb) }}
            </p>

            <p class="max-w-xl text-muted leading-relaxed">{{ product.description }}</p>

            <!-- Quantity Selector -->
            <div class="rounded-[1.75rem] border border-[var(--card-ring)] bg-[var(--panel-wash)] p-5">
              <div class="flex items-center space-x-4">
                <span
                  class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Quantity
                </span>
                <div class="flex items-center space-x-3">
                  <button
                    @click="decrement"
                    :disabled="quantity <= 1"
                    class="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-ring)] text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
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
                  <span class="w-8 text-center text-lg font-semibold text-foreground">
                    {{ quantity }}
                  </span>
                  <button
                    @click="increment"
                    :disabled="quantity >= 10"
                    class="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--card-ring)] text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
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
            </div>

            <!-- Add to Cart -->
            <PrimaryButton
              full-width
              :disabled="product.available_stock <= 0"
              @click="addCurrentProductToCart"
            >
              {{ product.available_stock > 0 ? 'Add to Cart' : 'Sold Out' }}
            </PrimaryButton>

            <!-- Stock Indicator -->
            <p
              v-if="product.available_stock > 0"
              class="text-sm text-success flex items-center gap-1.5"
            >
              <span class="w-2 h-2 rounded-full bg-success inline-block" />
              In Stock
            </p>
            <p v-else class="text-sm text-error flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-error inline-block" />
              Out of Stock
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Details Tabs -->
    <section class="border-y border-[var(--grid-line)] bg-surface">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div class="border-b border-sand">
          <nav class="flex space-x-8 -mb-px overflow-x-auto">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              @click="activeTab = tab.key"
              :class="[
                'border-b-2 px-1 py-4 font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors whitespace-nowrap',
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
          <div v-if="activeTab === 'nutrition'" class="max-w-md rounded-[1.75rem] border border-[var(--card-ring)] bg-[var(--panel-wash)] p-6">
            <div class="space-y-3">
              <div
                v-for="(value, label) in nutritionFacts"
                :key="label"
                class="flex justify-between py-2 border-b border-sand last:border-0"
              >
                <span class="text-sm text-muted">{{ label }}</span>
                <span class="text-sm font-semibold text-foreground">{{ value }}</span>
              </div>
            </div>
          </div>

          <div v-if="activeTab === 'ingredients'" class="max-w-2xl rounded-[1.75rem] border border-[var(--card-ring)] bg-[var(--panel-wash)] p-6">
            <p class="text-foreground leading-relaxed">{{ ingredientsText }}</p>
          </div>

          <div v-if="activeTab === 'howToUse'" class="max-w-2xl rounded-[1.75rem] border border-[var(--card-ring)] bg-[var(--panel-wash)] p-6">
            <p class="text-foreground leading-relaxed">{{ howToUseText }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Related Product -->
    <section v-if="relatedProduct" class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <h2 class="brand-title mb-8 text-2xl text-foreground">Also Available</h2>
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
  </div>
</template>
