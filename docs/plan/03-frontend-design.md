# CNX AthletX Frontend Implementation Plan

## 1. UX Information Architecture

### Sitemap & Navigation Hierarchy

```
CNX AthletX
├── Public Storefront
│   ├── Home (/)
│   ├── Shop (/shop)
│   ├── Product Detail (/product/:slug)
│   ├── Cart (/cart)
│   ├── Checkout (/checkout)
│   ├── Payment Instructions (/order/:id/payment)
│   ├── Order Confirmation (/order/:id/confirmation)
│   ├── Order Status (/order/status OR /order/:id)
│   ├── Privacy Policy (/privacy)
│   └── Terms of Service (/terms)
│
└── Admin Portal (Cloudflare Access Protected)
    ├── Orders List (/admin/orders)
    ├── Order Detail (/admin/orders/:id)
    └── Inventory Management (/admin/inventory)
```

### User Flow: Checkout Journey

```
1. Browse Products (Shop or Home)
   ↓
2. View Product Detail
   ↓
3. Add to Cart (cart icon updates with count badge)
   ↓
4. View Cart (/cart)
   - Review items
   - Adjust quantities
   - Remove items
   ↓
5. Proceed to Checkout (/checkout)
   - View stepper: [Cart] → [Details] → [Payment] → [Confirmation]
   - Fill customer information
   - Fill shipping address
   - Review order summary
   - Place Order
   ↓
6. Payment Instructions (/order/:id/payment)
   - Stepper: [Cart] → [Details] → [Payment] → [Confirmation]
   - View PromptPay QR code
   - View bank transfer details
   - Copy order reference
   - Upload/enter payment proof (optional)
   ↓
7. Order Confirmation (/order/:id/confirmation)
   - Stepper: [Cart] → [Details] → [Payment] → [✓ Confirmation]
   - Order summary
   - "What's next" instructions
   - Link to order status
   ↓
8. Order Status Tracking (/order/:id)
   - Enter order reference (if not in URL)
   - View order lifecycle timeline
   - Check current status
   - View tracking info (when shipped)
```

### Admin Flow: Order Management

```
1. Orders List (/admin/orders)
   - Filter by status tab
   - Search by order ID or customer
   ↓
2. Order Detail (/admin/orders/:id)
   - View complete order information
   - Verify payment proof
   - Take status-based actions:
     * pending_payment → Mark Paid / Cancel
     * paid → Pack / Cancel
     * packed → Ship (enter tracking) / Cancel
     * shipped → Mark Delivered
     * delivered → (no actions)
     * cancelled → (no actions)
   ↓
3. Update Inventory (/admin/inventory)
   - View stock levels
   - Adjust quantities
   - Monitor reserved vs available
```

---

## 2. Visual Design System — Tailwind Configuration

### Theme System

**Dark mode is the default theme.** Light mode is available via a user toggle (persisted in localStorage).

The theme uses **CSS custom properties** that swap via a `.light` class on `<html>`. All Tailwind utility classes (`bg-background`, `text-foreground`, etc.) automatically adapt — no `dark:` prefixes needed on individual elements.

- `:root` = dark theme (default)
- `:root.light` = light theme (opt-in)
- `@theme` in Tailwind CSS v4 references the variables

**Flash Prevention (`index.html`):**

```html
<script>
  if (localStorage.getItem('cnx-theme') === 'light') {
    document.documentElement.classList.add('light');
  }
</script>
```

Place in `<head>` before any CSS. No class = dark (default). Only `.light` is ever added.

### Color Palette

**Dark Theme (Default):**

| Token | Value | Notes |
|-------|-------|-------|
| `background` | `#0A0A0A` | Near-black, OLED-friendly |
| `foreground` | `#F4F3EE` | Warm white text |
| `primary` | `#3A8563` | Brighter green for dark contrast |
| `primary-light` | `#4A9B73` | Hover state |
| `primary-dark` | `#2F6B4F` | Active/pressed |
| `accent` | `#D4AD4A` | Brighter gold for dark bg |
| `accent-light` | `#E0BF60` | — |
| `sage` | `#9BBFAC` | Slightly lighter for readability |
| `sand` | `#1A1A1A` | Dark border/divider |
| `surface` | `#141414` | Card backgrounds |
| `surface-alt` | `#1E1E1E` | Elevated surfaces, hover, inputs |
| `muted` | `#A0A0A0` | Readable gray on dark |
| `error` | `#EF4444` | Brighter red |
| `success` | `#22C55E` | Brighter green |
| `footer-bg` | `#111111` | Always-dark footer |

**Light Theme (Toggle):**

| Token | Value | Notes |
|-------|-------|-------|
| `background` | `#F4F3EE` | Warm Natural White |
| `foreground` | `#1A1A1A` | Deep Charcoal |
| `primary` | `#2F6B4F` | Chiang Mai Green |
| `primary-light` | `#3A8563` | — |
| `primary-dark` | `#245539` | — |
| `accent` | `#C59A2D` | Northern Gold |
| `accent-light` | `#D4AD4A` | — |
| `sage` | `#8AAE9B` | — |
| `sand` | `#D9CDBF` | — |
| `surface` | `#FFFFFF` | White cards |
| `surface-alt` | `#F4F3EE` | — |
| `muted` | `#6B7280` | — |
| `error` | `#DC2626` | — |
| `success` | `#16A34A` | — |
| `footer-bg` | `#1A1A1A` | Always-dark footer |

**Color Usage Rules:**
1. **Dark mode is default** — the brand's primary expression. Near-black creates a premium, high-contrast feel
2. **Chiang Mai Green drives action** — all primary CTAs, active states, highlights
3. **Northern Gold is BADGE-ONLY** — never large areas, only small `bg-accent/10` badges
4. **Surface differentiation** — on dark bg, cards use `surface` (#141414); hover/inputs use `surface-alt` (#1E1E1E)
5. **Shadows disabled in dark mode** — use `ring-1 ring-[var(--card-ring)]` for subtle elevation instead
6. **Footer is always dark** — uses `footer-bg` variable to avoid the foreground/background inversion

### Tailwind CSS v4 Configuration

**File: `src/styles/tailwind.css`**

```css
@import "tailwindcss";

/* === Theme Variables === */
:root {
  /* Dark theme (default) */
  --bg: #0A0A0A;
  --fg: #F4F3EE;
  --primary: #3A8563;
  --primary-light: #4A9B73;
  --primary-dark: #2F6B4F;
  --accent: #D4AD4A;
  --accent-light: #E0BF60;
  --sage: #9BBFAC;
  --sand: #1A1A1A;
  --surface: #141414;
  --surface-alt: #1E1E1E;
  --muted: #A0A0A0;
  --error: #EF4444;
  --success: #22C55E;
  --footer-bg: #111111;

  /* Status pill colors */
  --status-pending-bg: rgb(120 53 15 / 0.5);
  --status-pending-text: #FCD34D;
  --status-paid-bg: rgb(30 58 138 / 0.5);
  --status-paid-text: #93C5FD;
  --status-packed-bg: rgb(88 28 135 / 0.5);
  --status-packed-text: #D8B4FE;
  --status-delivered-bg: rgb(20 83 45 / 0.5);
  --status-delivered-text: #86EFAC;
  --status-cancelled-bg: rgb(127 29 29 / 0.5);
  --status-cancelled-text: #FCA5A5;

  /* Warning notice colors */
  --warning-bg: rgb(120 53 15 / 0.15);
  --warning-border: rgb(217 119 6 / 0.3);
  --warning-text: #FCD34D;

  /* Shadows: none in dark mode (use card-ring for elevation) */
  --shadow-sm: none;
  --shadow-md: none;
  --shadow-lg: none;
  --card-ring: rgb(255 255 255 / 0.05);
}

:root.light {
  --bg: #F4F3EE;
  --fg: #1A1A1A;
  --primary: #2F6B4F;
  --primary-light: #3A8563;
  --primary-dark: #245539;
  --accent: #C59A2D;
  --accent-light: #D4AD4A;
  --sage: #8AAE9B;
  --sand: #D9CDBF;
  --surface: #FFFFFF;
  --surface-alt: #F4F3EE;
  --muted: #6B7280;
  --error: #DC2626;
  --success: #16A34A;
  --footer-bg: #1A1A1A;

  --status-pending-bg: #FEF3C7;
  --status-pending-text: #92400E;
  --status-paid-bg: #DBEAFE;
  --status-paid-text: #1E3A8A;
  --status-packed-bg: #F3E8FF;
  --status-packed-text: #581C87;
  --status-delivered-bg: #DCFCE7;
  --status-delivered-text: #14532D;
  --status-cancelled-bg: #FEE2E2;
  --status-cancelled-text: #7F1D1D;

  --warning-bg: #FFFBEB;
  --warning-border: #FDE68A;
  --warning-text: #92400E;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --card-ring: transparent;
}

@theme {
  /* Colors — all reference CSS variables, swap with theme */
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-primary: var(--primary);
  --color-primary-light: var(--primary-light);
  --color-primary-dark: var(--primary-dark);
  --color-accent: var(--accent);
  --color-accent-light: var(--accent-light);
  --color-sage: var(--sage);
  --color-sand: var(--sand);
  --color-surface: var(--surface);
  --color-surface-alt: var(--surface-alt);
  --color-muted: var(--muted);
  --color-error: var(--error);
  --color-success: var(--success);
  --color-footer-bg: var(--footer-bg);

  /* Typography */
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;

  /* Spacing */
  --container-max-width: 1280px;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
}

/* Typography Utilities */
.text-h1 {
  font-size: 2.5rem;
  line-height: 3rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--color-foreground);
}

.text-h2 {
  font-size: 2rem;
  line-height: 2.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--color-foreground);
}

.text-h3 {
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 600;
  color: var(--color-foreground);
}

.text-body {
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: 400;
  color: var(--color-foreground);
}

.text-small {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 400;
  color: var(--color-muted);
}

.text-caption {
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted);
}

/* Container */
.container {
  max-width: var(--container-max-width);
  margin-left: auto;
  margin-right: auto;
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (min-width: 640px) {
  .container {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}

/* Section Spacing */
.section-padding {
  padding-top: 4rem;
  padding-bottom: 4rem;
}

@media (min-width: 640px) {
  .section-padding {
    padding-top: 6rem;
    padding-bottom: 6rem;
  }
}
```

### Tailwind Configuration (TypeScript)

**File: `tailwind.config.ts`** (for content paths only — colors defined via CSS variables above)

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
} satisfies Config
```

---

## 3. Component Specifications

### 1. Primary Button

**Visual Description:**  
Solid Chiang Mai Green background, white text, medium rounded corners, generous padding. Used for primary CTAs like "Add to Cart", "Checkout", "Place Order".

**Tailwind Classes:**
```html
<button class="bg-primary text-surface rounded-md px-6 py-3 font-semibold transition-colors duration-200 hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
  Add to Cart
