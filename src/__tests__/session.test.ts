import { describe, expect, it } from 'vitest'
import { COLORS, createGame, PIECE_DEFINITIONS } from '../game'
import type { GameState, PieceId } from '../game'
import { describeRound, drawFirstColor, roundNumber } from '../session'

describe('drawFirstColor', () => {
  it('can land on any of the four, yours included', () => {
    const seen = new Set(Array.from({ length: 400 }, () => drawFirstColor()))
    expect(seen).toEqual(new Set(COLORS))
  })

  it('picks each color with roughly equal chance', () => {
    // A flat index into COLORS, so a fixed random maps to a known color.
    expect(drawFirstColor(() => 0)).toBe(COLORS[0])
    expect(drawFirstColor(() => 0.999)).toBe(COLORS[3])
    expect(drawFirstColor(() => 0.5)).toBe(COLORS[2])
  })
})


describe('which round a game is in', () => {
  /** A board where each colour has placed the given number of pieces. */
  function afterPlacing(counts: number[]): GameState {
    const all = PIECE_DEFINITIONS.map((p) => p.id) as PieceId[]
    const state = createGame(COLORS, 'blue')
    return {
      ...state,
      players: state.players.map((player, i) => ({
        ...player,
        remainingPieceIds: all.slice(counts[i]),
      })),
    }
  }

  it('is one before anybody has played', () => {
    // Nobody has played it yet, but it is the round they are about to play —
    // and "round 0" is not a thing anyone says.
    expect(roundNumber(createGame(COLORS, 'blue'))).toBe(1)
    expect(describeRound(createGame(COLORS, 'blue'))).toBe('first round')
  })

  it('counts a round as everyone having had a turn', () => {
    // Ten pieces down across four players: two full rounds, and the third in
    // progress. This is the case that made "10 pieces played" useless.
    expect(roundNumber(afterPlacing([3, 3, 2, 2]))).toBe(3)
    expect(describeRound(afterPlacing([3, 3, 2, 2]))).toBe('third round')
  })

  it('follows whoever is furthest, not the total placed', () => {
    // Two players passed out early. The total stops keeping pace with the game,
    // while the people still playing carry on into new rounds.
    expect(roundNumber(afterPlacing([9, 8, 1, 1]))).toBe(9)
  })

  it('has a word for every round a game can reach', () => {
    // Twenty-one pieces each, so twenty-one is as far as it goes — and a round
    // with no word for it would render as "undefined round".
    for (let round = 1; round <= 21; round++) {
      const described = describeRound(afterPlacing([round, 0, 0, 0]))
      expect(described, `round ${round}`).toMatch(/^[a-z-]+ round$/)
    }
  })
})
