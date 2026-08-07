import { describe, expect, it } from 'vitest'
import { computeScore } from '../scoring'
import type { PieceId } from '../types'

describe('computeScore', () => {
  it('scores -1 per unplayed square when the game ends with pieces left', () => {
    const remaining: PieceId[] = ['monomino', 'domino'] // 1 + 2 = 3 squares
    const result = computeScore({ remainingPieceIds: remaining, lastPiecePlayedId: null })
    expect(result.remainingSquares).toBe(3)
    expect(result.allPiecesPlaced).toBe(false)
    expect(result.perfectGame).toBe(false)
    expect(result.score).toBe(-3)
  })

  it('awards a +15 bonus for placing all pieces', () => {
    const result = computeScore({ remainingPieceIds: [], lastPiecePlayedId: 'pentomino-X' })
    expect(result.allPiecesPlaced).toBe(true)
    expect(result.perfectGame).toBe(false)
    expect(result.score).toBe(15)
  })

  it('awards a perfect-game +20 total when the last piece played is the monomino', () => {
    const result = computeScore({ remainingPieceIds: [], lastPiecePlayedId: 'monomino' })
    expect(result.perfectGame).toBe(true)
    expect(result.score).toBe(20)
  })
})
