import type { GameRecord } from '../history'
import type { OnlineGame } from '../online'
import type { PinRecord } from '../pin'

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
  claimUsername(
    playerId: string,
    username: string,
    previousUsername?: string,
    pin?: PinRecord,
  ): Promise<void>

  /** The profile behind an id, or null if the store has never seen it. */
  getPlayer(playerId: string): Promise<PlayerProfile | null>

  /**
   * Changes part of a profile, leaving the rest alone.
   *
   * Separate from `claimUsername` because these are the things a player edits
   * about themselves after the name is settled — their photo, and who they have
   * added — and a claim that carried them would have to know them all in order
   * not to wipe the ones it wasn't changing.
   */
  updateProfile(playerId: string, patch: ProfilePatch): Promise<void>

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

  /**
   * Calls back whenever the stored game changes, and returns the way to stop.
   *
   * This is what makes an opponent's move appear rather than having to be gone
   * looking for. Re-reading on a timer would do the same job badly: a turn in an
   * async game arrives at no predictable moment, so any interval is either too
   * slow to feel live or mostly wasted requests.
   */
  watchOnlineGame(gameId: string, onChange: (game: OnlineGame) => void): () => void
}

/** Thrown when a turn is written against a game that has already moved on. */
export class StaleGameError extends Error {
  constructor(message = 'That game has moved on. Opening it again will show the latest board.') {
    super(message)
    this.name = 'StaleGameError'
  }
}

/** The parts of a profile a player can change about themselves. */
export interface ProfilePatch {
  /** A new photo, or null to take the current one off. */
  photo?: string | null
  /** The whole list, not an addition — the caller owns the merge. */
  friendIds?: string[]
}

export interface PlayerProfile {
  playerId: string
  /** With the capitalisation its owner typed. */
  username: string
  createdAt: string
  /**
   * A small square photo, stored as a data URL right here on the profile.
   *
   * On the profile rather than in file storage because file storage isn't on
   * the free Firebase plan, and a thumbnail this size (see photo.ts) is a few
   * tens of kilobytes — comfortably inside a document. The cost is that every
   * profile read carries the picture, which is why friends' photos are cached
   * on the device.
   *
   * Readable by anyone who can look the name up, exactly like the username and
   * the PIN hash. Same bargain as the rest of this app: the link goes to
   * friends.
   */
  photo?: string
  /**
   * The people this player has added, by playerId.
   *
   * Kept on the profile rather than on the device so the friends page is there
   * when you sign in on another phone — losing it would silently empty the
   * screen the app is now organised around.
   */
  friendIds?: string[]
  /**
   * The PIN guarding this name, absent on an account that has never set one.
   *
   * It travels with the profile because the check happens on the device — there
   * is no server code to do it — so anyone who can look a name up can read this.
   * That is why it is a slow salted hash and never the digits. See pin.ts.
   */
  pin?: PinRecord
}
