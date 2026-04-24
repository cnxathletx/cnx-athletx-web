<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue'
import {
  fetchAdminProductLines,
  createAdminProductLine,
  updateAdminProductLine,
  uploadAdminLabTestFile,
  addAdminLabTestFile,
  updateAdminLabTestFile,
  deleteAdminLabTestFile,
  reorderAdminLabTestFiles,
  type AdminProductLine,
  type AdminLabTestFile,
  type CreateProductLinePayload,
  type UpdateProductLinePayload,
  AdminApiErrorResponse,
} from '../api/admin'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type SupportedLocale } from '../i18n'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'

const PRIMARY_LOCALE: SupportedLocale = 'en'

type NutritionRow = { key: string; value: string; sub: boolean }
type IngredientRow = { label: string; sub: boolean }

interface LocaleBuffer {
  name: string
  nutritionRows: NutritionRow[]
  ingredientRows: IngredientRow[]
  how_to_use: string
  who_is_for: string
  regulatory_info: string
}

function emptyLocaleBuffer(): LocaleBuffer {
  return {
    name: '',
    nutritionRows: [{ key: '', value: '', sub: false }],
    ingredientRows: [{ label: '', sub: false }],
    how_to_use: '',
    who_is_for: '',
    regulatory_info: '',
  }
}

function emptyLocaleMap(): Record<SupportedLocale, LocaleBuffer> {
  const map = {} as Record<SupportedLocale, LocaleBuffer>
  for (const l of SUPPORTED_LOCALES) map[l] = emptyLocaleBuffer()
  return map
}

const loading = ref(true)
const error = ref('')
const productLines = ref<AdminProductLine[]>([])

const createLoading = ref(false)
const createError = ref('')
const createSuccess = ref('')

const editingId = ref<number | null>(null)
const editLoading = ref(false)
const editError = ref('')
const editSuccess = ref('')

const createSlug = ref('')
const createActiveLocale = ref<SupportedLocale>(PRIMARY_LOCALE)
const createBuffers = reactive<Record<SupportedLocale, LocaleBuffer>>(emptyLocaleMap())

const editSlug = ref('')
const editActiveLocale = ref<SupportedLocale>(PRIMARY_LOCALE)
const editBuffers = reactive<Record<SupportedLocale, LocaleBuffer>>(emptyLocaleMap())

const createBuffer = computed(() => createBuffers[createActiveLocale.value])
const editBuffer = computed(() => editBuffers[editActiveLocale.value])

const sortedProductLines = computed(() => [...productLines.value].sort((a, b) => a.id - b.id))

function nutritionRowsToJson(rows: NutritionRow[]): string {
  const arr: { label: string; value: string; sub?: boolean }[] = []
  for (const row of rows) {
    const label = row.key.trim()
    const value = row.value.trim()
    if (!label || !value) continue
    const entry: { label: string; value: string; sub?: boolean } = { label, value }
    if (row.sub) entry.sub = true
    arr.push(entry)
  }
  return JSON.stringify(arr)
}

function nutritionJsonToRows(json: string): NutritionRow[] {
  try {
    const parsed = JSON.parse(json)
    let rows: NutritionRow[] = []
    if (Array.isArray(parsed)) {
      rows = parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string' && typeof r.value === 'string')
        .map((r) => ({ key: r.label, value: r.value, sub: r.sub === true }))
    } else if (parsed && typeof parsed === 'object') {
      rows = Object.entries(parsed as Record<string, string>).map(([key, value]) => ({
        key,
        value: String(value),
        sub: false,
      }))
    }
    return rows.length > 0 ? rows : [{ key: '', value: '', sub: false }]
  } catch {
    return [{ key: '', value: '', sub: false }]
  }
}

function ingredientRowsToString(rows: IngredientRow[]): string {
  const arr: { label: string; sub?: boolean }[] = []
  for (const row of rows) {
    const label = row.label.trim()
    if (!label) continue
    const entry: { label: string; sub?: boolean } = { label }
    if (row.sub) entry.sub = true
    arr.push(entry)
  }
  return JSON.stringify(arr)
}

