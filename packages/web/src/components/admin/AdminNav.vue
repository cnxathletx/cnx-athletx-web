<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SecondaryButton from '../ui/SecondaryButton.vue'

const route = useRoute()

const links = [
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/product-lines', label: 'Product Lines' },
  { to: '/admin/inventory', label: 'Inventory' },
  { to: '/admin/discounts', label: 'Discounts' },
]

const filteredLinks = computed(() => links.filter((link) => link.to !== route.path))
</script>

<template>
  <div class="flex items-center gap-2 flex-wrap">
    <RouterLink v-for="link in filteredLinks" :key="link.to" :to="link.to">
      <SecondaryButton size="sm">{{ link.label }}</SecondaryButton>
    </RouterLink>
  </div>
</template>