</button>
```

**States:**
- **Default:** `bg-primary text-surface`
- **Hover:** `hover:bg-primary-dark`
- **Active:** `active:bg-primary-dark active:scale-95`
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed`
- **Focus:** `focus:ring-2 focus:ring-primary focus:ring-offset-2`

**Variants:**
- **Full Width:** Add `w-full` class
- **Large:** `px-8 py-4 text-lg`
- **Small:** `px-4 py-2 text-sm`

---

### 2. Secondary Button

**Visual Description:**  
Outlined button with Deep Charcoal border and text, transparent background. Inverts to solid on hover (dark background, light text). Used for secondary actions like "Continue Shopping".

**Tailwind Classes:**
```html
<button class="border-2 border-foreground text-foreground bg-transparent rounded-md px-6 py-3 font-semibold transition-all duration-200 hover:bg-foreground hover:text-background disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2">
  Continue Shopping
</button>
```

**States:**
- **Default:** `border-2 border-foreground text-foreground bg-transparent`
- **Hover:** `hover:bg-foreground hover:text-background`
- **Active:** `active:scale-95`
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed`
- **Focus:** `focus:ring-2 focus:ring-foreground focus:ring-offset-2`

---

### 3. Ghost Button

**Visual Description:**  
Text-only button in primary color with underline on hover. Minimal visual weight, used for tertiary actions like "View Details", "Learn More".

**Tailwind Classes:**
```html
<button class="text-primary font-semibold underline-offset-4 hover:underline transition-all duration-200 focus:outline-none focus:underline">
  Learn More
</button>
```

**States:**
- **Default:** `text-primary font-semibold underline-offset-4`
- **Hover:** `hover:underline`
- **Active:** `active:opacity-75`
- **Focus:** `focus:underline focus:outline-none`

---

### 4. Badge

**Visual Description:**  
Northern Gold accent badge with transparent background and gold text. Small, pill-shaped with uppercase text. Used ONLY for minimal accents: product weight, "New", "Best Seller".

**Tailwind Classes:**
```html
<span class="inline-flex items-center bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1">
  500g
</span>
```

**Variants:**
- **Product Weight:** `bg-accent/10 text-accent` - "500g", "1kg"
- **New:** `bg-accent/10 text-accent` - "New"
- **Best Seller:** `bg-accent/10 text-accent` - "Best Seller"

**Usage Rule:**  
NEVER use gold for large areas. Gold appears ONLY in small badge form.

---

### 5. Product Card

**Visual Description:**  
Clean white card with subtle shadow, rounded corners. Product image fills top portion (4:3 aspect), content section below with product name, weight badge, price (large and bold), and primary CTA button. Elevates on hover.

**Tailwind Classes:**
```html
<div class="group bg-surface rounded-lg shadow-sm ring-1 ring-[var(--card-ring)] overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-1">
  <!-- Image Container -->
  <div class="aspect-[4/3] overflow-hidden bg-sand">
    <img 
      src="/product-image.jpg" 
      alt="Product name"
      class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  </div>
  
  <!-- Content -->
  <div class="p-6 space-y-4">
    <!-- Name & Badge -->
    <div class="space-y-2">
      <h3 class="text-xl font-semibold text-foreground">Plant Protein Powder</h3>
      <span class="inline-flex items-center bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1">
        500g
      </span>
    </div>
    
    <!-- Price -->
    <p class="text-2xl font-bold text-foreground">฿890</p>
    
    <!-- CTA -->
    <button class="w-full bg-primary text-surface rounded-md px-6 py-3 font-semibold transition-colors duration-200 hover:bg-primary-dark">
      Add to Cart
    </button>
  </div>
</div>
```

**States:**
- **Default:** `shadow-sm`
- **Hover:** `hover:shadow-md hover:-translate-y-1`, image `group-hover:scale-105`
- **Out of Stock:** Add overlay with `absolute inset-0 bg-foreground/10` and "Out of Stock" badge

**Layout Structure:**
- Image: `aspect-[4/3]` with `object-cover`
- Content padding: `p-6`
- Spacing: `space-y-4` between elements
- Button: `w-full` to fill card width

---

### 6. Checkout Stepper

**Visual Description:**  
Horizontal progress indicator showing 4 checkout steps. Active step has green circle with step number, bold text. Completed steps show green circle with checkmark. Upcoming steps show muted circle with step number, muted text. Connecting lines between circles.

**Tailwind Classes:**
```html
<nav aria-label="Checkout progress" class="py-8">
  <ol class="flex items-center justify-between max-w-3xl mx-auto">
    <!-- Step 1: Completed -->
    <li class="flex items-center flex-1">
      <div class="flex flex-col items-center flex-1">
        <div class="flex items-center w-full">
          <!-- Circle -->
          <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-surface font-semibold">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <!-- Connecting Line -->
          <div class="flex-1 h-0.5 bg-primary mx-2"></div>
        </div>
        <!-- Label -->
        <span class="mt-2 text-sm font-semibold text-foreground">Cart</span>
      </div>
    </li>
    
    <!-- Step 2: Active -->
    <li class="flex items-center flex-1">
      <div class="flex flex-col items-center flex-1">
        <div class="flex items-center w-full">
          <div class="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-surface font-semibold border-4 border-primary-light">
            2
          </div>
          <div class="flex-1 h-0.5 bg-muted/30 mx-2"></div>
        </div>
        <span class="mt-2 text-sm font-bold text-primary">Details</span>
      </div>
    </li>
    
    <!-- Step 3: Upcoming -->
    <li class="flex items-center flex-1">
      <div class="flex flex-col items-center flex-1">
        <div class="flex items-center w-full">
          <div class="w-10 h-10 bg-muted/20 rounded-full flex items-center justify-center text-muted font-semibold">
            3
          </div>
          <div class="flex-1 h-0.5 bg-muted/30 mx-2"></div>
        </div>
        <span class="mt-2 text-sm text-muted">Payment</span>
      </div>
    </li>
    
    <!-- Step 4: Upcoming (no connecting line after) -->
    <li class="flex items-center">
      <div class="flex flex-col items-center">
        <div class="w-10 h-10 bg-muted/20 rounded-full flex items-center justify-center text-muted font-semibold">
          4
        </div>
        <span class="mt-2 text-sm text-muted">Confirmation</span>
      </div>
    </li>
  </ol>
