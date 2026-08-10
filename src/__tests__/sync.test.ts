import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBackend } from '../backend'
import type { Backend } from '../backend'
import { createLocalBackend } from '../backend/local'
import type { GameRecord } from '../history'
import { clearSyncState, pendingCount, syncHistory } from '../sync'

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

/** Enough of a record for the sync to carry; the shape is history's problem. */
function record(id: string): GameRecord {
  return { id, players: [{ color: 'blue' }] } as never
}

function putHistory(...records: GameRecord[]) {
  localStorage.setItem('blokus:history:v1', JSON.stringify(records))
}

const ERIC = { playerId: 'p1', username: 'eric' }

beforeEach(() => {
  installStorage()
  resetBackend(createLocalBackend())
})

describe('syncing a new account', () => {
  it('carries up the games played before there was one', async () => {
    putHistory(record('g1'), record('g2'), record('g3'))

    expect(pendingCount(ERIC)).toBe(3)
    expect(await syncHistory(ERIC)).toEqual({ uploaded: 3, failed: 0 })
    expect(pendingCount(ERIC)).toBe(0)
  })

  it('does nothing the second time', async () => {
    putHistory(record('g1'))
    await syncHistory(ERIC)

    expect(await syncHistory(ERIC)).toEqual({ uploaded: 0, failed: 0 })
  })

  it('sends only what is new after that', async () => {
    putHistory(record('g1'))
    await syncHistory(ERIC)

    putHistory(record('g1'), record('g2'))
    expect(await syncHistory(ERIC)).toEqual({ uploaded: 1, failed: 0 })
  })
})

describe('when an upload fails', () => {
  it('keeps the ones that landed and retries only the rest', async () => {
    const failing = new Set(['g2'])
    const backend = createLocalBackend()
    resetBackend({
      ...backend,
      saveGame: (playerId, game) =>
        failing.has(game.id) ? Promise.reject(new Error('offline')) : backend.saveGame(playerId, game),
    } as Backend)

    putHistory(record('g1'), record('g2'), record('g3'))
    expect(await syncHistory(ERIC)).toEqual({ uploaded: 2, failed: 1 })
    expect(pendingCount(ERIC)).toBe(1)

    // The connection comes back.
    failing.clear()
    expect(await syncHistory(ERIC)).toEqual({ uploaded: 1, failed: 0 })
    expect(await backend.listGames(ERIC.playerId)).toHaveLength(3)
  })
})

describe('a shared device', () => {
  it('re-sends the history under whoever signs in next', async () => {
    putHistory(record('g1'))
    await syncHistory(ERIC)

    // Eric signs out; the sync state goes with him.
    clearSyncState()

    const friend = { playerId: 'p2', username: 'sam' }
    expect(await syncHistory(friend)).toEqual({ uploaded: 1, failed: 0 })
  })

  it('tracks each player separately, so one signing in does not mute the other', async () => {
    putHistory(record('g1'))
    await syncHistory(ERIC)

    expect(pendingCount({ playerId: 'p2', username: 'sam' })).toBe(1)
  })
})
