import { BOARD_SIZE, COLORS, createGame, readStrength } from './game'
import type { Color, GameState, Strength } from './game'

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
  strength?: Strength
  /**
   * Who holds this seat, in an online game. Absent on a computer seat, and on
   * every seat of a solo game — there is only one person there and `youAre`
   * already says which seat is theirs.
   *
   * Two colors carrying the same `playerId` is how one person plays two of them.
   */
  playerId?: string
  /**
   * Kept beside the id so a board can name people without a second lookup, and
   * so a finished game still says who played it if the account is later renamed.
   */
  username?: string
}

export type GameMode = 'solo' | 'online'

export interface Session {
  /** Identifies this game, so a finished one is only recorded to history once. */
  id: string
  mode: GameMode
  seats: Record<Color, Seat>
  /**
   * The seat belonging to whoever is holding this device.
   *
   * Only the seats can say this, and only in a solo game: there, the one human
   * seat is you. Online, every seat may be human and three of them are other
   * people, so "the first human seat" is a guess that is usually wrong — which
   * would face the board at somebody else and file the game under their result.
   */
  youAre?: Color
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

export function createSolo(
  playerColor: Color,
  strength: Strength,
  timed = false,
  firstColor?: Color,
): Session {
  const seats = {} as Record<Color, Seat>
  for (const color of COLORS) {
    seats[color] = color === playerColor ? { kind: 'human' } : { kind: 'computer', strength }
  }
  return {
    id: newGameId(),
    mode: 'solo',
    seats,
    youAre: playerColor,
    timed,
    state: createGame(COLORS, firstColor),
  }
}

/** Draws the colour that opens. Every seat has the same chance, including yours. */
export function drawFirstColor(random: () => number = Math.random): Color {
  return COLORS[Math.floor(random() * COLORS.length)]
}

/**
 * Carries a resumed game's opponents over from when seats named a difficulty
 * instead of a strength. Without this the seats would come back with no strength
 * at all and fall through to the default, quietly promoting a game in progress
 * to the hardest setting between one launch and the next.
 */
function migrateSeats(seats: Record<Color, Seat>): Record<Color, Seat> {
  const out = {} as Record<Color, Seat>
  for (const color of COLORS) {
    const seat = seats[color] as Seat & { difficulty?: unknown }
    out[color] =
      seat.strength === undefined && seat.difficulty !== undefined
        ? { kind: seat.kind, strength: readStrength(seat.difficulty) }
        : seat
  }
  return out
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Session
    const state = parsed?.state
    const looksValid =
      parsed?.mode === 'solo' &&
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
    return {
      ...parsed,
      id: parsed.id || newGameId(),
      timed: parsed.timed === true,
      seats: migrateSeats(parsed.seats),
    }
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
  const label = session.mode === 'online' ? 'Online game' : 'Solo game'
  return `${label} · ${placed} ${placed === 1 ? 'piece' : 'pieces'} played`
}
