import { ref, type Ref } from 'vue'

export interface UseAdminResourceOptions<T> {
  initial: T
  load: () => Promise<T>
  fallbackError?: string
}

export interface UseAdminResource<T> {
  data: Ref<T>
  loading: Ref<boolean>
  error: Ref<string | null>
  reload: () => Promise<void>
  runAction: (action: () => Promise<unknown>) => Promise<void>
}

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useAdminResource<T>(options: UseAdminResourceOptions<T>): UseAdminResource<T> {
  const data = ref(options.initial) as Ref<T>
  const loading = ref(false)
  const error = ref<string | null>(null)
  const fallbackError = options.fallbackError ?? 'Request failed'

  async function reload(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      data.value = await options.load()
    } catch (err) {
      error.value = messageFromError(err, fallbackError)
    } finally {
      loading.value = false
    }
  }

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    loading.value = true
    error.value = null
    try {
      await action()
      await reload()
    } catch (err) {
      error.value = messageFromError(err, fallbackError)
      loading.value = false
    }
  }

  return {
    data,
    loading,
    error,
    reload,
    runAction,
  }
}
