import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DIFFICULTY_STRENGTH as S, STRONGEST } from '../game'
import { clampTurnSeconds, DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings'
import { MAX_TURN_SECONDS, MIN_TURN_SECONDS } from '../turnClock'
import { DEFAULT_PALETTE_ID } from '../palette'

// The tests run in node, which has no localStorage. A plain map is enough.
beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

describe('loadSettings', () => {
  it('carries over a difficulty saved before the scale was a slider', () => {
    // What a build before the slider wrote. The player chose medium, so they
    // should come back on medium rather than being quietly moved to hardest.
    localStorage.setItem(
      'blokus:settings',
      JSON.stringify({ showLiveScores: true, difficulty: 'medium', turnSeconds: 20 }),
    )

    const loaded = loadSettings()
    expect(loaded.strength).toBe(S.medium)
    expect(loaded.showLiveScores).toBe(true)
    expect(loaded.turnSeconds).toBe(20)
  })

  it('prefers a strength over a difficulty when both are present', () => {
    localStorage.setItem('blokus:settings', JSON.stringify({ strength: 0.3, difficulty: 'easy' }))
    expect(loadSettings().strength).toBe(0.3)
  })

  it('defaults to the hardest setting when nothing is saved', () => {
    expect(loadSettings().strength).toBe(STRONGEST)
  })

  it('round-trips a strength from the middle of the slider', () => {
    saveSettings({ ...DEFAULT_SETTINGS, strength: 0.65 })
    expect(loadSettings().strength).toBe(0.65)
  })
})

describe('clampTurnSeconds', () => {
  it('keeps a sensible value as it is', () => {
    expect(clampTurnSeconds(30)).toBe(30)
  })

  it('pulls anything outside the range back to the nearest end', () => {
    expect(clampTurnSeconds(1)).toBe(MIN_TURN_SECONDS)
    expect(clampTurnSeconds(9999)).toBe(MAX_TURN_SECONDS)
  })

  it('rounds to whole seconds, since the countdown is shown in them', () => {
    expect(clampTurnSeconds(20.4)).toBe(20)
    expect(clampTurnSeconds(20.6)).toBe(21)
  })

  it('falls back to the default for what a number field hands back mid-edit', () => {
    // An emptied field reads as '', which Number() turns into 0 — that would
    // otherwise clamp to the minimum and silently change the setting.
    for (const junk of ['', '  ', 'abc', null, undefined, NaN]) {
      expect(clampTurnSeconds(junk)).toBe(DEFAULT_SETTINGS.turnSeconds)
    }
  })
})

describe('the colour settings', () => {
  it('start on the classic palette with nothing painted over it', () => {
    expect(DEFAULT_SETTINGS.paletteId).toBe(DEFAULT_PALETTE_ID)
    expect(DEFAULT_SETTINGS.colorOverrides).toEqual({})
  })

  it('keep a saved palette and hand-painted seats', () => {
    localStorage.setItem(
      'blokus:settings',
      JSON.stringify({ paletteId: 'neon', colorOverrides: { blue: '#7C3AED' } }),
    )

    const loaded = loadSettings()
    expect(loaded.paletteId).toBe('neon')
    // Normalised on the way in, so the rest of the app never sees two spellings
    // of the same colour.
    expect(loaded.colorOverrides).toEqual({ blue: '#7c3aed' })
  })

  it('fall back to the default for a palette that no longer exists', () => {
    // A palette could be renamed or dropped between versions, and an unpainted
    // board is worse than the classic one.
    localStorage.setItem('blokus:settings', JSON.stringify({ paletteId: 'retired-palette' }))
    expect(loadSettings().paletteId).toBe(DEFAULT_PALETTE_ID)
  })

  it('drop overrides that are not seats or not colours', () => {
    localStorage.setItem(
      'blokus:settings',
      JSON.stringify({ colorOverrides: { blue: 'banana', purple: '#ffffff', red: '#abc' } }),
    )
    expect(loadSettings().colorOverrides).toEqual({ red: '#aabbcc' })
  })

  it('survive overrides stored as something that is not an object', () => {
    localStorage.setItem('blokus:settings', JSON.stringify({ colorOverrides: ['#fff'] }))
    expect(loadSettings().colorOverrides).toEqual({})
  })
})
