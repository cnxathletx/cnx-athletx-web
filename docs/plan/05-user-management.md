# CNX AthletX — User Management (Customer Accounts)

## Overview

Passwordless customer accounts via email magic link, using the existing Resend integration. Enables order history and faster checkout with pre-filled shipping info.

**Auth method:** Email magic link (no passwords)
**Session:** HttpOnly cookie + D1 session table
**Scope:** Order history, pre-filled checkout, basic profile display

---

## Auth Flow: Magic Link

```
1. User visits /login
2. Enters email address
3. POST /api/auth/request-link {email}
4. Workers:
   a. Generate random token (32 bytes, hex encoded)
   b. INSERT INTO magic_links (email, token, expires_at = now + 15 min)
   c. Send email via Resend with link: https://cnxnature.com/auth/verify?token=xxx
   d. Response: {success: true, message: "Check your email"}
5. User clicks link in email
6. Browser → GET /auth/verify?token=xxx
7. Vue router intercepts → POST /api/auth/verify {token}
8. Workers:
   a. SELECT FROM magic_links WHERE token = ? AND expires_at > now AND used_at IS NULL
   b. If invalid/expired → 401
   c. Mark magic_link as used (SET used_at = now)
   d. Find or create user by email (INSERT ... ON CONFLICT DO NOTHING)
   e. Create session: INSERT INTO sessions (id = random token, user_id, expires_at = now + 30 days)
   f. Set HttpOnly cookie: session=<token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
   g. Response: {user: {id, email, name, phone}}
9. Vue stores user in Pinia, redirects to /account or previous page
```

### Session Lifecycle

- **Creation:** On magic link verification
- **Validation:** Middleware checks `session` cookie → looks up in D1 → checks expiry
- **Refresh:** No refresh in v1 (30-day fixed expiry is sufficient for low traffic)
- **Logout:** DELETE session from D1, clear cookie
- **Cleanup:** Cron or manual: DELETE FROM sessions WHERE expires_at < now (run weekly)

### Guest Checkout

Customer accounts are **optional**. The checkout flow works for both:
- **Logged in:** Customer info pre-filled from profile/last order, order linked to `user_id`
- **Guest:** Customer enters info manually, `user_id` is NULL on order
- **Post-checkout prompt:** After guest checkout, show "Create an account to track your orders" with email pre-filled

---

## D1 Schema Additions

```sql
-- users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,              -- ULID
    email TEXT NOT NULL UNIQUE,
    name TEXT,                        -- filled from first checkout or profile update
    phone TEXT,                       -- filled from first checkout or profile update
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- magic_links table (ephemeral, for auth flow)
CREATE TABLE magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,         -- 15 minutes from creation
    used_at TEXT,                     -- set when link is clicked
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- random 32-byte hex token
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,         -- 30 days from creation
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

### Orders Table Modification

Add nullable `user_id` column to existing `orders` table:

```sql
ALTER TABLE orders ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

**Migration note:** Existing orders will have `user_id = NULL` (guest orders). New orders from logged-in users get `user_id` set.

---

## API Endpoints

### POST /api/auth/request-link

**Purpose:** Send magic link email to user.

**Auth:** Public

**Request:**
```json
{
  "email": "somchai@example.com"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "If an account exists or can be created with this email, you will receive a login link."
}
```

**Validation:**
- `email`: valid email format, required
- Rate limit: max 3 requests per email per 15 minutes (count unexpired magic_links)

**Errors:**
- `400 Bad Request` — invalid email format
- `429 Too Many Requests` — rate limited:
  ```json
  {"error": "Too many login attempts. Please wait 15 minutes."}
  ```

**Security:**
- Always return the same success message whether email exists or not (prevents enumeration)
- Token: 32 bytes from `crypto.getRandomValues()`, hex encoded (64 chars)
- Link expires in 15 minutes
- Invalidate all previous unused magic links for same email

