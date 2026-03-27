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
    class="brand-panel group rounded-[2rem] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg"
  >
    <!-- Image Container -->
    <RouterLink :to="`/product/${slug}`" class="block">
      <div class="brand-landscape relative aspect-[4/3] overflow-hidden bg-sand">
        <img
          v-if="imageUrl && !imageLoadError"
          :src="imageUrl"
          :alt="name"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          @error="imageLoadError = true"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/6 via-transparent to-accent/10 transition-transform duration-300 group-hover:scale-105"
        >
            <svg
            class="w-20 h-20 text-primary/25"
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
          class="absolute inset-0 flex items-center justify-center bg-background/60"
        >
          <span
            class="rounded-full border border-primary/30 bg-background/80 px-4 py-2 font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary"
          >
            Out of Stock
          </span>
        </div>
      </div>
    </RouterLink>

    <!-- Content -->
    <div class="space-y-4 p-6">
      <div class="space-y-3">
        <RouterLink :to="`/product/${slug}`">
          <h3 class="brand-title text-2xl text-foreground transition-colors hover:text-primary">
            {{ name }}
          </h3>
        </RouterLink>
        <AppBadge :label="weight" />
      </div>

      <div class="brand-divider" />

      <p class="font-brand text-2xl font-bold uppercase tracking-[0.04em] text-foreground">
        {{ priceFormatted }}
      </p>

      <PrimaryButton full-width :disabled="!inStock" @click="addToCart">
        {{ inStock ? 'Add to Cart' : 'Sold Out' }}
      </PrimaryButton>
    </div>
  </div>
</template>
