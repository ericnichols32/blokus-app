import { describe, expect, it, vi } from 'vitest'
import {
  chooseMove,
  chooseTimeoutMove,
  DIFFICULTY_STRENGTH as S,
  isMoveLegal,
  pieceSize,
  readStrength,
  strengthLabel,
} from '../ai'
import type { Strength } from '../ai'
import { applyMove, createGame, finalizeScores } from '../engine'
import type { GameState } from '../engine'
import { COLORS } from '../types'
import type { Color, PieceId } from '../types'

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
function playGame(difficulties: Record<Color, Strength>, seed: number) {
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

const allSame = (d: Strength): Record<Color, Strength> => ({
  blue: d, yellow: d, red: d, green: d,
})

describe('chooseMove', () => {
  it('plays legal moves through to a finished game', () => {
    const { state, turns } = playGame(allSame(S.medium), 7)
    expect(state.gameOver).toBe(true)
    expect(turns).toBeGreaterThan(40)
    expect(state.placedPieces.length).toBe(turns)
  })

  it('returns null when the player has nothing left to play', () => {
    const state = createGame(COLORS)
    const stuck = { ...state.players[0], remainingPieceIds: [] }
    expect(chooseMove(state.board, stuck, ['yellow'], S.hard)).toBeNull()
  })

  it('opens on the start corner with a large piece', () => {
    const state = createGame(COLORS)
    const move = chooseMove(state.board, state.players[0], ['yellow', 'red', 'green'], S.hard)
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
        JSON.stringify(chooseMove(state.board, player, opponents, S.hard, seededRandom(seed))),
      ),
    )
    expect(hardPicks.size).toBeGreaterThan(1)

    const easyPicks = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        JSON.stringify(chooseMove(state.board, player, opponents, S.easy, seededRandom(seed))),
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
      const difficulties: Record<Color, Strength> =
        round % 2 === 0
          ? { blue: S.hard, yellow: S.easy, red: S.hard, green: S.easy }
          : { blue: S.easy, yellow: S.hard, red: S.easy, green: S.hard }

      const { state } = playGame(difficulties, (round + 1) * 97)
      const scores = finalizeScores(state)
      const best = (level: Strength) =>
        Math.max(...COLORS.filter((c) => difficulties[c] === level).map((c) => scores[c].score))

      margin += best(S.hard) - best(S.easy)
    }

    expect(margin / rounds).toBeGreaterThan(10)
  })

  it('leaves fewer squares unplayed on hard than on easy', () => {
    const hard = finalizeScores(playGame(allSame(S.hard), 31).state)
    const easy = finalizeScores(playGame(allSame(S.easy), 31).state)

    const avg = (s: ReturnType<typeof finalizeScores>) =>
      COLORS.reduce((sum, c) => sum + s[c].remainingSquares, 0) / COLORS.length

    expect(avg(hard)).toBeLessThan(avg(easy))
  })
})

describe('the strength scale', () => {
  const opponents: Color[] = ['yellow', 'red', 'green']

  it('puts the three measured levels at 0, a half and 1', () => {
    expect(S.easy).toBe(0)
    expect(S.medium).toBe(0.5)
    expect(S.hard).toBe(1)
  })

  /*
   * The weights are interpolated, and a non-finite strength would spread NaN
   * through every move score — at which point no score compares greater than
   * any other, nothing clears the acceptance threshold, and the search returns
   * undefined for a player who demonstrably has moves. Cheap to guard, and the
   * failure is a crash rather than a bad move.
   */
  it('still plays a legal move for a nonsense strength', () => {
    const state = createGame(COLORS)
    const nonsense = [NaN, Infinity, -Infinity, -1, 2, undefined as unknown as number]

    for (const strength of nonsense) {
      const move = chooseMove(state.board, state.players[0], opponents, strength)
      expect(move, `strength ${strength}`).not.toBeNull()
      expect(isMoveLegal(state.board, state.players[0], move!)).toBe(true)
    }
  })

  it('plays between easy and hard at the middle of the slider', () => {
    const avg = (s: ReturnType<typeof finalizeScores>) =>
      COLORS.reduce((sum, c) => sum + s[c].remainingSquares, 0) / COLORS.length

    const left = avg(finalizeScores(playGame(allSame(S.easy), 53).state))
    const middle = avg(finalizeScores(playGame(allSame(0.5), 53).state))
    const right = avg(finalizeScores(playGame(allSame(S.hard), 53).state))

    // Fewer squares left over is stronger play, so the middle should sit between.
    expect(middle).toBeLessThan(left)
    expect(middle).toBeGreaterThanOrEqual(right)
  })

  it('reads a strength off a setting saved when it was a difficulty word', () => {
    expect(readStrength('easy')).toBe(S.easy)
    expect(readStrength('medium')).toBe(S.medium)
    expect(readStrength('hard')).toBe(S.hard)
  })

  it('keeps a number it is given, clamped into range', () => {
    expect(readStrength(0.35)).toBe(0.35)
    expect(readStrength(-2)).toBe(0)
    expect(readStrength(7)).toBe(1)
  })

  it('falls back for a value it cannot read at all', () => {
    for (const junk of [null, undefined, '', 'impossible', NaN]) {
      expect(readStrength(junk, 0.5), `${junk}`).toBe(0.5)
    }
  })

  it('names the ends of the slider after the levels they are', () => {
    expect(strengthLabel(S.hard)).toBe('Hardest')
    expect(strengthLabel(S.medium)).toBe('Medium')
    expect(strengthLabel(S.easy)).toBe('Easiest')
  })
})