</nav>
```

**Step States:**
- **Completed:** `bg-primary text-surface` with checkmark icon, `text-foreground font-semibold` label, `bg-primary` connecting line
- **Active:** `bg-primary text-surface` with step number, `border-4 border-primary-light`, `text-primary font-bold` label, `bg-muted/30` connecting line
- **Upcoming:** `bg-muted/20 text-muted` with step number, `text-muted` label, `bg-muted/30` connecting line

**Responsive:**
- Desktop: Horizontal layout as shown
- Mobile: Switch to vertical layout or simplified indicator (current step only)

---

### 7. Order Status Pill

**Visual Description:**  
Small pill-shaped status indicator with color-coded backgrounds and text. Rounded fully, uppercase text, medium font weight. Each status has its own color scheme.

**Tailwind Classes:**

Status pills use CSS variable colors so they adapt to dark/light themes automatically.

```html
<!-- Pending Payment -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">
  Pending Payment
</span>

<!-- Paid -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-paid-bg)] text-[var(--status-paid-text)]">
  Paid
</span>

<!-- Packed -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-packed-bg)] text-[var(--status-packed-text)]">
  Packed
</span>

<!-- Shipped -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-primary/15 text-primary">
  Shipped
</span>

<!-- Delivered -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-delivered-bg)] text-[var(--status-delivered-text)]">
  Delivered
</span>

<!-- Cancelled -->
<span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-cancelled-bg)] text-[var(--status-cancelled-text)]">
  Cancelled
</span>
```

**Status Color Mapping (theme-aware via CSS variables):**
- `pending_payment`: Dark: `amber-900/50 + amber-300` | Light: `amber-100 + amber-800`
- `paid`: Dark: `blue-900/50 + blue-300` | Light: `blue-100 + blue-800`
- `packed`: Dark: `purple-900/50 + purple-300` | Light: `purple-100 + purple-800`
- `shipped`: `bg-primary/15 text-primary` (works in both themes)
- `delivered`: Dark: `green-900/50 + green-300` | Light: `green-100 + green-800`
- `cancelled`: Dark: `red-900/50 + red-300` | Light: `red-100 + red-800`

---

### 8. Navbar

**Visual Description:**  
Sticky header with semi-transparent warm white background and blur effect. Logo aligned left, navigation links center, cart icon with count badge aligned right. Bottom border in sand color. Mobile collapses to hamburger menu with slide-out drawer.

**Tailwind Classes:**
```html
<header class="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-sand">
  <div class="container">
    <div class="flex items-center justify-between h-16">
      <!-- Logo -->
      <a href="/" class="flex items-center">
        <img src="/logo.svg" alt="CNX AthletX" class="h-8" />
      </a>
      
      <!-- Desktop Navigation -->
      <nav class="hidden md:flex items-center space-x-8">
        <a href="/" class="text-sm font-semibold text-foreground hover:text-primary transition-colors">
          Home
        </a>
        <a href="/shop" class="text-sm font-semibold text-foreground hover:text-primary transition-colors">
          Shop
        </a>
        <a href="/order/status" class="text-sm font-semibold text-foreground hover:text-primary transition-colors">
          Track Order
        </a>
      </nav>
      
      <!-- Theme Toggle + Cart Icon -->
      <div class="flex items-center space-x-4">
        <!-- Theme Toggle (Component 14) -->
        <button @click="toggle" class="p-2 text-foreground hover:text-primary transition-colors" aria-label="Toggle theme">
          <!-- Sun icon (shown in dark mode) -->
          <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <!-- Moon icon (shown in light mode) -->
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        </button>

        <a href="/cart" class="relative p-2 text-foreground hover:text-primary transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          <!-- Count Badge -->
          <span class="absolute -top-1 -right-1 bg-primary text-surface text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            3
          </span>
        </a>
        
        <!-- Mobile Menu Button -->
        <button class="md:hidden p-2 text-foreground hover:text-primary transition-colors">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</header>

<!-- Mobile Drawer (hidden by default, shown with animation) -->
<div class="fixed inset-0 z-50 bg-foreground/50 backdrop-blur-sm md:hidden hidden" aria-hidden="true">
  <div class="fixed inset-y-0 right-0 w-64 bg-surface shadow-lg transform transition-transform duration-300">
    <div class="p-6 space-y-6">
      <button class="text-foreground hover:text-primary">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <nav class="flex flex-col space-y-4">
        <a href="/" class="text-lg font-semibold text-foreground hover:text-primary">Home</a>
        <a href="/shop" class="text-lg font-semibold text-foreground hover:text-primary">Shop</a>
        <a href="/order/status" class="text-lg font-semibold text-foreground hover:text-primary">Track Order</a>
      </nav>
    </div>
  </div>
</div>
```

**States:**
- **Default:** `bg-background/95 backdrop-blur-sm`
- **Link Hover:** `hover:text-primary`
- **Scroll State:** Already sticky, no color change needed
- **Mobile Menu Open:** Drawer slides in from right with `transform translate-x-0`, overlay visible

**Behavior:**
- Sticky positioning: `sticky top-0 z-50`
- Cart badge updates dynamically based on cart item count
- Mobile breakpoint: `md:` prefix

---

### 9. Footer

**Visual Description:**
Always-dark footer regardless of theme. Three-column grid on desktop: brand info (left), quick links (center), contact info (right). Bottom bar with copyright and legal links. Single column stack on mobile. Uses `footer-bg` CSS variable (dark: `#111111`, light: `#1A1A1A`) to avoid the foreground/background color inversion issue.

**Tailwind Classes:**
```html
<footer class="bg-footer-bg text-background/80">
  <!-- Main Footer Content -->
  <div class="container section-padding">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
      <!-- Brand Info -->
      <div class="space-y-4">
        <img src="/logo-light.svg" alt="CNX AthletX" class="h-8" />
        <p class="text-sm leading-relaxed">
          Clean athletic everyday health. Plant-based protein powder from Chiang Mai's active community.
        </p>
      </div>
      
      <!-- Quick Links -->
      <div class="space-y-4">
        <h3 class="text-background font-semibold">Quick Links</h3>
        <nav class="flex flex-col space-y-2">
          <a href="/shop" class="text-sm hover:text-background transition-colors">Shop</a>
          <a href="/order/status" class="text-sm hover:text-background transition-colors">Track Order</a>
          <a href="/privacy" class="text-sm hover:text-background transition-colors">Privacy Policy</a>
          <a href="/terms" class="text-sm hover:text-background transition-colors">Terms of Service</a>
        </nav>
      </div>
      
      <!-- Contact Info -->
      <div class="space-y-4">
        <h3 class="text-background font-semibold">Contact</h3>
        <div class="space-y-2 text-sm">
          <p>Chiang Mai, Thailand</p>
          <p>contact@cnxnature.com</p>
          <div class="flex space-x-4 pt-2">
            <a href="#" class="hover:text-background transition-colors" aria-label="Instagram">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
            <a href="#" class="hover:text-background transition-colors" aria-label="Facebook">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Bottom Bar -->
  <div class="border-t border-background/20">
    <div class="container py-6">
      <div class="flex flex-col md:flex-row justify-between items-center space-y-2 md:space-y-0 text-sm">
        <p>&copy; 2026 CNX AthletX. All rights reserved.</p>
        <div class="flex space-x-6">
          <a href="/privacy" class="hover:text-background transition-colors">Privacy</a>
          <a href="/terms" class="hover:text-background transition-colors">Terms</a>
        </div>
      </div>
    </div>
  </div>
</footer>
```

**Layout:**
- Desktop: 3-column grid with `gap-12`
- Mobile: Single column stack
- Bottom bar: Flex row on desktop, column on mobile

---

### 10. Admin Table

