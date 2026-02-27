<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '../stores/cart'
import { formatPrice } from '../api/products'
import { submitCheckout, CheckoutError } from '../api/checkout'
import { fetchLastAddress } from '../api/auth'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import CheckoutStepper from '../components/ui/CheckoutStepper.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const cart = useCartStore()
const auth = useAuthStore()

// Redirect if cart is empty
if (cart.items.length === 0) {
  router.replace('/cart')
}

// Form state
const form = ref({
  name: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  district: '',
  province: '',
  postal_code: '',
  discount_code: '',
})

const submitting = ref(false)
const apiError = ref('')
const fieldErrors = ref<Record<string, string>>({})

// Generate idempotency key once per page load
const idempotencyKey = crypto.randomUUID()

// Validation
function validate(): boolean {
  const errors: Record<string, string> = {}

  if (form.value.name.trim().length < 2) errors.name = 'Name must be at least 2 characters'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) errors.email = 'Enter a valid email'
  if (!/^(\+66|0)[0-9]{9}$/.test(form.value.phone))
    errors.phone = 'Enter a valid Thai phone (e.g. 0812345678)'
  if (form.value.line1.trim().length < 5) errors.line1 = 'Address must be at least 5 characters'
  if (!form.value.district.trim()) errors.district = 'District is required'
  if (!form.value.province.trim()) errors.province = 'Province is required'
  if (!/^\d{5}$/.test(form.value.postal_code)) errors.postal_code = 'Enter a 5-digit postal code'

  fieldErrors.value = errors
  return Object.keys(errors).length === 0
}

const canSubmit = computed(() => cart.items.length > 0 && !submitting.value)

onMounted(async () => {
  if (!auth.initialized) {
    await auth.init()
  }

  if (!auth.user) return

  if (!form.value.name) form.value.name = auth.user.name ?? ''
  if (!form.value.email) form.value.email = auth.user.email
  if (!form.value.phone) form.value.phone = auth.user.phone ?? ''

  try {
    const address = await fetchLastAddress()
    if (!address) return

    if (!form.value.line1) form.value.line1 = address.line1
    if (!form.value.line2) form.value.line2 = address.line2 ?? ''
    if (!form.value.district) form.value.district = address.district
    if (!form.value.province) form.value.province = address.province
    if (!form.value.postal_code) form.value.postal_code = address.postal_code
  } catch {
    // Ignore prefill failures.
  }
})

