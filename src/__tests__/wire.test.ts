import { describe, expect, it, vi } from 'vitest'
import { chooseMove, DIFFICULTY_STRENGTH as S } from '../game'
import { fromStored, hasNestedArray, toStored } from '../backend/wire'
import { colorToPlay, createOnlineGame, stateOf, submitMove } from '../online'
import type { OnlineGame, Participant } from '../online'

vi.setConfig({ testTimeout: 60_000 })

const eric: Participant = { playerId: 'p-eric', username: 'eric' }
const dave: Participant = { playerId: 'p-dave', username: 'dave' }

/** A game with real moves in it, which is the only interesting case here. */
function playedGame(moveCount: number): OnlineGame {
  let game = createOnlineGame([eric, dave], 'double', S.hard)
  for (let i = 0; i < moveCount; i++) {
    const state = stateOf(game)
    const color = colorToPlay(state)
    if (!color) break
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, S.medium)
    if (!move) break
    game = submitMove(game, game.seats[color].playerId!, move)
  }
  return game
}

describe('hasNestedArray', () => {
  it('finds an array inside an array, however deep it is buried', () => {
    expect(hasNestedArray([[0, 0]])).toBe(true)
    expect(hasNestedArray({ moves: [{ cells: [[1, 2]] }] })).toBe(true)
    expect(hasNestedArray({ a: { b: { c: [['x']] } } })).toBe(true)
  })

  it('passes anything Firestore would accept', () => {
    expect(hasNestedArray({ ids: ['a', 'b'], n: 1, nested: { k: 'v' } })).toBe(false)
    expect(hasNestedArray([{ a: 1 }, { a: 2 }])).toBe(false)
    expect(hasNestedArray([])).toBe(false)
    expect(hasNestedArray(null)).toBe(false)
  })
})

describe('what gets written to Firestore', () => {
  it('contains no nested arrays, whatever is in the game', () => {
    // The check that would have caught this before it reached a phone. Firestore
    // rejects an array inside an array outright — "Nested arrays are not
    // allowed" — and a move's cells are exactly that. It is invisible in the
    // types, since Point[] is a perfectly ordinary TypeScript type.
    const game = playedGame(6)
    expect(game.moves.length).toBeGreaterThan(0)

    // The unencoded game is the shape that fails, which is what makes the
    // encoded one worth asserting.
    expect(hasNestedArray(game)).toBe(true)
    expect(hasNestedArray(toStored(game))).toBe(false)
  })

  it('is still free of nested arrays for a game nobody has moved in', () => {
    expect(hasNestedArray(toStored(createOnlineGame([eric, dave], 'double', S.hard)))).toBe(false)
  })

  it('writes each cell as "col,row"', () => {
    const game = playedGame(1)
    const stored = toStored(game)

    expect(stored.moves[0].cells.every((c) => typeof c === 'string')).toBe(true)
    expect(stored.moves[0].cells[0]).toMatch(/^\d+,\d+$/)
  })
})

describe('the round trip', () => {
  it('brings a game back exactly as it went in', () => {
    const game = playedGame(8)
    // Through JSON as well, since that is what actually crosses the wire.
    const backAgain = fromStored(JSON.parse(JSON.stringify(toStored(game))))

    expect(backAgain).toEqual(game)
    // And the rebuilt board matches, which is the property that matters.
    expect(stateOf(backAgain)).toEqual(stateOf(game))
  })

  it('reads a game written before cells were encoded', () => {
    // Those documents only ever had empty move lists — the first real move was
    // what failed — but a pair that slipped through must still decode.
    const game = playedGame(2)
    const legacy = JSON.parse(JSON.stringify(game))

    expect(fromStored(legacy)).toEqual(game)
  })

  it('survives a document with no moves field at all', () => {
    const game = playedGame(0)
    const damaged = { ...toStored(game), moves: undefined } as never

    expect(fromStored(damaged).moves).toEqual([])
  })
})
