import type { Difficulty } from './game'

export interface Settings {
  /**
   * The running squares-left strip above the board. Off by default: it is a
   * scoreboard for a game that isn't over, and it crowds the board on a phone.
   */
  showLiveScores: boolean
  /**
   * What the computer plays at. Hard is the default because the weaker levels
   * exist to be found deliberately, not to be chosen by accident.
   */
  difficulty: Difficulty
}

export const DEFAULT_SETTINGS: Settings = {
  showLiveScores: false,
  difficulty: 'hard',
}

const STORAGE_KEY = 'blokus:settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS

    const parsed = JSON.parse(raw) as Partial<Settings>
    // Field by field, so a saved file written by an older version — or a newer
    // one with a setting this build doesn't know — still yields a usable value.
    return {
      showLiveScores:
        typeof parsed.showLiveScores === 'boolean'
          ? parsed.showLiveScores
          : DEFAULT_SETTINGS.showLiveScores,
      difficulty:
        parsed.difficulty === 'easy' || parsed.difficulty === 'medium' || parsed.difficulty === 'hard'
          ? parsed.difficulty
          : DEFAULT_SETTINGS.difficulty,
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
