import { PIECE_BY_ID } from './pieces'
import type { PieceId } from './types'

export interface ScoreInput {
  remainingPieceIds: PieceId[]
  lastPiecePlayedId: PieceId | null
}

export interface ScoreResult {
  remainingSquares: number
  allPiecesPlaced: boolean
  perfectGame: boolean
  score: number
}

/**
 * Standard Blokus scoring: -1 per unplayed square; +15 bonus for placing
 * all 21 pieces; an additional +5 ("perfect game") if the very last piece
 * played was the 1x1 monomino.
 */
export function computeScore({ remainingPieceIds, lastPiecePlayedId }: ScoreInput): ScoreResult {
  const remainingSquares = remainingPieceIds.reduce(
    (sum, id) => sum + PIECE_BY_ID[id].cells.length,
    0,
  )
  const allPiecesPlaced = remainingPieceIds.length === 0
  const perfectGame = allPiecesPlaced && lastPiecePlayedId === 'monomino'

  let score = -remainingSquares
  if (allPiecesPlaced) score += 15
  if (perfectGame) score += 5

  return { remainingSquares, allPiecesPlaced, perfectGame, score }
}
