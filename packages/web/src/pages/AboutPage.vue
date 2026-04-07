<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useHead } from '../composables/useHead'
import PrimaryButton from '../components/ui/PrimaryButton.vue'

const { t } = useI18n({ useScope: 'global' })

useHead({ title: 'About', description: 'Learn about CNX AthletX — plant-based protein from Chiang Mai\'s active community.', canonicalPath: '/about' })
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[960px] px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <!-- Header -->
      <div class="text-center space-y-4 mb-12 sm:mb-16">
        <span class="text-xs font-medium uppercase tracking-[0.05em] text-primary">
          {{ t('about.badge') }}
        </span>
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground leading-tight">
          {{ t('about.title') }}
        </h1>
        <p class="text-lg text-muted max-w-2xl mx-auto">
          {{ t('about.subtitle') }}
        </p>
      </div>

      <!-- Story sections -->
      <div class="space-y-12">
        <section class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 lg:p-10 space-y-6">
          <h2 class="text-2xl font-bold text-foreground">{{ t('about.originTitle') }}</h2>
          <div class="space-y-4 text-muted leading-relaxed">
            <p>{{ t('about.originP1') }}</p>
            <p>{{ t('about.originP2') }}</p>
          </div>
        </section>

        <section class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 lg:p-10 space-y-6">
          <h2 class="text-2xl font-bold text-foreground">{{ t('about.valuesTitle') }}</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div class="space-y-2">
              <h3 class="text-lg font-semibold text-foreground">{{ t('about.value1Title') }}</h3>
              <p class="text-muted text-sm leading-relaxed">{{ t('about.value1Desc') }}</p>
            </div>
            <div class="space-y-2">
              <h3 class="text-lg font-semibold text-foreground">{{ t('about.value2Title') }}</h3>
              <p class="text-muted text-sm leading-relaxed">{{ t('about.value2Desc') }}</p>
            </div>
            <div class="space-y-2">
              <h3 class="text-lg font-semibold text-foreground">{{ t('about.value3Title') }}</h3>
              <p class="text-muted text-sm leading-relaxed">{{ t('about.value3Desc') }}</p>
            </div>
            <div class="space-y-2">
              <h3 class="text-lg font-semibold text-foreground">{{ t('about.value4Title') }}</h3>
              <p class="text-muted text-sm leading-relaxed">{{ t('about.value4Desc') }}</p>
            </div>
          </div>
        </section>

        <section class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 lg:p-10 space-y-6">
          <h2 class="text-2xl font-bold text-foreground">{{ t('about.chiangMaiTitle') }}</h2>
          <div class="space-y-4 text-muted leading-relaxed">
            <p>{{ t('about.chiangMaiP1') }}</p>
            <p>{{ t('about.chiangMaiP2') }}</p>
          </div>
        </section>
      </div>

      <!-- CTA -->
      <div class="text-center mt-12 sm:mt-16">
        <p class="text-lg text-muted mb-6">{{ t('about.ctaText') }}</p>
        <RouterLink to="/shop">
          <PrimaryButton>{{ t('about.ctaButton') }}</PrimaryButton>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
