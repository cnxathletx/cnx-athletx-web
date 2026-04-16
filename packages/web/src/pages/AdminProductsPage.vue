<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  addAdminProductImage,
  createAdminProduct,
  deleteAdminProductImage,
  fetchAdminProducts,
  fetchAdminProductLines,
  reorderAdminProductImages,
  updateAdminProduct,
  type AdminProduct,
  type AdminProductLine,
  type AdminProductScreenshot,
  type CreateAdminProductPayload,
  type UpdateAdminProductPayload,
  AdminApiErrorResponse,
} from '../api/admin'
import PrimaryButton from '../components/ui/PrimaryButton.vue'
import SecondaryButton from '../components/ui/SecondaryButton.vue'
import AdminNav from '../components/admin/AdminNav.vue'

const IMAGE_UPLOAD_MAX_BYTES = 1_500_000
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const loading = ref(true)
const error = ref('')
const products = ref<AdminProduct[]>([])
const productLines = ref<AdminProductLine[]>([])

const createLoading = ref(false)
const createError = ref('')
const createSuccess = ref('')
const createImageUploading = ref(false)
const createImageError = ref('')

const editLoading = ref(false)
const editError = ref('')
const editSuccess = ref('')
const editImageUploading = ref(false)
const editImageError = ref('')
const editingId = ref<number | null>(null)

const screenshotUploading = ref(false)
const screenshotError = ref('')
const screenshotBusyId = ref<number | null>(null)

const createForm = reactive<CreateAdminProductPayload>({
  slug: '',
  name: '',
  description: '',
  price_thb: 899,
  weight_g: 500,
  image_url: '',
  active: true,
  stock_count: 0,
  product_line_id: null,
})

const editForm = reactive<Required<UpdateAdminProductPayload>>({
  slug: '',
  name: '',
  description: '',
  price_thb: 0,
  weight_g: 0,
  image_url: '',
  active: true,
  product_line_id: null,
})

const activeProducts = computed(() => products.value.filter((p) => !p.archived).sort((a, b) => a.id - b.id))
const archivedProducts = computed(() => products.value.filter((p) => p.archived).sort((a, b) => a.id - b.id))
const showArchived = ref(false)
const createImagePreview = computed(() => createForm.image_url.trim())
const editImagePreview = computed(() => editForm.image_url.trim())
const showCreatePreview = computed(() => createForm.name.trim() || createImagePreview.value)
const createPreviewWeight = computed(() => createForm.weight_g ? `${createForm.weight_g >= 1000 ? `${createForm.weight_g / 1000}kg` : `${createForm.weight_g}g`}` : '')
const createPreviewPrice = computed(() => createForm.price_thb ? `฿${Number(createForm.price_thb).toLocaleString()}` : '฿0')

function getProductLineName(id: number | null): string {
  if (id === null) return 'None'
  const pl = productLines.value.find((p) => p.id === id)
  return pl ? pl.name : `ID ${id}`
}

async function loadProducts() {
  loading.value = true
  error.value = ''
  try {
    const [prods, pls] = await Promise.all([fetchAdminProducts(), fetchAdminProductLines()])
    products.value = prods
    productLines.value = pls
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      error.value = err.message
    } else {
      error.value = 'Unable to load products.'
    }
  } finally {
    loading.value = false
  }
}

function resetCreateForm() {
  createForm.slug = ''
  createForm.name = ''
  createForm.description = ''
  createForm.price_thb = 899
  createForm.weight_g = 500
  createForm.image_url = ''
  createForm.active = true
  createForm.stock_count = 0
  createForm.product_line_id = null
  createImageError.value = ''
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Use JPG, PNG, WEBP, or GIF image files.'
  }

  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    return 'Image file is too large. Maximum size is 1.5 MB.'
  }

  return null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image data'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read image data'))
    reader.readAsDataURL(file)
  })
}

async function handleImagePick(file: File, mode: 'create' | 'edit') {
  const fileError = validateImageFile(file)

  if (mode === 'create') {
    createImageError.value = fileError ?? ''
    if (fileError) return
    createImageUploading.value = true
  } else {
    editImageError.value = fileError ?? ''
    if (fileError) return
    editImageUploading.value = true
  }

  try {
    const dataUrl = await readFileAsDataUrl(file)
    if (mode === 'create') {
      createForm.image_url = dataUrl
    } else {
      editForm.image_url = dataUrl
    }
  } catch {
    if (mode === 'create') {
      createImageError.value = 'Unable to process selected image.'
    } else {
      editImageError.value = 'Unable to process selected image.'
    }
  } finally {
    if (mode === 'create') {
      createImageUploading.value = false
    } else {
      editImageUploading.value = false
    }
  }
}

