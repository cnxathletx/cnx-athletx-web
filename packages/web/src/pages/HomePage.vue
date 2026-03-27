<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import ProductCard from '../components/ui/ProductCard.vue'
import { fetchProducts, formatPrice, formatWeight, type ApiProduct } from '../api/products'

const products = ref<ApiProduct[]>([])
const productsLoaded = ref(false)

const proofPoints = [
  '100% Natural',
  'Vegan',
  'Gluten Free',
  'Dairy Free',
  'No Added Sugar',
  'Muscle Support',
]

const ritualSteps = [
  {
    title: 'Shake It',
    detail: '2 scoops with cold water for a fast, clean post-session reset.',
  },
  {
    title: 'Blend It',
    detail: 'Add oats, fruit, or nut butter for a heavier recovery blend.',
  },
  {
    title: 'Mix It',
    detail: 'Fold into oats or yogurt when you want slower, steadier fuel.',
  },
]

const communityNotes = [
  {
    title: 'Trail Mornings',
    detail: 'Built for early climbs, road miles, and training in Chiang Mai heat.',
  },
  {
    title: 'Gym Sessions',
    detail: 'A stripped-back formula for lifters who want clarity, not clutter.',
  },
  {
    title: 'Everyday Recovery',
    detail: 'Comfortable enough for daily use, disciplined enough for athletes.',
  },
]

onMounted(async () => {
  try {
    products.value = await fetchProducts()
  } catch {
    // Silently fall back to empty — home page still renders other sections
  } finally {
    productsLoaded.value = true
  }
})
</script>