**Visual Description:**  
Full-width table on white surface with rounded corners and subtle shadow. Header row has background fill with small uppercase labels. Data rows have bottom borders and hover state. Status pills in status column. Action buttons in rightmost column.

**Tailwind Classes:**
```html
<div class="bg-surface rounded-lg shadow-sm ring-1 ring-[var(--card-ring)] overflow-hidden">
  <table class="w-full">
    <thead>
      <tr class="bg-background border-b border-sand">
        <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
          Order ID
        </th>
        <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
          Customer
        </th>
        <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
          Date
        </th>
        <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
          Total
        </th>
        <th class="px-6 py-3 text-left text-xs font-semibold text-foreground uppercase tracking-wider">
          Status
        </th>
        <th class="px-6 py-3 text-right text-xs font-semibold text-foreground uppercase tracking-wider">
          Actions
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-sand">
      <tr class="hover:bg-background/50 transition-colors">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
          #ORD-2026-001
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-foreground">
          Somchai Rattanakosin
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-muted">
          2026-02-11
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-foreground">
          ฿890
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]">
            Pending Payment
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
          <a href="/admin/orders/ORD-2026-001" class="text-primary font-semibold hover:underline">
            View
          </a>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

**Header:**
- `bg-background` with `border-b border-sand`
- Text: `text-xs font-semibold uppercase tracking-wider`
- Padding: `px-6 py-3`

**Rows:**
- Dividers: `divide-y divide-sand`
- Hover: `hover:bg-background/50`
- Cell padding: `px-6 py-4`
- Text sizes: `text-sm` for most cells, `text-xs` for actions

**Responsive:**
- Minimum table width enforced via parent container `overflow-x-auto`
- Mobile: Horizontal scroll enabled

---

### 11. Admin Action Button Set

**Visual Description:**  
Contextual button group that changes based on order status. Buttons appear horizontally aligned (desktop) or stacked (mobile). Primary actions use green button, destructive actions use red outline button.

**Tailwind Classes:**
```html
<!-- For status: pending_payment -->
<div class="flex flex-col sm:flex-row gap-3">
  <button class="bg-primary text-surface rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:bg-primary-dark">
    Mark as Paid
  </button>
  <button class="border-2 border-error text-error bg-transparent rounded-md px-4 py-2 text-sm font-semibold transition-all hover:bg-error hover:text-surface">
    Cancel Order
  </button>
</div>

<!-- For status: paid -->
<div class="flex flex-col sm:flex-row gap-3">
  <button class="bg-primary text-surface rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:bg-primary-dark">
    Mark as Packed
  </button>
  <button class="border-2 border-error text-error bg-transparent rounded-md px-4 py-2 text-sm font-semibold transition-all hover:bg-error hover:text-surface">
    Cancel Order
  </button>
</div>

<!-- For status: packed -->
<div class="space-y-3">
  <button class="w-full bg-primary text-surface rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:bg-primary-dark">
    Mark as Shipped
  </button>
  <!-- Shipping details form appears here when clicked -->
  <div class="space-y-3 bg-background p-4 rounded-md">
    <input type="text" placeholder="Tracking Number" class="w-full rounded-md border border-sand px-3 py-2 text-sm" />
    <input type="text" placeholder="Carrier Name" class="w-full rounded-md border border-sand px-3 py-2 text-sm" />
    <button class="w-full bg-primary text-surface rounded-md px-4 py-2 text-sm font-semibold">
      Confirm Shipment
    </button>
  </div>
</div>

<!-- For status: shipped -->
<div class="flex flex-col sm:flex-row gap-3">
  <button class="bg-success text-surface rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:bg-success/90">
    Mark as Delivered
  </button>
</div>

<!-- For status: delivered or cancelled -->
<p class="text-sm text-muted italic">No actions available</p>
```

**Action Logic:**
- `pending_payment`: "Mark as Paid" (primary), "Cancel Order" (error outline)
- `paid`: "Mark as Packed" (primary), "Cancel Order" (error outline)
- `packed`: "Mark as Shipped" (primary) → reveals shipping form
- `shipped`: "Mark as Delivered" (success)
- `delivered`: No actions
- `cancelled`: No actions

**Button Styles:**
- Primary action: `bg-primary text-surface hover:bg-primary-dark`
- Success action: `bg-success text-surface hover:bg-success/90`
- Cancel action: `border-2 border-error text-error hover:bg-error hover:text-surface`

---

### 12. Payment Instructions Card

**Visual Description:**  
Large prominent card on payment page displaying PromptPay QR code, bank transfer details, order reference (large, copyable), payment amount (bold), step-by-step instructions, and optional payment proof upload.

**Tailwind Classes:**
```html
<div class="bg-surface rounded-lg shadow-md p-8 space-y-8">
  <!-- Header -->
  <div class="text-center space-y-2">
    <h2 class="text-h2">Complete Your Payment</h2>
    <p class="text-small">Please transfer the exact amount using one of the methods below</p>
  </div>
  
  <!-- Order Reference (Prominent) -->
  <div class="bg-sand/30 rounded-lg p-6 text-center space-y-2">
    <p class="text-caption">Order Reference</p>
    <p class="text-3xl font-bold text-foreground font-mono tracking-wider">#ORD-2026-001</p>
    <button class="text-primary text-sm font-semibold hover:underline">
      Copy Reference
    </button>
  </div>
  
  <!-- Amount -->
  <div class="text-center space-y-1">
    <p class="text-caption">Amount to Transfer</p>
    <p class="text-4xl font-bold text-primary">฿890</p>
  </div>
  
  <!-- Payment Methods -->
  <div class="grid md:grid-cols-2 gap-8">
    <!-- PromptPay QR -->
    <div class="space-y-4">
      <h3 class="text-h3 text-center">PromptPay QR Code</h3>
      <div class="bg-surface border-2 border-sand rounded-lg p-6 flex justify-center">
        <div class="w-64 h-64 bg-sand flex items-center justify-center">
          <img src="/qr-code.png" alt="PromptPay QR Code" class="w-full h-full" />
        </div>
      </div>
      <p class="text-small text-center">Scan with your banking app</p>
    </div>
    
    <!-- Bank Transfer -->
    <div class="space-y-4">
      <h3 class="text-h3 text-center">Bank Transfer</h3>
      <div class="bg-background rounded-lg p-6 space-y-3 text-sm">
        <div class="flex justify-between">
          <span class="text-muted">Bank:</span>
          <span class="font-semibold">Bangkok Bank</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Account Name:</span>
          <span class="font-semibold">CNX AthletX Co., Ltd.</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Account Number:</span>
          <span class="font-semibold font-mono">123-4-56789-0</span>
        </div>
        <div class="pt-3 border-t border-sand">
          <p class="text-xs text-muted italic">
            Please include your order reference in the transfer note
          </p>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Instructions -->
  <div class="bg-primary/5 rounded-lg p-6 space-y-4">
    <h3 class="text-h3">What to do next:</h3>
    <ol class="space-y-3 text-sm">
      <li class="flex">
        <span class="font-bold text-primary mr-3">1.</span>
        <span>Transfer the exact amount (฿890) using PromptPay QR or bank transfer</span>
      </li>
      <li class="flex">
        <span class="font-bold text-primary mr-3">2.</span>
        <span>Include your order reference (#ORD-2026-001) in the transfer note</span>
      </li>
      <li class="flex">
        <span class="font-bold text-primary mr-3">3.</span>
        <span>Upload your payment slip below (optional but recommended for faster processing)</span>
      </li>
      <li class="flex">
        <span class="font-bold text-primary mr-3">4.</span>
        <span>We'll verify your payment within 24 hours and update your order status</span>
      </li>
    </ol>
  </div>
  
  <!-- Payment Proof Upload (Optional) -->
  <div class="space-y-4">
    <h3 class="text-h3">Upload Payment Proof (Optional)</h3>
    <div class="border-2 border-dashed border-sand rounded-lg p-8 text-center space-y-4">
      <svg class="w-12 h-12 mx-auto text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      <div>
        <button class="text-primary font-semibold hover:underline">
          Click to upload
        </button>
        <p class="text-small">or drag and drop your payment slip</p>
      </div>
      <p class="text-caption">PNG, JPG or PDF (max 5MB)</p>
    </div>
    <input type="text" placeholder="Or enter transaction reference number" class="w-full rounded-md border border-sand px-4 py-3 text-sm" />
    <button class="w-full bg-primary text-surface rounded-md px-6 py-3 font-semibold hover:bg-primary-dark">
      Submit Payment Proof
    </button>
  </div>
  
  <!-- Timer Notice (theme-aware warning colors) -->
  <div class="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg p-4 flex items-start space-x-3">
    <svg class="w-5 h-5 text-[var(--warning-text)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <div class="text-sm text-[var(--warning-text)]">
      <p class="font-semibold">Payment deadline: 24 hours</p>
      <p>Please complete payment by Feb 12, 2026 11:30 AM to secure your order</p>
    </div>
  </div>
</div>
```

**Key Elements:**
- Order reference: Large `text-3xl font-mono` on sand background, copyable
- Amount: Extra large `text-4xl font-bold text-primary`
- QR code: Square container `w-64 h-64`
- Bank details: Grid layout with label/value pairs
- Instructions: Numbered list with primary color numbers
- Upload area: Dashed border `border-2 border-dashed`
- Timer notice: Amber warning card

---

### 13. Cart Item Row

**Visual Description:**  
Horizontal layout showing product thumbnail, name, weight badge, quantity selector (minus/count/plus buttons), line total, and remove button. Stacks vertically on mobile.

**Tailwind Classes:**
```html
<div class="flex flex-col sm:flex-row sm:items-center gap-4 py-6 border-b border-sand">
  <!-- Product Image -->
  <div class="flex-shrink-0">
    <img src="/product-thumb.jpg" alt="Product name" class="w-24 h-24 object-cover rounded-md bg-sand" />
  </div>
  
  <!-- Product Info -->
  <div class="flex-1 space-y-2">
    <h3 class="text-lg font-semibold text-foreground">Plant Protein Powder</h3>
    <span class="inline-flex items-center bg-accent/10 text-accent text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1">
      500g
    </span>
    <p class="text-sm text-muted">฿890 each</p>
  </div>
  
  <!-- Quantity Selector -->
  <div class="flex items-center space-x-3">
    <button class="w-8 h-8 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-background transition-colors disabled:opacity-50">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
      </svg>
    </button>
    <span class="text-lg font-semibold text-foreground w-8 text-center">2</span>
    <button class="w-8 h-8 rounded-md border border-sand flex items-center justify-center text-foreground hover:bg-background transition-colors">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
  
  <!-- Line Total -->
  <div class="text-right">
    <p class="text-xl font-bold text-foreground">฿1,780</p>
  </div>
  
  <!-- Remove Button -->
  <button class="text-error hover:text-error/80 transition-colors">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  </button>
</div>
```

**Responsive Behavior:**
- Desktop: `flex-row` with `items-center`
- Mobile: `flex-col` stacked layout
- Image: Fixed size `w-24 h-24`
- Quantity buttons: `w-8 h-8` square buttons
- Remove: Icon button in error color

---

### 14. Theme Toggle Button

**Visual Description:**
Simple icon button that toggles between dark (default) and light mode. Shows a sun icon in dark mode, moon icon in light mode. Appears in the navbar between nav links and cart icon. Also appears in the mobile slide-out drawer.

**Vue Composable: `src/composables/useTheme.ts`**
```typescript
import { ref } from 'vue'

const STORAGE_KEY = 'cnx-theme'
const isDark = ref(!document.documentElement.classList.contains('light'))

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
    if (isDark.value) {
      document.documentElement.classList.remove('light')
      localStorage.setItem(STORAGE_KEY, 'dark')
    } else {
      document.documentElement.classList.add('light')
      localStorage.setItem(STORAGE_KEY, 'light')
    }
  }

  return { isDark, toggle }
}
```

**Tailwind Classes:**
```html
<button @click="toggle" class="p-2 text-foreground hover:text-primary transition-colors" aria-label="Toggle theme">
  <!-- Sun icon (shown in dark mode — click to switch to light) -->
  <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
  <!-- Moon icon (shown in light mode — click to switch to dark) -->
  <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
