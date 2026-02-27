<script setup lang="ts">
import TheNavbar from './components/layout/TheNavbar.vue'
import TheFooter from './components/layout/TheFooter.vue'
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col">
    <TheNavbar />
    <main class="flex-1">
      <RouterView />
    </main>
    <TheFooter />
  </div>
</template>
