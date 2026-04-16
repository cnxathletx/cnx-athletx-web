# CNX AthletX — Milestones & Acceptance Criteria

Last updated: 2026-04-16

## Phase 0: Repo Scaffolding + Cloudflare + CI

**Goal:** Working monorepo with both packages buildable and deployable to Cloudflare.

**Tasks:**
1. Initialize npm workspace monorepo (`packages/web`, `packages/api`)
2. Scaffold Vue 3 + Vite + TypeScript in `packages/web`
3. Scaffold Cloudflare Workers + itty-router in `packages/api`
4. Configure Tailwind CSS v4 with brand design tokens (colors, typography, spacing) and dark/light theme system
5. Create Cloudflare Pages project linked to `packages/web`
6. Create Cloudflare Workers project with `wrangler.toml`
7. Provision D1 database (dev + production)
8. Configure Cloudflare Access policy for `/admin/*` and `/api/admin/*`
9. Set up GitHub Actions: lint + build + deploy (Pages and Workers)
10. Store `RESEND_API_KEY` as Workers secret

**Acceptance Criteria:**
- [x] `npm run dev:web` starts Vue dev server at localhost:5171
- [x] `npm run dev:api` starts Workers dev server via `wrangler dev`
- [x] Pushing to `main` triggers CI that deploys both packages
- [x] Cloudflare Access blocks unauthenticated requests to `/admin/*`
- [x] D1 database is accessible from Workers dev environment
- [x] Tailwind config includes all brand color tokens and typography utilities
- [x] Dark/light theme system works: `:root` (dark default) and `:root.light` CSS variable switching
- [x] Flash prevention script in `index.html` prevents FOUC on theme load

---

## Phase 1: Tailwind Theme + Home/Shop UI Scaffolds

**Goal:** Brand-aligned UI shell with navigation, home page, and shop page rendering placeholder content.

**Tasks:**
1. Implement Navbar component (sticky, responsive, mobile hamburger drawer, theme toggle)
2. Implement Footer component (3-column grid, brand info, always-dark bg)
3. Implement Theme Toggle (useTheme composable, sun/moon icon button)
4. Build Home page with all sections:
   - Hero (headline + CTA + product image placeholder)
   - Social Proof Bar (trust signals)
   - Featured Products (2 placeholder product cards)
   - Brand Story (text + image placeholder, video placeholder slot)
   - Community (image grid placeholders)
   - CTA Banner
5. Build Shop page with product grid (2 placeholder cards)
6. Build Product Detail page layout (image + info + tabs)
7. Implement shared components: Primary Button, Secondary Button, Badge, Product Card
8. Set up Vue Router with all storefront routes
9. Verify responsive behavior at all breakpoints

