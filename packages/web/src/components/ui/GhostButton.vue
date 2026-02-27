<script setup lang="ts">
defineProps<{
  disabled?: boolean
}>()
</script>

<template>
  <button
    :disabled="disabled"
    class="text-primary font-semibold underline-offset-4 hover:underline transition-all duration-200 focus:outline-none focus:underline active:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <slot />
  </button>
</template>
