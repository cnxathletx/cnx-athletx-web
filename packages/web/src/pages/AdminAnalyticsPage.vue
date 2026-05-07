<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { fetchAdminAnalyticsReport, type AnalyticsMetricGroup, type AnalyticsReport } from '../api/admin'
import AdminNav from '../components/admin/AdminNav.vue'
import { useAdminResource } from '../composables/useAdminResource'

type PeriodKey = keyof AnalyticsMetricGroup

const emptyReport: AnalyticsReport = {
  visitors: {
    status: 'unconfigured',
    today: null,
    week: null,
    month: null,
  },
  orders: {
    today: 0,
    week: 0,
    month: 0,
  },
}

const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
]

const analytics = useAdminResource<AnalyticsReport>({
  initial: emptyReport,
  load: fetchAdminAnalyticsReport,
  fallbackError: 'Unable to load analytics.',
})

const visitorStatusMessage = computed(() => {
  if (analytics.data.value.visitors.status === 'unconfigured') {
    return 'Cloudflare visitor metrics are not configured yet.'
  }
  if (analytics.data.value.visitors.status === 'error') {
    return 'Cloudflare visitor metrics are temporarily unavailable.'
  }
  return ''
})

function formatVisitor(value: number | null): string {
  return value === null ? 'Not configured' : value.toLocaleString()
}

onMounted(() => {
  void analytics.reload()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1120px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Analytics</h1>
          <p class="text-sm text-muted mt-1">Visitor and order totals for the current day, week, and month.</p>
        </div>
        <AdminNav />
      </div>

      <div v-if="analytics.loading.value" class="grid gap-4 md:grid-cols-3 animate-pulse">
        <div v-for="period in periods" :key="period.key" class="h-44 rounded-lg bg-muted/10" />
      </div>

      <div v-else-if="analytics.error.value" class="bg-error/10 border border-error/30 rounded-md p-4 text-error text-sm">
        {{ analytics.error.value }}
      </div>

      <template v-else>
        <div v-if="visitorStatusMessage" class="rounded-md border border-sand bg-surface-alt px-4 py-3 text-sm text-muted">
          {{ visitorStatusMessage }}
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <section
            v-for="period in periods"
            :key="period.key"
            class="rounded-lg bg-surface ring-1 ring-[var(--card-ring)] p-5"
          >
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">{{ period.label }}</h2>

            <div class="mt-5 space-y-4">
              <div>
                <p class="text-sm text-muted">Visitors</p>
                <p class="mt-1 text-2xl font-bold text-foreground">
                  {{ formatVisitor(analytics.data.value.visitors[period.key]) }}
                </p>
              </div>

              <div class="border-t border-sand/60 pt-4">
                <p class="text-sm text-muted">Orders</p>
                <p class="mt-1 text-2xl font-bold text-foreground">
                  {{ analytics.data.value.orders[period.key].toLocaleString() }}
                </p>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>
