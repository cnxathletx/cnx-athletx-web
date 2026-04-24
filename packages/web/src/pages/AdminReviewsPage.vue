<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAdminReviews, approveReview, rejectReview, deleteAdminReview, type AdminReview, type AdminReviewStatus } from '../api/adminReviews'
import AdminNav from '../components/admin/AdminNav.vue'
import { useHead } from '../composables/useHead'

useHead({ title: 'Reviews — Admin', description: 'Moderate customer reviews.' })

const status = ref<AdminReviewStatus>('pending')
const reviews = ref<AdminReview[]>([])
const total = ref(0)
const loading = ref(false)
const error = ref<string | null>(null)
const rejectReasonFor = ref<number | null>(null)
const rejectReasonText = ref('')

async function load() {
  loading.value = true
  error.value = null
  try {
    const data = await fetchAdminReviews(status.value, 1)
    reviews.value = data.reviews
    total.value = data.pagination.total
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load reviews'
  } finally {
    loading.value = false
  }
}

async function onApprove(id: number) { await approveReview(id); await load() }

async function onReject(id: number) {
  await rejectReview(id, rejectReasonText.value || undefined)
  rejectReasonFor.value = null
  rejectReasonText.value = ''
  await load()
}

async function onDelete(id: number) {
  if (!window.confirm('Delete this review permanently?')) return
  await deleteAdminReview(id)
  await load()
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
