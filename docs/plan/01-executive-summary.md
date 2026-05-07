# CNX AthletX — Executive Summary

Last updated: 2026-04-29

## Current Status

CNX AthletX is a pre-launch ecommerce platform for selling plant-based protein products from Chiang Mai, Thailand. The codebase is materially beyond an early MVP, but **v1 has not been released yet**. Today the repository represents a launch candidate with most core commerce, operations, and support workflows implemented on Cloudflare Pages, Workers, and D1.

The current product supports:
- Storefront browsing with real product data from D1
- English and Thai customer-facing localization
- Cart, checkout, and manual PromptPay / bank transfer payment instructions
- Payment proof submission by transfer reference
- Public order lookup and order status tracking
- Passwordless customer accounts with magic links, order history, and saved address support
- Admin operations for orders, inventory, products, product lines, discounts, site settings, support chat, income reporting, and basic analytics
- Transactional email flows through Resend
- Centralized order status rules for admin transitions, payment webhooks, reporting, review eligibility, and payment-proof eligibility
- Shared internal abstractions for checkout inventory reservation, discount application, typed settings, money formatting, rate-limit policies, frontend API transport, and frontend domain types

The main gap is no longer basic product implementation. The remaining work for v1 release is launch hardening: production validation, browser/device QA, SEO/performance verification, deployment/config review, and final operational readiness.

### Release Roadmap

| Stage | Scope | Status |
|-------|-------|--------|
| **Current build** | Core storefront, checkout, manual payment workflow, payment proof, accounts, admin dashboard, discounts, settings, chat, reporting, analytics, and email flows | Implemented in repo, not released |
| **v1 release** | Production-ready launch of the existing manual-commerce stack with final QA, config validation, content review, and release checklist completion | Pending |
| **Post-launch** | Payment proof image upload (R2), unpaid order auto-expiry, deeper analytics, operational polish, and possible payment gateway automation | Future |

### Non-Goals For v1 Release

- No payment gateway integration
- No automated bank reconciliation or payment confirmation
- No image-based payment proof upload yet
- No fully automated fulfillment workflow
- No advanced promotions engine beyond discount codes

---

## Product Snapshot

CNX AthletX is designed as a lean, manually operated commerce system. Customers browse a brand-led storefront, place an order, transfer payment via PromptPay or bank transfer, then submit proof for manual verification. The owner completes fulfillment through an admin interface protected by Cloudflare Access-compatible admin authentication.

This keeps the initial release operationally simple while still covering the full customer journey:
- discover product
- place order
- submit payment proof
- receive lifecycle emails
- track order
- manage repeat purchases through an account

Compared with the original v1 planning assumptions, the codebase now also includes customer support chat, income reporting, saved addresses, product-line management, and storefront localization.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Customer Browser                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│          Cloudflare Pages SPA (Vue 3 + Vite)           │
│  Storefront, checkout, account area, admin interface   │
└──────────────────────────┬──────────────────────────────┘
                           │ fetch(/api/*)
                           ▼
┌─────────────────────────────────────────────────────────┐
│       Cloudflare Workers API (itty-router, TS)         │
│  Products, checkout, orders, auth, account, chat,      │
│  admin orders, inventory, products, discounts,         │
│  product lines, settings, reports                      │
└───────────────┬───────────────────────────┬─────────────┘
                │                           │
                ▼                           ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ Cloudflare D1 (SQLite)  │     │       Resend API        │
│ Orders, inventory, auth,│     │ Transactional email     │
│ settings, chat, reports │     │ and magic links         │
└─────────────────────────┘     └─────────────────────────┘
```

### Security Model

- **Storefront**: public
- **Customer accounts**: passwordless magic-link auth with HttpOnly session cookies
- **Admin APIs and admin UI**: admin-only access, with Cloudflare Access JWT support plus local/dev fallbacks
- **Auditability**: admin actions are logged in D1

### Key Architectural Decisions

1. **Single monorepo**: `packages/web` and `packages/api` move together.
2. **Cloudflare-native deployment**: Pages + Workers + D1 keep hosting and data close together.
3. **Integer money values**: all THB values are stored in satang.
4. **ULID order identifiers**: sortable and safe to expose publicly.
5. **Manual payment operations for v1**: reduces launch complexity and external dependencies.
6. **Passwordless auth**: avoids password storage and lowers account friction.
7. **Best-effort email delivery**: email failures are logged and do not block order state changes.
8. **Typed shared policy modules**: settings, money, inventory reservation, discounts, rate limits, order statuses, and payment providers are centralized so route handlers stay orchestration-focused.

---

## What Still Matters Before Release

- Validate production environment settings, secrets, and domain configuration
- Run full integration and E2E checks against the intended production-like setup
- Finish release QA for desktop/mobile browsers and payment/admin flows
- Confirm Lighthouse and SEO targets instead of assuming them from implementation
- Review customer-facing copy, legal content, and operational runbooks for launch day

---

## Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vue 3 + Vite + Tailwind CSS v4 | Storefront, account area, admin UI |
| State | Pinia | Cart and auth state |
| Routing | Vue Router | SPA navigation |
| Localization | vue-i18n | English and Thai storefront content |
| API | Cloudflare Workers + itty-router | REST API |
| Database | Cloudflare D1 | Orders, inventory, auth, settings, chat, reporting |
| Customer Auth | Magic links + D1 sessions | Passwordless login |
| Admin Auth | Cloudflare Access-compatible auth | Admin protection |
| Email | Resend | Magic-link and order lifecycle emails |
| Hosting | Cloudflare Pages | Static SPA hosting |

---

## Plan Documents

| Document | Contents |
|----------|----------|
| [02-backend-architecture.md](./02-backend-architecture.md) | Schema, API surface, admin workflow, Resend integration, testing |
| [03-frontend-design.md](./03-frontend-design.md) | Frontend structure, API transport conventions, page/composable responsibilities |
| [03-milestones.md](./03-milestones.md) | Phase-by-phase implementation tracking and acceptance criteria |

---

## Repo Structure

```
cnx-athletx/
├── packages/
│   ├── web/      # Vue storefront + account + admin SPA
│   └── api/      # Cloudflare Worker API and D1-backed business logic
├── docs/plan/    # Product, architecture, and milestone planning docs
├── e2e/          # Playwright end-to-end coverage
└── assets/       # Brand and content assets
```
