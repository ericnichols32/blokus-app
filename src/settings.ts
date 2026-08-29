import { readStrength, STRONGEST } from './game'
import type { Strength } from './game'
import { COLORS } from './game'
import type { Color } from './game'
import { DEFAULT_PALETTE_ID, normalizeHex, paletteById } from './palette'
import type { ColorOverrides } from './palette'
import { DEFAULT_TURN_SECONDS, MAX_TURN_SECONDS, MIN_TURN_SECONDS } from './turnClock'

export interface Settings {
  /**
   * The running squares-left strip above the board. Off by default: it is a
   * scoreboard for a game that isn't over, and it crowds the board on a phone.
   */
  showLiveScores: boolean
  /**
   * What the computer plays at, anywhere on a continuous 0–1 scale. Defaults to
   * the top of it: the weaker settings exist to be found deliberately, not to be
   * landed on by accident.
   */
  strength: Strength
  /**
   * How long each phase of a timed turn gets, in seconds — so a turn is at most
   * twice this. Only read when starting a timed game.
   */
  turnSeconds: number
  /**
   * Which set of four colours the board is drawn in. Purely how it looks: the
   * seats are still blue, yellow, red and green underneath, so this changes
   * nothing about a game and can be changed in the middle of one.
   *
   * It lives on the device rather than in a game, which means two people in the
   * same online game may be looking at different colours. That is the right way
   * round — it is a preference about your eyes, not about the game.
   */
  paletteId: string
  /** Seats painted by hand, over whatever the palette says. */
  colorOverrides: ColorOverrides
}

export const DEFAULT_SETTINGS: Settings = {
  showLiveScores: false,
  strength: STRONGEST,
  turnSeconds: DEFAULT_TURN_SECONDS,
  paletteId: DEFAULT_PALETTE_ID,
  colorOverrides: {},
}

/** Keeps only real seats and real colours out of whatever storage held. */
export function readColorOverrides(value: unknown): ColorOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const raw = value as Record<string, unknown>
  const out: ColorOverrides = {}
  for (const color of COLORS) {
    const hex = normalizeHex(raw[color])
    if (hex) out[color as Color] = hex
  }
  return out
}

/**
 * Whole seconds inside the allowed range, or the default for anything else —
 * including the text a number field hands back mid-edit, which can be empty or
 * `NaN` before it is a usable number.
 */
export function clampTurnSeconds(value: unknown): number {
  // Checked before Number(), which reads '', '  ' and null as 0 — all finite, so
  // they would otherwise clamp to the minimum and quietly rewrite the setting.
  if (value === null || value === undefined || String(value).trim() === '') {
    return DEFAULT_SETTINGS.turnSeconds
  }
  const seconds = Math.round(Number(value))
  if (!Number.isFinite(seconds)) return DEFAULT_SETTINGS.turnSeconds
  return Math.min(MAX_TURN_SECONDS, Math.max(MIN_TURN_SECONDS, seconds))
}

const STORAGE_KEY = 'blokus:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS

    const parsed = JSON.parse(raw) as Partial<Settings> & { difficulty?: unknown }
    // Field by field, so a saved file written by an older version — or a newer
    // one with a setting this build doesn't know — still yields a usable value.
    return {
      showLiveScores:
        typeof parsed.showLiveScores === 'boolean'
          ? parsed.showLiveScores
          : DEFAULT_SETTINGS.showLiveScores,
      // `difficulty` is what this was called when it had three steps.
      strength: readStrength(parsed.strength ?? parsed.difficulty),
      turnSeconds: clampTurnSeconds(parsed.turnSeconds),
      // An unknown palette id falls back to the default rather than leaving the
      // board unpainted — one could easily be a palette that has since been
      // renamed or dropped.
      paletteId: paletteById(parsed.paletteId as string | undefined).id,
      colorOverrides: readColorOverrides(parsed.colorOverrides),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing or a full quota; the choice just won't outlive the tab.
  }
}
