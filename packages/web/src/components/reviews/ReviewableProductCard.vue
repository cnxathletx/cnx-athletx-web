<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ReviewableProduct } from '../../api/reviews'

defineProps<{ product: ReviewableProduct }>()
defineEmits<{ (e: 'open'): void }>()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <article class="border border-foreground/10 rounded-lg p-4 bg-surface flex items-center justify-between gap-4">
    <div>
      <h3 class="font-semibold text-base">{{ product.name }}</h3>
      <p class="text-xs text-foreground/60">Order {{ product.orderId }}</p>
    </div>
    <button type="button" class="text-sm font-semibold underline" @click="$emit('open')">{{ t('reviews.writeReview') }}</button>
  </article>
</template>
