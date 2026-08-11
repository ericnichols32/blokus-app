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
 * wins, pieces left, perfect games, favourite colour and piece — is answerable
 * from this, at roughly a fifteenth of the size. Storing the moves as well
 * would additionally allow replaying a game, which nobody has asked for.
 */
export interface GameRecord {
  /** The session's id, so replaying a reload cannot record the game twice. */
  id: string
  finishedAt: string
  mode: GameMode
  /** The computers' setting in a solo game, on the 0–1 strength scale. */
  strength: Strength | null
  /** Whether the human turns were on a clock. */
  timed: boolean
  /** Your colour in a solo game; null when every seat was a person. */
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

  const yourColor = COLORS.find((c) => session.seats[c]?.kind === 'human') ?? null
  const computer = COLORS.map((c) => session.seats[c]).find((s) => s?.kind === 'computer')

  return {
    id: session.id,
    finishedAt: finishedAt.toISOString(),
    mode: session.mode,
    strength: session.mode === 'solo' ? (computer?.strength ?? null) : null,
    timed: session.timed,
    yourColor: session.mode === 'solo' ? yourColor : null,
    movesPlayed: session.state.placedPieces.length,
    players: session.state.players.map((player) => {
      const result = scores[player.color]
      return {
        color: player.color,
        seat: session.seats[player.color].kind,
        score: result.score,
        remainingSquares: result.remainingSquares,
        piecesLeft: [...player.remainingPieceIds],
        perfectGame: result.perfectGame,
        // Equal scores share a rank, matching the game-over screen.
        rank: ordered.findIndex((p) => scores[p.color].score === result.score) + 1,
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
