import type { PaletteChoice } from './palette'

/**
 * Which colours each online game is painted in, on this device.
 *
 * Kept here rather than on the game itself because paint is local: two people
 * in the same game may have picked different sets, and neither of them is
 * wrong. A solo game carries its own choice on the session, which is saved with
 * it; an online game lives on the server, where a colour scheme has no business
 * being.
 *
 * The point of storing it at all is that a game must not change colour under
 * you. Picking new colours for the game you are about to start would otherwise
 * repaint every game you are already in the middle of — and online, the seat
 * you painted belongs to somebody else, so the paint lands on the wrong person.
 */
const KEY = 'blokus:game-palette:v1'

/**
 * How many games' colours to remember. Well past any number of games somebody
 * has going at once, and it stops the store growing forever as games finish.
 */
const LIMIT = 60

type Stored = Record<string, PaletteChoice>

export function gamePaletteFor(gameId: string): PaletteChoice | null {
  const choice = read()[gameId]
  if (!choice || typeof choice.paletteId !== 'string') return null
  return { paletteId: choice.paletteId, colorOverrides: choice.colorOverrides ?? {} }
}

/**
 * Pins a game's colours, once.
 *
 * Deliberately does not overwrite: this is called every time a game is opened,
 * and the whole point is that the first answer is the one that sticks.
 */
export function rememberGamePalette(gameId: string, choice: PaletteChoice): void {
  const all = read()
  if (all[gameId]) return

  const entries = Object.entries(all)
  // Oldest first out. Insertion order is good enough for a cap this loose.
  const kept = entries.slice(Math.max(0, entries.length - (LIMIT - 1)))
  write({ ...Object.fromEntries(kept), [gameId]: choice })
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Stored
  } catch {
    return {}
  }
}

function write(all: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Out of room or private browsing. The game falls back to the current
    // colours, which is where it started before any of this existed.
  }
}
