<script setup lang="ts">
import { useHead } from '../composables/useHead'

useHead({ title: 'Privacy Policy', description: 'How CNX AthletX collects, uses, and protects your personal data.', canonicalPath: '/privacy' })
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[960px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16">
      <article class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 sm:p-8 lg:p-10 space-y-8">
        <header class="space-y-3">
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Privacy Policy</h1>
          <p class="text-sm text-muted">Effective date: February 27, 2026</p>
          <p class="text-sm text-muted">
            This Privacy Policy explains how CNX AthletX collects, uses, discloses, and protects your personal data
            when you use our website and services.
          </p>
        </header>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">1. Data We Collect</h2>
          <ul class="list-disc pl-6 text-sm text-muted space-y-2">
            <li>Identity data: name and email address.</li>
            <li>Contact data: phone number and shipping address.</li>
            <li>Transaction data: order details, payment references, and fulfillment status.</li>
            <li>Account data: login session and order history linked to your account email.</li>
            <li>Technical data: basic request metadata required for security and platform operations.</li>
          </ul>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">2. How We Use Your Data</h2>
          <ul class="list-disc pl-6 text-sm text-muted space-y-2">
            <li>Process orders, payments, shipping, and customer support.</li>
            <li>Authenticate account access through passwordless magic links.</li>
            <li>Maintain order records, inventory accuracy, and fraud prevention controls.</li>
            <li>Send transactional communications related to your orders and account.</li>
            <li>Comply with legal and regulatory obligations.</li>
          </ul>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">3. Legal Basis (PDPA)</h2>
          <p class="text-sm text-muted">
            We process personal data under lawful bases recognized by Thailand's Personal Data Protection Act (PDPA),
            including contract performance, legal obligations, legitimate interests, and consent where required.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">4. Data Sharing</h2>
          <p class="text-sm text-muted">We may share personal data with trusted service providers solely as needed to operate the service, including:</p>
          <ul class="list-disc pl-6 text-sm text-muted space-y-2">
            <li>Cloudflare (hosting, APIs, and database infrastructure).</li>
            <li>Resend (transactional email delivery).</li>
            <li>Payment and fulfillment operations as necessary to complete your order.</li>
          </ul>
          <p class="text-sm text-muted">We do not sell your personal data.</p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">5. Cookies and Sessions</h2>
          <p class="text-sm text-muted">
            We use essential cookies for authentication and session management. These cookies are required for account
            login and secure operation of core features.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">6. Retention</h2>
          <p class="text-sm text-muted">
            We retain personal data only for as long as needed for order fulfillment, account operations, legal
            compliance, dispute handling, and legitimate business records.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">7. Your Rights</h2>
          <p class="text-sm text-muted">Subject to PDPA and applicable law, you may request to:</p>
          <ul class="list-disc pl-6 text-sm text-muted space-y-2">
            <li>Access your personal data.</li>
            <li>Correct inaccurate or incomplete personal data.</li>
            <li>Request deletion, anonymization, or restriction of processing.</li>
            <li>Object to specific processing activities.</li>
            <li>Withdraw consent where processing relies on consent.</li>
          </ul>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">8. Security</h2>
          <p class="text-sm text-muted">
            We use reasonable technical and organizational measures to protect personal data from unauthorized access,
            loss, misuse, and disclosure.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">9. Contact</h2>
          <p class="text-sm text-muted">
            For privacy requests or questions, contact us at
            <a href="mailto:contact@cnxnature.com" class="text-primary hover:underline underline-offset-4">contact@cnxnature.com</a>.
          </p>
        </section>

        <section class="space-y-3">
          <h2 class="text-xl font-bold text-foreground">10. Policy Updates</h2>
          <p class="text-sm text-muted">
            We may update this policy periodically. Material changes will be reflected on this page with an updated
            effective date.
          </p>
        </section>
      </article>
    </div>
  </div>
</template>
