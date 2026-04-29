<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchAdminReviews, approveReview, rejectReview, deleteAdminReview, type AdminReview, type AdminReviewStatus } from '../api/adminReviews'
import AdminNav from '../components/admin/AdminNav.vue'
import { useHead } from '../composables/useHead'
import { useAdminResource } from '../composables/useAdminResource'

useHead({ title: 'Reviews — Admin', description: 'Moderate customer reviews.' })

const status = ref<AdminReviewStatus>('pending')
const rejectReasonFor = ref<number | null>(null)
const rejectReasonText = ref('')

const reviewsResource = useAdminResource<{ reviews: AdminReview[]; total: number }>({
  initial: { reviews: [], total: 0 },
  fallbackError: 'Failed to load reviews',
  async load() {
    const data = await fetchAdminReviews(status.value, 1)
    return { reviews: data.reviews, total: data.pagination.total }
  },
})

const reviews = computed(() => reviewsResource.data.value.reviews)
const loading = reviewsResource.loading
const error = reviewsResource.error

async function load() { await reviewsResource.reload() }

async function onApprove(id: number) {
  await reviewsResource.runAction(() => approveReview(id))
}

async function onReject(id: number) {
  await reviewsResource.runAction(() => rejectReview(id, rejectReasonText.value || undefined))
  if (!error.value) {
    rejectReasonFor.value = null
    rejectReasonText.value = ''
  }
}

async function onDelete(id: number) {
  if (!window.confirm('Delete this review permanently?')) return
  await reviewsResource.runAction(() => deleteAdminReview(id))
}

onMounted(() => { void load() })
</script>

<template>
  <main class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <AdminNav />
    <h1 class="text-2xl font-bold">Reviews</h1>

    <div class="flex gap-2">
      <button v-for="s in (['pending','approved','rejected'] as const)" :key="s" type="button"
        class="px-3 py-1 text-sm border border-foreground/20 rounded"
        :class="status === s ? 'bg-foreground text-background' : ''"
        @click="status = s; void load()">{{ s }}</button>
    </div>

    <p v-if="loading">Loading…</p>
    <p v-else-if="error" class="text-accent">{{ error }}</p>
    <table v-else class="w-full text-sm border-collapse">
      <thead>
        <tr class="border-b border-foreground/20 text-left">
          <th class="py-2">User</th>
          <th>Product line</th>
          <th>Rating</th>
          <th>Body</th>
          <th>Locale</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in reviews" :key="r.id" class="border-b border-foreground/10 align-top">
          <td class="py-2">{{ r.user_email }}</td>
          <td>{{ r.product_line_name }}</td>
          <td>{{ r.rating }}</td>
          <td class="max-w-md whitespace-pre-wrap">{{ r.body }}</td>
          <td>{{ r.locale }}</td>
          <td>{{ new Date(r.created_at).toLocaleString() }}</td>
          <td class="space-y-1">
            <div class="flex gap-2">
              <button v-if="r.status !== 'approved'" type="button" class="text-primary underline" @click="onApprove(r.id)">Approve</button>
              <button v-if="r.status !== 'rejected'" type="button" class="text-accent underline" @click="rejectReasonFor = r.id">Reject</button>
              <button type="button" class="text-foreground/60 underline" @click="onDelete(r.id)">Delete</button>
            </div>
            <div v-if="rejectReasonFor === r.id" class="mt-2 space-y-1">
              <input v-model="rejectReasonText" type="text" placeholder="Reason (optional)" class="border border-foreground/20 rounded p-1 text-xs w-full" />
              <div class="flex gap-2">
                <button type="button" class="text-xs underline" @click="onReject(r.id)">Confirm reject</button>
                <button type="button" class="text-xs underline text-foreground/60" @click="rejectReasonFor = null; rejectReasonText = ''">Cancel</button>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
