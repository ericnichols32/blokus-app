import type { GameRecord } from '../history'
import type { OnlineGame } from '../online'

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

  /** Puts a newly made online game where everyone in it can find it. */
  createOnlineGame(game: OnlineGame): Promise<void>

  /** One online game as the store currently holds it, or null if it has gone. */
  getOnlineGame(gameId: string): Promise<OnlineGame | null>

  /** Every online game this player is seated in. */
  listOnlineGames(playerId: string): Promise<OnlineGame[]>

  /**
   * Appends a turn to an online game.
   *
   * `expectedMoveCount` is how many moves the caller believed were already
   * played. The store must reject the write if the game has moved on since —
   * two devices open on the same game is the normal case, not the exception, and
   * a blind overwrite would silently erase somebody's turn. Throws
   * `StaleGameError` in that case, and the caller re-reads and tries again.
   */
  submitOnlineTurn(game: OnlineGame, expectedMoveCount: number): Promise<void>
}

/** Thrown when a turn is written against a game that has already moved on. */
export class StaleGameError extends Error {
  constructor(message = 'That game has moved on. Opening it again will show the latest board.') {
    super(message)
    this.name = 'StaleGameError'
  }
}

export interface PlayerProfile {
  playerId: string
  /** With the capitalisation its owner typed. */
  username: string
  createdAt: string
}