</button>
```

**States:**
- **Default:** `text-foreground` (adapts with theme)
- **Hover:** `hover:text-primary`
- **Focus:** `focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background`

**Placement:**
- Desktop: In navbar, between navigation links and cart icon
- Mobile: In slide-out drawer, above navigation links

---

## 4. Page Wireframes

### HOME PAGE

**Section 1: Hero**
- **Layout:** Full-width container, 2-column grid (1 col mobile)
- **Background:** `bg-background`
- **Content:**
  - Left column: 
    - Badge: "Plant-Based Power" (Northern Gold badge)
    - H1: "Fuel Your Active Life" (text-h1)
    - Subtext: "Premium plant-based protein powder from Chiang Mai's athletic community" (text-body, text-muted)
    - Primary Button: "Shop Now"
  - Right column:
    - Hero product image (aspect-4/3, rounded-lg, overflow-hidden)
- **Padding:** `section-padding`

**Section 2: Social Proof Bar**
- **Layout:** Full-width, 3-4 columns on desktop, 2 on tablet, 1 on mobile
- **Background:** `bg-surface-alt`
- **Content:**
  - Trust signals in grid:
    - Icon + "100% Plant-Based"
    - Icon + "Made in Thailand"
    - Icon + "Community Tested"
    - Icon + "Natural Ingredients"
- **Padding:** `py-12`

**Section 3: Featured Products**
- **Layout:** Container, section title + 2-column grid (1 col mobile)
- **Background:** `bg-surface`
- **Content:**
  - Section title: "Our Products" (text-h2, text-center, mb-12)
  - Product Card × 2 (500g and 1kg variants)
- **Padding:** `section-padding`

**Section 4: Brand Story**
- **Layout:** Container, 2-column grid (1 col mobile), text-left / image-right
- **Background:** `bg-surface-alt`
- **Content:**
  - Left column:
    - Small badge: "Our Story" (text-caption, text-primary)
    - H2: "Born in Chiang Mai's Active Community"
    - Body text: Brand mission, plant-based values, local community connection
    - Ghost button: "Learn More" (future link to about page)
  - Right column:
    - Community training photo (rounded-lg, aspect-4/3, natural daylight)
    - Placeholder note: "Future: Embedded video player"
- **Padding:** `section-padding`

**Section 5: Community**
- **Layout:** Container, section title + 3-column grid (2 col tablet, 1 col mobile)
- **Background:** `bg-background`
- **Content:**
  - Section title: "Join the Community" (text-h2, text-center, mb-12)
  - Image grid: 3-4 photos of real community, outdoor Chiang Mai training sessions
  - Images: `rounded-lg overflow-hidden aspect-[4/3] object-cover`
- **Padding:** `section-padding`

**Section 6: CTA Banner**
- **Layout:** Full-width, centered text
- **Background:** `bg-primary`
- **Content:**
  - H2: "Ready to fuel your next session?" (text-surface)
  - Primary Button: "Shop Now" (white button variant: `bg-surface text-primary hover:bg-surface/90`)
- **Padding:** `py-16 text-center`

**Section 7: Footer**
- As specified in Component 9

---

### SHOP PAGE

**Section 1: Header**
- **Layout:** Container, centered text
- **Background:** `bg-background`
- **Content:**
  - H1: "Shop" (text-h1)
  - Intro text: "Choose your plant-based protein powder" (text-body, text-muted)
- **Padding:** `py-12`

**Section 2: Product Grid**
- **Layout:** Container, 2-column grid (1 col mobile)
- **Background:** `bg-background`
- **Content:**
  - Product Card × 2 (500g variant, 1kg variant)
- **Padding:** `pb-16`

**Section 3: Trust Bar**
- **Layout:** Container, 3-column grid (1 col mobile)
- **Background:** `bg-surface-alt`
- **Content:**
  - Trust badges:
    - Icon + "Free Shipping over ฿1,500"
    - Icon + "100% Quality Guarantee"
    - Icon + "Secure Payment"
- **Padding:** `py-12`

**Section 4: Footer**
- As specified in Component 9

---

### PRODUCT DETAIL PAGE

**Section 1: Breadcrumb**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Breadcrumb trail: Home / Shop / Product Name (text-sm, text-muted, linked)
- **Padding:** `py-6`

**Section 2: Product Section**
- **Layout:** Container, 2-column grid (1 col mobile)
- **Background:** `bg-background`
- **Content:**
  - Left column:
    - Large product image (aspect-square, rounded-lg, bg-sand)
  - Right column:
    - Product name (text-h2)
    - Weight badge (Northern Gold badge)
    - Price (text-4xl font-bold text-foreground)
    - Description (text-body, leading-relaxed, space-y-4)
    - Quantity selector (same as cart item row)
    - Primary Button: "Add to Cart" (w-full)
    - Stock indicator: "In Stock" or "Low Stock" (text-sm, text-success or text-error)
- **Padding:** `section-padding`

**Section 3: Details Tabs/Accordion**
- **Layout:** Container
- **Background:** `bg-surface`
- **Content:**
  - Tab navigation or accordion headers:
    - "Nutrition Facts"
    - "Ingredients"
    - "How to Use"
  - Tab content panels with detailed information
- **Padding:** `section-padding`
- **Style:** Tabs with `border-b-2 border-primary` for active state

**Section 4: Related Product**
- **Layout:** Container, centered
- **Background:** `bg-background`
- **Content:**
  - Section title: "Also Available" (text-h3)
  - Single Product Card (alternate size variant)
- **Padding:** `section-padding`

**Section 5: Footer**
- As specified in Component 9

---

### CART PAGE

**Section 1: Header**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - H1: "Shopping Cart" (text-h1)
- **Padding:** `py-12`

**Section 2: Cart Content**
- **Layout:** Container, 2-column grid (1 col mobile - sidebar becomes top section)
- **Background:** `bg-background`
- **Content:**
  - Left column (2/3 width):
    - Cart Item Row × N (as specified in Component 13)
    - Empty state (if cart empty):
      - Icon (shopping bag)
      - Text: "Your cart is empty"
      - Secondary Button: "Continue Shopping"
  - Right column (1/3 width, sticky on desktop):
    - Order summary card (bg-surface, rounded-lg, shadow-sm, p-6):
      - "Order Summary" (text-h3)
      - Subtotal row (text-sm, flex justify-between)
      - Shipping row (text-sm, flex justify-between, text-muted: "Calculated at checkout")
      - Divider (border-t border-sand, my-4)
      - Total row (text-lg font-bold, flex justify-between)
      - Primary Button: "Proceed to Checkout" (w-full)
- **Padding:** `pb-16`

**Section 3: Footer**
- As specified in Component 9

---

### CHECKOUT PAGE

**Section 1: Stepper**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Checkout Stepper (Component 6) showing step 2 (Details) active
- **Padding:** `py-8`

**Section 2: Checkout Form**
- **Layout:** Container, 2-column grid (1 col mobile - sidebar becomes top section)
- **Background:** `bg-background`
- **Content:**
  - Left column (2/3 width):
    - Form card (bg-surface, rounded-lg, shadow-sm, p-8, space-y-6):
      - Section: Customer Information
        - Input: Full Name (required)
        - Input: Email (required)
        - Input: Phone Number (required, Thai format)
      - Section: Shipping Address
        - Textarea: Address Line (required)
        - Input: District/Tambon (required)
        - Input: Province (required, dropdown with Thai provinces)
        - Input: Postal Code (required, 5 digits)
      - Section: Delivery Notes (optional)
        - Textarea: Special instructions
  - Right column (1/3 width, sticky on desktop):
    - Order summary card (same as cart page)
    - Payment method display:
      - Label: "Payment Method"
      - Text: "Thai Bank Transfer / PromptPay"
      - Note: "You'll receive payment instructions after placing your order"
    - Primary Button: "Place Order" (w-full)
- **Padding:** `pb-16`

**Form Input Style:**
```html
<input
  type="text"
  class="w-full rounded-md border border-sand bg-surface-alt px-4 py-3 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
  placeholder="Enter your name"
