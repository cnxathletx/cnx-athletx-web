<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span
    class="inline-flex items-center rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] px-3 py-1 text-[0.68rem] font-brand font-semibold uppercase tracking-[0.18em] text-accent"
  >
    {{ label }}
  </span>
</template>
