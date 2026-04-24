<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { submitReview, ReviewApiError, type MyReview } from '../../api/reviews'
import PrimaryButton from '../ui/PrimaryButton.vue'

const props = defineProps<{ productLineId: number }>()
const emit = defineEmits<{ (e: 'submitted', review: MyReview): void; (e: 'cancel'): void }>()
const { t, locale } = useI18n({ useScope: 'global' })

const rating = ref(0)
const body = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const charCount = computed(() => body.value.length)
const trimmedBody = computed(() => body.value.trim())

function setBody(value: string) {
  body.value = value.slice(0, 1000)
}

async function onSubmit() {
  if (rating.value < 1 || rating.value > 5) return
  submitting.value = true
  error.value = null
  try {
    const review = await submitReview({
      productLineId: props.productLineId,
      rating: rating.value,
      body: trimmedBody.value || undefined,
      locale: (locale.value as string) === 'th' ? 'th' : 'en',
    })
    emit('submitted', review)
  } catch (e) {
    if (e instanceof ReviewApiError) {
      if (e.status === 403) error.value = t('reviews.errorEligibility')
      else if (e.status === 409) error.value = t('reviews.errorDuplicate')
      else error.value = t('reviews.errorGeneric')
    } else {
      error.value = t('reviews.errorGeneric')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="onSubmit">
    <div>
      <label class="block text-sm font-medium mb-2">{{ t('reviews.ratingLabel') }}</label>
      <div class="flex gap-1 text-2xl text-accent" role="radiogroup">
        <button
          v-for="n in [1, 2, 3, 4, 5]"
          :key="n"
          type="button"
          :data-testid="`star-${n}`"
          :aria-checked="rating >= n"
          role="radio"
          class="focus:outline-none focus:ring-2 focus:ring-primary rounded"
          @click="rating = n"
        >{{ rating >= n ? '★' : '☆' }}</button>
      </div>
      <div data-testid="rating-value" class="sr-only">{{ rating }}</div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-2" for="review-body">{{ t('reviews.bodyLabel') }}</label>
      <textarea
        id="review-body"
        :value="body"
        rows="4"
        :placeholder="t('reviews.bodyPlaceholder')"
        class="w-full border border-foreground/20 rounded p-2 bg-surface"
        @input="setBody(($event.target as HTMLTextAreaElement).value)"
      />
      <div class="text-xs text-foreground/60 text-right mt-1">{{ t('reviews.charCount', { count: charCount }) }}</div>
    </div>

    <p v-if="error" class="text-sm text-accent">{{ error }}</p>

    <div class="flex gap-2 justify-end">
      <button type="button" class="px-4 py-2 text-sm" @click="emit('cancel')">Cancel</button>
      <PrimaryButton type="submit" :disabled="submitting || rating < 1">{{ t('reviews.submit') }}</PrimaryButton>
    </div>
  </form>
</template>
