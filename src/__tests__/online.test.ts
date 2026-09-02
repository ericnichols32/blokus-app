import { describe, expect, it, vi } from 'vitest'
import { chooseMove, COLORS, DIFFICULTY_STRENGTH as S } from '../game'
import type { Color, GameState } from '../game'
import {
  advanceComputers,
  assignSeats,
  colorsOf,
  colorToPlay,
  createOnlineGame,
  fillsFor,
  isYourTurn,
  acceptRematch,
  declineRematch,
  endByAgreement,
  listEntry,
  opponentsOf,
  proposeRematch,
  rematchAgreed,
  rematchAwaits,
  SeatingError,
  stateOf,
  submitMove,
  summarize,
  TurnError,
} from '../online'
import type { OnlineGame, Participant } from '../online'

vi.setConfig({ testTimeout: 60_000 })

const eric: Participant = { playerId: 'p-eric', username: 'eric' }
const dave: Participant = { playerId: 'p-dave', username: 'dave' }
const sam: Participant = { playerId: 'p-sam', username: 'sam' }
const jo: Participant = { playerId: 'p-jo', username: 'jo' }

/** A game whose opener is pinned, so a test can say whose turn it starts on. */
function gameOpeningOn(
  first: Color,
  participants: Participant[],
  fill: Parameters<typeof createOnlineGame>[1] = 'computer',
): OnlineGame {
  const index = COLORS.indexOf(first)
  return createOnlineGame(participants, fill, S.hard, new Date('2026-08-11T12:00:00Z'), () =>
    // Math.floor(x * 4) has to land on `index`, so aim at the middle of its band.
    (index + 0.5) / COLORS.length,
  )
}

/** Plays the game out by whatever means each seat allows, to a finished board. */
function playToEnd(game: OnlineGame): OnlineGame {
  let current = game
  let guard = 0

  while (!current.finished) {
    if (guard++ > 100) throw new Error('game did not finish')
    const state = stateOf(current)
    const color = colorToPlay(state)
    if (!color) break

    const seat = current.seats[color]
    if (seat.kind !== 'human' || !seat.playerId) break

    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, S.medium)
    if (!move) break

    current = submitMove(current, seat.playerId, move)
  }

  return current
}

describe('assignSeats', () => {
  it('gives four people a color each, in board order', () => {
    const seats = assignSeats([eric, dave, sam, jo], 'computer')

    expect(COLORS.map((c) => seats[c].username)).toEqual(['eric', 'dave', 'sam', 'jo'])
    expect(COLORS.every((c) => seats[c].kind === 'human')).toBe(true)
  })

  it('fills the spare seat with the computer for three people', () => {
    const seats = assignSeats([eric, dave, sam], 'computer', S.medium)
    const computers = COLORS.filter((c) => seats[c].kind === 'computer')

    expect(computers).toHaveLength(1)
    expect(seats[computers[0]].strength).toBe(S.medium)
    expect(seats[computers[0]].playerId).toBeUndefined()
  })

  it('gives two people two colors each, on opposite corners', () => {
    const seats = assignSeats([eric, dave], 'double')

    // Opposite corners, not adjacent: two adjacent starts would hand one player a
    // connected quarter of the board to grow from.
    expect(seats.blue.playerId).toBe('p-eric')
    expect(seats.red.playerId).toBe('p-eric')
    expect(seats.yellow.playerId).toBe('p-dave')
    expect(seats.green.playerId).toBe('p-dave')
    expect(COLORS.every((c) => seats[c].kind === 'human')).toBe(true)
  })

  it('seats two people against two computers when asked', () => {
    const seats = assignSeats([eric, dave], 'computer')

    expect(COLORS.filter((c) => seats[c].kind === 'human')).toHaveLength(2)
    expect(COLORS.filter((c) => seats[c].kind === 'computer')).toHaveLength(2)
  })

  it('refuses a table that cannot be seated', () => {
    expect(() => assignSeats([eric], 'computer')).toThrow(SeatingError)
    expect(() => assignSeats([eric, dave, sam, jo, eric], 'computer')).toThrow(SeatingError)
    // Two colors each needs exactly two people; three would need six colors.
    expect(() => assignSeats([eric, dave, sam], 'double')).toThrow(SeatingError)
  })
})

