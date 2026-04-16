<script setup lang="ts">
import markSvg from '../../assets/brand/mark.svg?raw'

defineProps<{
  ariaLabel?: string
}>()
</script>

<template>
  <span
    class="inline-block shrink-0"
    role="img"
    :aria-label="ariaLabel ?? 'CNX AthletX'"
    v-html="markSvg"
  />
</template>

<style scoped>
.inline-block :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
