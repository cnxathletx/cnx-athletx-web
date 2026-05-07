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

interface CountRow {
  count: number
}

interface AnalyticsPeriodStarts {
  today: Date
  week: Date
  month: Date
  nextDay: Date
  todayDate: string
  weekDate: string
  monthDate: string
  nextDayDate: string
}

interface CloudflareAnalyticsRow {
  uniq?: {
    uniques?: number | null
  } | null
  dimensions?: {
    date?: string | null
  } | null
}

interface CloudflareAnalyticsResponse {
  data?: {
    viewer?: {
      zones?: Array<{
        httpRequests1dGroups?: CloudflareAnalyticsRow[]
      }>
    }
  }
  errors?: Array<{ message?: string }>
}

function getBangkokDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: value('weekday'),
  }
}

function bangkokDateToUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0))
}

function formatBangkokDate(date: Date): string {
  const parts = getBangkokDateParts(date)
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getAnalyticsPeriodStarts(now = new Date()): AnalyticsPeriodStarts {
  const parts = getBangkokDateParts(now)
  const today = bangkokDateToUtc(parts.year, parts.month, parts.day)
  const weekdayIndex = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday)
  const daysSinceMonday = weekdayIndex >= 0 ? weekdayIndex : 0
  const week = addUtcDays(today, -daysSinceMonday)
  const month = bangkokDateToUtc(parts.year, parts.month, 1)
  const nextDay = addUtcDays(today, 1)

  return {
    today,
    week,
    month,
    nextDay,
    todayDate: formatBangkokDate(today),
    weekDate: formatBangkokDate(week),
    monthDate: formatBangkokDate(month),
    nextDayDate: formatBangkokDate(nextDay),
  }
}

async function countOrders(env: Env, start: Date, end: Date): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM orders
     WHERE created_at >= ? AND created_at < ?`
  )
    .bind(start.toISOString(), end.toISOString())
    .first<CountRow>()

  return row?.count ?? 0
}

export async function fetchCloudflareVisitors(env: Env, periods: AnalyticsPeriodStarts): Promise<{
  status: 'ok' | 'unconfigured' | 'error'
  today: number | null
  week: number | null
  month: number | null
}> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    return { status: 'unconfigured', today: null, week: null, month: null }
  }

  const query = `
    query ZoneTraffic($zoneTag: string, $start: Date, $end: Date) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 40
            orderBy: [date_ASC]
            filter: {
              date_geq: $start
              date_lt: $end
            }
          ) {
            dimensions {
              date
            }
            uniq {
              uniques
            }
          }
        }
      }
    }
  `

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          zoneTag: env.CLOUDFLARE_ZONE_ID,
          start: periods.monthDate,
          end: periods.nextDayDate,
        },
      }),
    })

    if (!response.ok) {
      return { status: 'error', today: null, week: null, month: null }
    }

    const payload = await response.json() as CloudflareAnalyticsResponse
    if (payload.errors?.length) {
      return { status: 'error', today: null, week: null, month: null }
    }

    const rows = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []
    let today = 0
    let week = 0
    let month = 0

    for (const row of rows) {
      const date = row.dimensions?.date
      const uniques = row.uniq?.uniques ?? 0
      if (!date) continue
      if (date >= periods.monthDate) month += uniques
      if (date >= periods.weekDate) week += uniques
      if (date === periods.todayDate) today += uniques
    }

    return {
      status: 'ok',
      today,
      week,
      month,
    }
  } catch {
    return { status: 'error', today: null, week: null, month: null }
  }
}

export function registerAdminReportRoutes(router: RouterType) {
  router.get('/api/admin/reports/analytics', requireAdmin(async (_request, env) => {
    const periods = getAnalyticsPeriodStarts()

    try {
      const [ordersToday, ordersWeek, ordersMonth, visitors] = await Promise.all([
        countOrders(env, periods.today, periods.nextDay),
        countOrders(env, periods.week, periods.nextDay),
        countOrders(env, periods.month, periods.nextDay),
        fetchCloudflareVisitors(env, periods),
      ])

      return Response.json({
        visitors,
        orders: {
          today: ordersToday,
          week: ordersWeek,
          month: ordersMonth,
        },
      })
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }
  }))

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
