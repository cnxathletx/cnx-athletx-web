<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCartStore, unitPriceFor, lineTotalFor } from '../stores/cart'
import { nextTier } from '../utils/pricing'
import { formatPrice } from '../api/products'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AppBadge from '../components/ui/AppBadge.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import { useHead } from '../composables/useHead'

const { t } = useI18n({ useScope: 'global' })

useHead({ title: 'Cart', description: 'Review your cart before checkout.' })

const cart = useCartStore()

function increment(productId: number, current: number) {
  cart.updateQuantity(productId, current + 1)
}

function decrement(productId: number, current: number) {
  cart.updateQuantity(productId, current - 1)
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <CheckoutStepper :current-step="1" />

    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
      <h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-8">{{ t('cart.title') }}</h1>

      <!-- Empty State -->
      <div v-if="cart.items.length === 0" class="text-center py-16 space-y-4">
        <svg
          class="w-16 h-16 mx-auto text-muted/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
        <p class="text-xl font-semibold text-foreground">{{ t('cart.empty') }}</p>
        <p class="text-muted">{{ t('cart.emptySubtitle') }}</p>
        <RouterLink to="/shop">
          <SecondaryButton>{{ t('cart.continueShopping') }}</SecondaryButton>
        </RouterLink>
      </div>

      <!-- Cart Content -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Items Column -->
        <div class="lg:col-span-2 space-y-0">
          <div
            v-for="item in cart.items"
            :key="item.productId"
            class="flex flex-col sm:flex-row sm:items-center gap-4 py-6 border-b border-sand"
          >
            <!-- Product Image -->
            <RouterLink :to="`/product/${item.slug}`" class="shrink-0">
              <div
                class="w-24 h-24 rounded-md bg-gradient-to-br from-primary/15 via-sage/10 to-primary/5 flex items-center justify-center overflow-hidden"
              >
                <img
                  v-if="item.imageUrl"
                  :src="item.imageUrl"
                  :alt="item.name"
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
                <svg
                  v-else
                  class="w-10 h-10 text-muted/30"
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
            </RouterLink>

            <!-- Product Info -->
            <div class="flex-1 space-y-1">
              <RouterLink :to="`/product/${item.slug}`">
                <h3 class="text-lg font-semibold text-foreground hover:text-primary transition-colors">
                  {{ item.name }}
                </h3>
              </RouterLink>
              <AppBadge :label="item.weightLabel" />
              <p class="text-sm">
                <span
                  v-if="unitPriceFor(item) < item.priceSatang"
                  class="font-semibold text-foreground"
                >
                  {{ formatPrice(unitPriceFor(item)) }}
                </span>
                <span
                  v-if="unitPriceFor(item) < item.priceSatang"
                  class="ml-2 text-muted line-through"
                >
                  {{ formatPrice(item.priceSatang) }}
                </span>
                <span v-else class="text-muted">{{ formatPrice(item.priceSatang) }}</span>
                <span class="ml-1 text-muted">{{ t('common.each') }}</span>
              </p>
              <p
                v-if="unitPriceFor(item) < item.priceSatang"
                class="text-xs font-medium text-success"
              >
                {{ t('product.tierApplied') }}
              </p>
              <p
                v-else-if="nextTier(item.priceTiers ?? [], item.quantity)"
                class="text-xs text-muted"
              >
                {{
                  t('product.addMoreForDiscount', {
                    needed: nextTier(item.priceTiers ?? [], item.quantity)!.min_quantity - item.quantity,
                    price: formatPrice(nextTier(item.priceTiers ?? [], item.quantity)!.unit_price_thb),
                  })
                }}
              </p>
            </div>

            <!-- Quantity Selector -->
            <div class="flex items-center space-x-3">
              <button
                @click="decrement(item.productId, item.quantity)"
                :disabled="item.quantity <= 1"
                class="w-9 h-9 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-surface-alt transition-colors disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                </svg>
              </button>
              <span class="text-lg font-semibold text-foreground w-8 text-center">
                {{ item.quantity }}
              </span>
              <button
                @click="increment(item.productId, item.quantity)"
                :disabled="item.quantity >= 10"
                class="w-9 h-9 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-surface-alt transition-colors disabled:opacity-50"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            <!-- Line Total -->
            <p class="text-xl font-bold text-foreground w-28 text-right">
              {{ formatPrice(lineTotalFor(item)) }}
            </p>

            <!-- Remove Button -->
            <button
              @click="cart.removeItem(item.productId)"
              class="p-2 text-error hover:text-error/80 transition-colors"
              aria-label="Remove item"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Order Summary Sidebar -->
        <div class="lg:col-span-1">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4 sticky top-20">
            <h2 class="text-xl font-bold text-foreground">{{ t('cart.orderSummary') }}</h2>

            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">{{ t('cart.subtotal') }} ({{ cart.totalItems }} {{ t('common.items') }})</span>
                <span class="font-semibold text-foreground">{{ formatPrice(cart.subtotalSatang) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">{{ t('cart.shipping') }}</span>
                <span class="text-muted">{{ t('common.calculatedAtCheckout') }}</span>
              </div>
            </div>

            <div class="border-t border-sand pt-4">
              <div class="flex justify-between">
                <span class="text-lg font-bold text-foreground">{{ t('cart.total') }}</span>
                <span class="text-lg font-bold text-foreground">{{ formatPrice(cart.subtotalSatang) }}</span>
              </div>
            </div>

            <RouterLink to="/checkout">
              <PrimaryButton full-width size="lg">{{ t('cart.checkout') }}</PrimaryButton>
            </RouterLink>

            <RouterLink to="/shop" class="block text-center">
              <button class="text-primary font-semibold text-sm hover:underline underline-offset-4">
                {{ t('cart.continueShopping') }}
              </button>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
