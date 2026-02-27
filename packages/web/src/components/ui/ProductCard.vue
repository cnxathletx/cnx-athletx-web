<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppBadge from './AppBadge.vue'
import PrimaryButton from './PrimaryButton.vue'
import { useCartStore } from '../../stores/cart'

const props = defineProps<{
  productId: number
  name: string
  slug: string
  weight: string
  priceFormatted: string
  priceSatang: number
  imageUrl: string
  inStock: boolean
}>()

const cart = useCartStore()
const imageLoadError = ref(false)

watch(
  () => props.imageUrl,
  () => {
    imageLoadError.value = false
  }
)

function addToCart() {
  cart.addItem({
    productId: props.productId,
    slug: props.slug,
    name: props.name,
    weightLabel: props.weight,
    priceSatang: props.priceSatang,
    imageUrl: props.imageUrl,
  })
}
</script>

<template>
  <div
    class="group bg-surface rounded-lg shadow-sm ring-1 ring-[var(--card-ring)] overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1"
  >
    <!-- Image Container -->
    <RouterLink :to="`/product/${slug}`" class="block">
      <div class="aspect-[4/3] overflow-hidden bg-sand relative">
        <img
          v-if="imageUrl && !imageLoadError"
          :src="imageUrl"
          :alt="name"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          @error="imageLoadError = true"
        />
        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-primary/20 via-sage/15 to-primary/10 flex items-center justify-center transition-transform duration-300 group-hover:scale-105"
        >
          <svg
            class="w-20 h-20 text-muted/40"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <!-- Out of Stock Overlay -->
        <div
          v-if="!inStock"
          class="absolute inset-0 bg-foreground/30 flex items-center justify-center"
        >
          <span
            class="bg-foreground/80 text-background text-sm font-semibold px-4 py-2 rounded-md"
          >
            Out of Stock
          </span>
        </div>
      </div>
    </RouterLink>

    <!-- Content -->
    <div class="p-6 space-y-4">
      <div class="space-y-2">
        <RouterLink :to="`/product/${slug}`">
          <h3 class="text-xl font-semibold text-foreground hover:text-primary transition-colors">
            {{ name }}
          </h3>
        </RouterLink>
        <AppBadge :label="weight" />
      </div>

      <p class="text-2xl font-bold text-foreground">{{ priceFormatted }}</p>

      <PrimaryButton full-width :disabled="!inStock" @click="addToCart">
        {{ inStock ? 'Add to Cart' : 'Sold Out' }}
      </PrimaryButton>
    </div>
  </div>
</template>
