<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
  variant?: 'default' | 'inverse'
}>()
</script>

<template>
  <button
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center rounded-full border font-brand font-semibold uppercase tracking-[0.18em] transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
      'active:scale-[0.98]',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
      variant === 'inverse'
        ? 'border-[var(--card-ring)] bg-transparent text-primary hover:bg-primary/10'
        : 'border-primary bg-primary text-background hover:bg-primary-dark hover:border-primary-dark',
      size === 'sm'
        ? 'px-4 py-2 text-[0.68rem]'
        : size === 'lg'
          ? 'px-8 py-4 text-[0.8rem]'
          : 'px-6 py-3 text-[0.72rem]',
      fullWidth ? 'w-full' : '',
    ]"
  >
    <slot />
  </button>
</template>