/>
```

**Section 3: Footer**
- As specified in Component 9

---

### PAYMENT INSTRUCTIONS PAGE

**Section 1: Stepper**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Checkout Stepper (Component 6) showing step 3 (Payment) active
- **Padding:** `py-8`

**Section 2: Payment Instructions**
- **Layout:** Container, single column (max-w-4xl mx-auto)
- **Background:** `bg-background`
- **Content:**
  - Payment Instructions Card (Component 12)
- **Padding:** `pb-16`

**Section 3: Order Summary (Collapsible)**
- **Layout:** Container, single column (max-w-4xl mx-auto)
- **Background:** `bg-background`
- **Content:**
  - Collapsible card:
    - Header: "Order Summary" with expand/collapse icon
    - Content: List of order items, subtotal, shipping, total
- **Padding:** `pb-16`

**Section 4: Footer**
- As specified in Component 9

---

### ORDER CONFIRMATION PAGE

**Section 1: Stepper**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Checkout Stepper (Component 6) showing step 4 (Confirmation) completed
- **Padding:** `py-8`

**Section 2: Confirmation Message**
- **Layout:** Container, centered, max-w-2xl mx-auto
- **Background:** `bg-background`
- **Content:**
  - Success icon (green checkmark circle, large)
  - H1: "Order Confirmed!" (text-h1, text-center)
  - Body text: "Thank you for your order. We've received your order and will begin processing once payment is verified."
  - Order reference display (large, bg-sand/30, rounded-lg, p-6):
    - Label: "Order Reference"
    - Order ID: #ORD-2026-001 (text-3xl font-mono font-bold)
    - Copy button
- **Padding:** `py-12`

**Section 3: What's Next**
- **Layout:** Container, max-w-2xl mx-auto
- **Background:** `bg-surface rounded-lg shadow-sm`
- **Content:**
  - H2: "What's Next?" (text-h2)
  - Numbered list:
    1. Complete payment using the instructions sent to your email
    2. We'll verify your payment within 24 hours
    3. Once confirmed, we'll pack and ship your order
    4. Track your order status using the link below
  - Primary Button: "View Order Status"
  - Ghost Button: "Return to Shop"
- **Padding:** `p-8`

**Section 4: Footer**
- As specified in Component 9

---

### ORDER STATUS PAGE

**Section 1: Header**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - H1: "Track Your Order" (text-h1)
- **Padding:** `py-12`

**Section 2: Order Lookup (if no order ID in URL)**
- **Layout:** Container, max-w-md mx-auto
- **Background:** `bg-surface rounded-lg shadow-sm`
- **Content:**
  - Form:
    - Label: "Enter your order reference"
    - Input: Order reference (placeholder: "#ORD-2026-001")
    - Primary Button: "Track Order" (w-full)
- **Padding:** `p-8`

**Section 3: Order Status Display (if order found)**
- **Layout:** Container, 2-column grid (1 col mobile)
- **Background:** `bg-background`
- **Content:**
  - Left column (2/3 width):
    - Status timeline card (bg-surface, rounded-lg, shadow-sm, p-8):
      - Order reference header
      - Current status pill (large variant)
      - Vertical timeline:
        - Each step with circle indicator, title, description, timestamp
        - Completed steps: green circle with checkmark
        - Current step: green circle, bold text
        - Upcoming steps: muted circle, muted text
      - Timeline steps:
        1. Order Placed (timestamp)
        2. Payment Pending (timestamp or status)
        3. Payment Verified (timestamp or pending)
        4. Packed (timestamp or pending)
        5. Shipped (timestamp or pending, + tracking info)
        6. Delivered (timestamp or pending)
  - Right column (1/3 width):
    - Order details card (bg-surface, rounded-lg, shadow-sm, p-6):
      - Section: Order Items
        - Mini item rows (image thumb, name, qty, price)
      - Section: Shipping Address
        - Full address display
      - Section: Contact
        - Email, phone
      - Total amount (text-xl font-bold)
- **Padding:** `pb-16`

**Timeline Item Style:**
```html
<div class="flex space-x-4">
  <!-- Circle indicator -->
  <div class="flex-shrink-0 w-10 h-10 rounded-full bg-success flex items-center justify-center">
    <svg class="w-5 h-5 text-surface" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
    </svg>
  </div>
  <!-- Content -->
  <div class="flex-1 pb-8">
    <p class="font-semibold text-foreground">Order Placed</p>
    <p class="text-sm text-muted">Your order has been received</p>
    <p class="text-xs text-muted mt-1">Feb 11, 2026 10:30 AM</p>
  </div>