async function onCreateImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await handleImagePick(file, 'create')
  }
  input.value = ''
}

async function onEditImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await handleImagePick(file, 'edit')
  }
  input.value = ''
}

async function submitCreate() {
  createError.value = ''
  createSuccess.value = ''
  createLoading.value = true

  try {
    const product = await createAdminProduct({
      ...createForm,
      slug: createForm.slug.trim().toLowerCase(),
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      image_url: createForm.image_url.trim(),
      price_thb: Math.round(createForm.price_thb * 100),
      product_line_id: createForm.product_line_id,
    })
    products.value.push(product)
    createSuccess.value = 'Product created.'
    resetCreateForm()
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      createError.value = err.message
    } else {
      createError.value = 'Failed to create product.'
    }
  } finally {
    createLoading.value = false
  }
}

function startEdit(product: AdminProduct) {
  editingId.value = product.id
  editError.value = ''
  editSuccess.value = ''
  editImageError.value = ''

  editForm.slug = product.slug
  editForm.name = product.name
  editForm.description = product.description
  editForm.price_thb = product.price_thb / 100
  editForm.weight_g = product.weight_g
  editForm.image_url = product.image_url
  editForm.active = product.active
  editForm.product_line_id = product.product_line_id
}

function cancelEdit() {
  editingId.value = null
  editError.value = ''
  editSuccess.value = ''
  editImageError.value = ''
}

async function submitEdit() {
  if (editingId.value === null) return

  editError.value = ''
  editSuccess.value = ''
  editLoading.value = true

  try {
    const payload: UpdateAdminProductPayload = {
      slug: editForm.slug.trim().toLowerCase(),
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      price_thb: Math.round(Number(editForm.price_thb) * 100),
      weight_g: Number(editForm.weight_g),
      image_url: editForm.image_url.trim(),
      active: editForm.active,
      product_line_id: editForm.product_line_id,
    }

    const updated = await updateAdminProduct(editingId.value, payload)

    products.value = products.value.map((product) => (product.id === editingId.value ? updated : product))

    editSuccess.value = 'Product updated.'
  } catch (err) {
    if (err instanceof AdminApiErrorResponse) {
      editError.value = err.message
    } else {
      editError.value = 'Failed to update product.'
    }
  } finally {
    editLoading.value = false
  }
}

async function toggleArchive(product: AdminProduct) {
  const newArchived = !product.archived
  try {
    const updated = await updateAdminProduct(product.id, { archived: newArchived })
    products.value = products.value.map((p) => (p.id === product.id ? { ...updated, archived: newArchived } : p))
    if (editingId.value === product.id) cancelEdit()
  } catch (err) {
    error.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to update product.'
  }
}

function formatMoney(value: number): string {
  return `฿${(value / 100).toLocaleString()}`
}

function applyScreenshots(productId: number, screenshots: AdminProductScreenshot[]) {
  products.value = products.value.map((p) => (p.id === productId ? { ...p, screenshots } : p))
}

async function onScreenshotsSelected(event: Event, productId: number) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length === 0) return

  screenshotError.value = ''
  screenshotUploading.value = true
  try {
    let screenshots: AdminProductScreenshot[] | null = null
    for (const file of files) {
      const fileError = validateImageFile(file)
      if (fileError) {
        screenshotError.value = fileError
        break
      }
      const dataUrl = await readFileAsDataUrl(file)
      screenshots = await addAdminProductImage(productId, dataUrl)
    }
    if (screenshots) applyScreenshots(productId, screenshots)
  } catch (err) {
    screenshotError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to upload screenshot.'
  } finally {
    screenshotUploading.value = false
  }
}

async function removeScreenshot(productId: number, imageId: number) {
  screenshotError.value = ''
  screenshotBusyId.value = imageId
  try {
    const screenshots = await deleteAdminProductImage(productId, imageId)
    applyScreenshots(productId, screenshots)
  } catch (err) {
    screenshotError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to delete screenshot.'
  } finally {
    screenshotBusyId.value = null
  }
}

