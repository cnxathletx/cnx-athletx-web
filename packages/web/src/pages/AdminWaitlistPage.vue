<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminNav from '../components/admin/AdminNav.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import {
  AdminApiErrorResponse,
  fetchAdminWaitlist,
  type AdminWaitlistRow,
  type AdminWaitlistStatus,
} from '../api/admin'

const rows = ref<AdminWaitlistRow[]>([])
const status = ref<AdminWaitlistStatus>('active')
const loading = ref(true)
const error = ref('')

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function loadRows(nextStatus: AdminWaitlistStatus = status.value) {
  status.value = nextStatus
  loading.value = true
  error.value = ''
  try {
    rows.value = await fetchAdminWaitlist(nextStatus)
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load waitlist.'
  } finally {
    loading.value = false
  }
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function exportCsv() {
  const header = ['product_name', 'product_slug', 'email', 'marketing_consent', 'locale', 'created_at', 'notified_at']
  const lines = [
    header.join(','),
    ...rows.value.map((row) => [
      row.product_name,
      row.product_slug,
      row.email,
      row.marketing_consent ? 'yes' : 'no',
      row.locale,
      row.created_at,
      row.notified_at ?? '',
    ].map(csvEscape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `waitlist-${status.value}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  void loadRows('active')
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Waitlist</h1>
          <p class="text-sm text-muted mt-1">View back-in-stock requests and marketing consent.</p>
        </div>
        <AdminNav />
      </div>

      <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div class="flex gap-2 flex-wrap">
          <button
            v-for="item in ['active', 'notified', 'all']"
            :key="item"
            type="button"
            :data-status="item"
            :class="[
              'px-4 py-2 rounded-md text-sm font-semibold border transition-colors',
              status === item ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-foreground border-sand hover:border-foreground',
            ]"
            @click="loadRows(item as AdminWaitlistStatus)"
          >
            {{ item[0].toUpperCase() + item.slice(1) }}
          </button>
        </div>
        <SecondaryButton :disabled="rows.length === 0" @click="exportCsv">Export CSV</SecondaryButton>
      </div>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-12 bg-muted/10 rounded" />
        <div class="h-12 bg-muted/10 rounded" />
      </div>

      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">
        {{ error }}
      </div>

      <div v-else-if="rows.length === 0" class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 text-sm text-muted">
        No waitlist signups found.
      </div>

      <div v-else class="overflow-x-auto bg-surface rounded-lg ring-1 ring-[var(--card-ring)]">
        <table class="min-w-full text-sm">
          <thead class="bg-surface-alt text-muted">
            <tr>
              <th class="px-4 py-3 text-left font-semibold">Product</th>
              <th class="px-4 py-3 text-left font-semibold">Email</th>
              <th class="px-4 py-3 text-left font-semibold">Marketing</th>
              <th class="px-4 py-3 text-left font-semibold">Locale</th>
              <th class="px-4 py-3 text-left font-semibold">Created</th>
              <th class="px-4 py-3 text-left font-semibold">Notified</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-t border-sand">
              <td class="px-4 py-3">
                <p class="font-semibold text-foreground">{{ row.product_name }}</p>
                <p class="text-xs text-muted font-mono">{{ row.product_slug }}</p>
              </td>
              <td class="px-4 py-3 text-foreground">{{ row.email }}</td>
              <td class="px-4 py-3 text-foreground">{{ row.marketing_consent ? 'Yes' : 'No' }}</td>
              <td class="px-4 py-3 text-foreground">{{ row.locale }}</td>
              <td class="px-4 py-3 text-muted">{{ formatDate(row.created_at) }}</td>
              <td class="px-4 py-3 text-muted">{{ formatDate(row.notified_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
