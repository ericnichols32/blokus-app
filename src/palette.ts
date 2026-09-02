import { COLORS } from './game'
import type { Color } from './game'

/**
 * What the four seats are painted, and what they are called.
 *
 * The engine never sees any of this. A seat is `blue` for the whole life of the
 * game whatever it is drawn in — palettes are paint, not identity — which is why
 * a game can be recoloured mid-way, and why two people in the same online game
 * can be looking at entirely different colours without disagreeing about
 * anything that matters.
 *
 * The names travel with the paint for exactly that reason. "Blue's turn" is a
 * lie once blue is drawn violet, and the seat name is the one thing a player
 * cannot check against the board.
 */
export interface PaintedColor {
  hex: string
  name: string
}

export interface Palette {
  id: string
  name: string
  /** One line on what it is for, where that isn't obvious from the swatches. */
  note?: string
  colors: Record<Color, PaintedColor>
}

export const DEFAULT_PALETTE_ID = 'classic'

/**
 * Every palette keeps its four hues far apart, because telling the seats apart
 * is not decoration here — it is how the game is read. That rules out the
 * obvious "all blues" or "all warm" sets, which look handsome as swatches and
 * are unplayable on a crowded board.
 */
export const PALETTES: Palette[] = [
  {
    id: 'classic',
    name: 'Classic',
    note: 'The colors of the real board',
    colors: {
      blue: { hex: '#3b82f6', name: 'Blue' },
      yellow: { hex: '#eab308', name: 'Yellow' },
      red: { hex: '#ef4444', name: 'Red' },
      green: { hex: '#22c55e', name: 'Green' },
    },
  },
  {
    id: 'distinct',
    name: 'Easy to tell apart',
    // The Okabe–Ito set, chosen so the four stay distinguishable to the most
    // common forms of colour blindness — where classic red and green do not.
    note: 'Stays readable if red and green look alike to you',
    colors: {
      blue: { hex: '#56b4e9', name: 'Sky' },
      yellow: { hex: '#f0e442', name: 'Yellow' },
      red: { hex: '#d55e00', name: 'Vermilion' },
      green: { hex: '#009e73', name: 'Teal' },
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    colors: {
      blue: { hex: '#22d3ee', name: 'Cyan' },
      yellow: { hex: '#a3e635', name: 'Lime' },
      red: { hex: '#f472b6', name: 'Magenta' },
      green: { hex: '#fb923c', name: 'Tangerine' },
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: {
      blue: { hex: '#93c5fd', name: 'Powder' },
      yellow: { hex: '#fde68a', name: 'Butter' },
      red: { hex: '#fca5a5', name: 'Blush' },
      green: { hex: '#86efac', name: 'Mint' },
    },
  },
  {
    id: 'jewel',
    name: 'Jewel',
    colors: {
      blue: { hex: '#6366f1', name: 'Indigo' },
      yellow: { hex: '#f59e0b', name: 'Gold' },
      red: { hex: '#e11d48', name: 'Ruby' },
      green: { hex: '#10b981', name: 'Emerald' },
    },
  },
  {
    id: 'autumn',
    name: 'Autumn',
    colors: {
      blue: { hex: '#0ea5e9', name: 'Slate blue' },
      yellow: { hex: '#facc15', name: 'Corn' },
      red: { hex: '#c2410c', name: 'Rust' },
      green: { hex: '#4d7c0f', name: 'Moss' },
    },
  },
  {
    id: 'bold',
    name: 'Bold',
    colors: {
      blue: { hex: '#a855f7', name: 'Violet' },
      yellow: { hex: '#f59e0b', name: 'Amber' },
      red: { hex: '#f43f5e', name: 'Rose' },
      green: { hex: '#14b8a6', name: 'Teal' },
    },
  },
]

export function paletteById(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

/** A colour picked by hand, per seat. Absent seats keep the palette's own. */
export type ColorOverrides = Partial<Record<Color, string>>

/**
 * A complete answer to "what colour is each seat" — the set, plus anything
 * hand-picked on top of it.
 *
 * It exists as a value rather than as two loose settings fields because a game
 * takes a copy of it when it starts. Colours chosen for the game you are about
 * to play must not reach back into the games you are already in the middle of:
 * online, the seat you painted is somebody else's, so the paint would land on
 * the wrong person.
 */
export interface PaletteChoice {
  paletteId: string
  colorOverrides: ColorOverrides
}

/**
 * The four colours as they should actually be drawn: the chosen palette, with
 * any hand-picked seat painted over it.
 *
 * A hand-picked colour has no name of its own, so one is read off its hue —
 * otherwise the board would announce a turn for a colour it can't name.
 */
export function resolvePalette(
  paletteId: string | undefined,
  overrides: ColorOverrides = {},
): Record<Color, PaintedColor> {
  const base = paletteById(paletteId)
  const out = {} as Record<Color, PaintedColor>

  for (const color of COLORS) {
    const custom = normalizeHex(overrides[color])
    out[color] = custom ? { hex: custom, name: colorName(custom) } : base.colors[color]
  }
  return out
}

/** Whether anything has been painted over the palette. */
export function hasOverrides(overrides: ColorOverrides | undefined): boolean {
  return Boolean(overrides && COLORS.some((c) => normalizeHex(overrides[c])));
}

/** `#abc` and `ABCDEF` both become `#aabbcc`; anything else becomes null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim().replace(/^#/, '')

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`
  }
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw.toLowerCase()}` : null
}

/**
 * A name for an arbitrary colour, from its hue — and from its lightness and
 * saturation first, since "a very dark orange" is brown to everybody and
 * "hardly any colour at all" is grey whatever its hue says.
 */
export function colorName(hex: string): string {
  const rgb = normalizeHex(hex)
  if (!rgb) return 'Custom'

  const [h, s, l] = toHsl(rgb)

  if (l <= 0.08) return 'Black'
  if (l >= 0.94) return 'White'
  if (s <= 0.12) return l < 0.45 ? 'Charcoal' : l > 0.7 ? 'Silver' : 'Grey'

  const hue = HUE_NAMES.find(([limit]) => h < limit)?.[1] ?? 'Red'

  // Dark warm colours read as brown rather than as a dim orange.
  if (l < 0.3 && (hue === 'Orange' || hue === 'Yellow')) return 'Brown'
  if (l < 0.25) return `Dark ${hue.toLowerCase()}`
  if (l > 0.78) return `Pale ${hue.toLowerCase()}`
  return hue
}

/** Upper bound of each hue band, in degrees. */
const HUE_NAMES: [number, string][] = [
  [14, 'Red'],
  [40, 'Orange'],
  [67, 'Yellow'],
  [160, 'Green'],
  [190, 'Teal'],
  [250, 'Blue'],
  [285, 'Violet'],
  [330, 'Pink'],
  [361, 'Red'],
]

function toHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60

  return [h, s, l]
}