async function moveScreenshot(product: AdminProduct, index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= product.screenshots.length) return
  const ids = product.screenshots.map((s) => s.id)
  const [moved] = ids.splice(index, 1)
  ids.splice(target, 0, moved)

  screenshotError.value = ''
  screenshotBusyId.value = product.screenshots[index].id
  try {
    const screenshots = await reorderAdminProductImages(product.id, ids)
    applyScreenshots(product.id, screenshots)
  } catch (err) {
    screenshotError.value = err instanceof AdminApiErrorResponse ? err.message : 'Failed to reorder screenshots.'
  } finally {
    screenshotBusyId.value = null
  }
}

onMounted(async () => {
  await loadProducts()
})
</script>

<template>
  <div class="bg-background min-h-[60vh]">
    <div class="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-16 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <RouterLink to="/admin" class="text-sm text-muted hover:text-primary transition-colors mb-1 inline-block">&larr; Dashboard</RouterLink>
          <h1 class="text-3xl sm:text-4xl font-bold text-foreground">Admin Products</h1>
          <p class="text-sm text-muted mt-1">Create, edit, and archive product catalog entries.</p>
        </div>
        <AdminNav />
      </div>

      <div class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4">
        <h2 class="text-xl font-bold text-foreground">Create Product</h2>

        <div v-if="createError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ createError }}</div>
        <div v-if="createSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ createSuccess }}</div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input v-model="createForm.slug" type="text" placeholder="Slug (plant-protein-500g)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model="createForm.name" type="text" placeholder="Name" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model.number="createForm.price_thb" type="number" min="1" step="1" placeholder="Price (THB)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model.number="createForm.weight_g" type="number" min="1" step="1" placeholder="Weight (g)" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model.number="createForm.stock_count" type="number" min="0" step="1" placeholder="Initial stock" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          <input v-model="createForm.image_url" type="text" placeholder="Image URL, /path, or data:image" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
        </div>

        <div class="space-y-1">
          <label class="block text-sm font-medium text-foreground">Product Line</label>
          <select
            :value="createForm.product_line_id ?? ''"
            @change="createForm.product_line_id = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null"
            class="w-full sm:w-auto rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option value="">None</option>
            <option v-for="pl in productLines" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
          </select>
          <p class="text-xs text-muted">Links nutrition facts, ingredients, and usage instructions from the selected product line.</p>
        </div>

        <div class="space-y-2">
          <label class="block text-sm font-medium text-foreground">Upload Product Image</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-background hover:file:bg-primary-dark"
            @change="onCreateImageSelected"
          />
          <p class="text-xs text-muted">Accepted: JPG, PNG, WEBP, GIF. Max file size: 1.5 MB.</p>
          <p v-if="createImageUploading" class="text-xs text-primary">Processing image...</p>
          <p v-if="createImageError" class="text-xs text-error">{{ createImageError }}</p>
        </div>

        <textarea
          v-model="createForm.description"
          rows="4"
          placeholder="Description"
          class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />

        <div class="flex items-center gap-2">
          <label class="inline-flex items-center gap-2 text-sm text-foreground">
            <input v-model="createForm.active" type="checkbox" class="h-4 w-4 rounded border-sand bg-surface-alt text-primary focus:ring-primary" />
            Active product
          </label>
        </div>

        <!-- Live Preview -->
        <div v-if="showCreatePreview" class="space-y-2">
          <p class="text-sm font-medium text-muted">Shop Preview</p>
          <div class="max-w-xs">
            <div class="bg-surface rounded-lg shadow-sm ring-1 ring-[var(--card-ring)] overflow-hidden">
              <div class="aspect-[4/3] overflow-hidden bg-sand relative">
                <img
                  v-if="createImagePreview"
                  :src="createImagePreview"
                  alt="Preview"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full bg-gradient-to-br from-primary/20 via-sage/15 to-primary/10 flex items-center justify-center"
                >
                  <svg class="w-20 h-20 text-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <div class="p-6 space-y-4">
                <div class="space-y-2">
                  <h3 class="text-xl font-semibold text-foreground">{{ createForm.name.trim() || 'Product Name' }}</h3>
                  <span v-if="createPreviewWeight" class="inline-block rounded-full bg-surface-alt px-3 py-1 text-xs font-medium text-muted ring-1 ring-[var(--card-ring)]">{{ createPreviewWeight }}</span>
                </div>
                <p class="text-2xl font-bold text-foreground">{{ createPreviewPrice }}</p>
                <div class="inline-flex items-center justify-center rounded-md font-semibold w-full px-6 py-3 text-base bg-primary text-background opacity-75 cursor-default">Add to Cart</div>
              </div>
            </div>
          </div>
        </div>

        <PrimaryButton :disabled="createLoading || createImageUploading" @click="submitCreate">Create Product</PrimaryButton>
      </div>

      <div v-if="loading" class="space-y-3 animate-pulse">
        <div class="h-20 bg-muted/10 rounded" />
        <div class="h-20 bg-muted/10 rounded" />
      </div>
      <div v-else-if="error" class="bg-error/10 border border-error/30 rounded-md p-4 text-sm text-error">{{ error }}</div>
      <div v-else class="space-y-4">
        <div
          v-for="product in activeProducts"
          :key="product.id"
          class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4"
        >
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-center gap-3">
              <img
                v-if="product.image_url"
                :src="product.image_url"
                alt="Product thumbnail"
                class="w-12 h-12 rounded-md object-cover ring-1 ring-[var(--card-ring)]"
              />
              <div>
                <h3 class="text-lg font-semibold text-foreground">{{ product.name }}</h3>
                <p class="text-xs font-mono text-muted">ID {{ product.id }} · {{ product.slug }}</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold" :class="product.active ? 'text-primary' : 'text-muted'">
                {{ product.active ? 'Active' : 'Inactive' }}
              </p>
              <p class="text-xs text-muted">{{ formatMoney(product.price_thb) }} · {{ product.weight_g }}g · {{ getProductLineName(product.product_line_id) }}</p>
            </div>
          </div>

          <p class="text-sm text-muted">{{ product.description }}</p>

          <div class="grid grid-cols-3 gap-3 text-sm">
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Stock</p>
              <p class="text-foreground font-bold">{{ product.stock_count }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Reserved</p>
              <p class="text-foreground font-bold">{{ product.reserved_count }}</p>
            </div>
            <div class="bg-surface-alt rounded-md p-3">
              <p class="text-muted">Available</p>
              <p class="text-foreground font-bold">{{ product.available_count }}</p>
            </div>
          </div>

          <div v-if="editingId === product.id" class="space-y-3 border-t border-sand/60 pt-4">
            <div v-if="editError" class="bg-error/10 border border-error/30 rounded-md p-3 text-sm text-error">{{ editError }}</div>
            <div v-if="editSuccess" class="bg-primary/10 border border-primary/30 rounded-md p-3 text-sm text-primary">{{ editSuccess }}</div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input v-model="editForm.slug" type="text" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              <input v-model="editForm.name" type="text" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              <input v-model.number="editForm.price_thb" type="number" min="1" step="1" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              <input v-model.number="editForm.weight_g" type="number" min="1" step="1" class="rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              <input v-model="editForm.image_url" type="text" class="sm:col-span-2 rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-medium text-foreground">Product Line</label>
              <select
                :value="editForm.product_line_id ?? ''"
                @change="editForm.product_line_id = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null"
                class="w-full sm:w-auto rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">None</option>
                <option v-for="pl in productLines" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="block text-sm font-medium text-foreground">Upload Product Image</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-background hover:file:bg-primary-dark"
                @change="onEditImageSelected"
              />
              <p class="text-xs text-muted">Accepted: JPG, PNG, WEBP, GIF. Max file size: 1.5 MB.</p>
              <p v-if="editImageUploading" class="text-xs text-primary">Processing image...</p>
              <p v-if="editImageError" class="text-xs text-error">{{ editImageError }}</p>
            </div>

            <div v-if="editImagePreview" class="rounded-md border border-sand p-3 bg-surface-alt">
              <p class="text-xs text-muted mb-2">Image preview</p>
              <img :src="editImagePreview" alt="Edit product preview" class="w-32 h-32 object-cover rounded-md ring-1 ring-[var(--card-ring)]" />
            </div>

            <textarea
              v-model="editForm.description"
              rows="4"
              class="w-full rounded-md border border-sand px-4 py-3 text-sm bg-surface-alt text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />

            <div class="flex items-center gap-2">
              <label class="inline-flex items-center gap-2 text-sm text-foreground">
                <input v-model="editForm.active" type="checkbox" class="h-4 w-4 rounded border-sand bg-surface-alt text-primary focus:ring-primary" />
                Active product
              </label>
            </div>

            <div class="space-y-3 border-t border-sand/60 pt-4">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-medium text-foreground">Screenshots ({{ product.screenshots.length }})</label>
                <p v-if="screenshotUploading" class="text-xs text-primary">Uploading...</p>
              </div>
              <p class="text-xs text-muted">Add extra product images shown on the product detail page. Drag order with the arrow buttons. First image displays first.</p>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                class="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-background hover:file:bg-primary-dark"
                :disabled="screenshotUploading"
                @change="onScreenshotsSelected($event, product.id)"
              />
              <p v-if="screenshotError" class="text-xs text-error">{{ screenshotError }}</p>

              <ul v-if="product.screenshots.length > 0" class="space-y-2">
                <li
                  v-for="(shot, index) in product.screenshots"
                  :key="shot.id"
                  class="flex items-center gap-3 rounded-md border border-sand bg-surface-alt p-2"
                >
                  <img :src="shot.url" alt="Screenshot" class="w-16 h-16 rounded object-cover ring-1 ring-[var(--card-ring)]" />
                  <div class="flex-1 text-xs text-muted">
                    <p class="font-mono">#{{ index + 1 }}</p>
                  </div>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded border border-sand bg-surface text-foreground hover:bg-surface-alt disabled:opacity-50"
                      :disabled="index === 0 || screenshotBusyId === shot.id"
                      aria-label="Move up"
                      @click="moveScreenshot(product, index, -1)"
                    >
                      &uarr;
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded border border-sand bg-surface text-foreground hover:bg-surface-alt disabled:opacity-50"
                      :disabled="index === product.screenshots.length - 1 || screenshotBusyId === shot.id"
                      aria-label="Move down"
                      @click="moveScreenshot(product, index, 1)"
                    >
                      &darr;
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 text-xs rounded border border-error/40 text-error hover:bg-error/10 disabled:opacity-50"
                      :disabled="screenshotBusyId === shot.id"
                      @click="removeScreenshot(product.id, shot.id)"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              </ul>
              <p v-else class="text-xs text-muted italic">No screenshots yet.</p>
            </div>

            <div class="flex gap-2">
              <PrimaryButton :disabled="editLoading || editImageUploading" @click="submitEdit">Save</PrimaryButton>
              <SecondaryButton :disabled="editLoading || editImageUploading" @click="cancelEdit">Cancel</SecondaryButton>
            </div>
          </div>

          <div v-else class="border-t border-sand/60 pt-4 flex gap-2">
            <SecondaryButton size="sm" @click="startEdit(product)">Edit Product</SecondaryButton>
            <SecondaryButton size="sm" @click="toggleArchive(product)">Archive</SecondaryButton>
          </div>
        </div>

        <!-- Archived Products -->
        <div v-if="archivedProducts.length > 0" class="pt-4">
          <button
            class="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            @click="showArchived = !showArchived"
          >
            <svg
              class="w-4 h-4 transition-transform"
              :class="{ 'rotate-90': showArchived }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            Archived Products ({{ archivedProducts.length }})
          </button>

          <div v-if="showArchived" class="mt-4 space-y-4">
            <div
              v-for="product in archivedProducts"
              :key="product.id"
              class="bg-surface rounded-lg ring-1 ring-[var(--card-ring)] p-4 sm:p-6 space-y-4 opacity-70"
            >
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex items-center gap-3">
                  <img
                    v-if="product.image_url"
                    :src="product.image_url"
                    alt="Product thumbnail"
                    class="w-12 h-12 rounded-md object-cover ring-1 ring-[var(--card-ring)]"
                  />
                  <div>
                    <h3 class="text-lg font-semibold text-foreground">{{ product.name }}</h3>
                    <p class="text-xs font-mono text-muted">ID {{ product.id }} · {{ product.slug }}</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="text-sm font-semibold text-muted">Archived</p>
                  <p class="text-xs text-muted">{{ formatMoney(product.price_thb) }} · {{ product.weight_g }}g</p>
                </div>
              </div>
              <div class="border-t border-sand/60 pt-4">
                <SecondaryButton size="sm" @click="toggleArchive(product)">Unarchive</SecondaryButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
