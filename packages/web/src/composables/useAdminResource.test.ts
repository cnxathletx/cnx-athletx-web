import { describe, expect, it, vi } from 'vitest'
import { useAdminResource } from './useAdminResource'

describe('useAdminResource', () => {
  it('loads data and tracks loading state', async () => {
    const load = vi.fn().mockResolvedValue(['a', 'b'])
    const resource = useAdminResource<string[]>({ initial: [], load })

    const pending = resource.reload()
    expect(resource.loading.value).toBe(true)
    await pending

    expect(load).toHaveBeenCalledOnce()
    expect(resource.data.value).toEqual(['a', 'b'])
    expect(resource.loading.value).toBe(false)
    expect(resource.error.value).toBeNull()
  })

  it('captures load errors with a fallback message', async () => {
    const resource = useAdminResource<string[]>({
      initial: [],
      load: vi.fn().mockRejectedValue(new Error('No access')),
      fallbackError: 'Unable to load resource',
    })

    await resource.reload()

    expect(resource.data.value).toEqual([])
    expect(resource.error.value).toBe('No access')
    expect(resource.loading.value).toBe(false)
  })

  it('runs an action and reloads after success', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(['before'])
      .mockResolvedValueOnce(['after'])
    const action = vi.fn().mockResolvedValue(undefined)
    const resource = useAdminResource<string[]>({ initial: [], load })

    await resource.reload()
    await resource.runAction(action)

    expect(action).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledTimes(2)
    expect(resource.data.value).toEqual(['after'])
  })

  it('captures action errors without reloading', async () => {
    const load = vi.fn().mockResolvedValue(['before'])
    const action = vi.fn().mockRejectedValue(new Error('Action failed'))
    const resource = useAdminResource<string[]>({ initial: [], load })

    await resource.reload()
    await resource.runAction(action)

    expect(load).toHaveBeenCalledOnce()
    expect(resource.error.value).toBe('Action failed')
    expect(resource.loading.value).toBe(false)
  })
})
