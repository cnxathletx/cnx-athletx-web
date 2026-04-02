<script setup lang="ts">
import { RouterLink } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import { useHead } from '../composables/useHead'

useHead({ title: 'Page Not Found', description: 'The page you are looking for does not exist.' })
</script>

<template>
  <div class="bg-background min-h-[60vh] flex items-center justify-center">
    <div class="text-center px-4 py-16 space-y-6">
      <p class="text-6xl font-bold text-primary">404</p>
      <h1 class="text-2xl font-semibold text-foreground">Page Not Found</h1>
      <p class="text-muted max-w-md mx-auto">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div class="pt-4">
        <RouterLink to="/">
          <PrimaryButton>Back to Home</PrimaryButton>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
