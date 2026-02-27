<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  AuthApiErrorResponse,
  fetchAccountOrders,
  updateProfile,
  type AccountOrder,
} from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const fetchError = ref('')
const saveError = ref('')
const saveSuccess = ref('')

const page = ref(1)
const limit = 10
const total = ref(0)
const orders = ref<AccountOrder[]>([])

const profile = ref({
  name: '',
  phone: '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)))
const canPrev = computed(() => page.value > 1)
const canNext = computed(() => page.value < totalPages.value)

const statusLabels: Record<string, string> = {
  pending_payment: 'Awaiting Payment',
  paid: 'Paid',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const statusClasses: Record<string, string> = {
  pending_payment: 'bg-accent/15 text-accent',
  paid: 'bg-primary/15 text-primary',
  packed: 'bg-primary/15 text-primary',
  shipped: 'bg-primary/15 text-primary',
  delivered: 'bg-primary/15 text-primary',
  cancelled: 'bg-error/15 text-error',
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadOrders() {
  fetchError.value = ''
  try {
    const result = await fetchAccountOrders(page.value, limit)
    orders.value = result.orders
    total.value = result.pagination.total
  } catch (err) {
    if (err instanceof AuthApiErrorResponse && err.status === 401) {
      await router.replace({ path: '/login', query: { redirect: '/account' } })
      return
    }
    fetchError.value = 'Unable to load your account data.'
  }
}

async function saveProfile() {
  saveError.value = ''
  saveSuccess.value = ''

  const nextName = profile.value.name.trim()
  const nextPhone = profile.value.phone.trim()

  if (nextName.length < 2 || nextName.length > 100) {
    saveError.value = 'Name must be between 2 and 100 characters.'
    return
  }
  if (!/^(\+66|0)[0-9]{9}$/.test(nextPhone) && !/^\+[1-9][0-9]{6,14}$/.test(nextPhone)) {
    saveError.value = 'Phone must be a valid phone number (e.g. +66812345678).'
    return
  }

  saving.value = true
  try {
    const user = await updateProfile({ name: nextName, phone: nextPhone })
    auth.setUser(user)
    saveSuccess.value = 'Profile updated.'
  } catch (err) {
    if (err instanceof AuthApiErrorResponse) {
      saveError.value = err.message
    } else {
      saveError.value = 'Unable to save profile right now.'
    }
  } finally {
    saving.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  await router.push('/')
}

async function nextPage() {
  if (!canNext.value) return
  page.value += 1
  await loadOrders()
}

async function prevPage() {
  if (!canPrev.value) return
  page.value -= 1
  await loadOrders()
}

onMounted(async () => {
  if (!auth.initialized) {
    await auth.init()
  }

  if (!auth.isAuthenticated || !auth.user) {
    await router.replace({ path: '/login', query: { redirect: '/account' } })
    return
  }

  profile.value.name = auth.user.name ?? ''
  profile.value.phone = auth.user.phone ?? ''
  await loadOrders()
  loading.value = false
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16">
      <div v-if="loading" class="space-y-6 animate-pulse max-w-4xl mx-auto">
        <div class="h-10 bg-muted/10 rounded w-64" />
        <div class="h-44 bg-muted/10 rounded" />
        <div class="h-64 bg-muted/10 rounded" />
      </div>

      <div v-else-if="auth.user" class="max-w-4xl mx-auto space-y-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 class="text-3xl sm:text-4xl font-bold text-foreground">My Account</h1>
            <p class="text-muted mt-1">{{ auth.user.email }}</p>
          </div>
          <SecondaryButton size="sm" @click="handleLogout">Log Out</SecondaryButton>
        </div>

        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Profile</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                v-model="profile.name"
                type="text"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Your name"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Phone</label>
              <input
                v-model="profile.phone"
                type="tel"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="0812345678"
              />
            </div>
          </div>
          <p v-if="saveError" class="text-sm text-error">{{ saveError }}</p>
          <p v-if="saveSuccess" class="text-sm text-primary">{{ saveSuccess }}</p>
          <PrimaryButton size="sm" :disabled="saving" @click="saveProfile">
            {{ saving ? 'Saving...' : 'Save Profile' }}
          </PrimaryButton>
        </div>

        <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4">
          <h2 class="text-xl font-bold text-foreground">Order History</h2>

          <p v-if="fetchError" class="text-sm text-error">{{ fetchError }}</p>

          <div v-else-if="orders.length === 0" class="text-center py-8 space-y-3">
            <p class="text-muted">No orders yet.</p>
            <RouterLink to="/shop">
              <PrimaryButton size="sm">Shop Now</PrimaryButton>
            </RouterLink>
          </div>

          <div v-else class="space-y-3">
            <RouterLink
              v-for="order in orders"
              :key="order.id"
              :to="`/order/${order.id}`"
              class="block bg-surface-alt rounded-md border border-sand/50 px-4 py-4 hover:border-primary/40 transition-colors"
            >
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="space-y-1">
                  <p class="font-mono text-sm text-foreground">{{ order.id }}</p>
                  <p class="text-xs text-muted">{{ formatDate(order.created_at) }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span :class="['px-3 py-1 rounded-full text-xs font-semibold', statusClasses[order.status] || 'bg-muted/15 text-muted']">
                    {{ statusLabels[order.status] || order.status }}
                  </span>
                  <span class="text-sm font-semibold text-foreground">฿{{ order.total_thb.toLocaleString() }}</span>
                </div>
              </div>
              <p class="text-xs text-muted mt-2">{{ order.items_count }} item(s)</p>
            </RouterLink>
          </div>

          <div v-if="orders.length > 0" class="flex items-center justify-between pt-2">
            <SecondaryButton size="sm" :disabled="!canPrev" @click="prevPage">Previous</SecondaryButton>
            <p class="text-xs text-muted">Page {{ page }} of {{ totalPages }}</p>
            <SecondaryButton size="sm" :disabled="!canNext" @click="nextPage">Next</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
