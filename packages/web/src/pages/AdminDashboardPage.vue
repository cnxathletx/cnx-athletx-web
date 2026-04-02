<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="min-h-screen bg-background">
    <div class="max-w-4xl mx-auto px-4 py-12 sm:py-16">
      <div class="mb-10">
        <h1 class="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p class="mt-2 text-muted">CNX AthletX store management</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          to="/admin/orders"
          class="group block rounded-lg bg-surface p-6 ring-1 ring-sand transition hover:ring-primary"
        >
          <div class="mb-3 text-2xl">
            <svg class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">Orders</h2>
          <p class="mt-1 text-sm text-muted">View, filter, and manage customer orders. Process payments, pack, and ship.</p>
        </RouterLink>

        <RouterLink
          to="/admin/products"
          class="group block rounded-lg bg-surface p-6 ring-1 ring-sand transition hover:ring-primary"
        >
          <div class="mb-3 text-2xl">
            <svg class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">Products</h2>
          <p class="mt-1 text-sm text-muted">Create, edit, and manage your product catalog. Set prices and toggle availability.</p>
        </RouterLink>

        <RouterLink
          to="/admin/inventory"
          class="group block rounded-lg bg-surface p-6 ring-1 ring-sand transition hover:ring-primary"
        >
          <div class="mb-3 text-2xl">
            <svg class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">Inventory</h2>
          <p class="mt-1 text-sm text-muted">Monitor stock levels and adjust inventory counts for all products.</p>
        </RouterLink>

        <RouterLink
          to="/admin/discounts"
          class="group block rounded-lg bg-surface p-6 ring-1 ring-sand transition hover:ring-primary"
        >
          <div class="mb-3 text-2xl">
            <svg class="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">Discounts</h2>
          <p class="mt-1 text-sm text-muted">Create and manage discount codes. Set fixed or percent discounts with usage limits.</p>
        </RouterLink>
      </div>

      <div class="mt-10 text-center">
        <RouterLink to="/" class="text-sm text-muted hover:text-primary transition-colors underline underline-offset-4">
          Back to storefront
        </RouterLink>
      </div>
    </div>
  </div>
</template>
