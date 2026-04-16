import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
    },
    {
      path: '/shop',
      name: 'shop',
      component: () => import('../pages/ShopPage.vue'),
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../pages/AboutPage.vue'),
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../pages/PrivacyPolicyPage.vue'),
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../pages/TermsOfServicePage.vue'),
    },
    {
      path: '/product/:slug',
      name: 'product',
      component: () => import('../pages/ProductDetailPage.vue'),
    },
    {
      path: '/cart',
      name: 'cart',
      component: () => import('../pages/CartPage.vue'),
    },
    {
      path: '/checkout',
      name: 'checkout',
      component: () => import('../pages/CheckoutPage.vue'),
    },
    {
      path: '/order/status',
      name: 'order-lookup',
      component: () => import('../pages/OrderLookupPage.vue'),
    },
    {
      path: '/order/:id/payment',
      name: 'payment',
      component: () => import('../pages/PaymentInstructionsPage.vue'),
    },
    {
      path: '/order/:id/confirmation',
      name: 'confirmation',
      component: () => import('../pages/OrderConfirmationPage.vue'),
    },
    {
      path: '/order/:id',
      name: 'order-status',
      component: () => import('../pages/OrderStatusPage.vue'),
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      component: () => import('../pages/AdminDashboardPage.vue'),
    },
    {
      path: '/admin/orders',
      name: 'admin-orders',
      component: () => import('../pages/AdminOrdersPage.vue'),
    },
    {
      path: '/admin/orders/:id',
      name: 'admin-order-detail',
      component: () => import('../pages/AdminOrderDetailPage.vue'),
    },
    {
      path: '/admin/order/:id',
      redirect: (to) => ({ path: `/admin/orders/${to.params.id as string}` }),
    },
    {
      path: '/admin/inventory',
      name: 'admin-inventory',
      component: () => import('../pages/AdminInventoryPage.vue'),
    },
    {
      path: '/admin/products',
      name: 'admin-products',
      component: () => import('../pages/AdminProductsPage.vue'),
    },
    {
      path: '/admin/product-lines',
      name: 'admin-product-lines',
      component: () => import('../pages/AdminProductLinesPage.vue'),
    },
    {
      path: '/admin/discounts',
      name: 'admin-discounts',
      component: () => import('../pages/AdminDiscountsPage.vue'),
    },
    {
      path: '/admin/income',
      name: 'admin-income',
      component: () => import('../pages/AdminIncomePage.vue'),
    },
    {
      path: '/admin/chat',
      name: 'admin-chat',
      component: () => import('../pages/AdminChatPage.vue'),
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: () => import('../pages/AdminSettingsPage.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
    },
    {
      path: '/auth/verify',
      name: 'auth-verify',
      component: () => import('../pages/AuthVerifyPage.vue'),
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('../pages/AccountPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../pages/NotFoundPage.vue'),
    },
  ],
})

router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error)
  if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(message)) {
    const key = 'cnx-chunk-reload'
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.assign(to.fullPath)
    }
  }
})

router.afterEach(() => {
  sessionStorage.removeItem('cnx-chunk-reload')
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    await auth.init()
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if ((to.name === 'login' || to.name === 'auth-verify') && auth.isAuthenticated) {
    return { path: '/account' }
  }

  return true
})

export default router
