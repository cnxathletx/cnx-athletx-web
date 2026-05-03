<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const partners = [1, 2, 3, 4, 5, 6]
</script>

<template>
  <section class="bg-surface-alt border-t border-sand">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <div class="text-center mb-10">
        <h2 class="text-2xl sm:text-3xl font-bold text-foreground">
          {{ t('partners.title') }}
        </h2>
        <p class="mt-2 text-sm text-foreground/70">
          {{ t('partners.subtitle') }}
        </p>
      </div>

      <ul
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6"
        aria-label="Partners"
      >
        <li
          v-for="n in partners"
          :key="n"
          class="aspect-[3/2] rounded-lg bg-surface ring-1 ring-[var(--card-ring)] flex items-center justify-center text-xs sm:text-sm text-foreground/50 font-medium"
        >
          {{ t('partners.placeholder', { n }) }}
        </li>
      </ul>
    </div>
  </section>
</template>