function ingredientStringToRows(raw: string): IngredientRow[] {
  if (!raw) return [{ label: '', sub: false }]
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const rows = parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string')
        .map((r) => ({ label: r.label, sub: r.sub === true }))
      return rows.length > 0 ? rows : [{ label: '', sub: false }]
    }
  } catch {
    // legacy plain-text format: split on commas
  }
  const parts = raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts.map((label) => ({ label, sub: false })) : [{ label: '', sub: false }]
}

function addNutritionRow(buf: LocaleBuffer) {
  buf.nutritionRows.push({ key: '', value: '', sub: false })
}
function removeNutritionRow(buf: LocaleBuffer, index: number) {
  if (buf.nutritionRows.length > 1) buf.nutritionRows.splice(index, 1)
}
function addIngredientRow(buf: LocaleBuffer) {
  buf.ingredientRows.push({ label: '', sub: false })
}
function removeIngredientRow(buf: LocaleBuffer, index: number) {
  if (buf.ingredientRows.length > 1) buf.ingredientRows.splice(index, 1)
}

function bufferToTranslationEntry(buf: LocaleBuffer) {
  return {
    name: buf.name.trim(),
    nutrition_json: nutritionRowsToJson(buf.nutritionRows),
    ingredients: ingredientRowsToString(buf.ingredientRows),
    how_to_use: buf.how_to_use.trim(),
    who_is_for: buf.who_is_for.trim(),
    regulatory_info: buf.regulatory_info.trim(),
  }
}

function packTranslationsJson(buffers: Record<SupportedLocale, LocaleBuffer>): string {
  const out: Record<string, Record<string, string>> = {}
  for (const locale of SUPPORTED_LOCALES) {
    const entry = bufferToTranslationEntry(buffers[locale])
    const hasContent = entry.name || entry.how_to_use || entry.who_is_for || entry.regulatory_info
      || entry.ingredients !== '[]' || (entry.nutrition_json && entry.nutrition_json !== '[]')
    if (hasContent) out[locale] = entry
  }
  return JSON.stringify(out)
}

