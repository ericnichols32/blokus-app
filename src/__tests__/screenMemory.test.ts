import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  rememberOpenGame,
  rememberScreen,
  restoredOpenGame,
  restoredScreen,
} from '../screenMemory'

function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

let storage: Map<string, string>

beforeEach(() => {
  storage = installStorage()
})

describe('remembering the screen', () => {
  it('comes back the same', () => {
    rememberScreen('stats')
    expect(restoredScreen()).toBe('stats')
  })

  it('restores an online game and its list', () => {
    // Both matter now that the app reloads itself: a reload during an online
    // game used to land on the main menu, because nothing about it is saved
    // locally the way a solo game is.
    rememberScreen('online')
    expect(restoredScreen()).toBe('online')

    rememberScreen('online-game')
    expect(restoredScreen()).toBe('online-game')
  })

  it('refuses to restore a half-filled form', () => {
    // Their contents don't survive a reload, so returning to one would show an
    // empty copy of something already filled in.
    rememberScreen('account')
    expect(restoredScreen()).toBeNull()

    rememberScreen('online-setup')
    expect(restoredScreen()).toBeNull()
  })

  it('ignores junk in storage rather than trusting it as a screen', () => {
    storage.set('blokus:screen', 'not-a-screen')
    expect(restoredScreen()).toBeNull()
  })

  it('has nothing to restore on a fresh start', () => {
    expect(restoredScreen()).toBeNull()
    expect(restoredOpenGame()).toBeNull()
  })
})

describe('remembering which online game was open', () => {
  it('comes back, so a reload reopens the same board', () => {
    rememberOpenGame('game-123')
    expect(restoredOpenGame()).toBe('game-123')
  })

  it('is cleared on the way out', () => {
    rememberOpenGame('game-123')
    rememberOpenGame(null)
    expect(restoredOpenGame()).toBeNull()
  })
})

describe('when storage is unavailable', () => {
  it('carries on rather than taking the app down', () => {
    // Private browsing, or storage blocked. Losing the screen is a far smaller
    // problem than failing to start.
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    })

    expect(() => rememberScreen('game')).not.toThrow()
    expect(() => rememberOpenGame('x')).not.toThrow()
    expect(restoredScreen()).toBeNull()
    expect(restoredOpenGame()).toBeNull()
  })
})
