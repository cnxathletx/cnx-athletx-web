<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <footer class="bg-footer-bg text-foreground/80">
    <!-- Main Footer Content -->
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
        <!-- Brand Info -->
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-xl font-bold tracking-tight text-foreground">CNX</span>
            <span class="text-xl font-bold tracking-tight text-primary">AthletX</span>
          </div>
          <p class="text-sm leading-relaxed">
            Clean athletic everyday health. Plant-based protein powder from Chiang Mai's active
            community.
          </p>
        </div>

        <!-- Quick Links -->
        <div class="space-y-4">
          <h3 class="text-foreground font-semibold">Quick Links</h3>
          <nav class="flex flex-col space-y-2">
            <RouterLink
              to="/shop"
              class="text-sm hover:text-foreground transition-colors"
            >
              Shop
            </RouterLink>
            <RouterLink
              to="/order/status"
              class="text-sm hover:text-foreground transition-colors"
            >
              Track Order
            </RouterLink>
            <RouterLink
              to="/privacy"
              class="text-sm hover:text-foreground transition-colors"
            >
              Privacy Policy
            </RouterLink>
            <RouterLink
              to="/terms"
              class="text-sm hover:text-foreground transition-colors"
            >
              Terms of Service
            </RouterLink>
          </nav>
        </div>

        <!-- Contact Info -->
        <div class="space-y-4">
          <h3 class="text-foreground font-semibold">Contact</h3>
          <div class="space-y-2 text-sm">
            <p>Chiang Mai, Thailand</p>
            <p>contact@cnxnature.com</p>
            <div class="flex space-x-4 pt-2">
              <a
                href="https://www.instagram.com/cnx_athletx"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors"
                aria-label="Instagram"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                  />
                </svg>
              </a>
              <a
                href="https://www.tiktok.com/@cnx.athletx"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors"
                aria-label="TikTok"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.16z"
                  />
                </svg>
              </a>
              <a
                href="https://www.facebook.com/profile.php?id=61579807747184"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-foreground transition-colors"
                aria-label="Facebook"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Supplement Disclaimer -->
    <div class="border-t border-foreground/10">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-4">
        <p class="text-xs text-foreground/50 leading-relaxed text-center">
          This product is a dietary supplement. It is not intended to diagnose, treat, cure, or prevent any disease.
          Consult a healthcare professional before use. Not registered as a medicine by the Thai FDA.
        </p>
      </div>
    </div>

    <!-- Bottom Bar -->
    <div class="border-t border-foreground/20">
      <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6">
        <div
          class="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0 text-sm"
        >
          <p>&copy; 2026 CNX AthletX. All rights reserved.</p>
          <div class="flex space-x-6">
            <RouterLink to="/privacy" class="hover:text-foreground transition-colors">
              Privacy
            </RouterLink>
            <RouterLink to="/terms" class="hover:text-foreground transition-colors">
              Terms
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>