**Acceptance Criteria:**
- [x] Home page renders all 6 sections with correct brand colors and spacing
- [x] Navigation works on desktop (horizontal links) and mobile (hamburger drawer)
- [x] Theme toggle button in navbar switches between dark and light mode
- [x] Product cards display with correct styling (ring elevation in dark, shadow in light, hover effect, badge)
- [x] All pages use `bg-background` as primary background (dark: #0A0A0A, light: #F4F3EE)
- [x] Product-label Gold is used for all primary CTAs (dark: #EBB83C, light: #A67C1F)
- [x] Accent gold variants are used as supportive accents/badges, not as dominant page backgrounds
- [x] Typography uses Inter font with correct scale (H1: 2.5rem, H2: 2rem, etc.)
- [x] Pages are responsive: single column on mobile, multi-column on desktop
- [x] Theme preference persists via localStorage across page reloads

---

## Phase 2: D1 Schema + Product APIs + Seeded Products

**Goal:** Database initialized with schema and seed data. Product API endpoints return real data. Frontend fetches and displays real products.

**Tasks:**
1. Write and apply D1 schema (`schema.sql` with all 9 tables)
2. Write seed SQL for 2 products (500g at 89900 satang, 1000g at 159900 satang)
3. Implement `GET /api/products` — list active products with stock counts
4. Implement `GET /api/products/:slug` — single product with full details
5. Add CORS middleware for local development
6. Connect Vue product pages to real API data
7. Add loading and error states to product pages

**Acceptance Criteria:**
- [x] D1 schema creates all tables with correct indexes and constraints
- [x] `GET /api/products` returns both products with `stock_count > 0`
- [x] `GET /api/products/plant-protein-500g` returns full product detail
- [x] Product pages fetch and render real data from API
- [x] Inactive products (`active = 0`) are excluded from public API
- [x] Price displays correctly as THB (e.g., "฿899" from 89900 satang)

---

## Phase 3: Cart + Checkout + Payment Instructions UI

**Goal:** Complete purchase flow from adding to cart through receiving payment instructions.

**Tasks:**
1. Implement Pinia cart store (add, remove, update quantity, persist to localStorage)
2. Build Cart page with CartItemRow components and order summary
3. Build Checkout page with customer info form and Thai address fields
4. Implement `POST /api/checkout` with atomic stock reservation:
   - Validate stock availability
   - Reserve inventory (update `reserved_count`)
   - Create order + order_items in single D1 batch
   - Return order ID + payment instructions
5. Implement idempotency key handling (prevent duplicate orders)
6. Implement discount code support:
   - Add discount code input on cart/checkout
   - Validate code on backend during checkout
   - Return discount amount + adjusted order total
7. Build Payment Instructions page:
   - Display PromptPay QR code (static image from owner)
   - Show bank transfer details
   - Show order reference (large, copyable)
   - Show amount to transfer
8. Build Checkout Stepper component
9. Build Order Confirmation page
10. Implement `GET /api/orders/:id` — public order status (sanitized)
11. Build Order Status page with timeline tracker

**Acceptance Criteria:**
- [x] Adding product to cart updates cart icon count badge
- [x] Cart persists across page reloads (localStorage)
- [x] Checkout form validates: name, email, phone (Thai format), address fields, postal code (5 digits)
- [x] Submitting checkout creates order in D1 with `status = 'pending_payment'`
- [x] Inventory `reserved_count` increases by ordered quantity
- [x] Duplicate submission with same idempotency key returns existing order (not 201)
- [x] Applying a valid discount code returns reduced order total in both API response and UI summary
- [x] Invalid or expired discount code returns 422 with clear validation message
- [x] Insufficient stock returns 422 error with clear message
- [x] Payment Instructions page shows QR code, bank details, order reference, amount
- [x] Order Status page shows current status in visual timeline
- [x] Checkout stepper shows correct active step on each page

---

## Phase 4: Payment Proof Submission

**Goal:** Customers can submit proof of payment. Admin can see proof on order detail.

**Tasks:**
1. Implement `POST /api/orders/:id/payment-proof` — accepts reference string
2. Build payment proof form on Payment Instructions page (text input for transfer reference)
3. Store proof in `payment_proofs` table with `proof_type = 'reference'`
4. Show submitted proof on public Order Status page ("Proof submitted, awaiting verification")
5. Display payment proof details on admin order detail view

**v1.5 Future:**
- Image upload via Cloudflare R2
- `proof_type = 'image_url'` with R2 URL stored in `proof_value`

**Acceptance Criteria:**
- [x] Customer can enter transfer reference number on payment page
- [x] `POST /api/orders/:id/payment-proof` stores proof in D1
- [x] Multiple proofs per order are supported (customer can resubmit)
- [x] Order status page shows "Payment proof submitted" indicator
- [x] Submitting proof for a non-existent order returns 404
- [x] Submitting proof for an already-paid order returns 409

---

## Phase 5: Customer Accounts (Magic Link Auth)

**Goal:** Passwordless customer accounts with order history and faster checkout. Full spec in [05-user-management.md](./05-user-management.md).

**Tasks:**
1. Add `users`, `magic_links`, `sessions` tables to D1 schema
2. Add `user_id` nullable FK column to `orders` table
3. Implement auth endpoints: `POST /api/auth/request-link`, `POST /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/me`
4. Implement magic link email template via Resend
5. Add session middleware to Workers (cookie-based, HttpOnly)
6. Implement rate limiting on magic link requests (3 per email per 15 min)
7. Build Login page (email input → "check your email" confirmation state)
8. Build Auth Verify page (token validation → redirect to account)
9. Build Account Dashboard page (order history list + profile display)
10. Add Pinia auth store (`init`, `logout`, `setUser`, `isAuthenticated`)
11. Update Navbar with auth state (login link vs user avatar dropdown)
12. Update Checkout to pre-fill name/email/phone/address for logged-in users
13. Implement `GET /api/account/orders` (paginated user order history)
14. Implement `GET /api/account/last-address` (for checkout pre-fill)
15. Implement `PATCH /api/account/profile` (update name + phone)
16. Add post-checkout account creation prompt for guest users
17. Implement retroactive order linking on account creation (`UPDATE orders SET user_id = ? WHERE customer_email = ?`)

**Acceptance Criteria:**
- [x] User enters email on /login → receives magic link email within 30 seconds
- [x] Clicking valid magic link logs user in and redirects to /account
- [x] Expired link (>15 min) or used link shows error with "request new link" option
- [x] Session persists across browser restarts (30-day HttpOnly cookie)
- [x] /account shows user's order history with status pills
- [x] Checkout pre-fills name, email, phone, and last-used address for logged-in users
- [x] Guest checkout still works (user_id = NULL on order)
- [x] Post-checkout prompt lets guest create account; past orders retroactively linked
- [x] Navbar shows "Log In" when logged out and account/log-out controls when logged in
- [x] Logging out clears session and redirects to home
- [x] Rate limit: >3 magic link requests in 15 min returns 429
- [x] Same success message shown whether email exists or not (no enumeration)

---

## Phase 6: Admin Dashboard + Fulfillment Workflow

**Goal:** Owner can manage orders through the full lifecycle and maintain product/inventory data.

**Current status note (2026-02-27):** Phase 6 implementation is now in place in code:
- Admin routes and pages: `/admin/orders`, `/admin/orders/:id`, `/admin/inventory`, `/admin/products` (`/admin/order/:id` now redirects to `/admin/orders/:id`).
- Fulfillment APIs are implemented with transition validation and audit logs.
- Inventory adjustment API/UI is implemented.
- Product CRUD APIs/UI are implemented (`GET/POST/PATCH /api/admin/products`).
- Cloudflare Access enforcement is configured and protects `/admin/*` and `/api/admin/*` via Zero Trust policy.

**Tasks:**
1. Build Admin Orders List page:
   - Status filter tabs (All, Pending Payment, Paid, Packed, Shipped, Cancelled)
   - Admin Table component with order rows
   - Search by order ID or customer name
   - Pagination
2. Build Admin Order Detail page:
   - Customer info card, items table, payment info, shipment info
   - Payment proof display with reference/link
   - Admin Action Button Set (context-sensitive per status)
3. Implement admin API endpoints:
   - `GET /api/admin/orders?status=&page=&limit=`
   - `GET /api/admin/orders/:id`
   - `POST /api/admin/orders/:id/mark-paid`
   - `POST /api/admin/orders/:id/pack`
   - `POST /api/admin/orders/:id/ship` (carrier + tracking)
   - `POST /api/admin/orders/:id/cancel`
4. Implement Order Status Pill component (color per status)
5. Implement state transition validation (prevent invalid transitions)
6. Implement inventory adjustment on payment verification:
   - `reserved_count -= qty`, `stock_count -= qty`
7. Implement inventory restoration on cancellation
8. Implement audit logging (admin email from CF Access header)
9. Build Admin Inventory page (stock levels, adjust counts)
10. Implement `PATCH /api/admin/inventory/:productId`
11. Build Admin Products page (list products, edit product details, active/inactive toggle)
12. Implement admin product endpoints:
   - `GET /api/admin/products`
   - `POST /api/admin/products`
   - `PATCH /api/admin/products/:id`

**Acceptance Criteria:**
- [x] Admin pages only accessible through Cloudflare Access
- [x] Orders list shows correct status pills and filters work
- [x] Mark Paid: order status → `paid`, payment record created, inventory adjusted, audit logged
- [x] Pack: order status → `packed`, audit logged
- [x] Ship: order status → `shipped`, shipment record created with carrier + tracking, audit logged
- [x] Cancel: order status → `cancelled`, inventory restored (`reserved_count` or `stock_count`), audit logged
- [x] Invalid transitions return 409 (e.g., can't mark shipped order as paid)
- [x] Audit log shows admin email, action, timestamp for every action
- [x] Inventory page shows current stock, reserved count, available count
- [x] Stock adjustment via admin updates `stock_count` in D1
- [x] Product management page lists products with current active status and pricing
- [x] Admin can create and edit products (name, slug, description, price, weight, image, active)

---

## Phase 7: Resend Transactional Emails

**Goal:** Customers receive email notifications at key order lifecycle events.

**Tasks:**
1. Verify domain with Resend (DKIM + SPF + Return-Path via Cloudflare DNS)
2. Store `RESEND_API_KEY` as Workers secret
3. Create email service (`services/email.ts`) with Resend SDK
4. Implement email templates:
   - **Order Created**: order reference, items, total, PromptPay instructions, bank details
   - **Payment Confirmed**: order reference, "your order is being prepared"
   - **Order Shipped**: order reference, carrier, tracking number
5. Create `email_logs` table for tracking send attempts
6. Wire emails to order lifecycle events:
   - `POST /api/checkout` success → Order Created email
   - `POST /api/admin/orders/:id/mark-paid` → Payment Confirmed email
   - `POST /api/admin/orders/:id/ship` → Order Shipped email
7. Ensure email failures don't block state transitions (catch + log)
8. Apply brand copy guidelines (confident, grounded, no health claims)

**Acceptance Criteria:**
- [x] Domain verified in Resend dashboard (DKIM passing)
- [x] Order Created email sent on successful checkout (contains payment instructions)
- [x] Payment Confirmed email sent when admin marks paid
- [x] Order Shipped email sent with carrier + tracking number
- [x] Email failure logs to `email_logs` table but does NOT block order processing
- [x] Emails use brand voice (no exaggerated health claims, confident/grounded tone)
- [x] From address: `orders@cnxnature.com` (or configured domain)
- [x] Emails are mobile-friendly (70%+ of Thai ecommerce is mobile)

---

## Phase 8: Polish (SEO, Performance, Legal, Content)

**Goal:** Production-ready with SEO, legal compliance, and performance optimizations.

**Tasks:**
1. Add meta tags per page (title, description, OG, Twitter cards)
2. Add JSON-LD structured data on product pages (Product schema)
3. Add Organization schema on homepage
4. Create `robots.txt` (allow storefront, disallow admin)
5. Create `sitemap.xml` (static, 6 URLs)
6. Create Privacy Policy page (PDPA-compliant placeholder)
7. Create Terms of Service page (placeholder with key sections)
8. Add supplement disclaimer in footer (Thai FDA compliance)
9. Optimize images: lazy loading, WebP format, proper aspect ratios
10. Add 404 page
11. Test and optimize Lighthouse scores (target: 90+ performance, 100 accessibility)
12. Add loading skeletons for product pages and admin tables
13. Ensure all interactive elements meet 44x44px touch target minimum
14. Final cross-browser testing (Chrome, Safari, mobile Safari, Samsung Internet)

**Acceptance Criteria:**
- [x] Product pages have correct OG meta tags (title, description, image, price)
- [ ] Google Rich Results Test validates Product JSON-LD
- [x] `robots.txt` disallows `/admin/` and `/api/admin/`
- [x] Privacy Policy page exists with PDPA-required content sections
- [x] Terms of Service page exists with payment terms, shipping, returns
- [x] Footer includes supplement disclaimer
- [ ] Lighthouse Performance score >= 90
- [ ] Lighthouse Accessibility score = 100
- [x] All images use `loading="lazy"` for below-fold content
- [x] 404 page renders for unknown routes with link back to home
- [ ] Site works on Chrome, Safari, and mobile browsers

---

## Phase Summary

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| 0 | Infrastructure | Monorepo, Cloudflare setup, CI/CD, D1 provisioning |
| 1 | UI Foundation | Design system, home/shop pages, navigation, components |
| 2 | Data Layer | D1 schema, product API, seeded products, frontend integration |
| 3 | Purchase Flow | Cart, checkout, stock reservation, payment instructions |
| 4 | Payment Proof | Proof submission API + UI, admin visibility |
| 5 | Customer Accounts | Magic link auth, sessions, order history, checkout pre-fill |
| 6 | Admin | Dashboard, fulfillment workflow, inventory + product catalog management |
| 7 | Email | Resend integration, 4 email templates (incl. magic link), failure handling |
| 8 | Polish | SEO, legal pages, performance, cross-browser testing |

---

## Definition of Done

A developer can implement a production-ready v1 ecommerce platform using this plan that:

1. Runs entirely on Cloudflare infrastructure (Pages + Workers + D1)
2. Displays products with the CNX AthletX brand identity (warm, athletic, Chiang Mai community)
3. Accepts orders with manual PromptPay/bank transfer payment
4. Allows customers to submit payment proof
5. Supports passwordless customer accounts (magic link) with order history and checkout pre-fill
6. Provides admin dashboard for payment verification, packing, shipping, cancellation, and product/inventory management
7. Sends transactional emails via Resend at key lifecycle events
8. Complies with Thai FDA supplement advertising rules
9. Includes PDPA-compliant privacy policy
10. Scores 90+ on Lighthouse performance
11. Works on desktop and mobile browsers
