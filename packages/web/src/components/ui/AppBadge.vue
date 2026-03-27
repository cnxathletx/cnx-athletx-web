<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span
    class="inline-flex items-center bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1"
  >
    {{ label }}
  </span>
</template>