**Side Effect:**
```sql
-- Invalidate previous links
UPDATE magic_links SET used_at = CURRENT_TIMESTAMP
WHERE email = ? AND used_at IS NULL;

-- Create new link
INSERT INTO magic_links (email, token, expires_at)
VALUES (?, ?, datetime('now', '+15 minutes'));
```

---

### POST /api/auth/verify

**Purpose:** Verify magic link token, create/find user, start session.

**Auth:** Public

**Request:**
```json
{
  "token": "a1b2c3d4e5f6..."
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "email": "somchai@example.com",
    "name": "Somchai Rattana",
    "phone": "+66812345678"
  }
}
```

**Headers Set:**
```
Set-Cookie: session=<session_token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
```

**Validation:**
- `token`: 64-char hex string
- Token must exist, not be used, not be expired

**Errors:**
- `400 Bad Request` — invalid token format
- `401 Unauthorized` — token expired, used, or not found:
  ```json
  {"error": "Login link is invalid or expired. Please request a new one."}
  ```

**Side Effects:**
```sql
BEGIN TRANSACTION;

-- 1. Validate and consume token
UPDATE magic_links SET used_at = CURRENT_TIMESTAMP
WHERE token = ? AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP;
-- (check rows affected = 1, else reject)

-- 2. Find or create user
INSERT INTO users (id, email) VALUES (?, ?)
ON CONFLICT (email) DO NOTHING;

SELECT id, email, name, phone FROM users WHERE email = ?;

-- 3. Create session
INSERT INTO sessions (id, user_id, expires_at)
VALUES (?, ?, datetime('now', '+30 days'));

COMMIT;
```

---

### POST /api/auth/logout

**Purpose:** Destroy session and clear cookie.

**Auth:** Requires valid session cookie

**Request:** None (session from cookie)

**Response (200 OK):**
```json
{
  "success": true
}
```

**Headers Set:**
```
Set-Cookie: session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
```

**Side Effect:**
```sql
DELETE FROM sessions WHERE id = ?;
```

---

### GET /api/auth/me

**Purpose:** Get current authenticated user. Used by frontend on app load to check session.

**Auth:** Optional session cookie (returns null user if not authenticated)

**Response (200 OK — authenticated):**
```json
{
  "user": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "email": "somchai@example.com",
    "name": "Somchai Rattana",
    "phone": "+66812345678"
  }
}
```

**Response (200 OK — not authenticated):**
```json
{
  "user": null
}
```

**Note:** Returns 200 in both cases. Frontend checks `user !== null` to determine auth state.

---

### GET /api/account/orders

**Purpose:** List orders for the authenticated user, most recent first.

**Auth:** Requires valid session

**Request:** `GET /api/account/orders?page=1&limit=10`

**Response (200 OK):**
```json
{
  "orders": [
    {
      "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
      "status": "shipped",
      "total_thb": 259700,
      "items_count": 3,
      "created_at": "2026-02-11T08:30:00Z",
      "shipment": {
        "carrier": "Thailand Post",
        "tracking_number": "RN123456789TH"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 5
  }
}
```

**Errors:**
- `401 Unauthorized` — no valid session

---

### PATCH /api/account/profile

**Purpose:** Update user name and phone (for pre-filling checkout).

**Auth:** Requires valid session

**Request:**
```json
{
  "name": "Somchai Rattana",
  "phone": "+66812345678"
}
```

**Response (200 OK):**
```json
{
  "user": {
    "id": "01HN2P3Q4R5S6T7V8W9X0Y1Z2A",
    "email": "somchai@example.com",
    "name": "Somchai Rattana",
    "phone": "+66812345678"
  }
}
```

**Validation:**
- `name`: 2-100 chars (optional, only updates if provided)
- `phone`: Thai format (optional, only updates if provided)

**Errors:**
- `401 Unauthorized`
- `400 Bad Request` — validation errors

---

## Checkout Integration

### Pre-fill Logic