describe('fillsFor', () => {
  it('only offers two-colors-each to a pair', () => {
    expect(fillsFor(2)).toEqual(['double', 'computer'])
    expect(fillsFor(3)).toEqual(['computer'])
    expect(fillsFor(4)).toEqual(['computer'])
  })
})

describe('createOnlineGame', () => {
  it('lists each person once, even holding two colors', () => {
    const game = createOnlineGame([eric, dave], 'double')
    expect(game.playerIds.sort()).toEqual(['p-dave', 'p-eric'])
  })

  it('can open on any of the four colors', () => {
    const openers = new Set(
      Array.from({ length: 200 }, () => createOnlineGame([eric, dave, sam, jo], 'computer').firstColor),
    )
    expect(openers).toEqual(new Set(COLORS))
  })

  it('starts empty when a person opens', () => {
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])

    expect(game.moves).toEqual([])
    expect(isYourTurn(game, 'p-eric')).toBe(true)
  })

  it('plays the computer straight away when the draw opens on one', () => {
    // Otherwise nobody is on turn at all: no human has a legal action and the
    // computer has nothing to move it, so the game could never start.
    const game = gameOpeningOn('green', [eric, dave, sam])
    expect(game.seats.green.kind).toBe('computer')

    expect(game.moves).toHaveLength(1)
    expect(game.moves[0].color).toBe('green')
    // And the turn has come round to a person, so somebody can act.
    expect(COLORS.some((c) => isYourTurn(game, game.seats[c].playerId ?? ''))).toBe(true)
  })
})

describe('whose turn it is', () => {
  it('is nobody else’s when it is yours', () => {
    const game = gameOpeningOn('yellow', [eric, dave, sam, jo])

    expect(isYourTurn(game, 'p-dave')).toBe(true)
    expect(isYourTurn(game, 'p-eric')).toBe(false)
    expect(isYourTurn(game, 'p-sam')).toBe(false)
  })

  it('is yours for either of your colors in a two-color game', () => {
    const game = gameOpeningOn('red', [eric, dave], 'double')

    expect(colorsOf(game, 'p-eric')).toEqual(['blue', 'red'])
    // Red is eric's second color, so the draw landing there is still eric's turn.
    expect(isYourTurn(game, 'p-eric')).toBe(true)
  })

  it('is nobody’s once the game is over', () => {
    const finished = playToEnd(gameOpeningOn('blue', [eric, dave, sam, jo]))

    expect(finished.finished).toBe(true)
    expect(colorToPlay(stateOf(finished))).toBeNull()
    expect(finished.playerIds.every((id) => !isYourTurn(finished, id))).toBe(true)
  })
})

describe('opponentsOf', () => {
  it('lists the other people once each, skipping the computers', () => {
    const withBot = createOnlineGame([eric, dave, sam], 'computer')
    expect(opponentsOf(withBot, 'p-eric').map((p) => p.username).sort()).toEqual(['dave', 'sam'])

    const pair = createOnlineGame([eric, dave], 'double')
    expect(opponentsOf(pair, 'p-eric')).toEqual([dave])
  })
})

