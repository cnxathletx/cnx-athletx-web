# Email Events

All transactional emails are sent via **Resend** (`orders@cnxnature.com`). Email failures never block state transitions — they are fire-and-forget with best-effort logging to the `email_logs` table.

## Customer Emails

| Event | Trigger | Recipient | Template | Source |
|---|---|---|---|---|
| **Magic Link** | Customer requests login link (`POST /api/auth/request-link`) | Customer email | Login button + link, expires in 15 min | `auth.ts:55` → `sendMagicLinkEmail()` |
| **Order Created** | Checkout completes successfully (`POST /api/checkout`) | Customer email | Order confirmation with items, totals, and payment instructions (PromptPay + bank transfer) | `checkout.ts:395` → `sendOrderEmail('order_created')` |
| **Payment Confirmed** | Admin marks order as paid (`POST /api/admin/orders/:id/mark-paid`) | Customer email | Payment verified notice, items, totals, "order is being packed" | `admin/orders.ts:250` → `sendOrderEmail('payment_confirmed')` |
| **Order Shipped** | Admin records shipment (`POST /api/admin/orders/:id/ship`) | Customer email | Shipping notice with carrier name and tracking number, items, totals | `admin/orders.ts:337` → `sendOrderEmail('order_shipped')` |

## Admin Emails

| Event | Trigger | Recipient | Template | Source |
|---|---|---|---|---|
| **New Order** | Checkout completes successfully (`POST /api/checkout`) | All addresses in `ADMIN_EMAILS` env var | New order alert with customer info, shipping address, discount code (if any), items, totals | `checkout.ts:407` → `sendAdminNewOrderEmail()` |

## Email Infrastructure

- **Provider**: Resend API (`https://api.resend.com/emails`)
- **From address**: `CNX AthletX <orders@cnxnature.com>`
- **Templates**: HTML string interpolation in `packages/api/src/services/email.ts` (no template engine)
- **Logging**: All sends (success and failure) are logged to `email_logs` table with event type, recipient, status, and error message
- **Admin recipients**: Configured via `ADMIN_EMAILS` environment variable (comma-separated)

## Event Flow Diagram

```
Customer requests login
  └─► sendMagicLinkEmail() ──► Customer

Customer places order (POST /api/checkout)
  ├─► sendOrderEmail('order_created') ──► Customer
  └─► sendAdminNewOrderEmail() ──► Admin(s)

Admin marks paid (POST /api/admin/orders/:id/mark-paid)
  └─► sendOrderEmail('payment_confirmed') ──► Customer

Admin ships order (POST /api/admin/orders/:id/ship)
  └─► sendOrderEmail('order_shipped') ──► Customer
```
