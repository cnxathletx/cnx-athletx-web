<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import {
  fetchAdminProductLines,
  createAdminProductLine,
  updateAdminProductLine,
  type AdminProductLine,
  type CreateProductLinePayload,
  type UpdateProductLinePayload,
  AdminApiErrorResponse,
} from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'

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

const createForm = reactive<CreateProductLinePayload>({
  name: '',
  slug: '',
  nutrition_json: '{}',
  ingredients: '',
  how_to_use: '',
})

const editForm = reactive<Required<UpdateProductLinePayload>>({
  name: '',
  slug: '',
  nutrition_json: '{}',
  ingredients: '',
  how_to_use: '',
})

// Nutrition facts as editable key-value pairs
const createNutritionRows = ref<{ key: string; value: string }[]>([{ key: '', value: '' }])
const editNutritionRows = ref<{ key: string; value: string }[]>([{ key: '', value: '' }])

const sortedProductLines = computed(() => [...productLines.value].sort((a, b) => a.id - b.id))

function nutritionRowsToJson(rows: { key: string; value: string }[]): string {
  const obj: Record<string, string> = {}
  for (const row of rows) {
    const k = row.key.trim()
    const v = row.value.trim()
    if (k && v) obj[k] = v
  }
  return JSON.stringify(obj)
}

function nutritionJsonToRows(json: string): { key: string; value: string }[] {
  try {
    const obj = JSON.parse(json) as Record<string, string>
    const rows = Object.entries(obj).map(([key, value]) => ({ key, value }))
    return rows.length > 0 ? rows : [{ key: '', value: '' }]
  } catch {
    return [{ key: '', value: '' }]
  }
}

function addCreateNutritionRow() {
  createNutritionRows.value.push({ key: '', value: '' })
}

function removeCreateNutritionRow(index: number) {
  if (createNutritionRows.value.length > 1) {
    createNutritionRows.value.splice(index, 1)
  }
}

function addEditNutritionRow() {
  editNutritionRows.value.push({ key: '', value: '' })
}

function removeEditNutritionRow(index: number) {
  if (editNutritionRows.value.length > 1) {
    editNutritionRows.value.splice(index, 1)
  }
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
  createForm.name = ''
  createForm.slug = ''
  createForm.nutrition_json = '{}'
  createForm.ingredients = ''
  createForm.how_to_use = ''
  createNutritionRows.value = [{ key: '', value: '' }]
}

async function submitCreate() {
  createError.value = ''
  createSuccess.value = ''
  createLoading.value = true

  try {
    const pl = await createAdminProductLine({
      name: createForm.name.trim(),
      slug: createForm.slug.trim().toLowerCase(),
      nutrition_json: nutritionRowsToJson(createNutritionRows.value),
      ingredients: createForm.ingredients.trim(),
      how_to_use: createForm.how_to_use.trim(),
    })
    productLines.value.push(pl)
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
  editForm.name = pl.name
  editForm.slug = pl.slug
  editForm.nutrition_json = pl.nutrition_json
  editForm.ingredients = pl.ingredients
  editForm.how_to_use = pl.how_to_use
  editNutritionRows.value = nutritionJsonToRows(pl.nutrition_json)
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
    const payload: UpdateProductLinePayload = {
      name: editForm.name.trim(),
      slug: editForm.slug.trim().toLowerCase(),
      nutrition_json: nutritionRowsToJson(editNutritionRows.value),
      ingredients: editForm.ingredients.trim(),
      how_to_use: editForm.how_to_use.trim(),
    }

    const updated = await updateAdminProductLine(editingId.value, payload)
    productLines.value = productLines.value.map((pl) => (pl.id === editingId.value ? updated : pl))
    editSuccess.value = 'Product line updated.'
  } catch (err) {
    editError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to update product line.'
  } finally {
    editLoading.value = false
  }
}