describe('submitMove', () => {
  function firstLegalMove(game: OnlineGame) {
    const state = stateOf(game)
    const color = colorToPlay(state)!
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
    return chooseMove(state.board, player, opponents, S.medium)!
  }

  it('records your move and passes the turn on', () => {
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    const after = submitMove(game, 'p-eric', firstLegalMove(game))

    expect(after.moves).toHaveLength(1)
    expect(after.moves[0].color).toBe('blue')
    expect(isYourTurn(after, 'p-eric')).toBe(false)
    expect(isYourTurn(after, 'p-dave')).toBe(true)
  })

  it('leaves the game it was given untouched', () => {
    // The caller writes the returned game to the store; mutating the original
    // would let a failed write leave the screen showing a move nobody has.
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    submitMove(game, 'p-eric', firstLegalMove(game))

    expect(game.moves).toEqual([])
  })

  it('plays the computers that follow, in the same write', () => {
    // Turn order runs blue, yellow, red, green, so with eric on blue and dave on
    // yellow the two computer seats come after dave. Nothing on a server will
    // move them, so dave's write has to carry them or the game stalls forever.
    const game = gameOpeningOn('blue', [eric, dave], 'computer')
    expect(game.seats.red.kind).toBe('computer')
    expect(game.seats.green.kind).toBe('computer')

    const afterEric = submitMove(game, 'p-eric', firstLegalMove(game))
    expect(afterEric.moves).toHaveLength(1)
    expect(isYourTurn(afterEric, 'p-dave')).toBe(true)

    const afterDave = submitMove(afterEric, 'p-dave', firstLegalMove(afterEric))

    // Dave's move, then both computers, and the turn is back with eric.
    expect(afterDave.moves).toHaveLength(4)
    expect(afterDave.moves.map((m) => m.color)).toEqual(['blue', 'yellow', 'red', 'green'])
    expect(isYourTurn(afterDave, 'p-eric')).toBe(true)
  })

  it('refuses a move from somebody whose turn it is not', () => {
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    expect(() => submitMove(game, 'p-dave', firstLegalMove(game))).toThrow(TurnError)
  })

  it('refuses a move onto a board that has moved on', () => {
    // The stale-screen case: two devices open, one moves, the other still shows
    // the old board and tries to play the square that is now taken.
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    const stale = firstLegalMove(game)
    const moved = submitMove(game, 'p-eric', stale)

    // Round the table back to eric, then replay the identical placement.
    let current = moved
    for (const id of ['p-dave', 'p-sam', 'p-jo']) {
      current = submitMove(current, id, firstLegalMove(current))
    }

    expect(isYourTurn(current, 'p-eric')).toBe(true)
    expect(() => submitMove(current, 'p-eric', stale)).toThrow()
  })

  it('refuses a move once the game has finished', () => {
    const finished = playToEnd(gameOpeningOn('blue', [eric, dave, sam, jo]))
    expect(() => submitMove(finished, 'p-eric', finished.moves[0])).toThrow(TurnError)
  })

  it('marks the game finished on the move that ends it', () => {
    const finished = playToEnd(gameOpeningOn('blue', [eric, dave, sam, jo]))

    expect(finished.finished).toBe(true)
    expect(stateOf(finished).gameOver).toBe(true)
  })

  it('moves the clock on, so the list can sort by it', () => {
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    const after = submitMove(game, 'p-eric', firstLegalMove(game), new Date('2026-08-12T09:00:00Z'))

    expect(after.updatedAt).toBe('2026-08-12T09:00:00.000Z')
    expect(after.createdAt).toBe(game.createdAt)
  })
})

describe('advanceComputers', () => {
  it('stops the moment a person is on turn', () => {
    const game = gameOpeningOn('blue', [eric, dave, sam, jo])
    // Every seat is human, so there is nothing for it to play.
    expect(advanceComputers(game, stateOf(game))).toEqual([])
  })
})

describe('the games list', () => {
  const base = new Date('2026-08-01T12:00:00Z')

  function stub(over: Partial<OnlineGame>): OnlineGame {
    return {
      ...createOnlineGame([eric, dave, sam, jo], 'computer', S.hard, base),
      ...over,
    }
  }

  it('describes what each game is waiting for', () => {
    const yours = gameOpeningOn('blue', [eric, dave, sam, jo])
    expect(summarize(yours, 'p-eric').status).toBe('Your turn')
    expect(summarize(yours, 'p-dave').status).toBe('Waiting on @eric')

    const finished = playToEnd(yours)
    expect(summarize(finished, 'p-eric').status).toBe('Finished')
  })

  it('takes a list row for a finished game without replaying it', () => {
    // The list trusts the stored flag so it doesn't rebuild every finished game
    // it shows. Nothing is written from that path, and opening the game replays
    // the moves properly — which is what the next test checks.
    const flagged = stub({ id: 'flagged', firstColor: 'blue', finished: true })

    const row = listEntry(flagged, 'p-eric')
    expect(row.finished).toBe(true)
    expect(row.yourTurn).toBe(false)
    expect(row.status).toBe('Finished')
  })

  it('opening a game reads the board, not the flag', () => {
    // So a flag set wrongly can misfile a game in the list but can never make a
    // live game unplayable.
    const live = stub({ firstColor: 'blue', finished: true })

    expect(summarize(live, 'p-eric').finished).toBe(false)
    expect(summarize(live, 'p-eric').yourTurn).toBe(true)
  })

  it('does believe a game everyone agreed to stop', () => {
    // The one thing the board cannot be asked about: an abandoned game still
    // has legal moves on it, and nothing in the position says it is over.
    const stopped = stub({ firstColor: 'blue', finished: true, abandoned: true })

    expect(summarize(stopped, 'p-eric').finished).toBe(true)
    expect(summarize(stopped, 'p-eric').yourTurn).toBe(false)
    expect(summarize(stopped, 'p-eric').status).toBe('Ended early')
  })
})