When a logged-in user navigates to checkout:

```typescript
// In checkout composable
async function prefillCheckout() {
  const user = useAuthStore().user;
  if (!user) return; // guest checkout

  // Pre-fill from user profile
  form.name = user.name ?? '';
  form.email = user.email;
  form.phone = user.phone ?? '';

  // Pre-fill address from most recent order
  const { orders } = await api.get('/api/account/orders?limit=1');
  if (orders.length > 0) {
    const lastOrder = await api.get(`/api/orders/${orders[0].id}`);
    // Only pre-fill if the order has address data accessible to the user
    // (public order endpoint doesn't expose address, so we need a dedicated endpoint)
  }
}
```

### Dedicated Endpoint: GET /api/account/last-address

**Purpose:** Returns shipping address from user's most recent order (for checkout pre-fill).

**Auth:** Requires valid session

**Response (200 OK):**
```json
{
  "address": {
    "line1": "123 Nimmanhaemin Road",
    "line2": "Soi 5",
    "district": "Suthep",
    "province": "Chiang Mai",
    "postal_code": "50200"
  }
}
```

**Response (200 OK — no previous orders):**
```json
{
  "address": null
}
```

### Order Linking

Modify `POST /api/checkout` to link orders to authenticated users:

```typescript
// In checkout handler
const sessionUser = ctx.get('user'); // from auth middleware (null if guest)

const orderId = generateULID();
await db.prepare(
  `INSERT INTO orders (id, user_id, customer_name, ...) VALUES (?, ?, ?, ...)`
).bind(orderId, sessionUser?.id ?? null, customer.name, ...).run();
```

### Post-Checkout Account Prompt

After guest checkout, on the Order Confirmation page:

```html
<!-- Show only for guest users (no session) -->
<div class="bg-primary/5 rounded-lg p-6 space-y-3">
  <h3 class="text-h3">Want to track all your orders?</h3>
  <p class="text-body text-muted">
    Create a free account with {{ customer_email }} to view order history
    and speed up future checkouts.
  </p>
  <button class="bg-primary text-surface rounded-md px-6 py-3 font-semibold">
    Create Account
  </button>
</div>
```

Clicking "Create Account" triggers `POST /api/auth/request-link` with the checkout email, and retroactively links the order to the new user:

```sql
-- After user verifies magic link, link their guest orders
UPDATE orders SET user_id = ? WHERE customer_email = ? AND user_id IS NULL;
```

---

## Auth Middleware

```typescript
// /packages/api/src/middleware/session.ts

export async function sessionMiddleware(request: Request, env: Env) {
  const cookie = request.headers.get('Cookie') ?? '';
  const sessionToken = parseCookie(cookie, 'session');

  if (!sessionToken) {
    return null; // no session, continue as guest
  }

  const session = await env.DB.prepare(
    'SELECT s.id, s.user_id, s.expires_at, u.id as uid, u.email, u.name, u.phone FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP'
  ).bind(sessionToken).first();

  if (!session) {
    return null; // expired or invalid session
  }

  return {
    id: session.uid,
    email: session.email,
    name: session.name,
    phone: session.phone,
  };
}

// For endpoints that REQUIRE auth
export function requireAuth(user: User | null): User {
  if (!user) {
    throw new HttpError(401, 'Authentication required. Please log in.');
  }
  return user;
}
```

**Usage in routes:**

```typescript
// Optional auth (checkout - works for guests too)
router.post('/api/checkout', async (req, env) => {
  const user = await sessionMiddleware(req, env); // null for guests
  // ... use user?.id for order linking
});

// Required auth (account pages)
router.get('/api/account/orders', async (req, env) => {
  const user = requireAuth(await sessionMiddleware(req, env));
  // ... user is guaranteed non-null
});
```

---

## Magic Link Email Template

**Subject:** `Log in to CNX AthletX`