function parseNutritionDisplay(json: string): Record<string, string> {
  try {
    return JSON.parse(json) as Record<string, string>
  } catch {
    return {}
  }
}

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
          <p class="text-sm text-muted mt-1">Manage shared nutrition facts, ingredients, and usage instructions across product SKUs.</p>
        </div>
        <div class="flex items-center gap-2">
          <RouterLink to="/admin/products"><SecondaryButton size="sm">Products</SecondaryButton></RouterLink>
          <RouterLink to="/admin/orders"><SecondaryButton size="sm">Orders</SecondaryButton></RouterLink>
        </div>
      </div>

      <!-- Create Form -->
      <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
        <h2 class="text-xl font-bold text-foreground">Create Product Line</h2>

        <div v-if="createError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ createError }}</div>
        <div v-if="createSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ createSuccess }}</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input v-model="createForm.name" type="text" placeholder="Name (e.g. Plant Protein)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model="createForm.slug" type="text" placeholder="Slug (e.g. plant-protein)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
        </div>

        <!-- Nutrition Facts Editor -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-foreground">Nutrition Facts</label>
          <div v-for="(row, i) in createNutritionRows" :key="i" class="flex items-center gap-2">
            <input v-model="row.key" type="text" placeholder="Label (e.g. Protein)" class="flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            <input v-model="row.value" type="text" placeholder="Value (e.g. 25g)" class="flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            <button @click="removeCreateNutritionRow(i)" class="text-muted hover:text-error transition-colors p-1" :disabled="createNutritionRows.length <= 1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <button @click="addCreateNutritionRow" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add row</button>
        </div>

        <textarea
          v-model="createForm.ingredients"
          rows="3"
          placeholder="Ingredients (e.g. Pea protein isolate, brown rice protein...)"
          class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <textarea
          v-model="createForm.how_to_use"
          rows="3"
          placeholder="How to Use (e.g. Mix one scoop with 250ml water...)"
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
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-foreground">{{ pl.name }}</h3>
              <p class="text-xs font-mono text-muted">ID {{ pl.id }} · {{ pl.slug }}</p>
            </div>
          </div>

          <!-- Display nutrition, ingredients, how to use -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div class="bg-surface-alt rounded-md p-3 space-y-1">
              <p class="text-muted font-medium">Nutrition Facts</p>
              <div v-for="(value, label) in parseNutritionDisplay(pl.nutrition_json)" :key="label" class="flex justify-between">
                <span class="text-muted">{{ label }}</span>
                <span class="text-foreground font-medium">{{ value }}</span>
              </div>
              <p v-if="Object.keys(parseNutritionDisplay(pl.nutrition_json)).length === 0" class="text-muted italic">Not set</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted font-medium mb-1">Ingredients</p>
              <p class="text-foreground">{{ pl.ingredients || 'Not set' }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted font-medium mb-1">How to Use</p>
              <p class="text-foreground">{{ pl.how_to_use || 'Not set' }}</p>
            </div>
          </div>

          <!-- Edit Form -->
          <div v-if="editingId === pl.id" class="space-y-3 border-t border-sand/60 pt-4">
            <div v-if="editError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ editError }}</div>
            <div v-if="editSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ editSuccess }}</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input v-model="editForm.name" type="text" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              <input v-model="editForm.slug" type="text" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>

            <!-- Nutrition Facts Editor -->
            <div class="space-y-2">
              <label class="block text-sm font-medium text-foreground">Nutrition Facts</label>
              <div v-for="(row, i) in editNutritionRows" :key="i" class="flex items-center gap-2">
                <input v-model="row.key" type="text" placeholder="Label" class="flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
                <input v-model="row.value" type="text" placeholder="Value" class="flex-1 rounded-md border border-sand px-3 py-2 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
                <button @click="removeEditNutritionRow(i)" class="text-muted hover:text-error transition-colors p-1" :disabled="editNutritionRows.length <= 1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <button @click="addEditNutritionRow" class="text-sm text-primary hover:text-primary-dark transition-colors">+ Add row</button>
            </div>

            <textarea
              v-model="editForm.ingredients"
              rows="3"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <textarea
              v-model="editForm.how_to_use"
              rows="3"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

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
