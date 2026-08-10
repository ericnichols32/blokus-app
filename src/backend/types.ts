import type { GameRecord } from '../history'

/**
 * The shared store, as the app sees it.
 *
 * Everything the app needs from a server is behind this interface, for two
 * reasons: the game keeps working with no server configured at all, and the
 * tests never touch the network.
 */
export interface Backend {
  /** Whether this is a real shared store, or the standalone stand-in. */
  readonly kind: 'firebase' | 'local'

  /**
   * Finds who owns a username, or null if nobody has taken it.
   * Compared case-insensitively.
   */
  lookupUsername(username: string): Promise<PlayerProfile | null>

  /**
   * Records `playerId` as the owner of `username`.
   *
   * Callers are expected to have checked with `lookupUsername` first and, if
   * the name was taken, to have passed that owner's `playerId` here — claiming
   * an existing name is how signing in on a second device works, so this is a
   * join, not a conflict. Renaming releases the previous name.
   */
  claimUsername(playerId: string, username: string, previousUsername?: string): Promise<void>

  /** The profile behind an id, or null if the store has never seen it. */
  getPlayer(playerId: string): Promise<PlayerProfile | null>

  /** Files a finished game under a player. Writing the same game twice is safe. */
  saveGame(playerId: string, record: GameRecord): Promise<void>

  /** Every game filed under a player, newest last. */
  listGames(playerId: string): Promise<GameRecord[]>
}

export interface PlayerProfile {
  playerId: string
  /** With the capitalisation its owner typed. */
  username: string
  createdAt: string
}
