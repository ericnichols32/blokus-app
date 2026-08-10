import { describe, expect, it, vi } from 'vitest'
import { chooseMove, isMoveLegal, pieceSize } from '../ai'
import type { Difficulty } from '../ai'
import { applyMove, createGame, finalizeScores } from '../engine'
import type { GameState } from '../engine'
import { COLORS } from '../types'
import type { Color } from '../types'

// Several of these play complete four-player games to judge the AI, which takes
// seconds by nature. Vitest's 5s default is not enough headroom on CI.
vi.setConfig({ testTimeout: 60_000 })

function seededRandom(seed: number) {
  let s = seed
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  // Small seeds land within 0.002 of each other on the first call, which makes
  // consecutive seeds pick the same index. Discard the correlated prefix.
  for (let i = 0; i < 8; i++) next()
  return next
}

/** Plays a whole game with every seat driven by the AI. */
function playGame(difficulties: Record<Color, Difficulty>, seed: number) {
  const random = seededRandom(seed)
  let state: GameState = createGame(COLORS)
  let turns = 0

  while (!state.gameOver) {
    if (turns++ > 200) throw new Error('game did not terminate')

    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p !== player).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, difficulties[player.color], random)

    // advanceTurn only lands on players who have a move, so one must exist.
    expect(move).not.toBeNull()
    expect(isMoveLegal(state.board, player, move!)).toBe(true)

    state = applyMove(state, move!)
  }

  return { state, turns }
}

const allSame = (d: Difficulty): Record<Color, Difficulty> => ({
  blue: d, yellow: d, red: d, green: d,
})

describe('chooseMove', () => {
  it('plays legal moves through to a finished game', () => {
    const { state, turns } = playGame(allSame('medium'), 7)
    expect(state.gameOver).toBe(true)
    expect(turns).toBeGreaterThan(40)
    expect(state.placedPieces.length).toBe(turns)
  })

  it('returns null when the player has nothing left to play', () => {
    const state = createGame(COLORS)
    const stuck = { ...state.players[0], remainingPieceIds: [] }
    expect(chooseMove(state.board, stuck, ['yellow'], 'hard')).toBeNull()
  })

  it('opens on the start corner with a large piece', () => {
    const state = createGame(COLORS)
    const move = chooseMove(state.board, state.players[0], ['yellow', 'red', 'green'], 'hard')
    expect(move).not.toBeNull()
    expect(move!.cells.some(([c, r]) => c === 0 && r === 0)).toBe(true)
    // A strong opening spends a pentomino, not the single square.
    expect(pieceSize(move!.pieceId)).toBe(5)
  })

  // Three computers facing a symmetric board must not mirror each other, so
  // even hard varies its choice — just within a much narrower band.
  it('varies its choice at every difficulty', () => {
    const state = createGame(COLORS)
    const player = state.players[0]
    const opponents: Color[] = ['yellow', 'red', 'green']

    const hardPicks = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        JSON.stringify(chooseMove(state.board, player, opponents, 'hard', seededRandom(seed))),
      ),
    )
    expect(hardPicks.size).toBeGreaterThan(1)

    const easyPicks = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        JSON.stringify(chooseMove(state.board, player, opponents, 'easy', seededRandom(seed))),
      ),
    )
    expect(easyPicks.size).toBeGreaterThan(1)
  })

  /*
   * Scored as an average margin rather than as a clean sweep of wins. Both
   * levels choose randomly within a band, so "hard won all N" is a coin-flip
   * assertion on a small sample that a harmless change to how many random
   * numbers get drawn can break. The margin is the thing actually worth
   * guarding, and it sits around 24 points — a threshold of 10 catches a real
   * regression without failing on noise.
   */
  it('beats easy by a clear margin when playing on hard', () => {
    const rounds = 6
    let margin = 0

    for (let round = 0; round < rounds; round++) {
      // Alternate which diagonal plays hard, so neither the turn order nor the
      // per-colour styles decide the result.
      const difficulties: Record<Color, Difficulty> =
        round % 2 === 0
          ? { blue: 'hard', yellow: 'easy', red: 'hard', green: 'easy' }
          : { blue: 'easy', yellow: 'hard', red: 'easy', green: 'hard' }

      const { state } = playGame(difficulties, (round + 1) * 97)
      const scores = finalizeScores(state)
      const best = (level: Difficulty) =>
        Math.max(...COLORS.filter((c) => difficulties[c] === level).map((c) => scores[c].score))

      margin += best('hard') - best('easy')
    }

    expect(margin / rounds).toBeGreaterThan(10)
  })

  it('leaves fewer squares unplayed on hard than on easy', () => {
    const hard = finalizeScores(playGame(allSame('hard'), 31).state)
    const easy = finalizeScores(playGame(allSame('easy'), 31).state)

    const avg = (s: ReturnType<typeof finalizeScores>) =>
      COLORS.reduce((sum, c) => sum + s[c].remainingSquares, 0) / COLORS.length

    expect(avg(hard)).toBeLessThan(avg(easy))
  })
})
