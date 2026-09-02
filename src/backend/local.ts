import type { GameRecord } from '../history'
import { normalizeUsername } from '../account'
import type { OnlineGame } from '../online'
import { StaleGameError } from './types'
import type { Backend, PlayerProfile } from './types'

/**
 * The store used when no Firebase project is configured.
 *
 * It keeps everything in this browser, which means a username claimed here is
 * a label rather than an account: nobody else can see it and it won't follow
 * you to another device. That is a deliberately honest stand-in — it lets the
 * whole account flow be built, used and tested before any keys exist, and the
 * UI checks `kind` so it can say plainly that you aren't really online.
 */
export function createLocalBackend(): Backend {
  return {
    kind: 'local',

    async lookupUsername(username) {
      const key = normalizeUsername(username)
      return readPlayers().find((p) => normalizeUsername(p.username) === key) ?? null
    },

    async claimUsername(playerId, username, _previousUsername, pin) {
      const players = readPlayers().filter((p) => p.playerId !== playerId)
      const existing = readPlayers().find((p) => p.playerId === playerId)
      writePlayers([
        ...players,
        {
          // Everything already on the profile is carried over first: a claim is
          // about the name, and a rename that dropped the photo or the friends
          // list would empty the friends page as a side effect.
          ...existing,
          playerId,
          username,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          // Undefined leaves whatever was there: signing in on another device
          // must not wipe the PIN just because it wasn't being changed.
          pin: pin ?? existing?.pin,
        },
      ])
    },

    async getPlayer(playerId) {
      return readPlayers().find((p) => p.playerId === playerId) ?? null
    },

    async updateProfile(playerId, patch) {
      const players = readPlayers()
      const existing = players.find((p) => p.playerId === playerId)
      // A profile that isn't here yet still gets one, so a photo picked before
      // the name has finished being claimed isn't quietly dropped.
      const base: PlayerProfile = existing ?? {
        playerId,
        username: '',
        createdAt: new Date().toISOString(),
      }

      const updated: PlayerProfile = { ...base }
      if (patch.photo === null) delete updated.photo
      else if (patch.photo !== undefined) updated.photo = patch.photo
      if (patch.friendIds !== undefined) updated.friendIds = patch.friendIds

      writePlayers([...players.filter((p) => p.playerId !== playerId), updated])
    },

    async saveGame(playerId, record) {
      const games = readGames()
      const mine = games[playerId] ?? []
      // Replace rather than append, so re-syncing a game already filed here
      // updates it instead of listing it twice.
      games[playerId] = [...mine.filter((g) => g.id !== record.id), record]
      writeGames(games)
    },

    async listGames(playerId) {
      return readGames()[playerId] ?? []
    },

    async createOnlineGame(game) {
      writeOnline([...readOnline().filter((g) => g.id !== game.id), game])
    },

    async getOnlineGame(gameId) {
      return readOnline().find((g) => g.id === gameId) ?? null
    },

    async listOnlineGames(playerId) {
      return readOnline().filter((g) => g.playerIds.includes(playerId))
    },

    watchOnlineGame(gameId, onChange) {
      // A storage event fires in every *other* tab of this browser, which is as
      // close as a device-only store gets to somebody else moving — and is
      // exactly how two accounts in two tabs are tested.
      if (typeof window === 'undefined') return () => {}

      const handler = (event: StorageEvent) => {
        if (event.key !== ONLINE_KEY) return
        const game = readOnline().find((g) => g.id === gameId)
        if (game) onChange(game)
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },

    async writeOnlineGame(game, expectedMoveCount) {
      const games = readOnline()
      const stored = games.find((g) => g.id === game.id)
      // Same check the real store makes, so the stale-game path is exercised by
      // anyone developing without Firebase keys rather than only in production.
      if (stored && stored.moves.length !== expectedMoveCount) throw new StaleGameError()
      writeOnline([...games.filter((g) => g.id !== game.id), game])
    },
  }
}

const PLAYERS_KEY = 'blokus:local-backend:players:v1'
const GAMES_KEY = 'blokus:local-backend:games:v1'
const ONLINE_KEY = 'blokus:local-backend:online:v1'

function readPlayers(): PlayerProfile[] {
  const parsed = readJson(PLAYERS_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (p): p is PlayerProfile =>
      !!p && typeof p.playerId === 'string' && typeof p.username === 'string',
  )
}

function writePlayers(players: PlayerProfile[]): void {
  writeJson(PLAYERS_KEY, players)
}

function readGames(): Record<string, GameRecord[]> {
  const parsed = readJson(GAMES_KEY)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, GameRecord[]>
}

function writeGames(games: Record<string, GameRecord[]>): void {
  writeJson(GAMES_KEY, games)
}

/**
 * Online games in this mode are only ever visible to this one browser, so an
 * "online" game here is really a game against yourself. That is still worth
 * having: it exercises every path — seating, turns, the stale-write check —
 * without keys.
 */
function readOnline(): OnlineGame[] {
  const parsed = readJson(ONLINE_KEY)
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (g): g is OnlineGame =>
      !!g && typeof g.id === 'string' && Array.isArray(g.moves) && Array.isArray(g.playerIds),
  )
}

function writeOnline(games: OnlineGame[]): void {
  writeJson(ONLINE_KEY, games)
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable. Nothing is shared in this mode anyway, so losing it
    // costs a label rather than any real data.
  }
}
