import { describe, expect, it } from 'vitest'
import { COLORS } from '../game'
import {
  colorName,
  DEFAULT_PALETTE_ID,
  hasOverrides,
  normalizeHex,
  PALETTES,
  paletteById,
  resolvePalette,
} from '../palette'

describe('the palettes themselves', () => {
  it('all paint every seat', () => {
    for (const palette of PALETTES) {
      for (const color of COLORS) {
        expect(palette.colors[color].hex).toMatch(/^#[0-9a-f]{6}$/)
        expect(palette.colors[color].name.length).toBeGreaterThan(0)
      }
    }
  })

  it('never repeats a colour within a set', () => {
    // Two seats the same colour is unplayable, not merely ugly.
    for (const palette of PALETTES) {
      const hexes = COLORS.map((c) => palette.colors[c].hex)
      expect(new Set(hexes).size).toBe(COLORS.length)
    }
  })

  it('never repeats a name within a set either', () => {
    // The names are how a turn is announced, so two seats called the same thing
    // would make "Teal's turn" ambiguous.
    for (const palette of PALETTES) {
      const names = COLORS.map((c) => palette.colors[c].name)
      expect(new Set(names).size).toBe(COLORS.length)
    }
  })

  it('has unique ids, since that is what gets stored', () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length)
  })

  it('offers the six alternatives that were asked for, plus the original', () => {
    expect(PALETTES).toHaveLength(7)
    expect(PALETTES[0].id).toBe(DEFAULT_PALETTE_ID)
  })
})

describe('paletteById', () => {
  it('falls back to the default rather than leaving the board unpainted', () => {
    expect(paletteById('no-such-palette').id).toBe(DEFAULT_PALETTE_ID)
    expect(paletteById(undefined).id).toBe(DEFAULT_PALETTE_ID)
  })
})

describe('resolvePalette', () => {
  it('gives the palette when nothing is painted over it', () => {
    expect(resolvePalette('neon')).toEqual(paletteById('neon').colors)
  })

  it('paints a hand-picked seat over the palette, naming it from its hue', () => {
    const painted = resolvePalette('classic', { blue: '#7c3aed' })

    expect(painted.blue.hex).toBe('#7c3aed')
    expect(painted.blue.name).toBe('Violet')
    // Everything else is untouched.
    expect(painted.red).toEqual(paletteById('classic').colors.red)
  })

  it('ignores an override that isn\'t a colour', () => {
    const painted = resolvePalette('classic', { blue: 'banana' as string })
    expect(painted.blue).toEqual(paletteById('classic').colors.blue)
  })
})

describe('hasOverrides', () => {
  it('is true only when something real has been painted', () => {
    expect(hasOverrides({})).toBe(false)
    expect(hasOverrides(undefined)).toBe(false)
    expect(hasOverrides({ blue: 'nonsense' })).toBe(false)
    expect(hasOverrides({ blue: '#ffffff' })).toBe(true)
  })
})

describe('normalizeHex', () => {
  it('takes the forms a person or a colour input might give', () => {
    expect(normalizeHex('#AABBCC')).toBe('#aabbcc')
    expect(normalizeHex('aabbcc')).toBe('#aabbcc')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
    expect(normalizeHex('  #ABC  ')).toBe('#aabbcc')
  })

  it('refuses anything else', () => {
    for (const bad of ['', '#ab', '#abcd', 'red', 'rgb(1,2,3)', null, 42, undefined]) {
      expect(normalizeHex(bad)).toBeNull()
    }
  })
})

describe('naming a colour picked by hand', () => {
  it('names the hue', () => {
    expect(colorName('#ef4444')).toBe('Red')
    expect(colorName('#3b82f6')).toBe('Blue')
    expect(colorName('#22c55e')).toBe('Green')
    expect(colorName('#a855f7')).toBe('Violet')
    expect(colorName('#f472b6')).toBe('Pink')
  })

  it('reads lightness before hue, where hue alone would be wrong', () => {
    // "A very dark orange" is brown to everybody, and a colour with no
    // saturation has no meaningful hue at all.
    expect(colorName('#000000')).toBe('Black')
    expect(colorName('#ffffff')).toBe('White')
    expect(colorName('#808080')).toBe('Grey')
    expect(colorName('#4a2c0a')).toBe('Brown')
  })

  it('has something to say about any colour at all', () => {
    // The board announces a turn by name, so there is no colour it may refuse.
    for (let i = 0; i < 360; i += 7) {
      const hex = hslToHex(i, 0.7, 0.5)
      expect(colorName(hex).length).toBeGreaterThan(0)
    }
  })

  it('says Custom rather than throwing on nonsense', () => {
    expect(colorName('not a colour')).toBe('Custom')
  })
})

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
