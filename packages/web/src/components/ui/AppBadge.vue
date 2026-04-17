<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span
    class="inline-flex items-center bg-accent text-white text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1"
  >
    {{ label }}
  </span>
</template>
