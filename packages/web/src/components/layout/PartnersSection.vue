<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  buildInitialPartnerSlots,
  buildStaticPartnerTiles,
  PARTNER_TILE_COUNT,
  partners,
  rotatePartnerSlot,
} from './partners'

const { t } = useI18n({ useScope: 'global' })

const partnerSection = ref<HTMLElement | null>(null)
const partnerSlots = ref<number[]>(buildInitialPartnerSlots(partners.length))
const staticPartnerTiles = buildStaticPartnerTiles(partners)
const partnerTimeouts: ReturnType<typeof setTimeout>[] = []
const partnerTimers: ReturnType<typeof setInterval>[] = []
let partnerObserver: IntersectionObserver | null = null
let partnerRotationStarted = false

const displayedPartners = computed(() => {
  if (partners.length <= PARTNER_TILE_COUNT) return staticPartnerTiles
  return partnerSlots.value.map((slotIdx) => partners[slotIdx])
})

function rotatePartnerTile(slot: number) {
  partnerSlots.value = rotatePartnerSlot(partnerSlots.value, slot, partners.length)
}

function startPartnerRotation() {
  if (partnerRotationStarted || partners.length <= PARTNER_TILE_COUNT) return

  partnerRotationStarted = true
  for (let slot = 0; slot < PARTNER_TILE_COUNT; slot += 1) {
    const startDelay = slot * 1600
    const timeout = setTimeout(() => {
      rotatePartnerTile(slot)
      const timer = setInterval(() => rotatePartnerTile(slot), 5000)
      partnerTimers.push(timer)
    }, startDelay)
    partnerTimeouts.push(timeout)
  }
}

onMounted(() => {
  if (partners.length <= PARTNER_TILE_COUNT) return

  if (!partnerSection.value || typeof IntersectionObserver === 'undefined') {
    startPartnerRotation()
    return
  }

  partnerObserver = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      startPartnerRotation()
      partnerObserver?.disconnect()
      partnerObserver = null
    },
    { rootMargin: '200px 0px' },
  )

  partnerObserver.observe(partnerSection.value)
})

onBeforeUnmount(() => {
  partnerObserver?.disconnect()
  partnerTimeouts.forEach(clearTimeout)
  partnerTimers.forEach(clearInterval)
})
</script>

<template>
  <section ref="partnerSection" class="bg-surface-alt border-t border-sand">
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
          <transition name="story-fade" mode="default">
            <a
              v-if="'image' in partner"
              :key="partner.name"
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
            <span v-else :key="partner.placeholderIndex">
              {{ t('partners.placeholder', { n: partner.placeholderIndex }) }}
            </span>
          </transition>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.story-fade-enter-active,
.story-fade-leave-active {
  transition: opacity 800ms ease-in-out;
}

.story-fade-enter-from,
.story-fade-leave-to {
  opacity: 0;
}
</style>
