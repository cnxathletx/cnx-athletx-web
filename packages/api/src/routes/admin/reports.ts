import type { RouterType } from 'itty-router'
import type { Env } from '../../lib/types'
import { REVENUE_ORDER_STATUSES, orderStatusSqlList } from '../../lib/orderStatus'
import { requireAdmin } from '../../middleware/auth'

interface IncomeRow {
  product_name: string
  total_revenue: number
  total_quantity: number
}

interface MonthlyTotalRow {
  total_revenue: number
  total_orders: number
}

export function registerAdminReportRoutes(router: RouterType) {
  router.get('/api/admin/reports/income', requireAdmin(async (request, env) => {
    const url = new URL(request.url)
    const year = parseInt(url.searchParams.get('year') || '', 10)
    const month = parseInt(url.searchParams.get('month') || '', 10)

    if (!year || !month || month < 1 || month > 12) {
      return Response.json({ error: 'year and month query params required (e.g. ?year=2026&month=4)' }, { status: 400 })
    }

    const monthStr = String(month).padStart(2, '0')
    const startDate = `${year}-${monthStr}-01T00:00:00.000Z`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const nextMonthStr = String(nextMonth).padStart(2, '0')
    const endDate = `${nextYear}-${nextMonthStr}-01T00:00:00.000Z`

    try {
      const revenueStatusesSql = orderStatusSqlList(REVENUE_ORDER_STATUSES)

      // Revenue by product (only completed orders: paid, packed, shipped, delivered)
      const { results: productRows } = await env.DB.prepare(
        `SELECT p.name AS product_name,
                SUM(oi.line_total_thb) AS total_revenue,
                SUM(oi.quantity) AS total_quantity
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN products p ON p.id = oi.product_id
         WHERE o.created_at >= ? AND o.created_at < ?
           AND o.status IN ${revenueStatusesSql}
         GROUP BY p.id, p.name
         ORDER BY total_revenue DESC`
      )
        .bind(startDate, endDate)
        .all<IncomeRow>()

      // Monthly totals
      const totals = await env.DB.prepare(
        `SELECT COALESCE(SUM(total_thb), 0) AS total_revenue,
                COUNT(*) AS total_orders
         FROM orders
         WHERE created_at >= ? AND created_at < ?
           AND status IN ${revenueStatusesSql}`
      )
        .bind(startDate, endDate)
        .first<MonthlyTotalRow>()

      return Response.json({
        year,
        month,
        total_revenue: totals?.total_revenue ?? 0,
        total_orders: totals?.total_orders ?? 0,
        products: productRows.map((row) => ({
          product_name: row.product_name,
          total_revenue: row.total_revenue,
          total_quantity: row.total_quantity,
        })),
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))
}
