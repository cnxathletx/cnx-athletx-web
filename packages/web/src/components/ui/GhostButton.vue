<script setup lang="ts">
defineProps<{
  disabled?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled"
    class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent transition-all duration-200 hover:text-primary focus:outline-none active:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <slot />
  </button>
</template>
