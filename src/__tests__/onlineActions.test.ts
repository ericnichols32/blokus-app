import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBackend } from '../backend'
import { createLocalBackend } from '../backend/local'
import { StaleGameError } from '../backend/types'
import { chooseMove, DIFFICULTY_STRENGTH as S } from '../game'
import { loadHistory } from '../history'
import { colorToPlay, createOnlineGame, stateOf, submitMove } from '../online'
import type { OnlineGame } from '../online'
import {
  OnlineError,
  StaleTurnError,
  describePlayers,
  loadGames,
  recordIfFinished,
  refreshGame,
  resolveParticipants,
  sessionFor,
  startGame,
  takeTurn,
} from '../onlineActions'
import { stubBackend } from './helpers/backendStub'
import type { Account } from '../account'

vi.setConfig({ testTimeout: 60_000 })

const me: Account = { playerId: 'p-eric', username: 'eric' }

function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

/** Registers names in the local store, as claiming them would. */
async function register(...usernames: string[]) {
  const backend = createLocalBackend()
  for (const username of usernames) {
    await backend.claimUsername(`p-${username}`, username)
  }
}

function legalMove(game: OnlineGame) {
  const state = stateOf(game)
  const color = colorToPlay(state)!
  const player = state.players[state.currentPlayerIndex]
  const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
  return chooseMove(state.board, player, opponents, S.medium)!
}

function onTurn(game: OnlineGame): string {
  return game.seats[colorToPlay(stateOf(game))!].playerId!
}

beforeEach(async () => {
  installStorage()
  resetBackend(createLocalBackend())
  await register('eric', 'dave', 'sam')
})

describe('resolveParticipants', () => {
  it('puts you first and looks the rest up', async () => {
    const people = await resolveParticipants(me, ['dave', 'sam'])

    expect(people.map((p) => p.username)).toEqual(['eric', 'dave', 'sam'])
    expect(people[1].playerId).toBe('p-dave')
  })

  it('keeps the capitalisation the owner claimed, not what you typed', async () => {
    await createLocalBackend().claimUsername('p-Jo', 'Jo')
    const people = await resolveParticipants(me, ['jo'])

    expect(people[1].username).toBe('Jo')
  })

  it('refuses a name nobody has claimed, and says what to do', async () => {
    // Otherwise the game sits in the list forever, waiting for a turn from a
    // player who cannot exist.
    await expect(resolveParticipants(me, ['nobody'])).rejects.toThrow(/Nobody is called @nobody/)
  })

  it('refuses to seat the same person twice', async () => {
    await expect(resolveParticipants(me, ['dave', 'DAVE'])).rejects.toThrow(/twice/)
  })

  it('refuses to seat you against yourself', async () => {
    await expect(resolveParticipants(me, ['Eric'])).rejects.toThrow(/already in the game/)
  })

  it('needs at least one friend', async () => {
    await expect(resolveParticipants(me, [])).rejects.toThrow(/at least one friend/)
    await expect(resolveParticipants(me, ['  '])).rejects.toThrow(/at least one friend/)
  })

  it('tells a refusal apart from a dropped connection', async () => {
    // Opposite responses: waiting fixes one and never fixes the other. Told
    // apart because collapsing both into "try again" sent somebody round a loop
    // retrying a write the security rules were never going to allow.
    resetBackend(
      stubBackend({
        lookupUsername: () =>
          Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), {
            code: 'permission-denied',
          })),
      }),
    )
    await expect(resolveParticipants(me, ['dave'])).rejects.toThrow(/rules may not be published/)
  })

  it('says the server is unreachable rather than that the name is wrong', async () => {
    // Two very different problems, and telling a player their friend doesn't
    // exist when the connection dropped would send them chasing the wrong thing.
    resetBackend(stubBackend({ lookupUsername: () => Promise.reject(new Error('offline')) }))

    await expect(resolveParticipants(me, ['dave'])).rejects.toThrow(/Couldn't reach the server/)
  })
})

