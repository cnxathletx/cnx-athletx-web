import type { RouterType } from 'itty-router'
import { registerAdminOrderRoutes } from './admin/orders'
import { registerAdminInventoryRoutes } from './admin/inventory'
import { registerAdminProductRoutes } from './admin/products'

export function registerAdminRoutes(router: RouterType) {
  registerAdminOrderRoutes(router)
  registerAdminInventoryRoutes(router)
  registerAdminProductRoutes(router)
}
