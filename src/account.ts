import { newGameId } from './session'

/**
 * Who you are, as this device understands it.
 *
 * Two ids, deliberately:
 *
 * - `playerId` is the person. It never changes, and it is what game records are
 *   filed under, so changing your username doesn't orphan your stats.
 * - `username` is the label on that person, and the only thing anyone types.
 *
 * There is no password. Typing a username that already exists adopts that
 * player rather than overwriting it, which is what makes a second device work:
 * you open the link on the iPad, type your name, and your games are there.
 * The cost is that a friend who types your name becomes you — accepted, since
 * the link only goes to people you know.
 */
export interface Account {
  playerId: string
  username: string
}

const ACCOUNT_KEY = 'blokus:account:v1'

/**
 * Whether the "pick a name" prompt has already been shown and waved away.
 *
 * The prompt is meant to be the first thing a new player sees, but exactly
 * once: someone who only wants to play the computer shouldn't have to decline
 * it every time they open the app. The home screen keeps a way back in.
 */
const PROMPTED_KEY = 'blokus:account-prompted:v1'

export function hasBeenPrompted(): boolean {
  try {
    return localStorage.getItem(PROMPTED_KEY) === 'yes'
  } catch {
    // Can't tell, so don't nag — treat it as already asked.
    return true
  }
}

export function markPrompted(): void {
  try {
    localStorage.setItem(PROMPTED_KEY, 'yes')
  } catch {
    // Storage unavailable; the prompt may reappear next time, which is a much
    // smaller problem than blocking the app over it.
  }
}

/** Shortest name worth having; anything less collides by accident. */
export const USERNAME_MIN = 2
/** Long enough for a real name, short enough to sit on one line on a phone. */
export const USERNAME_MAX = 16

/**
 * The form a username is stored and compared in. Names are matched
 * case-insensitively — @Eric and @eric are the same person, not two — but the
 * capitals you typed are what everyone sees.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/**
 * Why a username can't be used, or null if it can.
 *
 * The message is written to be shown to the player as-is, so it says what to do
 * rather than naming the rule that was broken.
 */
export function usernameProblem(username: string): string | null {
  const trimmed = username.trim()

  if (trimmed.length === 0) return 'Pick a name.'
  if (trimmed.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`
  if (trimmed.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`
  // Letters, numbers and underscores only. Spaces and punctuation are out
  // because the name has to survive being said out loud to a friend.
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return 'Letters, numbers and underscores only.'
  if (!/[a-zA-Z]/.test(trimmed)) return 'Include at least one letter.'

  return null
}

export function isUsernameValid(username: string): boolean {
  return usernameProblem(username) === null
}

/** A fresh id for a person who has never been seen before. */
export function newPlayerId(): string {
  return newGameId()
}

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<Account>
    if (typeof parsed?.playerId !== 'string' || typeof parsed?.username !== 'string') return null
    if (!parsed.playerId || !parsed.username) return null

    return { playerId: parsed.playerId, username: parsed.username }
  } catch {
    return null
  }
}

export function saveAccount(account: Account): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  } catch {
    // Private browsing or a full quota. You stay signed in for this tab only,
    // which beats refusing to let you pick a name at all.
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}
