import { describe, expect, it, vi } from 'vitest'
import { chooseMove } from '../ai'
import { applyMove, createGame, replayMoves } from '../engine'
import type { GameState } from '../engine'
import { COLORS } from '../types'

// Replaying a game means re-running every move through the engine, so the
// fixtures here play out real games rather than toy sequences.
vi.setConfig({ testTimeout: 60_000 })

/** Plays `moves` AI moves, or to the end of the game, whichever comes first. */
function playUpTo(moves: number): GameState[] {
  const history: GameState[] = [createGame(COLORS)]
  let state = history[0]

  while (!state.gameOver && history.length <= moves) {
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p !== player).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, 'hard')
    if (!move) break
    state = applyMove(state, move)
    history.push(state)
  }

  return history
}

describe('replayMoves', () => {
  it('reproduces the exact state at every point in a game', () => {
    const history = playUpTo(30)
    expect(history.length).toBeGreaterThan(20)

    history.forEach((expected, i) => {
      const rebuilt = replayMoves(COLORS, expected.placedPieces)
      // Whole-state equality, so a drift in passedOut or whose turn it is
      // fails here rather than surfacing as a confusing board later.
      expect(rebuilt).toEqual(expected)
      expect(rebuilt.placedPieces).toHaveLength(i)
    })
  })

  it('rebuilds an empty game from no moves', () => {
    expect(replayMoves(COLORS, [])).toEqual(createGame(COLORS))
  })

  it('reproduces a finished game, including who passed out', () => {
    const history = playUpTo(Infinity)
    const final = history[history.length - 1]
    expect(final.gameOver).toBe(true)
    expect(final.players.some((p) => p.passedOut)).toBe(true)

    expect(replayMoves(COLORS, final.placedPieces)).toEqual(final)
  })

  it('rejects a move list that contradicts turn order', () => {
    const history = playUpTo(6)
    const moves = history[history.length - 1].placedPieces
    const swapped = [moves[1], moves[0], ...moves.slice(2)]

    expect(() => replayMoves(COLORS, swapped)).toThrow(/diverged at move 0/)
  })

  it('is fast enough to run on every undo', () => {
    const final = playUpTo(Infinity).pop()!
    const start = performance.now()
    for (let i = 0; i < 10; i++) replayMoves(COLORS, final.placedPieces)
    const perReplay = (performance.now() - start) / 10

    // A full game is the worst case; undo has to feel instant.
    expect(perReplay).toBeLessThan(150)
  })
})
