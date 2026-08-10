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
   * The smallest piece a move may spend, as a fraction of the size the best
   * move spends. This is the knob that sets strength: unplayed squares are the
   * score, so a level that will settle for a smaller piece is a weaker level.
   * At 1 the search will never spend fewer squares than it has to.
   */
  minSizeFraction: number
  /**
   * How wide a band to choose randomly from among the moves that clear the
   * size floor, as a fraction of their spread. This is the knob that sets
   * variety.
   *
   * Splitting it from the size floor matters. A pure argmax makes three
   * computers looking at a symmetric board reach for the same piece as each
   * other, turn after turn, which reads as a bug rather than as three
   * opponents — but widening a single combined knob to separate them also lets
   * them dump small pieces. Once the floor holds the squares steady, the rest
   * of the evaluation is refinement, and there is some room to disagree about
   * it without playing badly.
   */
  slack: number
  /**
   * The band to use for a player's opening move, which is far wider.
   *
   * The opening is where the sameness is both worst and cheapest to fix. An
   * empty board is symmetric, so every seat sees the same position from its own
   * corner and the best openings score within a hair of each other — choosing
   * among them costs almost nothing, and one different opening is enough to
   * send the rest of the game down a different path.
   *
   * Measured over 150 openings and 70 full games: widening the opening alone
   * took the three computers from opening identically in every game to 3% of
   * games, for under a point a game. Widening the second and third moves too
   * bought little further variety and cost three to four points a game, because
   * by then the positions have diverged and the evaluation is earning its keep.
   */
  openingSlack: number
}

const WEIGHTS: Record<Difficulty, Weights> = {
  easy: {
    pieceSize: 1, ownReach: 0, blocking: 0, centrality: 0,
    minSizeFraction: 0.4, slack: 1, openingSlack: 1,
  },
  medium: {
    pieceSize: 4, ownReach: 1.5, blocking: 0.5, centrality: 0.4,
    minSizeFraction: 0.8, slack: 0.45, openingSlack: 0.45,
  },
  hard: {
    pieceSize: 5, ownReach: 2.5, blocking: 2, centrality: 0.6,
    minSizeFraction: 1, slack: 0.08, openingSlack: 0.35,
  },
}

/**
 * A per-seat tilt on the weights, so the three computers in a solo game are
 * three opponents rather than one opponent playing three times.
 *
 * Randomness alone can't fix this. The scoring function has a sharp optimum, so
 * a band wide enough to separate three seats is also wide enough to let them
 * play badly — and on a symmetric board they'd still be drawing from the same
 * short list. Giving each seat a standing preference separates them by
 * conviction instead: each still plays its own best move, they just disagree
 * about what "best" means.
 *
 * `pieceSize` is deliberately untilted. How many squares a move spends is the
 * part of the evaluation that decides the game, and it must not wobble.
 */
type Style = Pick<Weights, 'ownReach' | 'blocking' | 'centrality'>

const STYLES: Record<Color, Style> = {
  blue: { ownReach: 1.3, blocking: 0.75, centrality: 1 },
  yellow: { ownReach: 0.8, blocking: 1.4, centrality: 1.05 },
  red: { ownReach: 1.05, blocking: 0.95, centrality: 1.45 },
  green: { ownReach: 1.2, blocking: 1.2, centrality: 0.65 },
}

function weightsFor(difficulty: Difficulty, color: Color): Weights {
  const base = WEIGHTS[difficulty]
  const style = STYLES[color]
  return {
    ...base,
    ownReach: base.ownReach * style.ownReach,
    blocking: base.blocking * style.blocking,
    centrality: base.centrality * style.centrality,
  }
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
  const weights = weightsFor(difficulty, player.color)
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

  const { minSizeFraction, slack, openingSlack } = WEIGHTS[difficulty]

  // Hold the number of squares steady first, then vary freely within that.
  // The floor is a fraction of what the best move spends rather than a fixed
  // size, because late on the best available move may only be two squares —
  // at which point insisting on five would mean passing.
  const floor = Math.ceil(pieceSize(best.move.pieceId) * minSizeFraction)
  const eligible = scored.filter((c) => pieceSize(c.move.pieceId) >= floor)

  const band = player.hasPlayedFirstMove ? slack : openingSlack

  const worst = eligible.reduce((min, c) => Math.min(min, c.score), Infinity)
  const threshold = best.score - (best.score - worst) * band
  // `eligible` always contains the best move, so this is never empty.
  const acceptable = eligible.filter((c) => c.score >= threshold)

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
