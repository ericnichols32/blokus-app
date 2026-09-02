import { BOARD_SIZE, COLORS, createGame, readStrength } from './game'
import type { Color, GameState, Strength } from './game'
import type { PaletteChoice } from './palette'

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
  /**
   * The colours this game is painted in, taken when it started.
   *
   * Fixed at kick-off for the same reason `timed` is: repainting on the setup
   * screen must change the game you are about to start, not the ones already
   * under way. Absent on games saved before this existed, which fall back to
   * whatever is currently set.
   */
  palette?: PaletteChoice
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
  palette?: PaletteChoice,
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
    palette,
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

/**
 * Which round the game is in, counting from one.
 *
 * A round is everyone having had one turn, so it is the most pieces any single
 * player has down — not the total placed, which counts four players' turns as
 * four separate steps and means nothing to anyone reading it. Measured off the
 * leader rather than off the total precisely because players pass out: once
 * somebody is finished the total stops keeping pace with the game, while the
 * people still playing carry on into new rounds.
 *
 * A game with nothing on the board is still in its first round — nobody has
 * played it yet, but it is the round they are about to play.
 */
export function roundNumber(state: GameState): number {
  const placed = state.players.map((p) => TOTAL_PIECES - p.remainingPieceIds.length)
  return Math.max(1, ...placed)
}

/** How many pieces each colour starts with. */
const TOTAL_PIECES = 21

const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
  'twenty-first',
]

/**
 * "third round" — the words rather than the digits, because this is read inside
 * a sentence rather than off a scoreboard. There are only ever twenty-one of
 * them, since that is how many pieces a colour has.
 */
export function describeRound(state: GameState): string {
  const round = roundNumber(state)
  return `${ORDINALS[round - 1] ?? `round ${round}`} round`
}
