<script setup lang="ts">
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import { fetchAdminIncomeReport, type IncomeReport, AdminApiErrorResponse } from '../api/admin'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'

const loading = ref(true)
const error = ref('')
const report = ref<IncomeReport | null>(null)

const now = new Date()
const selectedYear = ref(now.getFullYear())
const selectedMonth = ref(now.getMonth() + 1)

const chartCanvas = ref<HTMLCanvasElement | null>(null)

const CHART_COLORS = [
  '#8B9A7B', '#B53A32', '#D4A853', '#5B8A9A', '#9B6B8A',
  '#6B8A5B', '#A85B3A', '#3A7A8A', '#8A6B4A', '#5A6B8A',
]

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const displayMonth = computed(() => `${monthNames[selectedMonth.value - 1]} ${selectedYear.value}`)

async function loadReport() {
  error.value = ''
  loading.value = true
  try {
    report.value = await fetchAdminIncomeReport(selectedYear.value, selectedMonth.value)
    await nextTick()
    drawChart()
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Unable to load income report.'
    }
  } finally {
    loading.value = false
  }
}

function drawChart() {
  const canvas = chartCanvas.value
  if (!canvas || !report.value || report.value.products.length === 0) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const size = 280
  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  ctx.scale(dpr, dpr)

  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 10
  const total = report.value.products.reduce((sum, p) => sum + p.total_revenue, 0)

  if (total === 0) return

  let startAngle = -Math.PI / 2

  report.value.products.forEach((product, i) => {
    const sliceAngle = (product.total_revenue / total) * 2 * Math.PI
    const color = CHART_COLORS[i % CHART_COLORS.length]

    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    // White border between slices
    ctx.strokeStyle = '#2E2B26'
    ctx.lineWidth = 2
    ctx.stroke()

    startAngle += sliceAngle
  })

  // Center hole for donut effect
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.55, 0, 2 * Math.PI)
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#35322C'
  ctx.fill()

  // Center text
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-foreground').trim() || '#E5DDD0'
  ctx.font = 'bold 18px Inter, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`฿${total.toLocaleString()}`, cx, cy)
}

function prevMonth() {
  if (selectedMonth.value === 1) {
    selectedMonth.value = 12
    selectedYear.value -= 1
  } else {
    selectedMonth.value -= 1
  }
}

function nextMonth() {
  if (selectedMonth.value === 12) {
    selectedMonth.value = 1
    selectedYear.value += 1
  } else {
    selectedMonth.value += 1
  }
}

