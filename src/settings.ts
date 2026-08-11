import { readStrength, STRONGEST } from './game'
import type { Strength } from './game'
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
}

export const DEFAULT_SETTINGS: Settings = {
  showLiveScores: false,
  strength: STRONGEST,
  turnSeconds: DEFAULT_TURN_SECONDS,
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
