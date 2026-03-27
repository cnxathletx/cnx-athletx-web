<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  disabled?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center rounded-full font-brand font-semibold uppercase tracking-[0.16em] transition-all duration-200',
      'border border-[var(--card-ring)] text-foreground bg-[var(--panel-wash)]',
      'hover:bg-foreground hover:text-background',
      'focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 focus:ring-offset-background',
      'active:scale-[0.98]',
      'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
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
