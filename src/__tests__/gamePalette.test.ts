import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gamePaletteFor, rememberGamePalette } from '../gamePalette'

// The tests run in node, which has no localStorage. A plain map is enough.
function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

describe('the colours a game is pinned to', () => {
  beforeEach(() => {
    installStorage()
  })

  it('remembers what a game was first seen in', () => {
    rememberGamePalette('g1', { paletteId: 'dusk', colorOverrides: { blue: '#abcdef' } })
    expect(gamePaletteFor('g1')).toEqual({
      paletteId: 'dusk',
      colorOverrides: { blue: '#abcdef' },
    })
  })

  it('refuses to repaint a game it has already seen', () => {
    // The whole point: picking colours for the game you are about to start must
    // not reach back into one you are in the middle of.
    rememberGamePalette('g1', { paletteId: 'classic', colorOverrides: {} })
    rememberGamePalette('g1', { paletteId: 'dusk', colorOverrides: {} })
    expect(gamePaletteFor('g1')?.paletteId).toBe('classic')
  })

  it('keeps games apart', () => {
    rememberGamePalette('g1', { paletteId: 'classic', colorOverrides: {} })
    rememberGamePalette('g2', { paletteId: 'dusk', colorOverrides: {} })
    expect(gamePaletteFor('g1')?.paletteId).toBe('classic')
    expect(gamePaletteFor('g2')?.paletteId).toBe('dusk')
  })

  it('says nothing about a game it has never seen', () => {
    // Which is what makes an old game fall back to the current colours rather
    // than to some arbitrary default.
    expect(gamePaletteFor('never-heard-of-it')).toBeNull()
  })

  it('forgets the oldest rather than growing without limit', () => {
    for (let i = 0; i < 80; i++) {
      rememberGamePalette(`g${i}`, { paletteId: `set-${i}`, colorOverrides: {} })
    }
    // The newest is kept and the earliest has gone; the cap is what stops a
    // store of finished games growing forever.
    expect(gamePaletteFor('g79')?.paletteId).toBe('set-79')
    expect(gamePaletteFor('g0')).toBeNull()
  })

  it('survives a stored value that isn\'t what it expects', () => {
    localStorage.setItem('blokus:game-palette:v1', 'not json at all')
    expect(gamePaletteFor('g1')).toBeNull()
  })
})
