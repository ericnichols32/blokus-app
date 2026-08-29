/**
 * Which screen the app was on, remembered across a reload.
 *
 * This matters more than it looks. The app updates itself by reloading — see
 * appUpdate.ts — so a reload can land under somebody who was mid-game and did
 * not ask for one. Coming back to where they were is what makes that invisible
 * rather than infuriating.
 *
 * Session storage, not local: it should survive a reload and nothing longer.
 * Opening the app fresh tomorrow should start at the menu.
 */
export type Screen =
  | 'home'
  | 'solo-setup'
  | 'settings'
  | 'stats'
  | 'account'
  | 'game'
  | 'online'
  | 'online-setup'
  | 'online-game'
  | 'colors'
  | 'friend'

const SCREEN_KEY = 'blokus:screen'
const OPEN_GAME_KEY = 'blokus:online-game'

/**
 * Screens worth landing on again.
 *
 * 'account' and 'online-setup' are deliberately absent: both are half-finished
 * forms whose contents don't survive a reload, so returning to one would show an
 * empty version of something you had already filled in.
 */
const RESTORABLE = new Set<Screen>([
  'game',
  'solo-setup',
  'settings',
  'stats',
  'online',
  'online-game',
])

export function rememberScreen(screen: Screen): void {
  try {
    sessionStorage.setItem(SCREEN_KEY, screen)
  } catch {
    // Storage unavailable; the screen just won't survive a reload.
  }
}

export function restoredScreen(): Screen | null {
  try {
    const saved = sessionStorage.getItem(SCREEN_KEY) as Screen | null
    return saved && RESTORABLE.has(saved) ? saved : null
  } catch {
    return null
  }
}

/**
 * The online game that was open, since — unlike a solo game — there is nothing
 * saved on the device to find it by. Without this, a reload during an online
 * game could get no closer than the games list.
 */
export function rememberOpenGame(gameId: string | null): void {
  try {
    if (gameId) sessionStorage.setItem(OPEN_GAME_KEY, gameId)
    else sessionStorage.removeItem(OPEN_GAME_KEY)
  } catch {
    // As above: the reload just lands one screen further out.
  }
}

export function restoredOpenGame(): string | null {
  try {
    return sessionStorage.getItem(OPEN_GAME_KEY) || null
  } catch {
    return null
  }
}
