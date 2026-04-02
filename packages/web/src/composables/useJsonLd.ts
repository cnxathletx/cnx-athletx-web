import { watchEffect, onUnmounted } from 'vue'

const SCRIPT_ID = 'json-ld'

export function useJsonLd(getData: () => Record<string, unknown> | null) {
  watchEffect(() => {
    const data = getData()
    let el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

    if (!data) {
      el?.remove()
      return
    }

    if (!el) {
      el = document.createElement('script')
      el.id = SCRIPT_ID
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(data)
  })

  onUnmounted(() => {
    document.getElementById(SCRIPT_ID)?.remove()
  })
}
