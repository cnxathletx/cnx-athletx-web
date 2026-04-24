<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PublicReview } from '../../api/reviews'

const props = defineProps<{ reviews: PublicReview[]; page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e: 'page', page: number): void }>()
const { t } = useI18n({ useScope: 'global' })

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const canPrev = computed(() => props.page > 1)
const canNext = computed(() => props.page < totalPages.value)

function flag(locale: 'en' | 'th'): string { return locale === 'th' ? '🇹🇭' : '🇬🇧' }

function stars(n: number): string { return '★'.repeat(n) + '☆'.repeat(5 - n) }

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString() } catch { return iso }
}
</script>

<template>
  <ul class="space-y-4">
    <li v-for="r in reviews" :key="r.id" class="border border-foreground/10 rounded-lg p-4 bg-surface">
      <div class="flex items-center justify-between gap-2">
        <div class="text-accent" :aria-label="`${r.rating} stars`">{{ stars(r.rating) }}</div>
        <div class="text-xs text-foreground/60 flex items-center gap-2">
          <span aria-hidden="true">{{ flag(r.locale) }}</span>
          <span>{{ formatDate(r.createdAt) }}</span>
        </div>
      </div>
      <div class="text-xs text-foreground/60 mt-1">{{ t('reviews.verifiedBuyer') }}</div>
      <p v-if="r.body" class="mt-2 text-sm whitespace-pre-wrap">{{ r.body }}</p>
    </li>
  </ul>

  <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 text-sm">
    <button data-testid="prev-page" type="button" :disabled="!canPrev" class="px-3 py-1 border border-foreground/20 rounded disabled:opacity-50" @click="emit('page', page - 1)">←</button>
    <span>{{ page }} / {{ totalPages }}</span>
    <button data-testid="next-page" type="button" :disabled="!canNext" class="px-3 py-1 border border-foreground/20 rounded disabled:opacity-50" @click="emit('page', page + 1)">→</button>
  </div>
</template>