function loadBuffersFromProductLine(pl: AdminProductLine): Record<SupportedLocale, LocaleBuffer> {
  const buffers = emptyLocaleMap()
  let parsed: Record<string, Partial<{ name: string; nutrition_json: string; ingredients: string; how_to_use: string; who_is_for: string; regulatory_info: string }>> = {}
  try {
    const raw = pl.translations_json ? JSON.parse(pl.translations_json) : {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw
  } catch {
    // ignore
  }

  for (const locale of SUPPORTED_LOCALES) {
    const entry = parsed[locale] || {}
    const base = locale === PRIMARY_LOCALE
    buffers[locale] = {
      name: typeof entry.name === 'string' ? entry.name : (base ? pl.name : ''),
      nutritionRows: nutritionJsonToRows(typeof entry.nutrition_json === 'string' && entry.nutrition_json ? entry.nutrition_json : (base ? pl.nutrition_json : '[]')),
      ingredientRows: ingredientStringToRows(typeof entry.ingredients === 'string' ? entry.ingredients : (base ? pl.ingredients : '')),
      how_to_use: typeof entry.how_to_use === 'string' ? entry.how_to_use : (base ? pl.how_to_use : ''),
      who_is_for: typeof entry.who_is_for === 'string' ? entry.who_is_for : (base ? pl.who_is_for : ''),
      regulatory_info: typeof entry.regulatory_info === 'string' ? entry.regulatory_info : (base ? pl.regulatory_info : ''),
    }
  }
  return buffers
}

async function loadProductLines() {
  loading.value = true
  error.value = ''
  try {
    productLines.value = await fetchAdminProductLines()
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Unable to load product lines.'
  } finally {
    loading.value = false
  }
}

function resetCreateForm() {
  createSlug.value = ''
  createActiveLocale.value = PRIMARY_LOCALE
  for (const l of SUPPORTED_LOCALES) createBuffers[l] = emptyLocaleBuffer()
}

async function submitCreate() {
  createError.value = ''
  createSuccess.value = ''
  createLoading.value = true

  try {
    const primary = createBuffers[PRIMARY_LOCALE]
    const primaryEntry = bufferToTranslationEntry(primary)
    const payload: CreateProductLinePayload = {
      name: primaryEntry.name,
      slug: createSlug.value.trim().toLowerCase(),
      nutrition_json: primaryEntry.nutrition_json || '[]',
      ingredients: primaryEntry.ingredients,
      how_to_use: primaryEntry.how_to_use,
      who_is_for: primaryEntry.who_is_for,
      regulatory_info: primaryEntry.regulatory_info,
      translations_json: packTranslationsJson(createBuffers),
    }
    const pl = await createAdminProductLine(payload)
    productLines.value.push({ ...pl, lab_test_files: pl.lab_test_files ?? [] })
    createSuccess.value = 'Product line created.'
    resetCreateForm()
  } catch (err) {
    createError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to create product line.'
  } finally {
    createLoading.value = false
  }
}

function startEdit(pl: AdminProductLine) {
  editingId.value = pl.id
  editError.value = ''
  editSuccess.value = ''
  editSlug.value = pl.slug
  editActiveLocale.value = PRIMARY_LOCALE
  const loaded = loadBuffersFromProductLine(pl)
  for (const l of SUPPORTED_LOCALES) editBuffers[l] = loaded[l]
  labTestUploadError.value = ''
  for (const k of Object.keys(labTestDraftLabels)) delete labTestDraftLabels[Number(k)]
}

function cancelEdit() {
  editingId.value = null
  editError.value = ''
  editSuccess.value = ''
}

async function submitEdit() {
  if (editingId.value === null) return

  editError.value = ''
  editSuccess.value = ''
  editLoading.value = true

  try {
    const primary = editBuffers[PRIMARY_LOCALE]
    const primaryEntry = bufferToTranslationEntry(primary)
    const payload: UpdateProductLinePayload = {
      name: primaryEntry.name,
      slug: editSlug.value.trim().toLowerCase(),
      nutrition_json: primaryEntry.nutrition_json || '[]',
      ingredients: primaryEntry.ingredients,
      how_to_use: primaryEntry.how_to_use,
      who_is_for: primaryEntry.who_is_for,
      regulatory_info: primaryEntry.regulatory_info,
      translations_json: packTranslationsJson(editBuffers),
    }
    const updated = await updateAdminProductLine(editingId.value, payload)
    productLines.value = productLines.value.map((pl) =>
      pl.id === editingId.value ? { ...updated, lab_test_files: updated.lab_test_files ?? pl.lab_test_files ?? [] } : pl
    )
    editSuccess.value = 'Product line updated.'
  } catch (err) {
    editError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to update product line.'
  } finally {
    editLoading.value = false
  }
}

const LAB_TEST_MAX_BYTES = 2_000_000
const LAB_TEST_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

const labTestUploadError = ref('')
const labTestUploading = ref(false)
const labTestDraftLabels = reactive<Record<number, string>>({})

function isLabTestPdf(file: AdminLabTestFile): boolean {
  return file.content_type === 'application/pdf'
}

function currentLabTestFiles(id: number | null): AdminLabTestFile[] {
  if (id === null) return []
  const pl = productLines.value.find((p) => p.id === id)
  return pl?.lab_test_files ?? []
}

function updateProductLineLabTests(productLineId: number, files: AdminLabTestFile[]) {
  productLines.value = productLines.value.map((pl) =>
    pl.id === productLineId ? { ...pl, lab_test_files: files } : pl
  )
}

function r2KeyFromUrl(url: string, key: string): string {
  // The upload endpoint returns a `key` (relative to the R2 bucket) plus the public URL.
  // Prefer the key verbatim; fall back to extracting from the URL.
  if (key && key.startsWith('lab-tests/')) return key
  const m = url.match(/lab-tests\/[^/?#]+/)
  return m ? m[0] : key
}

async function onLabTestFilesSelected(event: Event) {
  if (editingId.value === null) return
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (files.length === 0) return

  labTestUploadError.value = ''
  labTestUploading.value = true

  try {
    for (const file of files) {
      if (file.size > LAB_TEST_MAX_BYTES) {
        labTestUploadError.value = `"${file.name}" exceeds ${LAB_TEST_MAX_BYTES.toLocaleString()} bytes.`
        continue
      }
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        labTestUploadError.value = `"${file.name}" is not a supported file type.`
        continue
      }
      try {
        const uploaded = await uploadAdminLabTestFile(file)
        const baseName = file.name.replace(/\.[^/.]+$/, '').slice(0, 200)
        const next = await addAdminLabTestFile(editingId.value, {
          url: uploaded.url,
          r2_key: r2KeyFromUrl(uploaded.url, uploaded.key),
          content_type: uploaded.content_type,
          size_bytes: uploaded.size_bytes,
          label: baseName,
        })
        updateProductLineLabTests(editingId.value, next)
      } catch (err) {
        labTestUploadError.value = err instanceof AdminApiErrorResponse ? err.message : `Failed to upload "${file.name}"`
      }
    }
  } finally {
    labTestUploading.value = false
    input.value = ''
  }
}

async function onLabTestLabelBlur(file: AdminLabTestFile) {
  if (editingId.value === null) return
  const draft = (labTestDraftLabels[file.id] ?? file.label).trim()
  if (draft === file.label) return
  try {
    const next = await updateAdminLabTestFile(editingId.value, file.id, draft)
    updateProductLineLabTests(editingId.value, next)
    delete labTestDraftLabels[file.id]
  } catch (err) {
    labTestUploadError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to rename file'
  }
}

async function onLabTestDelete(file: AdminLabTestFile) {
  if (editingId.value === null) return
  if (!confirm(`Delete lab test file "${file.label || file.id}"? This cannot be undone.`)) return
  try {
    const next = await deleteAdminLabTestFile(editingId.value, file.id)
    updateProductLineLabTests(editingId.value, next)
  } catch (err) {
    labTestUploadError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to delete file'
  }
}

async function onLabTestMove(file: AdminLabTestFile, direction: -1 | 1) {
  if (editingId.value === null) return
  const files = [...currentLabTestFiles(editingId.value)]
  const idx = files.findIndex((f) => f.id === file.id)
  if (idx < 0) return
  const target = idx + direction
  if (target < 0 || target >= files.length) return
  ;[files[idx], files[target]] = [files[target], files[idx]]
  try {
    const next = await reorderAdminLabTestFiles(editingId.value, files.map((f) => f.id))
    updateProductLineLabTests(editingId.value, next)
  } catch (err) {
    labTestUploadError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to reorder files'
  }
}

function labTestTypeBadge(file: AdminLabTestFile): string {
  return isLabTestPdf(file) ? 'PDF' : 'IMG'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function parseIngredientsDisplay(raw: string): { label: string; sub: boolean }[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string')
        .map((r) => ({ label: r.label, sub: r.sub === true }))
    }
  } catch {
    // legacy plain-text: split on commas
  }
  return raw
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label, sub: false }))
}

