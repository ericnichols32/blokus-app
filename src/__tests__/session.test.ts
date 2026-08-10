import { describe, expect, it, vi } from 'vitest'
import { chooseMove } from '../game'
import { applyMove } from '../game'
import type { GameState } from '../game'
import { canUndo, createPassAndPlay, createSolo, undo } from '../session'
import type { Session } from '../session'

vi.setConfig({ testTimeout: 60_000 })

/** Plays `count` moves into a session using the AI for every seat. */
function play(session: Session, count: number): Session {
  let state: GameState = session.state

  for (let i = 0; i < count && !state.gameOver; i++) {
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p !== player).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, 'medium')
    if (!move) break
    state = applyMove(state, move)
  }

  return { ...session, state }
}

describe('undo', () => {
  it('has nothing to take back before you have moved', () => {
    expect(canUndo(createSolo('blue', 'medium'))).toBe(false)
    expect(canUndo(createPassAndPlay())).toBe(false)
  })

  it('leaves a session with no moves untouched', () => {
    const fresh = createSolo('blue', 'medium')
    expect(undo(fresh)).toEqual(fresh)
  })

  it('in solo, rewinds past the computers back to your own turn', () => {
    // Blue is the human, so a full round is: you, then three computers.
    const played = play(createSolo('blue', 'medium'), 8)
    expect(played.state.placedPieces).toHaveLength(8)

    const rewound = undo(played)

    // Back to just before your second move — the first round survives.
    expect(rewound.state.placedPieces).toHaveLength(4)
    expect(rewound.state.players[rewound.state.currentPlayerIndex].color).toBe('blue')
    // The piece you took back is available again.
    const blue = rewound.state.players.find((p) => p.color === 'blue')!
    expect(blue.remainingPieceIds).toContain(played.state.placedPieces[4].pieceId)
  })

  it('in solo, undoing your only move empties the board', () => {
    const played = play(createSolo('blue', 'medium'), 4)
    const rewound = undo(played)

    expect(rewound.state.placedPieces).toHaveLength(0)
    expect(rewound.state.board.flat().filter(Boolean)).toHaveLength(0)
    expect(canUndo(rewound)).toBe(false)
  })

  it('rewinds to your own move even when you are not the first player', () => {
    // Green moves last, so its first move is the 4th of the game.
    const played = play(createSolo('green', 'medium'), 6)
    const rewound = undo(played)

    expect(rewound.state.placedPieces).toHaveLength(3)
    expect(rewound.state.players[rewound.state.currentPlayerIndex].color).toBe('green')
  })

  it('in pass and play, takes back a single move', () => {
    // Every seat is human, so your own last move is simply the last one played.
    const played = play(createPassAndPlay(), 6)
    const rewound = undo(played)

    expect(rewound.state.placedPieces).toHaveLength(5)
    expect(rewound.state.players[rewound.state.currentPlayerIndex].color).toBe(
      played.state.placedPieces[5].color,
    )
  })

  it('can be applied repeatedly, unwinding the game move by move', () => {
    let session = play(createPassAndPlay(), 6)

    for (let expected = 5; expected >= 0; expected--) {
      session = undo(session)
      expect(session.state.placedPieces).toHaveLength(expected)
    }

    expect(canUndo(session)).toBe(false)
  })
})
