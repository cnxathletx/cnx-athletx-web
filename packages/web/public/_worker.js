// Cloudflare Pages Advanced Mode worker
// Injects JSON-LD structured data into HTML for SEO crawlers

const API_BASE = 'https://api.cnxnature.com'
const SITE_URL = 'https://www.cnxnature.com'

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.cnxnature.com https://promptpay.io; connect-src 'self' https://api.cnxnature.com https://images.cnxnature.com https://cloudflareinsights.com; frame-src 'self' https://images.cnxnature.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v)
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function jsonLdSafe(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function safeImageUrl(url) {
  if (!url) return null
  const abs = url.startsWith('/') ? `${SITE_URL}${url}` : url
  return /^https?:\/\//i.test(abs) ? abs : null
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CNX AthletX',
    url: SITE_URL,
    logo: `${SITE_URL}/og-image.png`,
    description: 'Plant-based protein powder from Chiang Mai, Thailand.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Chiang Mai',
      addressCountry: 'TH',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'contact@cnxnature.com',
      contactType: 'customer service',
    },
  }
}

function buildProductJsonLd(product) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: safeImageUrl(product.image_url) ? [safeImageUrl(product.image_url)] : undefined,
    sku: product.slug,
    url: `${SITE_URL}/product/${product.slug}`,
    brand: { '@type': 'Brand', name: 'CNX AthletX' },
    offers: {
      '@type': 'Offer',
      price: (product.price_thb / 100).toFixed(2),
      priceCurrency: 'THB',
      availability: product.available_stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/product/${product.slug}`,
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'TH',
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
          transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 5, unitCode: 'DAY' },
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'TH',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      },
    },
  }
}

function buildMetaTags(title, description, ogImage, canonicalUrl) {
  const fullTitle = title ? `${title} — CNX AthletX` : 'CNX AthletX'
  const img = ogImage || `${SITE_URL}/og-image.png`
  const eTitle = htmlEscape(fullTitle)
  const eDesc = htmlEscape(description)
  const eImg = htmlEscape(img)
  const eCanonical = htmlEscape(canonicalUrl)
  return `
    <title>${eTitle}</title>
    <meta name="description" content="${eDesc}" />
    <meta property="og:title" content="${eTitle}" />
    <meta property="og:description" content="${eDesc}" />
    <meta property="og:image" content="${eImg}" />
    <meta property="og:url" content="${eCanonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="CNX AthletX" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${eTitle}" />
    <meta name="twitter:description" content="${eDesc}" />
    <meta name="twitter:image" content="${eImg}" />
    <link rel="canonical" href="${eCanonical}" />`
}

function stripStaticMeta(html) {
  return html
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta\s+property="og:(?:type|title|image|image:width|image:height|description|url|site_name)"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="(?:description|twitter:card|twitter:title|twitter:description|twitter:image)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
}

function injectIntoHead(html, metaTags, jsonLd, preloadImage) {
  html = stripStaticMeta(html)

  const preload = preloadImage
    ? `<link rel="preload" as="image" fetchpriority="high" href="${htmlEscape(preloadImage)}" />`
    : ''

  const injection = `${metaTags}
    ${preload}
    <script type="application/ld+json">${jsonLdSafe(jsonLd)}</script>`

  return html.replace('</head>', `${injection}\n</head>`)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    // Let non-HTML requests pass through (assets, API, etc.)
    const assetExtensions = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|map|json|txt|xml)$/
    if (assetExtensions.test(path)) {
      return withSecurityHeaders(await env.ASSETS.fetch(request))
    }

    // Product detail pages: /product/:slug
    const productMatch = path.match(/^\/product\/([a-z0-9-]+)$/)
    if (productMatch) {
      try {
        const slug = productMatch[1]
        const apiRes = await fetch(`${API_BASE}/api/products/${slug}`)

        if (apiRes.ok) {
          const { product } = await apiRes.json()
          const assetRes = await env.ASSETS.fetch(request)
          let html = await assetRes.text()

          const ogImage = safeImageUrl(product.image_url)
          const metaTags = buildMetaTags(
            product.name,
            `${product.name} — Plant-based protein powder. ฿${(product.price_thb / 100).toFixed(0)}. Ships across Thailand.`,
            ogImage,
            `${SITE_URL}/product/${slug}`
          )
          html = injectIntoHead(html, metaTags, buildProductJsonLd(product), ogImage)

          return withSecurityHeaders(new Response(html, {
            headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
          }))
        }
      } catch {
        // Fall through to default SPA response
      }
    }

    // Homepage: inject Organization schema
    if (path === '/' || path === '') {
      try {
        const assetRes = await env.ASSETS.fetch(request)
        let html = await assetRes.text()

        const metaTags = buildMetaTags(
          null,
          'Plant-based protein powder from Chiang Mai, Thailand. Clean athletic everyday health.',
          null,
          SITE_URL
        )
        html = injectIntoHead(html, metaTags, buildOrganizationJsonLd())

        return withSecurityHeaders(new Response(html, {
          headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
        }))
      } catch {
        // Fall through
      }
    }

    // Shop page
    if (path === '/shop') {
      try {
        const assetRes = await env.ASSETS.fetch(request)
        let html = await assetRes.text()

        const metaTags = buildMetaTags(
          'Shop',
          'Browse our plant-based protein powders. Available in 500g and 1kg sizes. Ships across Thailand.',
          null,
          `${SITE_URL}/shop`
        )
        // No JSON-LD for shop page, just meta tags
        html = stripStaticMeta(html)
        html = html.replace('</head>', `${metaTags}\n</head>`)

        return withSecurityHeaders(new Response(html, {
          headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
        }))
      } catch {
        // Fall through
      }
    }

    // All other routes: serve the SPA
    return withSecurityHeaders(await env.ASSETS.fetch(request))
  },
}