function parseNutritionDisplay(json: string): { label: string; value: string; sub: boolean }[] {
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed)) {
      return parsed
        .filter((r) => r && typeof r === 'object' && typeof r.label === 'string' && typeof r.value === 'string')
        .map((r) => ({ label: r.label, value: r.value, sub: r.sub === true }))
    }
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed as Record<string, string>).map(([label, value]) => ({
        label,
        value: String(value),
        sub: false,
      }))
    }
    return []
  } catch {
    return []
  }
}

function parseTranslations(raw: string): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(raw || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, Record<string, string>>
  } catch {
    // ignore
  }
  return {}
}

function displayField(pl: AdminProductLine, locale: SupportedLocale, field: 'nutrition_json' | 'ingredients' | 'how_to_use' | 'who_is_for' | 'regulatory_info' | 'name'): string {
  const translations = parseTranslations(pl.translations_json)
  const t = translations[locale]?.[field]
  if (typeof t === 'string' && t.trim() !== '') return t
  if (locale === PRIMARY_LOCALE) {
    if (field === 'name') return pl.name
    return pl[field]
  }
  return ''
}

// Per-product display-locale selector
const displayLocales = reactive<Record<number, SupportedLocale>>({})
function getDisplayLocale(id: number): SupportedLocale {
  return displayLocales[id] ?? PRIMARY_LOCALE
}
function setDisplayLocale(id: number, locale: SupportedLocale) {
  displayLocales[id] = locale
}