**HTML:**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .header { background-color: #2F6B4F; padding: 20px; text-align: center; }
    .content { padding: 30px 20px; max-width: 600px; margin: 0 auto; }
    .login-button { display: inline-block; background-color: #2F6B4F; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cnxnature.com/logo-white.png" alt="CNX AthletX" style="max-width: 150px;">
  </div>
  <div class="content">
    <h1>Log in to CNX AthletX</h1>
    <p>Click the button below to log in. This link expires in 15 minutes.</p>

    <p style="text-align: center; margin: 30px 0;">
      <a href="{{magic_link_url}}" class="login-button">Log In</a>
    </p>

    <p style="font-size: 14px; color: #666;">
      If you didn't request this link, you can safely ignore this email.
    </p>

    <p style="font-size: 12px; color: #999; word-break: break-all;">
      Or copy this URL: {{magic_link_url}}
    </p>
  </div>
  <div class="footer">
    <p>CNX AthletX | Chiang Mai, Thailand</p>
  </div>
</body>
</html>
```

---

## Frontend Pages

### Login Page (`/login`)

**Layout:** Centered card, max-w-md mx-auto

**Sections:**
1. **Header:** H1 "Log In" + subtext "Enter your email to receive a login link"
2. **Form Card** (bg-surface, rounded-lg, shadow-sm, p-8):
   - Email input
   - Primary Button: "Send Login Link" (w-full)
3. **After submission state:**
   - Success icon
   - Text: "Check your email! We sent a login link to {{ email }}"
   - Note: "Link expires in 15 minutes. Check spam if you don't see it."
   - Ghost button: "Resend link" (disabled for 60 seconds)

### Magic Link Verify Page (`/auth/verify`)

**Layout:** Centered, minimal

**States:**
1. **Loading:** Spinner + "Verifying your login..."
2. **Success:** Redirect to `/account` (or previous page stored in localStorage)
3. **Error:** "This login link is invalid or expired." + Primary Button: "Request a new link"

### Account Dashboard (`/account`)

**Layout:** Container, max-w-4xl mx-auto

**Sections:**
1. **Header:** H1 "My Account" + user email display
2. **Quick Info Card** (bg-surface, rounded-lg, shadow-sm, p-6):
   - Name (editable inline or via modal)
   - Email (display only)
   - Phone (editable inline or via modal)
3. **Order History:**
   - Section title: "Order History" (text-h2)
   - If no orders: Empty state "No orders yet" + CTA "Shop Now"
   - If orders: List of order summary cards:
     - Order ID, date, status pill, total, items count
     - Click → navigates to `/orders/:id` (existing order status page)
   - Pagination if > 10 orders
4. **Logout Button:** Secondary button at bottom

### Navbar Update

Add user state to navbar:
- **Logged out:** Show "Log In" text link next to cart icon
- **Logged in:** Show user icon/avatar with dropdown (Account, Log Out)

```html
<!-- Logged out -->
<a href="/login" class="text-sm font-semibold text-foreground hover:text-primary">
  Log In
</a>

<!-- Logged in -->
<div class="relative">
  <button class="w-8 h-8 rounded-full bg-primary text-surface flex items-center justify-center text-sm font-bold">
    S  <!-- First letter of name, or email -->
  </button>
  <!-- Dropdown -->
  <div class="absolute right-0 mt-2 w-48 bg-surface rounded-lg shadow-md py-2">
    <a href="/account" class="block px-4 py-2 text-sm hover:bg-background">My Account</a>
    <button class="block w-full text-left px-4 py-2 text-sm hover:bg-background text-error">Log Out</button>
  </div>
</div>
```

---

## Pinia Auth Store

```typescript
// /packages/web/src/stores/auth.ts
import { defineStore } from 'pinia';

interface User {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: true, // true until initial /api/auth/me check completes
  }),

  getters: {
    isAuthenticated: (state) => state.user !== null,
    displayName: (state) => state.user?.name ?? state.user?.email ?? 'Guest',
  },

  actions: {
    async init() {
      // Called once on app startup (App.vue mounted)
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        this.user = data.user;
      } catch {
        this.user = null;
      } finally {
        this.loading = false;
      }
    },

    async logout() {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      this.user = null;
    },

    setUser(user: User) {
      this.user = user;
    },
  },
});
```

---

## Security Considerations

1. **Magic link tokens:** 32 bytes of `crypto.getRandomValues()` — 256 bits of entropy, not guessable
2. **Token expiry:** 15 minutes, single use (marked `used_at` on consumption)
3. **Session cookies:** `HttpOnly` (no JS access), `Secure` (HTTPS only), `SameSite=Lax` (CSRF protection)
4. **Rate limiting:** Max 3 magic link requests per email per 15 minutes
5. **Email enumeration:** Same response message whether email exists or not
6. **Session cleanup:** Expired sessions remain in D1 until cleanup — no security risk, just storage
7. **Logout:** Deletes server-side session (cookie alone is insufficient)
8. **No password storage:** Zero risk of password breach

---

## Impact on Existing Plan

### Backend Changes (02-backend-architecture.md)
- Add 3 tables: `users`, `magic_links`, `sessions`
- Add `user_id` nullable FK to `orders` table
- Add auth endpoints: request-link, verify, logout, me
- Add account endpoints: orders, profile, last-address
- Add session middleware to Workers router
- Add magic link email template to Resend service
- Add `email_logs` entries for magic link emails

### Frontend Changes (03-frontend-design.md)
- Add pages: Login, Auth Verify, Account Dashboard
- Update Navbar: auth state (login link vs user avatar dropdown)
- Update Checkout: pre-fill logic for logged-in users
- Update Order Confirmation: post-checkout account creation prompt
- Add Pinia auth store
- Add Vue Router guards for `/account/*` routes

### Milestone Changes (04-milestones.md)
- New Phase 5.5 (between admin dashboard and emails): Customer Accounts
- Or integrate into existing phases

---

## Suggested Phase: Customer Accounts

**Insert as Phase 5 (shift current Phase 5 → 6, etc.):**

### Phase 5: Customer Accounts (Magic Link Auth)

**Tasks:**
1. Add `users`, `magic_links`, `sessions` tables to D1 schema
2. Add `user_id` column to `orders` table
3. Implement magic link auth endpoints (request-link, verify, logout, me)
4. Implement magic link email template via Resend
5. Add session middleware to Workers
6. Build Login page (email form → "check your email" state)
7. Build Auth Verify page (token validation → redirect)
8. Build Account Dashboard (order history + profile display)
9. Add Pinia auth store with init/logout/setUser
10. Update Navbar with login/user state
11. Update Checkout with pre-fill logic for logged-in users
12. Implement `GET /api/account/orders` and `GET /api/account/last-address`
13. Implement `PATCH /api/account/profile` (name + phone update)
14. Add post-checkout account creation prompt for guest users
15. Implement retroactive order linking on account creation
16. Add rate limiting to magic link requests

**Acceptance Criteria:**
- [ ] User enters email on /login → receives magic link email within 30 seconds
- [ ] Clicking magic link logs user in and redirects to /account
- [ ] Expired magic link (>15 minutes) shows error with "request new link" option
- [ ] Used magic link cannot be reused (returns error)
- [ ] Session persists across browser restarts (30-day cookie)
- [ ] /account shows order history for logged-in user
- [ ] Checkout pre-fills name, email, phone, and last-used address for logged-in users
- [ ] Guest checkout still works (user_id = NULL on order)
- [ ] Post-checkout prompt lets guest create account; past orders are linked to new account
- [ ] Navbar shows "Log In" when logged out, user avatar when logged in
- [ ] Logging out clears session cookie and redirects to home
- [ ] Rate limit: requesting >3 magic links in 15 minutes returns 429
- [ ] Same success message shown whether email exists or not (no enumeration)
