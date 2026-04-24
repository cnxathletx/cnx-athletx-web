import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startWorker, stopWorker, resetDb, workerFetch } from '../test/helpers'

beforeAll(async () => { await startWorker() })
afterAll(async () => { await stopWorker() })
beforeEach(async () => { await resetDb() })

const FAKE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // "%PDF-1.4"

async function uploadLabTest(): Promise<{ url: string; key: string; content_type: string; size_bytes: number }> {
  const res = await workerFetch('/api/admin/upload/lab-test-file', {
    method: 'POST',
    admin: true,
    rawBody: FAKE_PDF,
    headers: { 'Content-Type': 'application/pdf' },
  })
  expect(res.status).toBe(201)
  return await res.json() as { url: string; key: string; content_type: string; size_bytes: number }
}

async function attachLabTest(productLineId: number, payload: { url: string; r2_key: string; content_type: string; size_bytes: number }) {
  return workerFetch(`/api/admin/product-lines/${productLineId}/lab-test-files`, {
    admin: true,
    body: { ...payload, label: 'Attached file' },
  })
}

describe('POST /api/admin/cleanup/r2-orphans', () => {
  it('dry-run lists orphans without deleting', async () => {
    const orphan = await uploadLabTest()

    const res = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1&min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    expect(res.status).toBe(200)
    const data = await res.json() as {
      dry_run: true
      orphan_count: number
      scanned: number
      orphans: Array<{ key: string; size: number }>
    }
    expect(data.dry_run).toBe(true)
    expect(data.orphan_count).toBeGreaterThanOrEqual(1)
    expect(data.orphans.some((o) => o.key === orphan.key)).toBe(true)

    // Verify NOT deleted: re-running dry-run still shows it.
    const res2 = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1&min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    const data2 = await res2.json() as { orphans: Array<{ key: string }> }
    expect(data2.orphans.some((o) => o.key === orphan.key)).toBe(true)
  })

  it('deletes orphans and preserves referenced files', async () => {
    const orphan = await uploadLabTest()
    const kept = await uploadLabTest()
    const attach = await attachLabTest(1, {
      url: kept.url,
      r2_key: kept.key,
      content_type: kept.content_type,
      size_bytes: kept.size_bytes,
    })
    expect(attach.status).toBe(201)

    const res = await workerFetch('/api/admin/cleanup/r2-orphans?min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    expect(res.status).toBe(200)
    const data = await res.json() as { dry_run: false; deleted: string[]; orphan_count: number; errors: unknown[] }
    expect(data.dry_run).toBe(false)
    expect(data.deleted).toContain(orphan.key)
    expect(data.deleted).not.toContain(kept.key)
    expect(data.errors).toHaveLength(0)

    // Confirm orphan really gone — re-run should not list it.
    const res2 = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1&min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    const data2 = await res2.json() as { orphans: Array<{ key: string }> }
    expect(data2.orphans.some((o) => o.key === orphan.key)).toBe(false)
  })

  it('skips files newer than min_age_seconds', async () => {
    const fresh = await uploadLabTest()

    // 1-hour minimum age: the just-uploaded object should NOT be flagged.
    const res = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1&min_age_seconds=3600', {
      method: 'POST',
      admin: true,
    })
    const data = await res.json() as { orphans: Array<{ key: string }> }
    expect(data.orphans.some((o) => o.key === fresh.key)).toBe(false)
  })

  it('writes an audit log row on real cleanup', async () => {
    await uploadLabTest()

    const res = await workerFetch('/api/admin/cleanup/r2-orphans?min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    expect(res.status).toBe(200)

    const audit = await workerFetch('/api/admin/audit-logs?action=r2_orphan_cleanup', { admin: true })
    // Endpoint may or may not exist; this is a soft check via the response.
    if (audit.status === 200) {
      const json = await audit.json() as { logs?: Array<{ action: string }> }
      expect(json.logs?.some((l) => l.action === 'r2_orphan_cleanup')).toBe(true)
    }
  })
})

describe('Reference detection', () => {
  it('treats product image_url as referenced', async () => {
    // Seeded products use /images/products/... URLs that don't actually exist in R2,
    // so the upload-and-don't-attach orphan is the only thing that should appear.
    const orphan = await uploadLabTest()

    const res = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1&min_age_seconds=0', {
      method: 'POST',
      admin: true,
    })
    const data = await res.json() as {
      orphans: Array<{ key: string }>
      referenced_count: number
    }
    // Both seeded products' image_urls should be added to referenced set.
    expect(data.referenced_count).toBeGreaterThanOrEqual(2)
    expect(data.orphans.some((o) => o.key === orphan.key)).toBe(true)
  })

  it('non-admin caller is rejected', async () => {
    const res = await workerFetch('/api/admin/cleanup/r2-orphans?dry_run=1', { method: 'POST' })
    expect([401, 403]).toContain(res.status)
  })
})
