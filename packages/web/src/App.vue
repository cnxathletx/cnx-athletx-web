<script setup lang="ts">
import { onMounted } from 'vue'
import TheNavbar from './components/layout/TheNavbar.vue'
import TheFooter from './components/layout/TheFooter.vue'
import ChatWidget from './components/chat/ChatWidget.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()

onMounted(async () => {
  await auth.init()
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col">
    <TheNavbar />
    <main class="flex-1">
      <RouterView />
    </main>
    <TheFooter />
    <ChatWidget />
  </div>
</template>
