import { BOARD_SIZE, COLORS, createGame } from './game'
import type { Color, Difficulty, GameState } from './game'

export type SeatKind = 'human' | 'computer'

export interface Seat {
  kind: SeatKind
  /** Only meaningful for computer seats. */
  difficulty?: Difficulty
}

export type GameMode = 'solo' | 'pass-and-play'

export interface Session {
  mode: GameMode
  seats: Record<Color, Seat>
  state: GameState
}

/**
 * Bump when the saved shape changes. A stale save is discarded rather than
 * being fed to the engine, which would fail in confusing ways mid-game.
 */
const STORAGE_KEY = 'blokus:session:v2'

export function createSolo(playerColor: Color, difficulty: Difficulty): Session {
  const seats = {} as Record<Color, Seat>
  for (const color of COLORS) {
    seats[color] = color === playerColor ? { kind: 'human' } : { kind: 'computer', difficulty }
  }
  return { mode: 'solo', seats, state: createGame(COLORS) }
}

export function createPassAndPlay(): Session {
  const seats = {} as Record<Color, Seat>
  for (const color of COLORS) seats[color] = { kind: 'human' }
  return { mode: 'pass-and-play', seats, state: createGame(COLORS) }
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

    return looksValid ? parsed : null
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

/** True once at least one piece is down and the game hasn't finished. */
export function isResumable(session: Session): boolean {
  return !session.state.gameOver && session.state.placedPieces.length > 0
}

export function describeSession(session: Session): string {
  const placed = session.state.placedPieces.length
  const label = session.mode === 'solo' ? 'Solo game' : 'Pass and play'
  return `${label} · ${placed} ${placed === 1 ? 'piece' : 'pieces'} played`
}