async function handleSubmit() {
  if (!validate() || !canSubmit.value) return

  submitting.value = true
  apiError.value = ''

  try {
    const result = await submitCheckout({
      items: cart.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
      customer: {
        name: form.value.name.trim(),
        email: form.value.email.trim().toLowerCase(),
        phone: form.value.phone.trim(),
        address: {
          line1: form.value.line1.trim(),
          line2: form.value.line2.trim(),
          district: form.value.district.trim(),
          province: form.value.province.trim(),
          postal_code: form.value.postal_code,
        },
      },
      idempotency_key: idempotencyKey,
      discount_code: form.value.discount_code.trim() || undefined,
    })

    // Store checkout result for payment page
    sessionStorage.setItem('cnx-last-order', JSON.stringify(result))
    sessionStorage.setItem('cnx-last-checkout-email', form.value.email.trim().toLowerCase())

    // Clear cart
    cart.clearCart()

    // Navigate to payment instructions
    router.push(`/order/${result.order_id}/payment`)
  } catch (e) {
    if (e instanceof CheckoutError) {
      if (e.details?.length) {
        // Map field errors
        const newErrors: Record<string, string> = {}
        for (const d of e.details) {
          const key = d.field.replace('customer.address.', '').replace('customer.', '')
          newErrors[key] = d.message
        }
        fieldErrors.value = newErrors
        apiError.value = e.message
      } else {
        apiError.value = e.message
      }
    } else {
      apiError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <CheckoutStepper :current-step="2" />

    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
      <h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-8">Checkout</h1>

      <form @submit.prevent="handleSubmit" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Form Column -->
        <div class="lg:col-span-2 space-y-8">
          <!-- Contact Information -->
          <div class="space-y-4">
            <h2 class="text-xl font-bold text-foreground">Contact Information</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">Full Name</label>
                <input
                  v-model="form.name"
                  type="text"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.name ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="Somchai Rattana"
                />
                <p v-if="fieldErrors.name" class="mt-1 text-xs text-error">{{ fieldErrors.name }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">Email</label>
                <input
                  v-model="form.email"
                  type="email"
                  :disabled="!!auth.user"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed',
                    fieldErrors.email ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="you@example.com"
                />
                <p v-if="fieldErrors.email" class="mt-1 text-xs text-error">{{ fieldErrors.email }}</p>
                <p v-else-if="auth.user" class="mt-1 text-xs text-muted">Using your account email.</p>
              </div>
            </div>
            <div class="max-w-sm">
              <label class="block text-sm font-medium text-foreground mb-1">Phone Number</label>
              <input
                v-model="form.phone"
                type="tel"
                :class="[
                  'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  fieldErrors.phone ? 'border-error' : 'border-sand',
                ]"
                placeholder="0812345678"
              />
              <p v-if="fieldErrors.phone" class="mt-1 text-xs text-error">{{ fieldErrors.phone }}</p>
            </div>
          </div>

          <!-- Shipping Address -->
          <div class="space-y-4">
            <h2 class="text-xl font-bold text-foreground">Shipping Address</h2>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Address Line 1</label>
              <input
                v-model="form.line1"
                type="text"
                :class="[
                  'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  fieldErrors.line1 ? 'border-error' : 'border-sand',
                ]"
                placeholder="123 Nimmanhaemin Road"
              />
              <p v-if="fieldErrors.line1" class="mt-1 text-xs text-error">{{ fieldErrors.line1 }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-foreground mb-1">Address Line 2 (Optional)</label>
              <input
                v-model="form.line2"
                type="text"
                class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Soi 5, Floor 2"
              />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">District</label>
                <input
                  v-model="form.district"
                  type="text"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.district ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="Suthep"
                />
                <p v-if="fieldErrors.district" class="mt-1 text-xs text-error">{{ fieldErrors.district }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">Province</label>
                <input
                  v-model="form.province"
                  type="text"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.province ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="Chiang Mai"
                />
                <p v-if="fieldErrors.province" class="mt-1 text-xs text-error">{{ fieldErrors.province }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-foreground mb-1">Postal Code</label>
                <input
                  v-model="form.postal_code"
                  type="text"
                  inputmode="numeric"
                  maxlength="5"
                  :class="[
                    'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    fieldErrors.postal_code ? 'border-error' : 'border-sand',
                  ]"
                  placeholder="50200"
                />
                <p v-if="fieldErrors.postal_code" class="mt-1 text-xs text-error">{{ fieldErrors.postal_code }}</p>
              </div>
            </div>
          </div>

          <!-- Discount Code -->
          <div class="space-y-2">
            <label class="block text-sm font-medium text-foreground">Discount Code (Optional)</label>
            <div class="flex gap-2 max-w-sm">
              <input
                v-model="form.discount_code"
                type="text"
                :class="[
                  'flex-1 rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted uppercase transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                  fieldErrors.discount_code ? 'border-error' : 'border-sand',
                ]"
                placeholder="SAVE10"
              />
            </div>
            <p v-if="fieldErrors.discount_code" class="text-xs text-error">{{ fieldErrors.discount_code }}</p>
          </div>
        </div>

        <!-- Order Summary Sidebar -->
        <div class="lg:col-span-1">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 space-y-4 sticky top-20">
            <h2 class="text-xl font-bold text-foreground">Order Summary</h2>

            <div class="space-y-3 divide-y divide-sand">
              <div
                v-for="item in cart.items"
                :key="item.productId"
                class="flex justify-between pt-3 first:pt-0"
              >
                <div>
                  <p class="text-sm font-medium text-foreground">{{ item.name }}</p>
                  <p class="text-xs text-muted">{{ item.weightLabel }} x {{ item.quantity }}</p>
                </div>
                <p class="text-sm font-semibold text-foreground">
                  {{ formatPrice(item.priceSatang * item.quantity) }}
                </p>
              </div>
            </div>

            <div class="border-t border-sand pt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted">Subtotal</span>
                <span class="font-semibold text-foreground">{{ formatPrice(cart.subtotalSatang) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Shipping</span>
                <span class="text-muted">Calculated on submit</span>
              </div>
            </div>

            <!-- API Error -->
            <div
              v-if="apiError"
              class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error"
            >
              {{ apiError }}
            </div>

            <PrimaryButton
              full-width
              size="lg"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              {{ submitting ? 'Placing Order...' : 'Place Order' }}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