<template>
  <div>
    <section class="border-b border-[var(--grid-line)] bg-background">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div class="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div class="space-y-8">
            <div class="space-y-5">
              <span class="brand-kicker text-accent">Natural Performance</span>
              <h1 class="brand-title max-w-3xl text-5xl leading-none text-primary sm:text-6xl lg:text-7xl">
                CNX AthletX
              </h1>
              <p class="max-w-xl text-lg leading-relaxed text-muted">
                A darker, cleaner expression of plant-based performance nutrition from Chiang Mai.
                Built for athletes who want fewer ingredients, steadier recovery, and a brand that
                feels grounded instead of loud.
              </p>
            </div>

            <div class="flex flex-wrap gap-3">
              <span class="brand-pill">Made in Chiang Mai</span>
              <span class="brand-pill">Plant-Based Protein</span>
              <span class="brand-pill">Minimal Formula</span>
            </div>

            <div class="flex flex-col gap-4 sm:flex-row">
              <RouterLink to="/shop">
                <PrimaryButton size="lg">Shop Collection</PrimaryButton>
              </RouterLink>
              <RouterLink
                to="/shop"
                class="self-center font-brand text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-accent transition-colors hover:text-primary sm:self-auto"
              >
                Explore the Formula
              </RouterLink>
            </div>
          </div>

          <div class="brand-panel brand-landscape rounded-[2.2rem] p-8 sm:p-10">
            <div class="flex h-full min-h-[460px] flex-col justify-between gap-8">
              <div class="space-y-4 text-center">
                <p class="brand-kicker text-accent">Natural Performance</p>
                <h2 class="brand-title text-4xl text-primary sm:text-5xl">CNX AthletX</h2>
                <p class="mx-auto max-w-sm text-sm leading-relaxed text-muted">
                  Premium plant-based protein powder with a quieter, more tactile identity.
                </p>
              </div>

              <div class="brand-divider" />

              <div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div
                  v-for="point in proofPoints"
                  :key="point"
                  class="rounded-2xl border border-[var(--card-ring)] bg-white/[0.03] px-4 py-3 text-center"
                >
                  <p class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-primary">
                    {{ point }}
                  </p>
                </div>
              </div>

              <div class="space-y-3 text-center">
                <div class="brand-divider" />
                <p class="brand-title text-2xl text-primary">Made in Chiang Mai</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="border-b border-[var(--grid-line)] bg-background">
      <div class="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div
            v-for="point in proofPoints"
            :key="point"
            class="rounded-full border border-[var(--card-ring)] bg-[var(--panel-wash)] px-4 py-3 text-center"
          >
            <span class="font-brand text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-foreground">
              {{ point }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div class="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-3">
            <span class="brand-kicker text-accent">Core Products</span>
            <h2 class="brand-title text-3xl text-primary sm:text-4xl">Performance, Not Noise</h2>
            <p class="max-w-2xl text-muted">
              The collection stays deliberately narrow: quality protein, straightforward flavor,
              and packaging that feels calm, earthy, and technical.
            </p>
          </div>
          <RouterLink
            to="/shop"
            class="font-brand text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-accent transition-colors hover:text-primary"
          >
            View Full Shop
          </RouterLink>
        </div>

        <div v-if="productsLoaded && products.length" class="grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
          <ProductCard
            v-for="product in products"
            :key="product.id"
            :product-id="product.id"
            :name="product.name"
            :slug="product.slug"
            :weight="formatWeight(product.weight_g)"
            :price-formatted="formatPrice(product.price_thb)"
            :price-satang="product.price_thb"
            :image-url="product.image_url"
            :in-stock="product.available_stock > 0"
          />
        </div>
        <div v-else-if="!productsLoaded" class="grid max-w-3xl grid-cols-1 gap-8 sm:grid-cols-2">
          <div
            v-for="i in 2"
            :key="i"
            class="brand-panel animate-pulse rounded-[2rem]"
          >
            <div class="aspect-[4/3] bg-sand" />
            <div class="space-y-4 p-6">
              <div class="h-6 w-3/4 rounded bg-sand" />
              <div class="h-5 w-1/4 rounded bg-sand" />
              <div class="h-px bg-sand/70" />
              <div class="h-8 w-1/3 rounded bg-sand" />
              <div class="h-12 rounded-full bg-sand" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="border-y border-[var(--grid-line)] bg-surface">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div class="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div class="brand-panel rounded-[2rem] p-8 sm:p-10">
            <div class="max-w-2xl space-y-5">
              <span class="brand-kicker text-accent">Origin Story</span>
              <h2 class="brand-title text-3xl text-primary sm:text-4xl">
                Built from Chiang Mai terrain and training culture
              </h2>
              <p class="text-muted leading-relaxed">
                The new identity trades flashy sports nutrition cues for something more grounded:
                mineral browns, warm bone text, sage accents, and a sense of terrain. It reflects
                the landscape around the brand as much as the product in the bag.
              </p>
              <p class="text-muted leading-relaxed">
                That same approach drives the formula. Fewer distractions, more clarity, and a
                product designed for people who run, climb, lift, and recover with intent.
              </p>
            </div>
          </div>

          <div class="grid gap-4">
            <div class="brand-panel rounded-[2rem] p-6">
              <p class="brand-kicker text-accent">Palette</p>
              <div class="mt-5 flex items-center gap-4">
                <span class="h-14 w-14 rounded-full bg-[var(--signal)]" />
                <span class="h-14 w-14 rounded-full bg-primary" />
                <span class="h-14 w-14 rounded-full bg-[#ded6c5]" />
                <span class="h-14 w-14 rounded-full bg-accent" />
              </div>
            </div>
            <div class="brand-panel rounded-[2rem] p-6">
              <p class="brand-kicker text-accent">Direction</p>
              <ul class="mt-5 space-y-3 text-sm text-muted">
                <li>Condensed uppercase hierarchy inspired by the new pack face.</li>
                <li>Thin divider lines and wider spacing instead of glossy wellness tropes.</li>
                <li>Textured, landscape-like depth replacing flat black backgrounds.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div class="mb-10 space-y-3">
          <span class="brand-kicker text-accent">Use Ritual</span>
          <h2 class="brand-title text-3xl text-primary sm:text-4xl">Shake It. Blend It. Mix It.</h2>
        </div>
        <div class="grid gap-6 lg:grid-cols-3">
          <article
            v-for="step in ritualSteps"
            :key="step.title"
            class="brand-panel rounded-[2rem] p-8"
          >
            <div class="space-y-4">
              <span class="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--card-ring)] bg-white/5 font-brand text-sm font-bold text-primary">
                {{ step.title.charAt(0) }}
              </span>
              <h3 class="brand-title text-2xl text-primary">{{ step.title }}</h3>
              <p class="text-muted leading-relaxed">{{ step.detail }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="border-t border-[var(--grid-line)] bg-surface-alt">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div class="mb-10 space-y-3">
          <span class="brand-kicker text-accent">Community Fit</span>
          <h2 class="brand-title text-3xl text-primary sm:text-4xl">Designed for real training days</h2>
        </div>
        <div class="grid gap-6 md:grid-cols-3">
          <article
            v-for="note in communityNotes"
            :key="note.title"
            class="rounded-[2rem] border border-[var(--card-ring)] bg-[var(--panel-wash)] p-8"
          >
            <h3 class="brand-title text-2xl text-primary">{{ note.title }}</h3>
            <p class="mt-4 text-muted leading-relaxed">{{ note.detail }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="bg-background">
      <div class="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 lg:px-8">
        <div class="brand-panel rounded-[2.2rem] px-6 py-10 text-center sm:px-12">
          <div class="mx-auto max-w-3xl space-y-5">
            <span class="brand-kicker text-accent">Ready to Restock</span>
            <h2 class="brand-title text-3xl text-primary sm:text-5xl">
              Bring the new CNX AthletX language into your routine
            </h2>
            <p class="text-muted">
              Shop the current sizes and move through training with a formula and identity that now
              feel aligned.
            </p>
            <RouterLink to="/shop">
              <PrimaryButton size="lg">Shop Now</PrimaryButton>
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
