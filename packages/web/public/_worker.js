// Cloudflare Pages Advanced Mode worker
// Injects JSON-LD structured data into HTML for SEO crawlers

const API_BASE = 'https://api.cnxnature.com'
const SITE_URL = 'https://www.cnxnature.com'

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
    image: product.image_url
      ? [product.image_url.startsWith('/') ? `${SITE_URL}${product.image_url}` : product.image_url]
      : undefined,
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
  return `
    <title>${fullTitle}</title>
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${fullTitle}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="CNX AthletX" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${fullTitle}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${img}" />
    <link rel="canonical" href="${canonicalUrl}" />`
}

function injectIntoHead(html, metaTags, jsonLd, preloadImage) {
  // Replace the existing <title> tag
  html = html.replace(/<title>[^<]*<\/title>/, '')

  const preload = preloadImage
    ? `<link rel="preload" as="image" fetchpriority="high" href="${preloadImage}" />`
    : ''

  const injection = `${metaTags}
    ${preload}
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`

  return html.replace('</head>', `${injection}\n</head>`)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    // Let non-HTML requests pass through (assets, API, etc.)
    const assetExtensions = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|map|json|txt|xml)$/
    if (assetExtensions.test(path)) {
      return env.ASSETS.fetch(request)
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

          const ogImage = product.image_url
            ? (product.image_url.startsWith('/') ? `${SITE_URL}${product.image_url}` : product.image_url)
            : null
          const metaTags = buildMetaTags(
            product.name,
            `${product.name} — Plant-based protein powder. ฿${(product.price_thb / 100).toFixed(0)}. Ships across Thailand.`,
            ogImage,
            `${SITE_URL}/product/${slug}`
          )
          html = injectIntoHead(html, metaTags, buildProductJsonLd(product), ogImage)

          return new Response(html, {
            headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
          })
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

        return new Response(html, {
          headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
        })
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
        html = html.replace(/<title>[^<]*<\/title>/, '')
        html = html.replace('</head>', `${metaTags}\n</head>`)

        return new Response(html, {
          headers: { ...Object.fromEntries(assetRes.headers), 'content-type': 'text/html;charset=UTF-8' },
        })
      } catch {
        // Fall through
      }
    }

    // All other routes: serve the SPA
    return env.ASSETS.fetch(request)
  },
}