describe('chooseTimeoutMove', () => {
  const opponents: Color[] = ['yellow', 'red', 'green']

  it('plays a legal move', () => {
    const state = createGame(COLORS)
    const move = chooseTimeoutMove(state.board, state.players[0], opponents)

    expect(move).not.toBeNull()
    expect(isMoveLegal(state.board, state.players[0], move!)).toBe(true)
  })

  it('gives the same answer twice for the same position', () => {
    const state = createGame(COLORS)
    const first = chooseTimeoutMove(state.board, state.players[0], opponents)
    const second = chooseTimeoutMove(state.board, state.players[0], opponents)

    // The countdown re-renders constantly, so an unstable choice would mean the
    // piece being chosen for you kept changing as the clock ticked down.
    expect(first).toEqual(second)
  })

  it('keeps the piece you already had in hand', () => {
    const state = createGame(COLORS)
    const move = chooseTimeoutMove(state.board, state.players[0], opponents, 'tetromino-T')

    expect(move).not.toBeNull()
    expect(move!.pieceId).toBe('tetromino-T')
    expect(isMoveLegal(state.board, state.players[0], move!)).toBe(true)
  })

  it('falls back to another piece when that one has nowhere to go', () => {
    const state = createGame(COLORS)
    // A piece the player no longer holds has no legal placement by definition,
    // which is the same situation as one that is boxed in on a full board and
    // far easier to set up.
    const held: PieceId[] = ['monomino', 'domino', 'tromino-I']
    const player = { ...state.players[0], remainingPieceIds: held }
    const move = chooseTimeoutMove(state.board, player, opponents, 'pentomino-X')

    expect(move).not.toBeNull()
    expect(held).toContain(move!.pieceId)
    expect(isMoveLegal(state.board, player, move!)).toBe(true)
  })

  it('returns null when the player has nothing to play', () => {
    const state = createGame(COLORS)
    const stuck = { ...state.players[0], remainingPieceIds: [] }
    expect(chooseTimeoutMove(state.board, stuck, opponents)).toBeNull()
  })

  /**
   * The point of the mode. A player who lets the clock run out every turn must
   * do clearly worse than one who plays properly, or the timer is decoration.
   */
  it('loses to a player who actually chooses, by a clear margin', () => {
    const rounds = 4
    let margin = 0

    for (let round = 0; round < rounds; round++) {
      const random = seededRandom((round + 1) * 53)
      // Blue and red play hard; yellow and green never beat the clock.
      const timedOut: Color[] = round % 2 === 0 ? ['yellow', 'green'] : ['blue', 'red']
      let state: GameState = createGame(COLORS)
      let turns = 0

      while (!state.gameOver) {
        if (turns++ > 200) throw new Error('game did not terminate')
        const player = state.players[state.currentPlayerIndex]
        const others = state.players.filter((p) => p !== player).map((p) => p.color)

        const move = timedOut.includes(player.color)
          ? chooseTimeoutMove(state.board, player, others)
          : chooseMove(state.board, player, others, S.hard, random)

        expect(move).not.toBeNull()
        state = applyMove(state, move!)
      }

      const scores = finalizeScores(state)
      const best = (colors: Color[]) => Math.max(...colors.map((c) => scores[c].score))
      margin += best(COLORS.filter((c) => !timedOut.includes(c))) - best(timedOut)
    }

    expect(margin / rounds).toBeGreaterThan(5)
  })

  /**
   * The other half of the deal: it must not be so bad that the mode is a
   * formality. A median move should comfortably beat the worst legal move
   * available, which is what a genuinely random pick risks handing you.
   */
  it('is middling rather than terrible', () => {
    const state = createGame(COLORS)
    const move = chooseTimeoutMove(state.board, state.players[0], opponents)

    // The opening is a free choice of any piece on the corner, so a mediocre
    // move should still be spending real squares, not dumping the single.
    expect(pieceSize(move!.pieceId)).toBeGreaterThan(2)
  })
})
