<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'

const router = useRouter()
const orderId = ref('')
const error = ref('')

function lookupOrder() {
  const id = orderId.value.trim()
  if (!id) {
    error.value = 'Please enter an order ID'
    return
  }
  error.value = ''
  router.push(`/order/${id}`)
}
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16">
      <div class="max-w-md mx-auto text-center space-y-8">
        <div class="space-y-2">
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Track Your Order</h1>
          <p class="text-muted">Enter your order ID to check the status.</p>
        </div>

        <form @submit.prevent="lookupOrder" class="space-y-4">
          <div>
            <input
              v-model="orderId"
              type="text"
              :class="[
                'w-full rounded-md border px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-center font-mono',
                error ? 'border-error' : 'border-sand',
              ]"
              placeholder="Enter your order ID"
            />
            <p v-if="error" class="mt-2 text-xs text-error">{{ error }}</p>
          </div>
          <PrimaryButton full-width size="lg" @click="lookupOrder">
            Look Up Order
          </PrimaryButton>
        </form>

        <p class="text-sm text-muted">
          Your order ID was included in the confirmation email sent after placing your order.
        </p>
      </div>
    </div>
  </div>
</template>