</div>
```

**Section 4: Footer**
- As specified in Component 9

---

### ADMIN: ORDERS LIST

**Section 1: Header & Filters**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - H1: "Orders" (text-h1)
  - Status filter tabs:
    - Horizontal tab navigation (flex space-x-4)
    - Tabs: All, Pending Payment, Paid, Packed, Shipped, Cancelled
    - Active tab: `border-b-2 border-primary text-primary font-semibold`
    - Inactive tab: `text-muted hover:text-foreground`
  - Search bar:
    - Input with search icon: "Search by order ID or customer name"
- **Padding:** `py-8 space-y-6`

**Section 2: Orders Table**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Admin Table (Component 10) with columns:
    - Order ID (linked)
    - Customer (name)
    - Date (formatted)
    - Total (฿ amount)
    - Status (pill)
    - Actions ("View" link)
- **Padding:** `pb-16`

**Section 3: Pagination**
- **Layout:** Container, centered
- **Background:** `bg-background`
- **Content:**
  - Pagination controls:
    - Previous button (secondary)
    - Page numbers (clickable, active page in primary color)
    - Next button (secondary)
- **Padding:** `py-8`

---

### ADMIN: ORDER DETAIL

**Section 1: Header**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Back link: "← Back to Orders" (text-primary, hover:underline)
  - H1: "Order #ORD-2026-001" (text-h1)
  - Current status pill (large)
- **Padding:** `py-8`

**Section 2: Order Details**
- **Layout:** Container, 2-column grid (1 col tablet)
- **Background:** `bg-background`
- **Content:**
  - Left column (2/3 width):
    - Order Info Card (bg-surface, rounded-lg, shadow-sm, p-6, mb-6):
      - Order reference
      - Order date
      - Status pill
    - Customer Info Card (bg-surface, rounded-lg, shadow-sm, p-6, mb-6):
      - Customer name
      - Email (clickable mailto link)
      - Phone (clickable tel link)
      - Shipping address (full display)
    - Items Table:
      - Simple table: Product, Quantity, Price, Line Total
      - Subtotal, Shipping, Total rows at bottom
  - Right column (1/3 width):
    - Payment Info Card (bg-surface, rounded-lg, shadow-sm, p-6, mb-6):
      - Payment method: "Bank Transfer / PromptPay"
      - Transaction reference (if provided)
      - Payment proof link/image preview (if uploaded)
      - Verification status badge
    - Shipment Card (bg-surface, rounded-lg, shadow-sm, p-6, mb-6):
      - Carrier name (if shipped)
      - Tracking number (copyable, if shipped)
      - Shipped date (if shipped)
      - Empty state: "Not shipped yet"
    - Admin Action Button Set (Component 11):
      - Context-based buttons for current status
- **Padding:** `pb-16`

**Section 3: Audit Log Timeline**
- **Layout:** Container
- **Background:** `bg-surface rounded-lg shadow-sm`
- **Content:**
  - H3: "Order History" (text-h3, mb-6)
  - Vertical timeline:
    - Each entry: timestamp, action description, admin user (if applicable)
    - Example: "Feb 11, 10:30 AM - Order placed by customer"
    - Example: "Feb 11, 2:15 PM - Marked as paid by Admin User"
- **Padding:** `p-8`

---

### ADMIN: INVENTORY MANAGEMENT

**Section 1: Header**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - H1: "Inventory Management" (text-h1)
  - Description: "Manage stock levels for all products"
- **Padding:** `py-8`

**Section 2: Inventory Table**
- **Layout:** Container
- **Background:** `bg-background`
- **Content:**
  - Table (bg-surface, rounded-lg, shadow-sm):
    - Columns:
      - Product (name + image thumb)
      - SKU (text-sm font-mono)
      - Current Stock (editable number input)
      - Reserved (read-only, shows qty in pending orders)
      - Available (calculated: Current - Reserved)
      - Actions (Save button for that row)
    - Stock level indicators:
      - Available > 10: text-success
      - Available 5-10: text-amber-600
      - Available < 5: text-error font-semibold
- **Padding:** `pb-16`

**Editable Input Style:**
```html
<input 
  type="number" 
  class="w-24 rounded-md border border-sand px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
  value="50"
/>
```

---

## 5. Photo Treatment Guidelines

### Product Photography Standards

**Background & Lighting:**
- Light-toned background (white or warm neutral) for product photography — contrasts well against the dark UI
- Natural daylight or soft studio lighting (no harsh shadows)
- Consistent lighting across all product shots

**Composition:**
- Product centered, fills 70-80% of frame
- Straight-on angle with slight perspective (not completely flat)
- Show product label clearly
- Include size reference if helpful (e.g., hand holding container)

**Image Specs:**
- Primary product images: 1200×1200px minimum (square aspect)
- Product card thumbnails: 800×600px minimum (4:3 aspect)
- Format: JPG (optimized) or WebP
- File size: <200KB after optimization

**Image Container Treatment:**
```html
<div class="aspect-square overflow-hidden rounded-lg bg-sand">
  <img 
    src="/product.jpg" 
    alt="Product name" 
    class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
    loading="lazy"
  />
</div>
```

### Community & Lifestyle Photography

**Context & Setting:**
- Outdoor Chiang Mai locations: parks, running trails, outdoor gyms, mountains
- Natural daylight (golden hour preferred: early morning or late afternoon)
- Real community members (not stock photo models)
- Active scenarios: training, post-workout, group activities

**Mood & Aesthetic:**
- Warm, authentic, energetic
- Clean backgrounds (avoid cluttered environments)
- Focus on people and action, product secondary
- Natural expressions, genuine moments

**Image Specs:**
- Hero images: 1920×1080px minimum (16:9 aspect)
- Community grid: 800×600px minimum (4:3 aspect)
- Format: JPG (optimized) or WebP
- File size: <300KB for hero, <150KB for grid

**Image Container Treatment:**
```html
<div class="aspect-[4/3] overflow-hidden rounded-lg">
  <img 
    src="/community-photo.jpg" 
    alt="Community training session" 
    class="w-full h-full object-cover"
    loading="lazy"
  />
</div>
```

### What to AVOID:

- **NO gritty warehouse gym aesthetic** (no harsh industrial lighting, no heavy-handed HDR, no overly aggressive contrast)
- **NO decorative leaf clipart spam** (no illustrated leaves, no botanical pattern overlays, no nature graphics)
- **NO generic stock photos** (no unrealistic poses, no studio gym equipment shots, no obviously foreign models)
- **NO soft wellness "spa" aesthetic** (no pastel gradients, no minimalist zen vibes, no meditation imagery)

**Dark UI Note:** The site uses a near-black background (#0A0A0A). Product photography should use lighter tones that contrast well against dark surfaces. Image containers use `bg-surface` (#141414 in dark mode) to provide a subtle frame.

### Placeholder Strategy

**During Development:**
- Use solid `bg-surface` colored blocks with brand icon centered (adapts to dark/light automatically)
- Display aspect ratio correctly (square for products, 4:3 for community)
- Add subtle text overlay: "Product photo coming soon" (text-muted, text-sm)

**Placeholder Component:**
```html
<div class="aspect-square bg-surface rounded-lg flex items-center justify-center">
  <div class="text-center space-y-2">
    <svg class="w-16 h-16 mx-auto text-muted/30" fill="currentColor" viewBox="0 0 24 24">
      <!-- Brand icon or image icon -->
    </svg>
    <p class="text-sm text-muted">Photo coming soon</p>
  </div>
