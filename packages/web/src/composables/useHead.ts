import { watchEffect, onUnmounted, type Ref, isRef } from 'vue'

export interface HeadOptions {
  title?: string | Ref<string>
  description?: string | Ref<string>
  ogImage?: string | Ref<string>
  ogType?: string
  canonicalPath?: string | Ref<string>
}

const BASE_TITLE = 'CNX AthletX'
const SITE_URL = 'https://www.cnxnature.com'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`

function unref<T>(val: T | Ref<T>): T {
  return isRef(val) ? val.value : val
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function useHead(options: HeadOptions) {
  const originalTitle = document.title

  watchEffect(() => {
    const title = unref(options.title)
    const description = unref(options.description)
    const ogImage = unref(options.ogImage) || DEFAULT_OG_IMAGE
    const canonicalPath = unref(options.canonicalPath)

    // Title
    document.title = title ? `${title} — ${BASE_TITLE}` : BASE_TITLE

    // Description
    if (description) {
      setMeta('description', description)
      setMeta('og:description', description, 'property')
      setMeta('twitter:description', description)
    }

    // OG tags
    setMeta('og:title', document.title, 'property')
    setMeta('og:type', options.ogType || 'website', 'property')
    setMeta('og:image', ogImage, 'property')
    setMeta('og:site_name', BASE_TITLE, 'property')

    // Twitter card
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', document.title)
    setMeta('twitter:image', ogImage)

    // Canonical + og:url
    if (canonicalPath) {
      const url = `${SITE_URL}${canonicalPath}`
      setLink('canonical', url)
      setMeta('og:url', url, 'property')
    }
  })

  onUnmounted(() => {
    document.title = originalTitle
  })
}