describe('startGame', () => {
  it('stores a game both people can find', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)

    expect((await loadGames('p-eric')).map((e) => e.game.id)).toEqual([game.id])
    expect((await loadGames('p-dave')).map((e) => e.game.id)).toEqual([game.id])
  })

  it('seats two colors each when asked', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)
    expect(game.seats.blue.playerId).toBe('p-eric')
    expect(game.seats.red.playerId).toBe('p-eric')
  })

  it('seats the computer in the spare places when asked', async () => {
    const game = await startGame(me, ['dave'], 'computer', S.medium)
    expect(game.seats.red.kind).toBe('computer')
    expect(game.seats.red.strength).toBe(S.medium)
  })

  it('names the cause when the database refuses the write', async () => {
    // Exactly what happened on the real project: the rule for the new collection
    // existed in the repo but had never been published, so every write was
    // refused while every read worked.
    resetBackend(
      stubBackend({
        lookupUsername: () => Promise.resolve({ playerId: 'p-dave', username: 'dave', createdAt: '' }),
        createOnlineGame: () =>
          Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), {
            code: 'permission-denied',
          })),
      }),
    )

    await expect(startGame(me, ['dave'], 'double', S.hard)).rejects.toThrow(/rules need publishing/)
  })

  it('does not leave a half-made game behind when the write fails', async () => {
    resetBackend(
      stubBackend({
        lookupUsername: () => Promise.resolve({ playerId: 'p-dave', username: 'dave', createdAt: '' }),
        createOnlineGame: () => Promise.reject(new Error('nope')),
        listOnlineGames: () => Promise.resolve([]),
      }),
    )

    await expect(startGame(me, ['dave'], 'double', S.hard)).rejects.toThrow(OnlineError)
    expect(await loadGames('p-eric')).toEqual([])
  })
})

describe('takeTurn', () => {
  it('writes the move and hands back the new board', async () => {
    const game = await startGame(me, ['dave', 'sam'], 'computer', S.hard)
    const player = onTurn(game)

    const after = await takeTurn(game, player, legalMove(game))

    expect(after.moves.length).toBe(game.moves.length + 1)
    expect((await refreshGame(game.id)).moves.length).toBe(after.moves.length)
  })

  it('refuses a stale turn and brings back the board that won', async () => {
    const game = await startGame(me, ['dave', 'sam'], 'computer', S.hard)

    // Somebody else's device gets its turn in first.
    const theirs = submitMove(game, onTurn(game), legalMove(game))
    await createLocalBackend().submitOnlineTurn(theirs, game.moves.length)

    // This screen is still showing the older board.
    let caught: unknown
    try {
      await takeTurn(game, onTurn(game), legalMove(game))
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(StaleTurnError)
    expect((caught as StaleTurnError).latest?.moves).toEqual(theirs.moves)
    // And the turn that landed first is intact.
    expect((await refreshGame(game.id)).moves).toEqual(theirs.moves)
  })

  it('reports a failed write in words, not as a raw error', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)
    resetBackend(
      stubBackend({ submitOnlineTurn: () => Promise.reject(new Error('network went away')) }),
    )

    await expect(takeTurn(game, onTurn(game), legalMove(game))).rejects.toThrow(
      /Couldn't save your move/,
    )
  })
})

describe('sessionFor', () => {
  it('says which seat is yours, so the board faces you', async () => {
    const game = await startGame(me, ['dave', 'sam'], 'computer', S.hard)

    expect(sessionFor(game, 'p-dave').youAre).toBe('yellow')
    expect(sessionFor(game, 'p-eric').youAre).toBe('blue')
    // Never a clock: the next turn might be tomorrow.
    expect(sessionFor(game, 'p-eric').timed).toBe(false)
    expect(sessionFor(game, 'p-eric').mode).toBe('online')
  })

  it('gives a two-color player their first color', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)
    expect(sessionFor(game, 'p-dave').youAre).toBe('yellow')
  })
})