</div>
```

### Image Optimization Workflow

1. **Editing:** Adjust white balance to warm tone, increase brightness slightly, maintain natural colors
2. **Resize:** Export at 2x resolution for retina displays
3. **Compress:** Use ImageOptim or similar (target 70-80% quality for JPG)
4. **Format:** Serve WebP with JPG fallback
5. **Loading:** Use `loading="lazy"` for below-fold images

### Hover & Interaction Effects

**Product Images:**
```css
/* Subtle zoom on hover */
.group:hover img {
  transform: scale(1.05);
  transition: transform 300ms ease-out;
}
```

**Community Images:**
```css
/* Slight brightness increase on hover */
.group:hover img {
  filter: brightness(1.05);
  transition: filter 200ms ease-out;
}
```

---

## 6. Responsive Design Rules

### Mobile-First Approach

All layouts start with mobile (single column) and progressively enhance for larger screens.

**Base Layout (Mobile):**
- Single column stacking
- Full-width components
- Touch-friendly button sizes (min 44×44px)
- Simplified navigation (hamburger menu)
- Reduced typography scale (~85% of desktop)

### Breakpoint System

```css
/* Tailwind breakpoints */
sm: 640px   /* Small tablets, large phones landscape */
md: 768px   /* Tablets */
lg: 1024px  /* Small laptops, large tablets landscape */
xl: 1280px  /* Desktops */
```

### Typography Scaling

**Desktop (default):**
- H1: 2.5rem (40px)
- H2: 2rem (32px)
- H3: 1.5rem (24px)
- Body: 1rem (16px)

**Mobile (<640px):**
- H1: 2rem (32px) - 80% scale
- H2: 1.75rem (28px) - 87.5% scale
- H3: 1.25rem (20px) - 83% scale
- Body: 1rem (16px) - no change

**Implementation:**
```html
<h1 class="text-[2rem] sm:text-h1">Mobile-optimized heading</h1>
<h2 class="text-[1.75rem] sm:text-h2">Subheading</h2>
```

### Navigation Responsive Behavior

**Desktop (≥768px):**
- Horizontal navigation links visible
- Logo left, nav center, cart right
- Full navbar height: 64px

**Mobile (<768px):**
- Logo left, cart + hamburger right
- Navigation links hidden
- Hamburger triggers slide-out drawer from right
- Drawer: full height, 256px width, backdrop overlay

**Implementation:**
```html
<!-- Desktop nav: visible md and up -->
<nav class="hidden md:flex items-center space-x-8">...</nav>

<!-- Mobile trigger: visible below md -->
<button class="md:hidden">Hamburger Icon</button>
```

### Grid Layouts

**Product Grid:**
- Mobile: `grid-cols-1`
- Desktop: `grid-cols-2`
```html
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
```

**Content Grids (2-column):**
- Mobile: `flex-col` (stack)
- Desktop: `grid-cols-2`
```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
```

**Footer (3-column):**
- Mobile: `grid-cols-1`
- Desktop: `grid-cols-3`
```html
<div class="grid grid-cols-1 md:grid-cols-3 gap-12">
```

### Checkout & Forms

**Desktop (≥768px):**
- 2-column layout: form left (2/3), summary right (1/3)
- Summary sidebar sticky

**Mobile (<768px):**
- Single column stack
- Summary appears ABOVE form (so user sees total first)
- Summary collapsible to save space

**Implementation:**
```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
  <!-- Order: summary first on mobile, second on desktop -->
  <div class="order-2 lg:order-1 lg:col-span-2">Form</div>
  <div class="order-1 lg:order-2 lg:col-span-1 lg:sticky lg:top-24">Summary</div>
</div>
```

### Cart Item Row

**Desktop:**
- Horizontal flex: image | info | quantity | price | remove
- All in one row

**Mobile:**
- Vertical stack: image → info → quantity → (price + remove in row)
```html
<div class="flex flex-col sm:flex-row sm:items-center gap-4">
```

### Admin Tables

**Desktop (≥768px):**
- Full table layout visible
- All columns shown

**Tablet (≥640px <768px):**
- Some columns may be hidden (e.g., date)
- Essential columns: Order ID, Customer, Status, Actions

**Mobile (<640px):**
- Horizontal scroll enabled on table container
- Minimum supported width: 768px
- User can swipe to see all columns

**Implementation:**
```html
<div class="overflow-x-auto">
  <table class="min-w-[768px] w-full">...</table>
</div>
```

### Container Padding

**Desktop:**
- `container` class: px-8 (32px left/right)

**Tablet:**
- px-6 (24px left/right)

**Mobile:**
- px-4 (16px left/right)

**Implementation (already in Tailwind config):**
```css
.container {
  padding-left: 1rem; /* 16px mobile */
}
@media (min-width: 640px) {
  .container {
    padding-left: 1.5rem; /* 24px tablet */
  }
}
@media (min-width: 1024px) {
  .container {
    padding-left: 2rem; /* 32px desktop */
  }
}
```

### Section Padding

**Desktop:**
- `section-padding` class: py-24 (96px top/bottom)

**Mobile:**
- py-16 (64px top/bottom)

**Implementation (already in Tailwind config):**
```css
.section-padding {
  padding-top: 4rem; /* 64px mobile */
  padding-bottom: 4rem;
}
@media (min-width: 640px) {
  .section-padding {
    padding-top: 6rem; /* 96px desktop */
    padding-bottom: 6rem;
  }
}
```

### Button Sizing

**Desktop:**
- Primary: `px-6 py-3` (24px/12px)

**Mobile:**
- Same sizing (buttons are already touch-friendly)
- Full-width variant common on mobile: `w-full sm:w-auto`

### Image Aspect Ratios

**Maintain consistent ratios across breakpoints:**
- Product images: Always square (`aspect-square`)
- Community photos: Always 4:3 (`aspect-[4/3]`)
- Hero images: 4:3 on mobile, 16:9 on desktop
```html
<div class="aspect-[4/3] lg:aspect-[16/9]">
```

### Touch Targets

**Minimum sizes for mobile:**
- Buttons: 44×44px minimum
- Links in navigation: 44px height minimum
- Form inputs: 44px height minimum
- Icon buttons: 44×44px

**Implementation:**
```html
<!-- Ensure adequate padding for touch -->
<button class="px-6 py-3">Text Button</button> <!-- Results in ~48px height -->
<button class="w-10 h-10">Icon</button> <!-- 40px, slightly small but acceptable -->
```

### Sticky Elements

**Desktop:**
- Navbar: `sticky top-0`
- Checkout summary: `sticky top-24` (below navbar)

**Mobile:**
- Navbar: `sticky top-0` (same)
- Checkout summary: NOT sticky (stacks above form)

**Implementation:**
```html
<div class="lg:sticky lg:top-24">Summary</div>
```

### Modal & Drawer Behavior

**Desktop:**
- Modals: centered overlay, max-width constrained
- Drawers: slide from right (e.g., mobile nav on desktop would be modal)

**Mobile:**
- Modals: full-screen or near full-screen
- Drawers: slide from right, 80% screen width max

### Z-Index Hierarchy

```css
/* Z-index scale */
Navbar: z-50
Mobile drawer overlay: z-50
Mobile drawer: z-50
Modals: z-40
Sticky elements: z-30
Tooltips: z-20
```

### Admin Minimum Width

**Admin pages minimum supported width: 768px (tablet)**
- Below 768px: Show message "Please use a tablet or desktop to access admin panel"
- No mobile-specific admin layouts

**Implementation:**
```html
<!-- Admin root wrapper -->
<div class="min-w-[768px]">
  <!-- Below 768px, show message -->
  <div class="md:hidden p-8 text-center">
    <p>Please use a tablet or desktop to access the admin panel.</p>
  </div>
  <!-- Above 768px, show admin interface -->
  <div class="hidden md:block">
    Admin content
  </div>
</div>
```

---

## Summary

This frontend implementation plan provides a complete, actionable blueprint for building CNX AthletX's ecommerce storefront and admin portal. Every design decision reflects the brand identity: clean athletic everyday health from Chiang Mai's active community.

**Key Takeaways:**

1. **Dark Mode Default:** Near-black (#0A0A0A) is the default theme, with toggle-to-light. CSS variable architecture means components adapt automatically — no `dark:` prefixes needed
2. **Color Usage:** Chiang Mai Green drives action, Northern Gold ONLY for small badges/accents. Surface differentiation (#141414 cards on #0A0A0A background) replaces shadows in dark mode
3. **Imagery:** Natural daylight, Chiang Mai context, real community — lighter-toned photography contrasts well against the dark UI
4. **UI Style:** Premium dark aesthetic, generous spacing, subtle rounded corners, modern sans-serif
5. **Component Library:** 14 fully specified components with exact Tailwind classes and states (including Theme Toggle)
6. **Page Wireframes:** Every page section detailed top-to-bottom with layout, content, and theme-aware background colors
7. **Responsive:** Mobile-first with clear breakpoint rules, typography scaling, and touch-friendly targets
8. **Admin:** Protected behind Cloudflare Access, minimum 768px width, comprehensive order management workflow

**Implementation files:**
- Tailwind CSS v4 config with theme system (`src/styles/tailwind.css`)
- TypeScript config for content paths (`tailwind.config.ts`)
- Theme composable (`src/composables/useTheme.ts`)
- Flash prevention script in `index.html`

All components, layouts, and styles are production-ready and can be implemented directly by the development team.