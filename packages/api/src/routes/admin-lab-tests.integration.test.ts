import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

const PDF_KEY = 'lab-tests/01h0000000000000000000000a.pdf'
const IMG_KEY = 'lab-tests/01h0000000000000000000000b.jpg'

async function addFile(payload: Record<string, unknown>, productLineId = 1) {
  return workerFetch(`/api/admin/product-lines/${productLineId}/lab-test-files`, {
    admin: true,
    body: payload,
  })
}

describe('POST /api/admin/product-lines/:id/lab-test-files', () => {
  it('appends a PDF lab test file at end of sort_order', async () => {
    const res = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 12345,
      label: 'Heavy metals COA',
    })
    expect(res.status).toBe(201)
    const data = await res.json() as { lab_test_files: Array<{ id: number; label: string; content_type: string; sort_order: number }> }
    expect(data.lab_test_files).toHaveLength(1)
    expect(data.lab_test_files[0].label).toBe('Heavy metals COA')
    expect(data.lab_test_files[0].content_type).toBe('application/pdf')
    expect(data.lab_test_files[0].sort_order).toBe(0)
  })

  it('rejects unknown product line', async () => {
    const res = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
    }, 9999)
    expect(res.status).toBe(404)
  })

  it('rejects disallowed content-type', async () => {
    const res = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/octet-stream',
      size_bytes: 100,
    })
    expect(res.status).toBe(400)
  })

  it('rejects malformed r2_key', async () => {
    const res = await addFile({
      url: `https://images.cnxnature.com/products/foo.jpg`,
      r2_key: 'products/foo.jpg',
      content_type: 'image/jpeg',
      size_bytes: 100,
    })
    expect(res.status).toBe(400)
  })

  it('rejects oversize size_bytes', async () => {
    const res = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 3_000_000,
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/product-lines/:id/lab-test-files/:fileId', () => {
  it('renames the label', async () => {
    const add = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'Original',
    })
    const { lab_test_files: [file] } = await add.json() as { lab_test_files: Array<{ id: number }> }

    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/${file.id}`, {
      method: 'PATCH',
      admin: true,
      body: { label: 'Renamed COA' },
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { lab_test_files: Array<{ id: number; label: string }> }
    expect(data.lab_test_files[0].label).toBe('Renamed COA')
  })

  it('returns 404 for unknown file id', async () => {
    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/9999`, {
      method: 'PATCH',
      admin: true,
      body: { label: 'x' },
    })
    expect(res.status).toBe(404)
  })

  it('rejects label longer than 200 chars', async () => {
    const add = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
    })
    const { lab_test_files: [file] } = await add.json() as { lab_test_files: Array<{ id: number }> }

    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/${file.id}`, {
      method: 'PATCH',
      admin: true,
      body: { label: 'x'.repeat(201) },
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/admin/product-lines/:id/lab-test-files/reorder', () => {
  it('reorders files by file_ids array', async () => {
    const a = await (await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'A',
    })).json() as { lab_test_files: Array<{ id: number; label: string }> }
    const b = await (await addFile({
      url: `https://images.cnxnature.com/${IMG_KEY}`,
      r2_key: IMG_KEY,
      content_type: 'image/jpeg',
      size_bytes: 200,
      label: 'B',
    })).json() as { lab_test_files: Array<{ id: number; label: string }> }

    const idA = a.lab_test_files.find((f) => f.label === 'A')!.id
    const idB = b.lab_test_files.find((f) => f.label === 'B')!.id

    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/reorder`, {
      method: 'PATCH',
      admin: true,
      body: { file_ids: [idB, idA] },
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { lab_test_files: Array<{ id: number; label: string }> }
    expect(data.lab_test_files.map((f) => f.label)).toEqual(['B', 'A'])
  })

  it('rejects a partial file_ids array', async () => {
    const add = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
    })
    const { lab_test_files: [f] } = await add.json() as { lab_test_files: Array<{ id: number }> }

    // Missing this file id
    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/reorder`, {
      method: 'PATCH',
      admin: true,
      body: { file_ids: [] },
    })
    expect(res.status).toBe(400)

    // File id not belonging to this line
    const res2 = await workerFetch(`/api/admin/product-lines/1/lab-test-files/reorder`, {
      method: 'PATCH',
      admin: true,
      body: { file_ids: [f.id + 9999] },
    })
    expect(res2.status).toBe(400)
  })
})

