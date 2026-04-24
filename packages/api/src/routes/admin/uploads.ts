import type { RouterType } from 'itty-router'
import type { Env } from '../../lib/types'
import { generateULID } from '../../lib/ulid'
import { nowIso } from '../../lib/utils'
import { requireAdmin } from '../../middleware/auth'

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const LAB_TEST_ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const MAX_BYTES = 2_000_000

export function registerAdminUploadRoutes(router: RouterType) {
  router.post('/api/admin/upload/product-image', requireAdmin(async (request, env, adminUser) => {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const ext = ALLOWED_TYPES[contentType]
    if (!ext) {
      return Response.json(
        { error: 'Unsupported content-type. Use image/jpeg, image/png, or image/webp' },
        { status: 415 }
      )
    }

    const buffer = await request.arrayBuffer()
    if (buffer.byteLength === 0) {
      return Response.json({ error: 'Empty body' }, { status: 400 })
    }
    if (buffer.byteLength > MAX_BYTES) {
      return Response.json({ error: `Image exceeds ${MAX_BYTES} bytes` }, { status: 413 })
    }

    const key = `products/${generateULID().toLowerCase()}.${ext}`

    try {
      await env.PRODUCT_IMAGES.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return Response.json({ error: 'Upload failed' }, { status: 500 })
    }

    const base = env.PUBLIC_IMAGES_BASE_URL?.replace(/\/$/, '') || ''
    const url = base ? `${base}/${key}` : `/images/${key}`

    try {
      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'product_image_upload', NULL, ?, ?)`
      )
        .bind(
          adminUser.email,
          JSON.stringify({ key, size: buffer.byteLength, content_type: contentType }),
          nowIso()
        )
        .run()
    } catch {
      // Audit failure must not break upload
    }

    return Response.json({ url, key }, { status: 201 })
  }))

  router.post('/api/admin/upload/lab-test-file', requireAdmin(async (request, env, adminUser) => {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const ext = LAB_TEST_ALLOWED_TYPES[contentType]
    if (!ext) {
      return Response.json(
        { error: 'Unsupported content-type. Use application/pdf, image/jpeg, image/png, or image/webp' },
        { status: 415 }
      )
    }

    const buffer = await request.arrayBuffer()
    if (buffer.byteLength === 0) {
      return Response.json({ error: 'Empty body' }, { status: 400 })
    }
    if (buffer.byteLength > MAX_BYTES) {
      return Response.json({ error: `File exceeds ${MAX_BYTES} bytes` }, { status: 413 })
    }

    const key = `lab-tests/${generateULID().toLowerCase()}.${ext}`

    try {
      await env.PRODUCT_IMAGES.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      return Response.json({ error: 'Upload failed' }, { status: 500 })
    }

    const base = env.PUBLIC_IMAGES_BASE_URL?.replace(/\/$/, '') || ''
    const url = base ? `${base}/${key}` : `/images/${key}`

    try {
      await env.DB.prepare(
        `INSERT INTO admin_audit_log (admin_email, action, order_id, details_json, created_at)
         VALUES (?, 'lab_test_file_upload', NULL, ?, ?)`
      )
        .bind(
          adminUser.email,
          JSON.stringify({ key, size: buffer.byteLength, content_type: contentType }),
          nowIso()
        )
        .run()
    } catch {
      // Audit failure must not break upload
    }

    return Response.json(
      { url, key, content_type: contentType, size_bytes: buffer.byteLength },
      { status: 201 }
    )
  }))
}

export function registerPublicImageRoutes(router: RouterType) {
  router.get('/images/:rest+', async (request: Request, env: Env) => {
    const url = new URL(request.url)
    const key = decodeURIComponent(url.pathname.replace(/^\/images\//, ''))
    if (!key || key.includes('..')) {
      return new Response('Not Found', { status: 404 })
    }

    const ifNoneMatch = request.headers.get('if-none-match') || undefined
    const obj = await env.PRODUCT_IMAGES.get(key, {
      onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
    })
    if (!obj) {
      return new Response('Not Found', { status: 404 })
    }

    // R2 returns a bare object (no body) when the etag matches — signal 304
    if ('body' in obj === false || !(obj as R2ObjectBody).body) {
      return new Response(null, {
        status: 304,
        headers: { etag: (obj as R2Object).httpEtag },
      })
    }

    const headers = new Headers()
    ;(obj as R2ObjectBody).writeHttpMetadata(headers)
    headers.set('etag', (obj as R2ObjectBody).httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    return new Response((obj as R2ObjectBody).body, { headers })
  })
}
