<script setup lang="ts">
defineProps<{
  currentStep: number
}>()

const steps = [
  { number: 1, label: 'Cart' },
  { number: 2, label: 'Details' },
  { number: 3, label: 'Payment' },
  { number: 4, label: 'Confirmation' },
]
</script>

<template>
  <nav aria-label="Checkout progress" class="py-6 sm:py-8">
    <ol class="flex items-center justify-between max-w-xl mx-auto px-4">
      <li
        v-for="(step, index) in steps"
        :key="step.number"
        :class="['flex items-center', index < steps.length - 1 ? 'flex-1' : '']"
      >
        <div class="flex flex-col items-center" :class="index < steps.length - 1 ? 'flex-1' : ''">
          <div class="flex items-center w-full">
            <!-- Circle -->
            <div
              :class="[
                'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 transition-colors',
                step.number < currentStep
                  ? 'bg-primary text-surface'
                  : step.number === currentStep
                    ? 'bg-primary text-surface ring-4 ring-primary/30'
                    : 'bg-muted/20 text-muted',
              ]"
            >
              <!-- Checkmark for completed -->
              <svg
                v-if="step.number < currentStep"
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span v-else>{{ step.number }}</span>
            </div>
            <!-- Connecting Line -->
            <div
              v-if="index < steps.length - 1"
              :class="[
                'flex-1 h-0.5 mx-2 transition-colors',
                step.number < currentStep ? 'bg-primary' : 'bg-muted/20',
              ]"
            />
          </div>
          <!-- Label -->
          <span
            :class="[
              'mt-2 text-xs sm:text-sm transition-colors',
              step.number === currentStep
                ? 'font-bold text-primary'
                : step.number < currentStep
                  ? 'font-semibold text-foreground'
                  : 'text-muted',
            ]"
          >
            {{ step.label }}
          </span>
        </div>
      </li>
    </ol>
  </nav>
</template>
