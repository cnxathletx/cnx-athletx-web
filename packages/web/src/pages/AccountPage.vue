<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AuthApiErrorResponse,
  fetchAccountOrders,
  fetchSavedAddress,
  updateAddress,
  updateProfile,
  type AccountOrder,
  type SavedAddress,
} from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import { useAuthStore } from '../stores/auth'
import { useHead } from '../composables/useHead'
import { useThaiAddress } from '../composables/useThaiAddress'

useHead({ title: 'My Account', description: 'View your order history and manage your account.' })

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

const address = ref<SavedAddress>({
  line1: '',
  line2: null,
  subdistrict: '',
  district: '',
  province: '',
  postal_code: '',
})
const thaiAddr = useThaiAddress()

// Sync Thai address composable → address ref
watch(thaiAddr.selectedProvince, (v) => { address.value.province = v })
watch(thaiAddr.selectedDistrict, (v) => { address.value.district = v })
watch(thaiAddr.selectedSubdistrict, (v) => { address.value.subdistrict = v })
watch(thaiAddr.postalCode, (v) => { address.value.postal_code = v })

const savingAddress = ref(false)
const addressError = ref('')
const addressSuccess = ref('')

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

async function saveAddress() {
  addressError.value = ''
  addressSuccess.value = ''

  if (address.value.line1.trim().length < 5) {
    addressError.value = 'Address line 1 must be at least 5 characters.'
    return
  }
  if (!address.value.district.trim()) {
    addressError.value = 'District is required.'
    return
  }
  if (!address.value.subdistrict.trim()) {
    addressError.value = 'Sub-district is required.'
    return
  }
  if (!address.value.province.trim()) {
    addressError.value = 'Province is required.'
    return
  }
  if (!/^\d{5}$/.test(address.value.postal_code)) {
    addressError.value = 'Postal code must be exactly 5 digits.'
    return
  }

  savingAddress.value = true
  try {
    const saved = await updateAddress({
      line1: address.value.line1.trim(),
      line2: address.value.line2?.trim() || null,
      subdistrict: address.value.subdistrict.trim(),
      district: address.value.district.trim(),
      province: address.value.province.trim(),
      postal_code: address.value.postal_code,
    })
    address.value = saved
    addressSuccess.value = 'Address saved.'
  } catch (err) {
    if (err instanceof AuthApiErrorResponse) {
      addressError.value = err.message
    } else {
      addressError.value = 'Unable to save address right now.'
    }
  } finally {
    savingAddress.value = false
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

  try {
    const saved = await fetchSavedAddress()
    if (saved) {
      address.value = saved
      // Pre-fill Thai address dropdowns
      if (saved.province) {
        thaiAddr.setAddress({
          province: saved.province,
          district: saved.district,
          subdistrict: saved.subdistrict,
          postalCode: saved.postal_code,
        })
      }
    }
  } catch {
    // Non-critical — address section will just be empty
  }

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
          <h2 class="text-xl font-bold text-foreground">Shipping Address</h2>
          <p class="text-sm text-muted">This address will be pre-filled at checkout.</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium text-foreground mb-1">Address Line 1</label>
              <input
                v-model="address.line1"
                type="text"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="123/4 Moo 5, Soi Example"
              />
            </div>
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium text-foreground mb-1">Address Line 2 <span class="text-muted font-normal">(optional)</span></label>
              <input
                v-model="address.line2"
                type="text"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Building, floor, unit"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Province</label>
              <select
                v-model="thaiAddr.selectedProvince.value"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select province</option>
                <option v-for="p in thaiAddr.provinces" :key="p.code" :value="p.name">{{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">District</label>
              <select
                v-model="thaiAddr.selectedDistrict.value"
                :disabled="!thaiAddr.selectedProvince.value"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select district</option>
                <option v-for="d in thaiAddr.filteredDistricts.value" :key="d.code" :value="d.name">{{ d.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Sub-district</label>
              <select
                v-model="thaiAddr.selectedSubdistrict.value"
                :disabled="!thaiAddr.selectedDistrict.value"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select sub-district</option>
                <option v-for="s in thaiAddr.filteredSubdistricts.value" :key="s.name" :value="s.name">{{ s.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Postal Code</label>
              <input
                v-model="thaiAddr.postalCode.value"
                type="text"
                maxlength="5"
                readonly
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Auto-filled"
              />
            </div>
          </div>
          <p v-if="addressError" class="text-sm text-error">{{ addressError }}</p>
          <p v-if="addressSuccess" class="text-sm text-primary">{{ addressSuccess }}</p>
          <PrimaryButton size="sm" :disabled="savingAddress" @click="saveAddress">
            {{ savingAddress ? 'Saving...' : 'Save Address' }}
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

<style scoped>
select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
  background-position: right 0.75rem center;
  background-repeat: no-repeat;
  background-size: 1.25em 1.25em;
  padding-right: 2.5rem;
}
</style>