describe('DELETE /api/admin/product-lines/:id/lab-test-files/:fileId', () => {
  it('removes the file from the list', async () => {
    const add = await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
    })
    const { lab_test_files: [f] } = await add.json() as { lab_test_files: Array<{ id: number }> }

    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/${f.id}`, {
      method: 'DELETE',
      admin: true,
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { lab_test_files: unknown[] }
    expect(data.lab_test_files).toHaveLength(0)
  })

  it('returns 404 for unknown file id', async () => {
    const res = await workerFetch(`/api/admin/product-lines/1/lab-test-files/9999`, {
      method: 'DELETE',
      admin: true,
    })
    expect(res.status).toBe(404)
  })
})

describe('public product response embeds lab_test_files', () => {
  it('returns files in sort_order and exposes only public fields', async () => {
    await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'First',
    })
    await addFile({
      url: `https://images.cnxnature.com/${IMG_KEY}`,
      r2_key: IMG_KEY,
      content_type: 'image/jpeg',
      size_bytes: 200,
      label: 'Second',
    })

    const res = await workerFetch('/api/products/plant-protein-500g')
    expect(res.status).toBe(200)
    const data = await res.json() as {
      product: {
        lab_test_files: Array<{ id: number; url: string; content_type: string; label: string; r2_key?: string; size_bytes?: number }>
      }
    }
    expect(data.product.lab_test_files).toHaveLength(2)
    expect(data.product.lab_test_files[0].label).toBe('First')
    expect(data.product.lab_test_files[0].content_type).toBe('application/pdf')
    expect(data.product.lab_test_files[1].label).toBe('Second')
    // Public shape: no r2_key or size_bytes leaked.
    expect(data.product.lab_test_files[0].r2_key).toBeUndefined()
    expect(data.product.lab_test_files[0].size_bytes).toBeUndefined()
  })

  it('both sibling products share the same product_line files', async () => {
    await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'Shared COA',
    })

    const r500 = await workerFetch('/api/products/plant-protein-500g')
    const r1000 = await workerFetch('/api/products/plant-protein-1000g')
    const d500 = await r500.json() as { product: { lab_test_files: Array<{ label: string }> } }
    const d1000 = await r1000.json() as { product: { lab_test_files: Array<{ label: string }> } }
    expect(d500.product.lab_test_files).toHaveLength(1)
    expect(d1000.product.lab_test_files).toHaveLength(1)
    expect(d500.product.lab_test_files[0].label).toBe('Shared COA')
    expect(d1000.product.lab_test_files[0].label).toBe('Shared COA')
  })

  it('list endpoint also includes lab_test_files', async () => {
    await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'From list',
    })

    const res = await workerFetch('/api/products')
    const data = await res.json() as {
      products: Array<{ slug: string; lab_test_files: Array<{ label: string }> }>
    }
    for (const p of data.products) {
      expect(p.lab_test_files).toHaveLength(1)
      expect(p.lab_test_files[0].label).toBe('From list')
    }
  })
})

describe('admin product-lines list includes lab_test_files', () => {
  it('returns lab_test_files for each product line', async () => {
    await addFile({
      url: `https://images.cnxnature.com/${PDF_KEY}`,
      r2_key: PDF_KEY,
      content_type: 'application/pdf',
      size_bytes: 100,
      label: 'Admin visible',
    })

    const res = await workerFetch('/api/admin/product-lines', { admin: true })
    expect(res.status).toBe(200)
    const data = await res.json() as {
      product_lines: Array<{ id: number; lab_test_files: Array<{ label: string; size_bytes: number }> }>
    }
    const line = data.product_lines.find((p) => p.id === 1)!
    expect(line.lab_test_files).toHaveLength(1)
    expect(line.lab_test_files[0].label).toBe('Admin visible')
    expect(line.lab_test_files[0].size_bytes).toBe(100)
  })
})
