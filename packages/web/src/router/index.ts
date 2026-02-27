import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '../pages/HomePage.vue'

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
  ],
})

export default router
