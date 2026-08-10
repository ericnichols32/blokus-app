import { checkPlacement, findContactPoints, placeCells } from './board'
import type { Board } from './board'
import { findLegalPlacements } from './engine'
import type { Move, PlayerState } from './engine'
import { PIECE_BY_ID } from './pieces'
import { BOARD_SIZE } from './types'
import type { Color, PieceId, Point } from './types'

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

interface Weights {
  /** Squares covered. Dominant in real play: unplayed squares are the score. */
  pieceSize: number
  /** Corner contacts this move opens up for us — our future mobility. */
  ownReach: number
  /** Opponent contact points this move covers or seals off. */
  blocking: number
  /** Pull toward the middle, which matters most while expanding early. */
  centrality: number
  /**
   * 0 picks the best move every time; higher values pick randomly from a wider
   * band of near-best moves, which is what makes the easier levels beatable.
   */
  slack: number
}

const WEIGHTS: Record<Difficulty, Weights> = {
  easy: { pieceSize: 1, ownReach: 0, blocking: 0, centrality: 0, slack: 0.55 },
  medium: { pieceSize: 4, ownReach: 1.5, blocking: 0.5, centrality: 0.4, slack: 0.2 },
  hard: { pieceSize: 5, ownReach: 2.5, blocking: 2, centrality: 0.6, slack: 0 },
}

const CENTRE = (BOARD_SIZE - 1) / 2

/**
 * Corner contacts this colour would hold after the move, counted on a board
 * that already includes it. More reach means more places to play later, which
 * is the difference between dumping big pieces and actually building a game.
 */
function reachAfter(board: Board, color: Color, cells: Point[]): number {
  return findContactPoints(placeCells(board, color, cells), color, false).length
}

function centralityScore(cells: Point[]): number {
  let total = 0
  for (const [col, row] of cells) {
    const distance = Math.abs(col - CENTRE) + Math.abs(row - CENTRE)
    total += (2 * CENTRE - distance) / (2 * CENTRE)
  }
  return total / cells.length
}

/**
 * How much this move hurts everyone else: their contact points we sit on
 * outright, plus the ones we make unusable by crowding them edge-on.
 */
function blockingScore(board: Board, color: Color, cells: Point[], opponents: Color[]): number {
  if (opponents.length === 0) return 0

  const occupied = new Set(cells.map(([c, r]) => `${c},${r}`))
  const after = placeCells(board, color, cells)
  let score = 0

  for (const opponent of opponents) {
    const before = findContactPoints(board, opponent, false)
    if (before.length === 0) continue
    const lost = before.filter(([c, r]) => occupied.has(`${c},${r}`)).length
    const remaining = findContactPoints(after, opponent, false).length
    score += lost + Math.max(0, before.length - remaining - lost) * 0.5
  }

  return score / opponents.length
}

export interface ScoredMove {
  move: Move
  score: number
}

/**
 * Every legal move for this player, scored. Exposed separately from
 * `chooseMove` so the UI can reuse it for hints later.
 */
export function scoreMoves(
  board: Board,
  player: PlayerState,
  opponents: Color[],
  difficulty: Difficulty,
): ScoredMove[] {
  const weights = WEIGHTS[difficulty]
  const isFirstMove = !player.hasPlayedFirstMove
  const scored: ScoredMove[] = []

  for (const pieceId of player.remainingPieceIds) {
    const placements = findLegalPlacements(board, player.color, pieceId, isFirstMove)
    if (placements.length === 0) continue

    const size = PIECE_BY_ID[pieceId].cells.length

    for (const cells of placements) {
      let score = size * weights.pieceSize

      if (weights.ownReach !== 0) score += reachAfter(board, player.color, cells) * weights.ownReach
      if (weights.blocking !== 0) {
        score += blockingScore(board, player.color, cells, opponents) * weights.blocking
      }
      if (weights.centrality !== 0) score += centralityScore(cells) * weights.centrality

      scored.push({ move: { pieceId, cells }, score })
    }
  }

  return scored
}

/**
 * Picks a move for the computer, or null when it has none and must pass.
 *
 * `random` is injectable so tests can pin the choice.
 */
export function chooseMove(
  board: Board,
  player: PlayerState,
  opponents: Color[],
  difficulty: Difficulty,
  random: () => number = Math.random,
): Move | null {
  const scored = scoreMoves(board, player, opponents, difficulty)
  if (scored.length === 0) return null

  let best = scored[0]
  for (const candidate of scored) {
    if (candidate.score > best.score) best = candidate
  }

  const { slack } = WEIGHTS[difficulty]
  if (slack === 0) return best.move

  // Take anything within `slack` of the best, so the easier levels stay varied
  // without ever choosing an outright terrible move.
  const worst = scored.reduce((min, c) => Math.min(min, c.score), Infinity)
  const threshold = best.score - (best.score - worst) * slack
  const acceptable = scored.filter((c) => c.score >= threshold)

  return acceptable[Math.floor(random() * acceptable.length)].move
}

/** Guards against a bad move reaching applyMove, which throws. */
export function isMoveLegal(board: Board, player: PlayerState, move: Move): boolean {
  if (!player.remainingPieceIds.includes(move.pieceId)) return false
  return checkPlacement(board, player.color, move.cells, !player.hasPlayedFirstMove).valid
}

export function pieceSize(pieceId: PieceId): number {
  return PIECE_BY_ID[pieceId].cells.length
}
