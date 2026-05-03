<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

const partners = [
  {
    name: 'CNX Sports Recovery',
    image: '/images/partners/cnx-sports-recovery.png',
    href: 'https://cnxsportsrecovery.com',
  },
  { placeholderIndex: 2 },
  { placeholderIndex: 3 },
  { placeholderIndex: 4 },
  { placeholderIndex: 5 },
  { placeholderIndex: 6 },
]

const displayedPartners = [...partners]

for (let i = displayedPartners.length - 1; i > 0; i -= 1) {
  const j = Math.floor(Math.random() * (i + 1))
  const partner = displayedPartners[i]
  displayedPartners[i] = displayedPartners[j]
  displayedPartners[j] = partner
}
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
          v-for="partner in displayedPartners"
          :key="'image' in partner ? partner.name : partner.placeholderIndex"
          class="aspect-[3/2] overflow-hidden rounded-lg bg-surface ring-1 ring-[var(--card-ring)] flex items-center justify-center text-xs sm:text-sm text-foreground/50 font-medium"
        >
          <a
            v-if="'image' in partner"
            :href="partner.href"
            target="_blank"
            rel="noopener noreferrer"
            class="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-alt"
          >
            <img
              :src="partner.image"
              :alt="partner.name"
              class="h-full w-full object-cover transition-opacity hover:opacity-90"
            >
          </a>
          <template v-else>
            {{ t('partners.placeholder', { n: partner.placeholderIndex }) }}
          </template>
        </li>
      </ul>
    </div>
  </section>
</template>