describe('a game rebuilt from its stored moves', () => {
  it('comes back exactly as it went in', () => {
    // This is the property the whole design rests on: the move list is the game,
    // so a document round-tripped through JSON has to rebuild the same board.
    const played = playToEnd(gameOpeningOn('red', [eric, dave, sam, jo]))
    const throughJson: OnlineGame = JSON.parse(JSON.stringify(played))

    const before: GameState = stateOf(played)
    const after: GameState = stateOf(throughJson)
    expect(after).toEqual(before)
  })
})


describe('proposing to stop a game and start another', () => {
  const everyone = gameOpeningOn('blue', [eric, dave, sam])

  it('counts the person who asked as having agreed', () => {
    // Asking is agreeing. Making the proposer accept their own proposal would
    // be a second tap that can only ever have one answer.
    const asked = proposeRematch(everyone, 'p-eric')
    expect(asked.rematch?.accepted).toEqual(['p-eric'])
    expect(rematchAwaits(asked, 'p-eric')).toBe(false)
    expect(rematchAwaits(asked, 'p-dave')).toBe(true)
  })

  it('needs everyone still in the game, not just one of them', () => {
    // The point of asking rather than just doing it: a game somebody is winning
    // should not end because the person losing wanted a fresh start.
    const asked = proposeRematch(everyone, 'p-eric')
    expect(rematchAgreed(asked)).toBe(false)

    const one = acceptRematch(asked, 'p-dave')
    expect(rematchAgreed(one)).toBe(false)

    const all = acceptRematch(one, 'p-sam')
    expect(rematchAgreed(all)).toBe(true)
  })

  it('does not ask the computers', () => {
    // Nothing is being taken away from them, and a seat that can never answer
    // would leave the proposal standing forever.
    const withBots = gameOpeningOn('blue', [eric, dave])
    expect(rematchAgreed(acceptRematch(proposeRematch(withBots, 'p-eric'), 'p-dave'))).toBe(true)
  })

  it('ignores somebody agreeing twice', () => {
    const asked = proposeRematch(everyone, 'p-eric')
    const twice = acceptRematch(acceptRematch(asked, 'p-dave'), 'p-dave')
    expect(twice.rematch?.accepted).toEqual(['p-eric', 'p-dave'])
    expect(rematchAgreed(twice)).toBe(false)
  })

  it('clears the proposal when anyone says keep playing', () => {
    const asked = proposeRematch(everyone, 'p-eric')
    // null rather than undefined, so it is written over the stored one instead
    // of being dropped from the document and leaving the old value in place.
    expect(declineRematch(asked).rematch).toBeNull()
    expect(rematchAgreed(declineRematch(asked))).toBe(false)
  })

  it('refuses to end a game everyone has not agreed to end', () => {
    const asked = proposeRematch(everyone, 'p-eric')
    expect(() => endByAgreement(asked)).toThrow(TurnError)
  })

  it('ends the game once they have, without a result', () => {
    // Abandoned, not finished-and-scored: nobody played it out, so there is no
    // winner and nothing that should reach anybody's stats.
    const all = acceptRematch(acceptRematch(proposeRematch(everyone, 'p-eric'), 'p-dave'), 'p-sam')
    const over = endByAgreement(all)

    expect(over.finished).toBe(true)
    expect(over.abandoned).toBe(true)
    expect(over.rematch).toBeNull()
    expect(summarize(over, 'p-eric').yourTurn).toBe(false)
  })

  it('will not start a proposal on a game that is already over', () => {
    expect(() => proposeRematch({ ...everyone, finished: true }, 'p-eric')).toThrow(TurnError)
  })
})
