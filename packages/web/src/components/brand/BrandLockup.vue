<script setup lang="ts">
import lockupSvg from '../../assets/brand/lockup.svg?raw'

defineProps<{
  ariaLabel?: string
}>()
</script>

<template>
  <span
    class="block shrink-0"
    role="img"
    :aria-label="ariaLabel ?? 'CNX AthletX — Natural Performance'"
    v-html="lockupSvg"
  />
</template>

<style scoped>
.block :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
