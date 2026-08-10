import type { Account } from './account'
import { getBackend } from './backend'
import { loadHistory } from './history'
import type { GameRecord } from './history'

/**
 * Pushes finished games up to the account they belong to.
 *
 * Games are recorded locally the moment they end, whether or not anyone is
 * signed in, so the first sync after claiming a name carries every game played
 * before that — you don't lose the history you built up while deciding.
 *
 * Which games have gone up is tracked per player rather than globally, so
 * signing in as somebody else on a shared phone re-uploads under the new name
 * instead of silently skipping.
 */
const SYNCED_KEY = 'blokus:synced:v1'

export interface SyncResult {
  uploaded: number
  failed: number
}

/**
 * Everything that should happen for a signed-in player when the app opens or a
 * game ends: make sure the shared store knows the name, then push the games.
 */
export async function syncAccount(account: Account): Promise<SyncResult> {
  await ensureNameRegistered(account)
  return syncHistory(account)
}

/**
 * Registers a name the shared store has never heard of.
 *
 * This exists for one specific gap. A name claimed while no Firebase project
 * was configured — or while offline — was only ever written to this device, so
 * as far as the server is concerned nobody holds it. Left alone, a friend could
 * later claim the same name and end up a different person under it, with both
 * of them believing they were @eric.
 *
 * If somebody already holds the name, it is left alone rather than taken back.
 * Everyone with the link is allowed to claim anything, so re-asserting on every
 * load would turn a collision into a tug of war that neither side can see.
 */
async function ensureNameRegistered(account: Account): Promise<void> {
  const backend = getBackend()
  try {
    if (await backend.lookupUsername(account.username)) return
    await backend.claimUsername(account.playerId, account.username)
  } catch {
    // Offline, most likely. The next open tries again, and nothing downstream
    // depends on this having succeeded.
  }
}

export async function syncHistory(account: Account): Promise<SyncResult> {
  const backend = getBackend()
  const already = loadSynced()[account.playerId] ?? []
  const pending = loadHistory().filter((game) => !already.includes(game.id))

  if (pending.length === 0) return { uploaded: 0, failed: 0 }

  const done: string[] = []
  let failed = 0

  // One at a time and recorded as they land, so a connection that drops halfway
  // keeps the games that made it and retries only the rest on the next run.
  for (const game of pending) {
    try {
      await backend.saveGame(account.playerId, game)
      done.push(game.id)
    } catch {
      failed++
    }
  }

  if (done.length > 0) markSynced(account.playerId, done)
  return { uploaded: done.length, failed }
}

/** How many finished games are waiting to go up for this player. */
export function pendingCount(account: Account, history: GameRecord[] = loadHistory()): number {
  const already = loadSynced()[account.playerId] ?? []
  return history.filter((game) => !already.includes(game.id)).length
}

/**
 * Forgets what has been uploaded, so the next sync sends everything again.
 * Used when signing out, since the next person on this device shouldn't inherit
 * a record of what the last one had already sent.
 */
export function clearSyncState(): void {
  try {
    localStorage.removeItem(SYNCED_KEY)
  } catch {
    // Nothing useful to do; the worst case is re-uploading games, which the
    // backend overwrites rather than duplicating.
  }
}

function loadSynced(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(SYNCED_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string[]>
  } catch {
    return {}
  }
}

function markSynced(playerId: string, gameIds: string[]): void {
  try {
    const synced = loadSynced()
    synced[playerId] = [...new Set([...(synced[playerId] ?? []), ...gameIds])]
    localStorage.setItem(SYNCED_KEY, JSON.stringify(synced))
  } catch {
    // Storage unavailable. Games will be re-sent next time, which is harmless:
    // saveGame is keyed by game id and overwrites.
  }
}
