import { BOARD_SIZE, COLORS, createGame, replayMoves } from './game'
import type { Color, Difficulty, GameState } from './game'

/**
 * Lives here rather than alongside the history it serves, because history.ts
 * only needs types from this file — keeping the one value it would import out
 * of it avoids a cycle between the two.
 */
export function newGameId(): string {
  // randomUUID needs a secure context, which a plain-http or file:// open lacks.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type SeatKind = 'human' | 'computer'

export interface Seat {
  kind: SeatKind
  /** Only meaningful for computer seats. */
  difficulty?: Difficulty
}

export type GameMode = 'solo' | 'pass-and-play'

export interface Session {
  /** Identifies this game, so a finished one is only recorded to history once. */
  id: string
  mode: GameMode
  seats: Record<Color, Seat>
  /**
   * Whether every human turn is on a clock. Fixed at kick-off rather than read
   * from settings, so a game already under way can't have a timer appear
   * halfway through it.
   */
  timed: boolean
  state: GameState
}

/**
 * Bump when the saved shape changes. A stale save is discarded rather than
 * being fed to the engine, which would fail in confusing ways mid-game.
 */
const STORAGE_KEY = 'blokus:session:v2'

export function createSolo(playerColor: Color, difficulty: Difficulty, timed = false): Session {
  const seats = {} as Record<Color, Seat>
  for (const color of COLORS) {
    seats[color] = color === playerColor ? { kind: 'human' } : { kind: 'computer', difficulty }
  }
  return { id: newGameId(), mode: 'solo', seats, timed, state: createGame(COLORS) }
}

export function createPassAndPlay(): Session {
  const seats = {} as Record<Color, Seat>
  for (const color of COLORS) seats[color] = { kind: 'human' }
  return { id: newGameId(), mode: 'pass-and-play', seats, timed: false, state: createGame(COLORS) }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Session
    const state = parsed?.state
    const looksValid =
      (parsed?.mode === 'solo' || parsed?.mode === 'pass-and-play') &&
      !!parsed.seats &&
      COLORS.every((c) => parsed.seats[c]?.kind === 'human' || parsed.seats[c]?.kind === 'computer') &&
      Array.isArray(state?.board) &&
      state.board.length === BOARD_SIZE &&
      Array.isArray(state.players) &&
      state.players.length > 0

    if (!looksValid) return null
    // Games saved before ids or the clock existed are filled in rather than
    // thrown away, since a game in progress is worth more than a tidy format.
    // A save from before timed mode was untimed by definition.
    return { ...parsed, id: parsed.id || newGameId(), timed: parsed.timed === true }
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Private browsing or a full quota. Play continues; it just won't resume.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}

/**
 * How many moves would survive an undo: everything from your own most recent
 * move onward is dropped. In a solo game that takes back the computers' replies
 * too, so you land back on your own turn facing the board you actually chose
 * from — undoing one move at a time would just hand the turn straight back to
 * the computer.
 *
 * Null when there is nothing of yours to take back.
 */
export function undoTarget(session: Session): number | null {
  const moves = session.state.placedPieces
  for (let i = moves.length - 1; i >= 0; i--) {
    if (session.seats[moves[i].color].kind === 'human') return i
  }
  return null
}

export function canUndo(session: Session): boolean {
  return undoTarget(session) !== null
}

/** Rewinds to just before your last move, or returns the session untouched. */
export function undo(session: Session): Session {
  const target = undoTarget(session)
  if (target === null) return session

  const colors = session.state.players.map((p) => p.color)
  const kept = session.state.placedPieces.slice(0, target)
  return { ...session, state: replayMoves(colors, kept) }
}

/** True once at least one piece is down and the game hasn't finished. */
export function isResumable(session: Session): boolean {
  return !session.state.gameOver && session.state.placedPieces.length > 0
}

export function describeSession(session: Session): string {
  const placed = session.state.placedPieces.length
  const label = session.mode === 'solo' ? 'Solo game' : 'Pass and play'
  return `${label} · ${placed} ${placed === 1 ? 'piece' : 'pieces'} played`
}
