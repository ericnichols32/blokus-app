import { beforeEach, describe, expect, it, vi } from 'vitest'
import { watchForNewVersion } from '../appUpdate'

/** A stand-in for the service worker registration and its events. */
function installServiceWorker({ controlled }: { controlled: boolean }) {
  const listeners: Record<string, (() => void)[]> = {}
  const update = vi.fn(() => Promise.resolve())
  const reload = vi.fn()

  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: controlled ? {} : null,
      ready: Promise.resolve({ update }),
      addEventListener: (type: string, fn: () => void) => {
        ;(listeners[type] ??= []).push(fn)
      },
    },
  })
  vi.stubGlobal('window', { location: { reload }, setInterval: vi.fn() })
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: () => void) => {
      ;(listeners[type] ??= []).push(fn)
    },
  })

  return {
    update,
    reload,
    fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('taking a new version', () => {
  it('reloads when a new worker takes over', async () => {
    const sw = installServiceWorker({ controlled: true })
    watchForNewVersion()
    await Promise.resolve()

    sw.fire('controllerchange')
    expect(sw.reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload on a first ever visit', async () => {
    // The first install fires controllerchange too. Reloading there would
    // reload every new visitor once, for a version they already have.
    const sw = installServiceWorker({ controlled: false })
    watchForNewVersion()
    await Promise.resolve()

    sw.fire('controllerchange')
    expect(sw.reload).not.toHaveBeenCalled()
  })

  it('reloads once however many times the event fires', async () => {
    const sw = installServiceWorker({ controlled: true })
    watchForNewVersion()
    await Promise.resolve()

    sw.fire('controllerchange')
    sw.fire('controllerchange')
    sw.fire('controllerchange')
    expect(sw.reload).toHaveBeenCalledTimes(1)
  })
})

describe('looking for a new version', () => {
  it('asks on start, since the browser only checks by itself on a page load', async () => {
    const sw = installServiceWorker({ controlled: true })
    watchForNewVersion()
    await Promise.resolve()
    await Promise.resolve()

    expect(sw.update).toHaveBeenCalled()
  })

  it('asks again when the app is returned to', async () => {
    const sw = installServiceWorker({ controlled: true })
    watchForNewVersion()
    await Promise.resolve()
    await Promise.resolve()

    const before = sw.update.mock.calls.length
    sw.fire('visibilitychange')
    expect(sw.update.mock.calls.length).toBe(before + 1)
  })

  it('survives a check that fails, rather than leaving the app broken', async () => {
    const sw = installServiceWorker({ controlled: true })
    sw.update.mockRejectedValue(new Error('offline'))

    expect(() => watchForNewVersion()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
  })
})

describe('where there is no service worker at all', () => {
  it('does nothing rather than throwing', () => {
    // A plain browser tab with workers unavailable. The game still works; it
    // just won't update itself.
    vi.stubGlobal('navigator', {})
    expect(() => watchForNewVersion()).not.toThrow()
  })
})
