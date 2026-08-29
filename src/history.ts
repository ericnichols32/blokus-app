import { COLORS, finalizeScores } from './game'
import type { Color, PieceId, Strength } from './game'
import type { GameMode, SeatKind, Session } from './session'

/**
 * One finished game, kept so a stats screen has real history to read whenever
 * it gets built. Recording starts now because a game not written down when it
 * ends is gone: nothing else in the app keeps a finished board.
 *
 * Deliberately a summary rather than the move list. Which pieces a player never
 * placed is enough to derive which ones they did, so every stat asked for —
 * wins, pieces left, perfect games, favorite color and piece — is answerable
 * from this, at roughly a fifteenth of the size. Storing the moves as well
 * would additionally allow replaying a game, which nobody has asked for.
 */
export interface GameRecord {
  /** The session's id, so replaying a reload cannot record the game twice. */
  id: string
  finishedAt: string
  /**
   * `'pass-and-play'` is a mode the app no longer offers. Records written while
   * it existed still say so, and they are still real games, so the value stays
   * readable here rather than being scrubbed out of somebody's history.
   */
  mode: GameMode | 'pass-and-play'
  /** The computers' setting in a solo game, on the 0–1 strength scale. */
  strength: Strength | null
  /** Whether the human turns were on a clock. */
  timed: boolean
  /** Your color, or null in an old pass-and-play game where every seat was a person. */
  yourColor: Color | null
  /** Total pieces placed by everyone, as a rough measure of how long it ran. */
  movesPlayed: number
  players: GameRecordPlayer[]
}

export interface GameRecordPlayer {
  color: Color
  seat: SeatKind
  score: number
  remainingSquares: number
  /** Pieces never placed. Everything else in the set of 21 was played. */
  piecesLeft: PieceId[]
  perfectGame: boolean
  /** Shared by players on equal scores, so two firsts means a draw at the top. */
  rank: number
  /**
   * Who held this seat, for an online game. Absent on a computer, on a solo
   * game, and on every record written before this was stored — which is why
   * per-friend stats can only count games played from that point on. The name is
   * kept beside the id so a record still says who played it after a rename.
   */
  playerId?: string
  username?: string
}

const HISTORY_KEY = 'blokus:history:v1'

/**
 * Old games are dropped once past this. Well beyond anything a person plays on
 * a phone, and it stops the store growing without limit.
 */
const HISTORY_LIMIT = 500

export function loadHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    // A record missing its id or players can't be counted or de-duplicated, so
    // drop it rather than letting it break every read from here on.
    return parsed.filter(
      (r): r is GameRecord =>
        !!r && typeof r.id === 'string' && Array.isArray(r.players) && r.players.length > 0,
    )
  } catch {
    return []
  }
}

function saveHistory(records: GameRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(-HISTORY_LIMIT)))
  } catch {
    // Quota or private browsing. The game itself is unaffected; only the
    // history stops growing, which is not worth interrupting play over.
  }
}

/** Builds the record for a finished game without touching storage. */
export function summarise(session: Session, finishedAt = new Date()): GameRecord {
  const scores = finalizeScores(session.state)
  const ordered = [...session.state.players].sort(
    (a, b) => scores[b.color].score - scores[a.color].score,
  )

  // youAre when the session knows it, which online games always do. Falling back
  // to the first human seat keeps solo games — and every game already recorded —
  // reading the same as before.
  const yourColor =
    session.youAre ?? COLORS.find((c) => session.seats[c]?.kind === 'human') ?? null
  const computer = COLORS.map((c) => session.seats[c]).find((s) => s?.kind === 'computer')

  return {
    id: session.id,
    finishedAt: finishedAt.toISOString(),
    mode: session.mode,
    strength: computer?.strength ?? null,
    timed: session.timed,
    yourColor,
    movesPlayed: session.state.placedPieces.length,
    players: session.state.players.map((player) => {
      const result = scores[player.color]
      const seat = session.seats[player.color]
      return {
        color: player.color,
        seat: seat.kind,
        score: result.score,
        remainingSquares: result.remainingSquares,
        piecesLeft: [...player.remainingPieceIds],
        perfectGame: result.perfectGame,
        // Equal scores share a rank, matching the game-over screen.
        rank: ordered.findIndex((p) => scores[p.color].score === result.score) + 1,
        // Only present online. Undefined keys are dropped on the way to the
        // store, which will not accept them.
        ...(seat.playerId ? { playerId: seat.playerId } : {}),
        ...(seat.username ? { username: seat.username } : {}),
      }
    }),
  }
}

/**
 * Writes a finished game to the history, once. Returns the record if it was
 * newly added, or null if the game isn't over or was already recorded — which
 * is what makes it safe to call from a render effect that re-runs on reload.
 */
export function recordFinishedGame(session: Session, now = new Date()): GameRecord | null {
  if (!session.state.gameOver) return null

  const history = loadHistory()
  if (history.some((r) => r.id === session.id)) return null

  const record = summarise(session, now)
  saveHistory([...history, record])
  return record
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}
