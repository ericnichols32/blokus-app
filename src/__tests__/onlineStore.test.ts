import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseMove, DIFFICULTY_STRENGTH as S } from '../game'
import { createLocalBackend } from '../backend/local'
import { StaleGameError } from '../backend/types'
import type { Backend } from '../backend/types'
import { colorToPlay, createOnlineGame, stateOf, submitMove } from '../online'
import type { OnlineGame, Participant } from '../online'

vi.setConfig({ testTimeout: 60_000 })

const eric: Participant = { playerId: 'p-eric', username: 'eric' }
const dave: Participant = { playerId: 'p-dave', username: 'dave' }
const sam: Participant = { playerId: 'p-sam', username: 'sam' }

function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

/** Whatever the seat on turn would legally play. */
function legalMove(game: OnlineGame) {
  const state = stateOf(game)
  const color = colorToPlay(state)!
  const player = state.players[state.currentPlayerIndex]
  const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
  return chooseMove(state.board, player, opponents, S.medium)!
}

/** The playerId whose turn it is. */
function onTurn(game: OnlineGame): string {
  const color = colorToPlay(stateOf(game))!
  return game.seats[color].playerId!
}

let backend: Backend

beforeEach(() => {
  installStorage()
  backend = createLocalBackend()
})

describe('storing an online game', () => {
  it('comes back the same as it went in', async () => {
    const game = createOnlineGame([eric, dave, sam], 'computer')
    await backend.createOnlineGame(game)

    expect(await backend.getOnlineGame(game.id)).toEqual(game)
  })

  it('is null when the store has never seen it', async () => {
    expect(await backend.getOnlineGame('nope')).toBeNull()
  })

  it('survives storage being unavailable rather than throwing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    })

    const game = createOnlineGame([eric, dave], 'computer')
    await expect(backend.createOnlineGame(game)).resolves.toBeUndefined()
    expect(await backend.getOnlineGame(game.id)).toBeNull()
  })

  it('ignores stored junk rather than failing every read after it', async () => {
    localStorage.setItem('blokus:local-backend:online:v1', '{"not":"an array"}')
    expect(await backend.listOnlineGames('p-eric')).toEqual([])

    localStorage.setItem(
      'blokus:local-backend:online:v1',
      JSON.stringify([null, { id: 'no-moves' }, { id: 'ok', moves: [], playerIds: ['p-eric'] }]),
    )
    const games = await backend.listOnlineGames('p-eric')
    expect(games.map((g) => g.id)).toEqual(['ok'])
  })
})

describe('listing a player’s games', () => {
  it('returns only the games that player is seated in', async () => {
    const theirs = createOnlineGame([eric, dave], 'computer')
    const someoneElses = createOnlineGame([dave, sam], 'computer')
    await backend.createOnlineGame(theirs)
    await backend.createOnlineGame(someoneElses)

    expect((await backend.listOnlineGames('p-eric')).map((g) => g.id)).toEqual([theirs.id])
    expect((await backend.listOnlineGames('p-dave')).map((g) => g.id).sort()).toEqual(
      [theirs.id, someoneElses.id].sort(),
    )
  })

  it('finds a game for somebody holding two colors', async () => {
    const pair = createOnlineGame([eric, dave], 'double')
    await backend.createOnlineGame(pair)

    expect((await backend.listOnlineGames('p-dave')).map((g) => g.id)).toEqual([pair.id])
  })
})

describe('submitting a turn', () => {
  it('replaces the stored game rather than adding a second copy', async () => {
    const game = createOnlineGame([eric, dave, sam], 'computer')
    await backend.createOnlineGame(game)

    const played = submitMove(game, onTurn(game), legalMove(game))
    await backend.submitOnlineTurn(played, game.moves.length)

    const all = await backend.listOnlineGames(onTurn(game))
    expect(all.filter((g) => g.id === game.id)).toHaveLength(1)
    expect((await backend.getOnlineGame(game.id))?.moves.length).toBe(played.moves.length)
  })

  it('refuses a turn written against a board that has moved on', async () => {
    // The real case this guards: two friends both have the game open, one moves,
    // and the other's screen is now a turn behind. Without the check, the second
    // write would erase the first one's move.
    const game = createOnlineGame([eric, dave, sam], 'computer')
    await backend.createOnlineGame(game)

    // Not a hardcoded zero: a game whose draw opened on the computer already
    // carries that move, so what the caller "believed" is whatever it was given.
    const opening = game.moves.length
    const first = submitMove(game, onTurn(game), legalMove(game))
    await backend.submitOnlineTurn(first, opening)

    // A second write still claiming the board it was handed at the start.
    const stale = submitMove(game, onTurn(game), legalMove(game))
    await expect(backend.submitOnlineTurn(stale, opening)).rejects.toThrow(StaleGameError)

    // And the turn that landed first is still there, untouched.
    expect((await backend.getOnlineGame(game.id))?.moves).toEqual(first.moves)
  })

  it('accepts a turn once the caller has caught up', async () => {
    const game = createOnlineGame([eric, dave, sam], 'computer')
    await backend.createOnlineGame(game)

    const first = submitMove(game, onTurn(game), legalMove(game))
    await backend.submitOnlineTurn(first, game.moves.length)

    // Re-read, as the app does after a stale write, and play from there.
    const fresh = (await backend.getOnlineGame(game.id))!
    const second = submitMove(fresh, onTurn(fresh), legalMove(fresh))

    await expect(backend.submitOnlineTurn(second, fresh.moves.length)).resolves.toBeUndefined()
    expect((await backend.getOnlineGame(game.id))?.moves.length).toBe(second.moves.length)
  })
})
