import type { Backend } from '../../backend/types'

/**
 * A Backend with every method stubbed, for tests that only care about one of
 * them.
 *
 * Exists so that adding a method to the interface doesn't break every test that
 * hand-rolls a fake — which is what happened when online games were added. Pass
 * only the methods under test; the rest resolve to nothing.
 */
export function stubBackend(over: Partial<Backend> = {}): Backend {
  return {
    kind: 'firebase',
    lookupUsername: () => Promise.resolve(null),
    claimUsername: () => Promise.resolve(),
    getPlayer: () => Promise.resolve(null),
    updateProfile: () => Promise.resolve(),
    saveGame: () => Promise.resolve(),
    listGames: () => Promise.resolve([]),
    createOnlineGame: () => Promise.resolve(),
    getOnlineGame: () => Promise.resolve(null),
    listOnlineGames: () => Promise.resolve([]),
    writeOnlineGame: () => Promise.resolve(),
    watchOnlineGame: () => () => {},
    ...over,
  }
}
