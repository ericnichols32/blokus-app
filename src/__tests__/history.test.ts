import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMove, chooseMove, COLORS, DIFFICULTY_STRENGTH as S } from '../game'
import type { GameState } from '../game'
import { clearHistory, loadHistory, recordFinishedGame, summarise } from '../history'
import { createSolo } from '../session'
import type { Session } from '../session'

vi.setConfig({ testTimeout: 60_000 })

// The tests run in node, which has no localStorage. A plain map is enough:
// the module only ever reads, writes and removes one key.
function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

/** Plays a session out to the end with the AI driving every seat. */
function playToEnd(session: Session): Session {
  let state: GameState = session.state
  let guard = 0

  while (!state.gameOver) {
    if (guard++ > 200) throw new Error('game did not finish')
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p !== player).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, S.hard)
    if (!move) break
    state = applyMove(state, move)
  }

  return { ...session, state }
}

let storage: Map<string, string>

beforeEach(() => {
  storage = installStorage()
})

describe('recordFinishedGame', () => {
  it('ignores a game still in progress', () => {
    expect(recordFinishedGame(createSolo('blue', S.hard))).toBeNull()
    expect(loadHistory()).toEqual([])
  })

  it('records a finished game', () => {
    const finished = playToEnd(createSolo('blue', S.hard))
    const record = recordFinishedGame(finished)

    expect(record).not.toBeNull()
    expect(loadHistory()).toHaveLength(1)
    expect(loadHistory()[0].id).toBe(finished.id)
  })

  it('will not record the same game twice', () => {
    // The effect that calls this re-runs on every reload while a finished game
    // is still loaded, so this is the property that stops history inflating.
    const finished = playToEnd(createSolo('blue', S.hard))

    expect(recordFinishedGame(finished)).not.toBeNull()
    expect(recordFinishedGame(finished)).toBeNull()
    expect(recordFinishedGame(finished)).toBeNull()
    expect(loadHistory()).toHaveLength(1)
  })

  it('records a second, different game alongside the first', () => {
    recordFinishedGame(playToEnd(createSolo('blue', S.hard)))
    recordFinishedGame(playToEnd(createSolo('red', S.easy)))

    const history = loadHistory()
    expect(history).toHaveLength(2)
    expect(new Set(history.map((r) => r.id)).size).toBe(2)
  })

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {},
    })

    const finished = playToEnd(createSolo('blue', S.hard))
    expect(() => recordFinishedGame(finished)).not.toThrow()
    expect(loadHistory()).toEqual([])
  })
})

describe('summarise', () => {
  it('captures everything the asked-for stats need', () => {
    const finished = playToEnd(createSolo('green', S.medium))
    const record = summarise(finished, new Date('2026-08-10T12:00:00Z'))

    expect(record.mode).toBe('solo')
    expect(record.yourColor).toBe('green')
    expect(record.strength).toBe(S.medium)
    expect(record.finishedAt).toBe('2026-08-10T12:00:00.000Z')
    expect(record.movesPlayed).toBe(finished.state.placedPieces.length)
    expect(record.players).toHaveLength(4)

    for (const player of record.players) {
      expect(COLORS).toContain(player.color)
      expect(player.rank).toBeGreaterThanOrEqual(1)
      expect(player.rank).toBeLessThanOrEqual(4)
      // Score is minus one per unplayed square, before any bonus.
      expect(player.score).toBeLessThanOrEqual(-player.remainingSquares + 20)
    }

    // Exactly one human seat in a solo game.
    expect(record.players.filter((p) => p.seat === 'human')).toHaveLength(1)
  })

  it('lets you work out which pieces were played', () => {
    const finished = playToEnd(createSolo('blue', S.hard))
    const record = summarise(finished)

    for (const player of record.players) {
      const actual = finished.state.players.find((p) => p.color === player.color)!
      expect(player.piecesLeft).toEqual(actual.remainingPieceIds)
      // 21 pieces in a set, so what is left tells you what went down.
      expect(21 - player.piecesLeft.length).toBeGreaterThan(0)
    }
  })

  it('gives players on equal scores the same rank', () => {
    const finished = playToEnd(createSolo('blue', S.hard))
    const record = summarise(finished)

    const byScore = new Map<number, number[]>()
    for (const p of record.players) {
      byScore.set(p.score, [...(byScore.get(p.score) ?? []), p.rank])
    }
    for (const ranks of byScore.values()) {
      expect(new Set(ranks).size).toBe(1)
    }

    // The best score always ranks first.
    const best = Math.max(...record.players.map((p) => p.score))
    expect(record.players.find((p) => p.score === best)!.rank).toBe(1)
  })
})

describe('loadHistory', () => {
  it('returns nothing when there is no history', () => {
    expect(loadHistory()).toEqual([])
  })

  it('ignores stored junk rather than throwing', () => {
    storage.set('blokus:history:v1', 'not json at all')
    expect(loadHistory()).toEqual([])

    storage.set('blokus:history:v1', '{"not":"an array"}')
    expect(loadHistory()).toEqual([])
  })

  it('drops records too damaged to count', () => {
    storage.set(
      'blokus:history:v1',
      JSON.stringify([
        { id: 'ok', players: [{ color: 'blue' }] },
        { players: [{ color: 'blue' }] },
        { id: 'no-players', players: [] },
        null,
      ]),
    )

    const history = loadHistory()
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe('ok')
  })
})

describe('the stored history is capped', () => {
  it('drops the oldest games once past the limit', () => {
    // Fabricated rather than played out, since the cap is about the store, not
    // the games. Only the shape loadHistory checks for has to be right.
    const existing = Array.from({ length: 500 }, (_, i) => ({
      id: `old-${i}`,
      players: [{ color: 'blue' }],
    }))
    storage.set('blokus:history:v1', JSON.stringify(existing))

    recordFinishedGame(playToEnd(createSolo('blue', S.hard)))

    const history = loadHistory()
    expect(history).toHaveLength(500)
    // The very oldest is gone and the new one is on the end.
    expect(history.some((r) => r.id === 'old-0')).toBe(false)
    expect(history[0].id).toBe('old-1')
    expect(history[history.length - 1].players).toHaveLength(4)
  })
})

describe('clearHistory', () => {
  it('empties the history', () => {
    recordFinishedGame(playToEnd(createSolo('blue', S.hard)))
    expect(loadHistory()).toHaveLength(1)

    clearHistory()
    expect(loadHistory()).toEqual([])
  })
})
