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
      'inline-flex items-center justify-center rounded-md font-semibold transition-all duration-200',
      'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
      'active:scale-[0.97]',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
      variant === 'inverse'
        ? 'bg-surface text-primary hover:bg-surface/90'
        : 'bg-primary text-background hover:bg-primary-dark',
      size === 'sm' ? 'px-4 py-2 text-sm' : size === 'lg' ? 'px-8 py-4 text-lg' : 'px-6 py-3 text-base',
      fullWidth ? 'w-full' : '',
    ]"
  >
    <slot />
  </button>
</template>
