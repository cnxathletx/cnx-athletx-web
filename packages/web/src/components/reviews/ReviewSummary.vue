<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReviewSummary } from '../../api/reviews'

const props = defineProps<{ summary: ReviewSummary }>()
const { t } = useI18n({ useScope: 'global' })

const avgFormatted = computed(() => props.summary.avgRating == null ? '–' : props.summary.avgRating.toFixed(1))
const stars = computed(() => {
  const value = props.summary.avgRating ?? 0
  return [1, 2, 3, 4, 5].map((n) => n <= Math.round(value))
})
</script>

<template>
  <section v-if="summary.count === 0" class="text-sm text-foreground/70">
    {{ t('reviews.empty') }}
  </section>
  <section v-else class="flex items-start gap-6 flex-wrap">
    <div>
      <div class="text-3xl font-semibold">{{ avgFormatted }}</div>
      <div class="flex gap-0.5 text-accent" aria-label="rating stars">
        <span v-for="(filled, i) in stars" :key="i">{{ filled ? '★' : '☆' }}</span>
      </div>
      <div class="text-sm text-foreground/70 mt-1">{{ t('reviews.summaryCount', { count: summary.count }, summary.count) }}</div>
    </div>
    <ul class="flex-1 min-w-[200px] space-y-1 text-sm">
      <li v-for="n in [5, 4, 3, 2, 1]" :key="n" class="flex items-center gap-2">
        <span class="w-3 text-right">{{ n }}</span>
        <span class="flex-1 h-2 bg-foreground/10 rounded">
          <span class="block h-2 bg-primary rounded" :style="{ width: summary.count ? `${(summary.distribution[String(n) as '1' | '2' | '3' | '4' | '5'] / summary.count) * 100}%` : '0%' }"></span>
        </span>
        <span class="w-8 text-right text-foreground/60">{{ summary.distribution[String(n) as '1' | '2' | '3' | '4' | '5'] }}</span>
      </li>
    </ul>
  </section>
</template>
