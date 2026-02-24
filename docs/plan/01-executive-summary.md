# CNX AthletX — Implementation Plan

## Executive Summary

CNX AthletX is a lean ecommerce platform for selling plant-based protein powder from Chiang Mai, Thailand. The platform runs entirely on Cloudflare infrastructure (Pages, Workers, D1) with manual payment verification via PromptPay/Thai bank transfer and manual fulfillment managed through an admin dashboard.

### Version Roadmap

| Version | Scope | Target |
|---------|-------|--------|
| **v1** | Full storefront + manual PromptPay checkout + admin dashboard + Resend emails + customer accounts (magic link auth, order history, faster checkout). 2 SKUs (500g, 1000g). No payment gateway. | MVP Launch |
| **v1.5** | Payment proof image upload (R2 storage), order auto-expiry (24h unpaid), admin email resend button, basic analytics dashboard, brand story video embed on homepage | Fast Follow |
| **v2** | 2C2P payment gateway integration, automated payment confirmation, discount codes, additional SKUs, Thai language support, saved addresses | Growth |

### Non-Goals (v1)
- No payment gateway integration
- No automated bank confirmation
- No promotions/discount engine
- No complex inventory beyond stock count
- No saved addresses management (pre-fill from last order only)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  CUSTOMER                        │
│            (Browser / Mobile)                    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────┐
│           Cloudflare Pages (SPA)                │
│        Vue 3 + Vite + Tailwind CSS v4           │
│   Storefront pages + Admin panel (same SPA)     │
└────────────────────┬────────────────────────────┘
                     │ fetch(/api/*)
                     ▼
┌─────────────────────────────────────────────────┐
│          Cloudflare Workers (API)               │
│                                                  │
│  Public:        /api/products                    │
│                 /api/checkout                     │
│                 /api/orders/:id                   │
│                 /api/orders/:id/payment-proof     │
│                                                  │
│  Admin:         /api/admin/*                     │
│  (CF Access)    Cf-Access-Authenticated-User-Email│
└──────────┬──────────────────────┬───────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌──────────────────┐
│  Cloudflare D1   │   │    Resend API    │
│  (SQLite)        │   │  Transactional   │
│  System of       │   │  Email Only      │
│  Record          │   │                  │
└──────────────────┘   └──────────────────┘
```

### Security Model
- **Storefront**: Public, no auth required for browsing
- **Customer accounts**: Passwordless magic link auth via Resend (HttpOnly session cookies, D1 sessions table)
- **Admin panel + admin API**: Protected by Cloudflare Access (email domain gate)
- **Admin identity**: Extracted from `Cf-Access-Authenticated-User-Email` header for audit logging

### Key Architectural Decisions
1. **Monorepo with npm workspaces** — `packages/web` (Pages) + `packages/api` (Workers)
2. **Money stored as integers** — All THB amounts in satang (THB * 100) to avoid floating point
3. **ULIDs for order IDs** — Sortable, URL-safe, no sequential guessing
4. **Idempotency keys on checkout** — Prevents duplicate orders from double-submits
5. **Email failures don't block state transitions** — Best-effort delivery, logged to D1
6. **Passwordless customer auth** — Magic link via Resend, no password storage, HttpOnly session cookies
7. **Dark mode default** — Near-black (#0A0A0A) default theme with toggle-to-light. CSS variable architecture — no `dark:` prefixes, colors swap automatically via `:root` / `:root.light`

---

## Plan Documents

| Document | Contents |
|----------|----------|
| [02-backend-architecture.md](./02-backend-architecture.md) | D1 schema, API spec, admin workflow, Resend integration, testing, SEO/compliance, repo structure |
| [03-frontend-design.md](./03-frontend-design.md) | UX information architecture, Tailwind design system, component specs, page wireframes, responsive rules |
| [04-milestones.md](./04-milestones.md) | Phased milestones with acceptance criteria |
| [05-user-management.md](./05-user-management.md) | Customer accounts: magic link auth, sessions, order history, checkout pre-fill |

---

## Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vue 3 + Vite + Tailwind CSS v4 | SPA storefront + admin |
| State | Pinia | Cart, product cache |
| Routing | Vue Router | Client-side routing |
| API | Cloudflare Workers + itty-router | REST API |
| Database | Cloudflare D1 (SQLite) | System of record |
| Customer Auth | Magic link (Resend) + D1 sessions | Passwordless login |
| Admin Auth | Cloudflare Access | Admin protection |
| Email | Resend | Transactional emails |
| Hosting | Cloudflare Pages | Static SPA hosting |
| IDs | ULID | Order identifiers |

---

## Repo Structure

```
cnx-athletx/
├── packages/
│   ├── web/                    # Cloudflare Pages (Vue SPA)
│   │   ├── src/
│   │   │   ├── components/     # Shared UI components
│   │   │   ├── pages/          # Route-level pages
│   │   │   │   └── admin/      # Admin pages
│   │   │   ├── composables/    # Vue composables (useCart, useApi)
│   │   │   ├── stores/         # Pinia stores
│   │   │   ├── assets/         # Static assets, styles
│   │   │   └── router/         # Vue Router config
│   │   ├── public/             # Static files (images, robots.txt)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tailwind.config.ts
│   │
│   └── api/                    # Cloudflare Workers
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   │   └── admin/      # Admin-only routes
│       │   ├── services/       # Business logic (email, inventory)
│       │   ├── db/             # Schema + seed SQL
│       │   ├── middleware/     # Auth, CORS, error handling
│       │   ├── types/          # TypeScript interfaces
│       │   └── index.ts        # Workers entry point
│       ├── tests/              # Unit + integration tests
│       ├── wrangler.toml
│       └── vitest.config.ts
│
├── docs/plan/                  # This plan
├── .github/workflows/          # CI/CD
├── package.json                # Workspace root
└── README.md
```