watch(editingId, (id) => {
  if (id === null) return
  if (!(id in displayLocales)) displayLocales[id] = PRIMARY_LOCALE
})

onMounted(async () => {
  await loadProductLines()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Product Lines</h1>
          <p class="text-sm text-muted mt-1">Manage shared nutrition facts, ingredients, and usage instructions across product SKUs. Enter content for each supported language.</p>
        </div>
        <AdminNav />
      </div>

      <!-- Create Form -->
      <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
        <h2 class="text-xl font-bold text-foreground">Create Product Line</h2>

        <div v-if="createError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ createError }}</div>
        <div v-if="createSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ createSuccess }}</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input v-model="createSlug" type="text" placeholder="Slug (e.g. plant-protein)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
        </div>

        <!-- Locale tabs -->
        <div class="flex gap-1 border-b border-sand/60">
          <button
            v-for="locale in SUPPORTED_LOCALES"
            :key="locale"
            type="button"
            @click="createActiveLocale = locale"
            :class="[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              createActiveLocale === locale
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-foreground'
            ]"
          >
            {{ LOCALE_LABELS[locale] }}
            <span v-if="locale === PRIMARY_LOCALE" class="ml-1 text-[10px] uppercase opacity-70">primary</span>
          </button>
        </div>

        <input v-model="createBuffer.name" type="text" :placeholder="`Name (${LOCALE_LABELS[createActiveLocale]})`" class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />

        <!-- Nutrition Facts Editor -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-foreground">Nutrition Facts ({{ LOCALE_LABELS[createActiveLocale] }})</label>
          <p class="text-xs text-muted">Tick "Sub" to render a row as an italic, indented sub-line (e.g. "of which sugars").</p>
          <div v-for="(row, i) in createBuffer.nutritionRows" :key="i" class="flex items-center gap-2">
            <input v-model="row.key" type="text" placeholder="Label (e.g. Protein)" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic pl-6']" />
            <input v-model="row.value" type="text" placeholder="Value (e.g. 25g)" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic']" />
            <label class="flex items-center gap-1 text-xs text-muted select-none">
              <input v-model="row.sub" type="checkbox" class="accent-primary" />
              Sub
            </label>
            <button @click="removeNutritionRow(createBuffer, i)" class="text-muted hover:text-error transition-colors p-1" :disabled="createBuffer.nutritionRows.length <= 1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <button @click="addNutritionRow(createBuffer)" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add row</button>
        </div>

        <!-- Ingredients Editor -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-foreground">Ingredients ({{ LOCALE_LABELS[createActiveLocale] }})</label>
          <p class="text-xs text-muted">Tick "Sub" to mark a sub-ingredient (italic, indented).</p>
          <div v-for="(row, i) in createBuffer.ingredientRows" :key="i" class="flex items-center gap-2">
            <input v-model="row.label" type="text" placeholder="Ingredient (e.g. Pea protein isolate)" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic pl-6']" />
            <label class="flex items-center gap-1 text-xs text-muted select-none">
              <input v-model="row.sub" type="checkbox" class="accent-primary" />
              Sub
            </label>
            <button @click="removeIngredientRow(createBuffer, i)" class="text-muted hover:text-error transition-colors p-1" :disabled="createBuffer.ingredientRows.length <= 1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <button @click="addIngredientRow(createBuffer)" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add ingredient</button>
        </div>

        <textarea
          v-model="createBuffer.how_to_use"
          rows="3"
          :placeholder="`How to Use (${LOCALE_LABELS[createActiveLocale]})`"
          class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <textarea
          v-model="createBuffer.who_is_for"
          rows="3"
          :placeholder="`Who is this For? (${LOCALE_LABELS[createActiveLocale]})`"
          class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <textarea
          v-model="createBuffer.regulatory_info"
          rows="3"
          :placeholder="`Regulatory & Safety Information (${LOCALE_LABELS[createActiveLocale]})`"
          class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <PrimaryButton :disabled="createLoading" @click="submitCreate">Create Product Line</PrimaryButton>
      </div>

      <!-- List -->
      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-20 bg-muted/10 rounded" />
        <div class="h-20 bg-muted/10 rounded" />
      </div>
      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">{{ error }}</div>
      <div v-else class="space-y-4">
        <div
          v-for="pl in sortedProductLines"
          :key="pl.id"
          class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4"
        >
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-foreground">{{ displayField(pl, getDisplayLocale(pl.id), 'name') || pl.name }}</h3>
              <p class="text-xs font-mono text-muted">ID {{ pl.id }} · {{ pl.slug }}</p>
            </div>
            <div class="flex gap-1">
              <button
                v-for="locale in SUPPORTED_LOCALES"
                :key="locale"
                type="button"
                @click="setDisplayLocale(pl.id, locale)"
                :class="[
                  'px-2 py-1 text-xs rounded transition-colors',
                  getDisplayLocale(pl.id) === locale
                    ? 'bg-primary text-white'
                    : 'bg-surface-alt text-muted hover:text-foreground'
                ]"
              >
                {{ locale.toUpperCase() }}
              </button>
            </div>
          </div>

          <!-- Display nutrition, ingredients, how to use, who is for, regulatory info -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
            <div class="bg-surface-alt rounded-md p-3 space-y-1">
              <p class="text-muted font-medium">Nutrition Facts</p>
              <div v-for="(row, i) in parseNutritionDisplay(displayField(pl, getDisplayLocale(pl.id), 'nutrition_json'))" :key="i" class="flex justify-between">
                <span :class="['text-muted', row.sub && 'italic pl-4']">{{ row.label }}</span>
                <span :class="['text-foreground font-medium', row.sub && 'italic']">{{ row.value }}</span>
              </div>
              <p v-if="parseNutritionDisplay(displayField(pl, getDisplayLocale(pl.id), 'nutrition_json')).length === 0" class="text-muted italic">Not set</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3 space-y-1">
              <p class="text-muted font-medium">Ingredients</p>
              <p v-for="(row, i) in parseIngredientsDisplay(displayField(pl, getDisplayLocale(pl.id), 'ingredients'))" :key="i" :class="['text-foreground', row.sub && 'italic pl-4']">{{ row.label }}</p>
              <p v-if="parseIngredientsDisplay(displayField(pl, getDisplayLocale(pl.id), 'ingredients')).length === 0" class="text-muted italic">Not set</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted font-medium mb-1">How to Use</p>
              <p class="text-foreground whitespace-pre-line">{{ displayField(pl, getDisplayLocale(pl.id), 'how_to_use') || 'Not set' }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted font-medium mb-1">Who is this For?</p>
              <p class="text-foreground whitespace-pre-line">{{ displayField(pl, getDisplayLocale(pl.id), 'who_is_for') || 'Not set' }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted font-medium mb-1">Regulatory &amp; Safety</p>
              <p class="text-foreground whitespace-pre-line">{{ displayField(pl, getDisplayLocale(pl.id), 'regulatory_info') || 'Not set' }}</p>
            </div>
          </div>

          <!-- Edit Form -->
          <div v-if="editingId === pl.id" class="space-y-3 border-t border-sand/60 pt-4">
            <div v-if="editError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ editError }}</div>
            <div v-if="editSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ editSuccess }}</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input v-model="editSlug" type="text" placeholder="Slug" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>

            <!-- Locale tabs -->
            <div class="flex gap-1 border-b border-sand/60">
              <button
                v-for="locale in SUPPORTED_LOCALES"
                :key="locale"
                type="button"
                @click="editActiveLocale = locale"
                :class="[
                  'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                  editActiveLocale === locale
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-foreground'
                ]"
              >
                {{ LOCALE_LABELS[locale] }}
                <span v-if="locale === PRIMARY_LOCALE" class="ml-1 text-[10px] uppercase opacity-70">primary</span>
              </button>
            </div>

            <input v-model="editBuffer.name" type="text" :placeholder="`Name (${LOCALE_LABELS[editActiveLocale]})`" class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />

            <!-- Nutrition Facts Editor -->
            <div class="space-y-2">
              <label class="block text-sm font-medium text-foreground">Nutrition Facts ({{ LOCALE_LABELS[editActiveLocale] }})</label>
              <p class="text-xs text-muted">Tick "Sub" to render a row as an italic, indented sub-line.</p>
              <div v-for="(row, i) in editBuffer.nutritionRows" :key="i" class="flex items-center gap-2">
                <input v-model="row.key" type="text" placeholder="Label" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic pl-6']" />
                <input v-model="row.value" type="text" placeholder="Value" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic']" />
                <label class="flex items-center gap-1 text-xs text-muted select-none">
                  <input v-model="row.sub" type="checkbox" class="accent-primary" />
                  Sub
                </label>
                <button @click="removeNutritionRow(editBuffer, i)" class="text-muted hover:text-error transition-colors p-1" :disabled="editBuffer.nutritionRows.length <= 1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <button @click="addNutritionRow(editBuffer)" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add row</button>
            </div>

            <!-- Ingredients Editor -->
            <div class="space-y-2">
              <label class="block text-sm font-medium text-foreground">Ingredients ({{ LOCALE_LABELS[editActiveLocale] }})</label>
              <p class="text-xs text-muted">Tick "Sub" to mark a sub-ingredient (italic, indented).</p>
              <div v-for="(row, i) in editBuffer.ingredientRows" :key="i" class="flex items-center gap-2">
                <input v-model="row.label" type="text" placeholder="Ingredient" :class="['flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent', row.sub && 'italic pl-6']" />
                <label class="flex items-center gap-1 text-xs text-muted select-none">
                  <input v-model="row.sub" type="checkbox" class="accent-primary" />
                  Sub
                </label>
                <button @click="removeIngredientRow(editBuffer, i)" class="text-muted hover:text-error transition-colors p-1" :disabled="editBuffer.ingredientRows.length <= 1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <button @click="addIngredientRow(editBuffer)" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add ingredient</button>
            </div>

            <textarea
              v-model="editBuffer.how_to_use"
              rows="3"
              :placeholder="`How to Use (${LOCALE_LABELS[editActiveLocale]})`"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <textarea
              v-model="editBuffer.who_is_for"
              rows="3"
              :placeholder="`Who is this For? (${LOCALE_LABELS[editActiveLocale]})`"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <textarea
              v-model="editBuffer.regulatory_info"
              rows="3"
              :placeholder="`Regulatory & Safety Information (${LOCALE_LABELS[editActiveLocale]})`"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <!-- Lab Test Files -->
            <div class="space-y-3 rounded-md border border-sand/60 bg-surface-alt/40 p-4">
              <div>
                <h4 class="text-sm font-semibold text-foreground">Lab Test Files</h4>
                <p class="text-xs text-muted mt-0.5">PDFs or images. 2 MB max each. Shown to all locales.</p>
              </div>

              <div v-if="labTestUploadError" class="bg-error/10 border border-error/30 rounded-md p-2 text-xs text-error">
                {{ labTestUploadError }}
              </div>

              <ul v-if="currentLabTestFiles(editingId).length > 0" class="space-y-2">
                <li
                  v-for="(file, i) in currentLabTestFiles(editingId)"
                  :key="file.id"
                  class="flex items-center gap-3 bg-surface rounded-md ring-1 ring-[var(--card-ring)] p-2"
                >
                  <div class="flex flex-col">
                    <button
                      type="button"
                      @click="onLabTestMove(file, -1)"
                      :disabled="i === 0"
                      class="text-muted hover:text-foreground disabled:opacity-30 p-0.5"
                      aria-label="Move up"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      type="button"
                      @click="onLabTestMove(file, 1)"
                      :disabled="i === currentLabTestFiles(editingId).length - 1"
                      class="text-muted hover:text-foreground disabled:opacity-30 p-0.5"
                      aria-label="Move down"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>

                  <div class="w-12 h-12 flex items-center justify-center rounded bg-surface-alt overflow-hidden shrink-0">
                    <img v-if="!isLabTestPdf(file)" :src="file.url" :alt="file.label" class="w-full h-full object-cover" />
                    <svg v-else class="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>

                  <span class="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-primary/10 text-primary shrink-0">
                    {{ labTestTypeBadge(file) }}
                  </span>

                  <input
                    :value="labTestDraftLabels[file.id] ?? file.label"
                    @input="(e) => (labTestDraftLabels[file.id] = (e.target as HTMLInputElement).value)"
                    @blur="onLabTestLabelBlur(file)"
                    type="text"
                    placeholder="Label"
                    class="flex-1 min-w-0 rounded border border-sand px-2 py-1 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />

                  <span class="text-xs text-muted shrink-0">{{ formatBytes(file.size_bytes) }}</span>

                  <a
                    :href="file.url"
                    target="_blank"
                    rel="noopener"
                    class="text-muted hover:text-primary transition-colors p-1"
                    :aria-label="`Open ${file.label || 'file'} in new tab`"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  </a>

                  <button
                    type="button"
                    @click="onLabTestDelete(file)"
                    class="text-muted hover:text-error transition-colors p-1"
                    aria-label="Delete file"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" /></svg>
                  </button>
                </li>
              </ul>
              <p v-else class="text-xs text-muted italic">No lab test files.</p>

              <label class="flex items-center gap-3 text-sm">
                <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-white hover:opacity-90 cursor-pointer text-xs font-medium transition-opacity" :class="labTestUploading && 'opacity-60 cursor-wait'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                  {{ labTestUploading ? 'Uploading...' : 'Add files' }}
                  <input
                    type="file"
                    multiple
                    :accept="LAB_TEST_ACCEPT"
                    :disabled="labTestUploading"
                    class="sr-only"
                    @change="onLabTestFilesSelected"
                  />
                </span>
                <span class="text-xs text-muted">PDF, JPG, PNG, WebP · up to 2 MB each</span>
              </label>
            </div>

            <div class="flex gap-2">
              <PrimaryButton :disabled="editLoading" @click="submitEdit">Save</PrimaryButton>
              <SecondaryButton :disabled="editLoading" @click="cancelEdit">Cancel</SecondaryButton>
            </div>
          </div>

          <div v-else class="border-t border-sand/60 pt-4">
            <SecondaryButton size="sm" @click="startEdit(pl)">Edit</SecondaryButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
