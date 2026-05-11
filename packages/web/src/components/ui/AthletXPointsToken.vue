<template>
  <span
    class="inline-flex items-center justify-center rounded-full bg-primary text-background ring-1 ring-primary/20"
    :class="sizeClasses"
    aria-hidden="true"
  >
    <svg class="h-[58%] w-[58%]" viewBox="0 0 348 352" fill="currentColor" focusable="false">
      <path d="M267 1.4c-20.1 4.5-36 14.7-47.6 30.6-2.2 3-11.8 16.8-21.2 30.7L181 87.8l26.6 38.6c14.7 21.2 27 38.6 27.3 38.6s14.3-20.1 31.1-44.5c16.8-24.5 42.1-61.4 56.3-82.1C336.4 17.8 348 .7 348 .4c0-1.1-75.8-.1-81 1M35.6 34.2c.7 1.2 36.1 52.7 74.1 108.1 9 13 16.3 24.2 16.3 24.8 0 .5-7.8 12.4-17.3 26.2-9.5 13.9-28.1 40.9-41.4 60.2-13.2 19.2-33.4 48.7-44.9 65.5C10.8 335.8 1.1 350.1.6 350.8c-.7 1.1 6 1.3 39 1 37.5-.4 40.3-.6 47.2-2.7 13.8-4.1 28.1-12.7 36.3-21.9 3.8-4.2 18.5-25.3 50-71.4 4-5.9 7.4-10.7 7.5-10.5.1.1 7.9 11.4 17.4 25.2 9.4 13.7 18.8 26.7 20.8 28.8s6.2 5 9.2 6.5l5.5 2.7 37.3.3c30.7.3 37.3.1 36.6-1-.9-1.4-21.7-31.9-60-87.4-33.2-48.3-70-101.7-97.3-141.4-12.3-17.9-24-34.2-26-36.3s-5.8-5.1-8.6-6.5l-5-2.7-37.8-.3c-30.8-.2-37.7 0-37.1 1" />
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), {
  size: 'md',
})

const sizeClasses = computed(() => props.size === 'sm' ? 'h-7 w-7' : 'h-10 w-10')
</script>
