import type { RouterType } from 'itty-router'
import type { Env } from '../../lib/types'
import { nowIso } from '../../lib/utils'
import { requireAdmin } from '../../middleware/auth'

const PREFIXES = ['products/', 'lab-tests/'] as const
const DEFAULT_MIN_AGE_SECONDS = 60 * 60 // 1 hour
const MAX_SCAN_OBJECTS = 5000

interface OrphanInfo {
  key: string
  uploaded: string
  size: number
}

function extractR2Key(value: string): string | null {
  const m = value.match(/(products|lab-tests)\/[^/?#\s]+/i)
  return m ? m[0] : null
}

async function loadReferencedKeys(env: Env): Promise<Set<string>> {
  const referenced = new Set<string>()

  const lab = await env.DB.prepare(`SELECT r2_key FROM product_line_lab_tests`).all<{ r2_key: string }>()
  for (const r of lab.results) {
    if (r.r2_key) referenced.add(r.r2_key)
  }

  const images = await env.DB.prepare(`SELECT url FROM product_images`).all<{ url: string }>()
  for (const r of images.results) {
    const key = extractR2Key(r.url)
    if (key) referenced.add(key)
  }

  const products = await env.DB.prepare(`SELECT image_url FROM products`).all<{ image_url: string }>()
  for (const r of products.results) {
    const key = extractR2Key(r.image_url)
    if (key) referenced.add(key)
  }

  return referenced
}

async function listAllUnderPrefixes(env: Env, prefixes: readonly string[]) {
  const all: { key: string; uploaded: Date; size: number }[] = []
  let truncated = false
  for (const prefix of prefixes) {
    let cursor: string | undefined
    while (true) {
      if (all.length >= MAX_SCAN_OBJECTS) {
        truncated = true
        break
      }
      const result: R2Objects = await env.PRODUCT_IMAGES.list({ prefix, cursor, limit: 1000 })
      for (const obj of result.objects) {
        all.push({ key: obj.key, uploaded: obj.uploaded, size: obj.size })
      }
      if (!result.truncated) break
      cursor = result.truncated ? result.cursor : undefined
      if (!cursor) break
    }
    if (truncated) break
  }
  return { objects: all, truncated }
}

export function registerAdminCleanupRoutes(router: RouterType) {
  router.post('/api/admin/cleanup/r2-orphans', requireAdmin(async (request, env, adminUser) => {
    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dry_run') === '1'
    const minAgeRaw = url.searchParams.get('min_age_seconds')
    const minAgeSeconds = minAgeRaw === null ? DEFAULT_MIN_AGE_SECONDS : Math.max(0, parseInt(minAgeRaw, 10) || 0)
    const cutoff = Date.now() - minAgeSeconds * 1000

    let referenced: Set<string>
    try {
      referenced = await loadReferencedKeys(env)
    } catch {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    let listing: { objects: { key: string; uploaded: Date; size: number }[]; truncated: boolean }
    try {
      listing = await listAllUnderPrefixes(env, PREFIXES)
    } catch {
      return Response.json({ error: 'R2 list failed' }, { status: 500 })
    }

    const orphans: OrphanInfo[] = []
    for (const obj of listing.objects) {
      if (referenced.has(obj.key)) continue
      if (obj.uploaded.getTime() > cutoff) continue
      orphans.push({ key: obj.key, uploaded: obj.uploaded.toISOString(), size: obj.size })
    }

    const summary = {
      scanned: listing.objects.length,
      referenced_count: referenced.size,
      orphan_count: orphans.length,
      min_age_seconds: minAgeSeconds,
      truncated: listing.truncated,
    }

    if (dryRun) {
      return Response.json({ ...summary, dry_run: true, orphans })
    }

    const deleted: string[] = []
    const errors: { key: string; error: string }[] = []
    for (const orphan of orphans) {
      try {
        await env.PRODUCT_IMAGES.delete(orphan.key)
        deleted.push(orphan.key)
      } catch (err) {
        errors.push({ key: orphan.key, error: err instanceof Error ? err.message : 'delete failed' })
      }
    }

    try {
      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'r2_orphan_cleanup', NULL, ?, ?)`
      )
        .bind(
          adminUser.email,
          JSON.stringify({
            scanned: summary.scanned,
            referenced_count: summary.referenced_count,
            orphan_count: summary.orphan_count,
            deleted_count: deleted.length,
            error_count: errors.length,
            min_age_seconds: minAgeSeconds,
          }),
          nowIso()
        )
        .run()
    } catch {
      // Audit failure must not break the response
    }

    return Response.json({ ...summary, dry_run: false, deleted, errors })
  }))
}