describe('recordIfFinished', () => {
  /** Plays a whole game out through the store, as the two devices would. */
  async function finish(game: OnlineGame): Promise<OnlineGame> {
    let current = game
    let guard = 0
    while (!current.finished) {
      if (guard++ > 100) throw new Error('game did not finish')
      current = await takeTurn(current, onTurn(current), legalMove(current))
    }
    return current
  }

  it('files nothing while the game is still going', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)

    expect(recordIfFinished(game, 'p-eric')).toBeNull()
    expect(loadHistory()).toEqual([])
  })

  it('files a finished game under your own seat', async () => {
    const done = await finish(await startGame(me, ['dave'], 'double', S.hard))

    const record = recordIfFinished(done, 'p-dave')
    expect(record).not.toBeNull()
    // Dave's own seat, not the first human seat in the game — which is eric's.
    expect(record?.yourColor).toBe('yellow')
    expect(record?.mode).toBe('online')
    expect(loadHistory()).toHaveLength(1)
  })

  it('files it once however many times the game is opened', async () => {
    const done = await finish(await startGame(me, ['dave'], 'double', S.hard))

    expect(recordIfFinished(done, 'p-eric')).not.toBeNull()
    expect(recordIfFinished(done, 'p-eric')).toBeNull()
    expect(recordIfFinished(done, 'p-eric')).toBeNull()
    expect(loadHistory()).toHaveLength(1)
  })

  it('files nothing for somebody who is not in the game', async () => {
    const done = await finish(await startGame(me, ['dave'], 'double', S.hard))

    expect(recordIfFinished(done, 'p-stranger')).toBeNull()
    expect(loadHistory()).toEqual([])
  })
})

describe('describePlayers', () => {
  it('names the others, and counts the computers', async () => {
    const four = createOnlineGame(
      [
        { playerId: 'p-eric', username: 'eric' },
        { playerId: 'p-dave', username: 'dave' },
        { playerId: 'p-sam', username: 'sam' },
        { playerId: 'p-jo', username: 'jo' },
      ],
      'computer',
    )
    expect(describePlayers(four, 'p-eric')).toBe('@dave, @sam and @jo')

    const withBots = createOnlineGame(
      [
        { playerId: 'p-eric', username: 'eric' },
        { playerId: 'p-dave', username: 'dave' },
      ],
      'computer',
    )
    expect(describePlayers(withBots, 'p-eric')).toBe('@dave and 2 computers')
  })

  it('says when you are each playing two colors', async () => {
    const pair = createOnlineGame(
      [
        { playerId: 'p-eric', username: 'eric' },
        { playerId: 'p-dave', username: 'dave' },
      ],
      'double',
    )
    expect(describePlayers(pair, 'p-eric')).toBe('@dave · two colors each')
  })
})

describe('refreshGame', () => {
  it('says so plainly when the game has gone', async () => {
    await expect(refreshGame('never-existed')).rejects.toThrow(/no longer there/)
  })

  it('turns a dead connection into something a player can act on', async () => {
    resetBackend(stubBackend({ getOnlineGame: () => Promise.reject(new Error('offline')) }))
    await expect(refreshGame('any')).rejects.toThrow(/Check your connection/)
  })
})

describe('loadGames', () => {
  it('reports a failure rather than showing an empty list', async () => {
    // An empty list and a broken connection look identical on screen, and one of
    // them means "your games are gone".
    resetBackend(stubBackend({ listOnlineGames: () => Promise.reject(new Error('offline')) }))
    await expect(loadGames('p-eric')).rejects.toThrow(OnlineError)
  })
})

describe('the stale check itself', () => {
  it('is what stops two devices erasing each other', async () => {
    const game = await startGame(me, ['dave'], 'double', S.hard)
    const first = submitMove(game, onTurn(game), legalMove(game))
    await createLocalBackend().submitOnlineTurn(first, game.moves.length)

    await expect(
      createLocalBackend().submitOnlineTurn(first, game.moves.length),
    ).rejects.toThrow(StaleGameError)
  })
})
