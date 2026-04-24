<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const links = [
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/product-lines', label: 'Product Lines' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/discounts', label: 'Discounts' },
  { to: '/admin/income', label: 'Income' },
  { to: '/admin/chat', label: 'Chat' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/settings', label: 'Settings' },
]

const filteredLinks = computed(() => links.filter((link) => link.to !== route.path))
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <RouterLink
      v-for="link in filteredLinks"
      :key="link.to"
      :to="link.to"
      class="inline-flex items-center justify-center rounded-md font-semibold transition-all duration-200 border-2 border-foreground text-foreground bg-transparent hover:bg-foreground hover:text-background focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 focus:ring-offset-background active:scale-[0.97] px-4 py-2 text-sm"
    >
      {{ link.label }}
    </RouterLink>
  </div>
</template>
