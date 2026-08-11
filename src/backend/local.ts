import type { GameRecord } from '../history'
import { normalizeUsername } from '../account'
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

    async claimUsername(playerId, username) {
      const players = readPlayers().filter((p) => p.playerId !== playerId)
      const existing = readPlayers().find((p) => p.playerId === playerId)
      writePlayers([
        ...players,
        { playerId, username, createdAt: existing?.createdAt ?? new Date().toISOString() },
      ])
    },

    async getPlayer(playerId) {
      return readPlayers().find((p) => p.playerId === playerId) ?? null
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
  }
}

const PLAYERS_KEY = 'blokus:local-backend:players:v1'
const GAMES_KEY = 'blokus:local-backend:games:v1'

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