async function exportPdf() {
  if (!report.value) return

  const r = report.value
  const total = r.total_revenue

  // Build SVG pie chart for PDF
  const svgSize = 200
  const svgCx = svgSize / 2
  const svgCy = svgSize / 2
  const svgRadius = 80
  const innerRadius = 44
  let svgPaths = ''
  let angle = -Math.PI / 2

  if (r.products.length > 0 && total > 0) {
    r.products.forEach((product, i) => {
      const sliceAngle = (product.total_revenue / total) * 2 * Math.PI
      const x1 = svgCx + svgRadius * Math.cos(angle)
      const y1 = svgCy + svgRadius * Math.sin(angle)
      const x2 = svgCx + svgRadius * Math.cos(angle + sliceAngle)
      const y2 = svgCy + svgRadius * Math.sin(angle + sliceAngle)
      const ix1 = svgCx + innerRadius * Math.cos(angle + sliceAngle)
      const iy1 = svgCy + innerRadius * Math.sin(angle + sliceAngle)
      const ix2 = svgCx + innerRadius * Math.cos(angle)
      const iy2 = svgCy + innerRadius * Math.sin(angle)
      const largeArc = sliceAngle > Math.PI ? 1 : 0
      const color = CHART_COLORS[i % CHART_COLORS.length]
      svgPaths += `<path d="M${x1},${y1} A${svgRadius},${svgRadius} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${innerRadius},${innerRadius} 0 ${largeArc},0 ${ix2},${iy2} Z" fill="${color}" stroke="#fff" stroke-width="1"/>`
      angle += sliceAngle
    })
  }

  const legendRows = r.products.map((p, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length]
    const pct = total > 0 ? ((p.total_revenue / total) * 100).toFixed(1) : '0.0'
    return `<tr>
      <td style="padding:6px 10px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};vertical-align:middle"></span></td>
      <td style="padding:6px 10px">${escapeHtml(p.product_name)}</td>
      <td style="padding:6px 10px;text-align:right">&#3647;${p.total_revenue.toLocaleString()}</td>
      <td style="padding:6px 10px;text-align:right">${p.total_quantity}</td>
      <td style="padding:6px 10px;text-align:right">${pct}%</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Income Report - ${displayMonth.value}</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #2E2B26; margin: 0; padding: 20px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
  .stats { display: flex; gap: 24px; margin-bottom: 28px; }
  .stat-card { background: #f5f2ec; padding: 16px 20px; border-radius: 8px; min-width: 140px; }
  .stat-value { font-size: 24px; font-weight: 700; }
  .stat-label { font-size: 12px; color: #666; margin-top: 2px; }
  .chart-section { display: flex; align-items: flex-start; gap: 32px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #d5cbba; font-weight: 600; color: #666; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
  <h1>Income Report</h1>
  <p class="subtitle">${displayMonth.value} &mdash; CNX AthletX</p>
  <div class="stats">
    <div class="stat-card">
      <div class="stat-value">&#3647;${r.total_revenue.toLocaleString()}</div>
      <div class="stat-label">Total Revenue</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${r.total_orders}</div>
      <div class="stat-label">Orders</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${r.products.length}</div>
      <div class="stat-label">Products Sold</div>
    </div>
  </div>
  <div class="chart-section">
    <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">${svgPaths}</svg>
  </div>
  <h2 style="font-size:16px;margin-bottom:8px">Revenue by Product</h2>
  <table>
    <thead>
      <tr>
        <th style="width:30px"></th>
        <th>Product</th>
        <th style="text-align:right">Revenue</th>
        <th style="text-align:right">Qty Sold</th>
        <th style="text-align:right">Share</th>
      </tr>
    </thead>
    <tbody>${legendRows}</tbody>
  </table>
  <div class="footer">Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body>
</html>`

  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.addEventListener('load', () => {
    printWindow.print()
  })
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

watch([selectedYear, selectedMonth], () => loadReport())

onMounted(() => loadReport())
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Income Report</h1>
          <p class="text-sm text-muted mt-1">Monthly revenue breakdown by product.</p>
        </div>
        <AdminNav />
      </div>

      <!-- Month selector -->
      <div class="flex items-center gap-3">
        <SecondaryButton size="sm" @click="prevMonth">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </SecondaryButton>
        <span class="text-lg font-semibold text-foreground min-w-[180px] text-center">{{ displayMonth }}</span>
        <SecondaryButton size="sm" @click="nextMonth">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
        </SecondaryButton>
        <div class="ml-auto">
          <SecondaryButton size="sm" :disabled="!report || report.products.length === 0" @click="exportPdf">
            <svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export PDF
          </SecondaryButton>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-24 bg-muted/10 rounded" />
        <div class="h-64 bg-muted/10 rounded" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-error text-sm">
        {{ error }}
      </div>

      <!-- Report content -->
      <template v-else-if="report">
        <!-- Summary cards -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-5">
            <p class="text-sm text-muted">Total Revenue</p>
            <p class="text-2xl font-bold text-foreground mt-1">&#3647;{{ report.total_revenue.toLocaleString() }}</p>
          </div>
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-5">
            <p class="text-sm text-muted">Orders</p>
            <p class="text-2xl font-bold text-foreground mt-1">{{ report.total_orders }}</p>
          </div>
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-5">
            <p class="text-sm text-muted">Products Sold</p>
            <p class="text-2xl font-bold text-foreground mt-1">{{ report.products.length }}</p>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="report.products.length === 0" class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-8 text-center">
          <p class="text-muted text-sm">No completed orders for {{ displayMonth }}.</p>
        </div>

        <!-- Chart + Table -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Pie chart -->
          <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-6 flex flex-col items-center justify-center">
            <h2 class="text-sm font-semibold text-muted mb-4 self-start">Revenue Share</h2>
            <canvas ref="chartCanvas" class="max-w-full" />
            <!-- Legend -->
            <div class="mt-5 space-y-2 w-full">
              <div
                v-for="(product, i) in report.products"
                :key="product.product_name"
                class="flex items-center gap-2 text-sm"
              >
                <span
                  class="w-3 h-3 rounded-sm flex-shrink-0"
                  :style="{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }"
                />
                <span class="text-foreground truncate flex-1">{{ product.product_name }}</span>
                <span class="text-muted ml-auto whitespace-nowrap">
                  {{ report.total_revenue > 0 ? ((product.total_revenue / report.total_revenue) * 100).toFixed(1) : '0.0' }}%
                </span>
              </div>
            </div>
          </div>

          <!-- Product table -->
          <div class="lg:col-span-2 bg-surface rounded-lg ring-1 ring-[var(--card-ring)] overflow-x-auto">
            <table class="w-full text-sm whitespace-nowrap">
              <thead class="bg-surface-alt text-muted">
                <tr>
                  <th class="text-left px-4 py-3 font-medium">Product</th>
                  <th class="text-right px-4 py-3 font-medium">Revenue</th>
                  <th class="text-right px-4 py-3 font-medium">Qty Sold</th>
                  <th class="text-right px-4 py-3 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(product, i) in report.products"
                  :key="product.product_name"
                  class="border-t border-sand/60"
                >
                  <td class="px-4 py-3 text-foreground">
                    <div class="flex items-center gap-2">
                      <span
                        class="w-3 h-3 rounded-sm flex-shrink-0"
                        :style="{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }"
                      />
                      {{ product.product_name }}
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right font-semibold text-foreground">&#3647;{{ product.total_revenue.toLocaleString() }}</td>
                  <td class="px-4 py-3 text-right text-muted">{{ product.total_quantity }}</td>
                  <td class="px-4 py-3 text-right text-muted">
                    {{ report.total_revenue > 0 ? ((product.total_revenue / report.total_revenue) * 100).toFixed(1) : '0.0' }}%
                  </td>
                </tr>
              </tbody>
              <tfoot class="border-t-2 border-sand font-semibold">
                <tr>
                  <td class="px-4 py-3 text-foreground">Total</td>
                  <td class="px-4 py-3 text-right text-foreground">&#3647;{{ report.total_revenue.toLocaleString() }}</td>
                  <td class="px-4 py-3 text-right text-muted">{{ report.products.reduce((sum, p) => sum + p.total_quantity, 0) }}</td>
                  <td class="px-4 py-3 text-right text-muted">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
