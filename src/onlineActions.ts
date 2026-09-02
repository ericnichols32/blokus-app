import { getBackend } from './backend'
import { StaleGameError } from './backend/types'
import { COLORS } from './game'
import type { Color, PieceId, Point, Strength } from './game'
import { recordFinishedGame } from './history'
import type { GameRecord } from './history'
import { normalizeUsername } from './account'
import type { Account } from './account'
import { colorsOf, createOnlineGame, stateOf, submitMove, summarize } from './online'
import type { OnlineGame, Participant, SeatFill } from './online'
import type { Session } from './session'

/**
 * Everything the screens do with an online game, kept out of them so it can be
 * tested without rendering anything.
 *
 * The rule throughout: the store is the truth, this module never caches. Every
 * action re-reads what it needs, because the whole point of an async game is
 * that somebody else moved while you weren't looking.
 */

/** Something a player can be told, rather than a stack trace. */
export class OnlineError extends Error {}

/**
 * Why a request failed, in the only three flavours worth telling a player apart.
 *
 * The distinction earns its keep: a dropped connection is fixed by trying again
 * and the other two never are, yet all three look identical from the outside.
 * Reporting everything as "check your connection" sent somebody retrying a write
 * the security rules would never allow, and then a second time against a
 * document shape the database will never accept.
 */
type FailureKind =
  /** The rules said no. */
  | 'refused'
  /** The database understood and rejected it — a bug here, not a rule. */
  | 'rejected'
  /** No answer came back. */
  | 'unreachable'

function classify(error: unknown): FailureKind {
  const code = String((error as { code?: unknown })?.code ?? '')
  const message = String((error as { message?: unknown })?.message ?? '')

  if (code.endsWith('permission-denied') || /permission|insufficient|denied/i.test(message)) {
    return 'refused'
  }
  // invalid-argument is a malformed document; failed-precondition is usually a
  // query needing an index. Both are ours to fix and neither improves by waiting.
  if (
    code.endsWith('invalid-argument') ||
    code.endsWith('failed-precondition') ||
    /nested arrays|requires an index/i.test(message)
  ) {
    return 'rejected'
  }
  return 'unreachable'
}

/**
 * `refused` names the rules; `offline` is the ordinary flaky-connection case. A
 * rejection gets a fixed line of its own, because there is nothing useful a
 * player can do about it and pretending otherwise wastes their time.
 */
function failure(error: unknown, refused: string, offline: string): OnlineError {
  switch (classify(error)) {
    case 'refused':
      return new OnlineError(refused)
    case 'rejected':
      return new OnlineError(
        "The database turned that down as malformed. That's a bug in the app rather than anything you did — trying again won't help.",
      )
    default:
      return new OnlineError(offline)
  }
}

/**
 * Turns typed names into the people who will be seated.
 *
 * Names are looked up rather than trusted: a game invented for a username
 * nobody owns would sit in the list forever waiting for a turn from a player
 * who cannot exist.
 */
export async function resolveParticipants(
  me: Account,
  usernames: string[],
): Promise<Participant[]> {
  const backend = getBackend()
  const participants: Participant[] = [{ playerId: me.playerId, username: me.username }]
  const seen = new Set([normalizeUsername(me.username)])

  for (const raw of usernames) {
    const name = raw.trim()
    if (!name) continue

    const key = normalizeUsername(name)
    if (seen.has(key)) {
      throw new OnlineError(
        key === normalizeUsername(me.username)
          ? `You're already in the game — no need to add @${name}.`
          : `@${name} is in the game twice.`,
      )
    }
    seen.add(key)

    let profile
    try {
      profile = await backend.lookupUsername(name)
    } catch (error) {
      throw failure(
        error,
        "The database turned that lookup down. The app's online rules may not be published yet.",
        "Couldn't reach the server to check that name. Try again in a moment.",
      )
    }
    if (!profile) {
      throw new OnlineError(
        `Nobody is called @${name} yet. They need to open the link and pick that name first.`,
      )
    }

    participants.push({ playerId: profile.playerId, username: profile.username })
  }

  if (participants.length < 2) throw new OnlineError('Add at least one friend to play against.')
  return participants
}

/** Makes the game and puts it where everyone in it will find it. */
export async function startGame(
  me: Account,
  usernames: string[],
  fill: SeatFill,
  strength: Strength,
): Promise<OnlineGame> {
  const participants = await resolveParticipants(me, usernames)
  const game = createOnlineGame(participants, fill, strength)

  try {
    await getBackend().createOnlineGame(game)
  } catch (error) {
    throw failure(
      error,
      "The database won't accept online games yet — its rules need publishing. Nothing you can fix from here.",
      "Couldn't start the game — the server didn't answer. Try again.",
    )
  }

  return game
}

/**
 * Every online game you are seated in, live and finished, exactly as the store
 * holds them.
 *
 * Unsorted and ungrouped on purpose: the friends page files them under the
 * people in them rather than into piles, so anything decided here would only
 * have to be undone. See `buildFriendsView`.
 */
export async function loadOnlineGames(playerId: string): Promise<OnlineGame[]> {
  try {
    return await getBackend().listOnlineGames(playerId)
  } catch (error) {
    throw failure(
      error,
      "The database won't hand over online games yet — its rules need publishing.",
      "Couldn't load your games. Check your connection and try again.",
    )
  }
}

/** The game as the store holds it right now. */
export async function refreshGame(gameId: string): Promise<OnlineGame> {
  let game: OnlineGame | null
  try {
    game = await getBackend().getOnlineGame(gameId)
  } catch (error) {
    throw failure(
      error,
      "The database won't hand over that game — its rules need publishing.",
      "Couldn't load that game. Check your connection and try again.",
    )
  }
  if (!game) throw new OnlineError('That game is no longer there.')
  return game
}

/**
 * Plays your turn and writes it.
 *
 * The write carries the move count the local board was built from, so a game
 * that moved on while this screen was open is refused rather than overwritten.
 * The fresh game comes back with the error so the screen can show the board that
 * actually exists instead of leaving the player staring at a stale one.
 */
export async function takeTurn(
  game: OnlineGame,
  playerId: string,
  move: { pieceId: PieceId; cells: Point[] },
): Promise<OnlineGame> {
  const played = submitMove(game, playerId, move)

  try {
    await getBackend().submitOnlineTurn(played, game.moves.length)
  } catch (error) {
    if (error instanceof StaleGameError) {
      throw new StaleTurnError(error.message, await refreshGame(game.id).catch(() => null))
    }
    throw failure(
      error,
      "The database refused your move — the app's online rules need publishing.",
      "Couldn't save your move. Check your connection and try again.",
    )
  }

  return played
}

/** A turn refused because the game had moved on, carrying the board that won. */
export class StaleTurnError extends OnlineError {
  /** The board that won the race, so the screen can show what actually exists. */
  readonly latest: OnlineGame | null

  constructor(message: string, latest: OnlineGame | null) {
    super(message)
    this.latest = latest
  }
}

/**
 * Watches one game for somebody else's move, and hands back the way to stop.
 *
 * The caller gets every change including the echo of its own write, which is
 * harmless: the store is the truth, and what comes back is what it holds.
 */
export function watchGame(gameId: string, onChange: (game: OnlineGame) => void): () => void {
  try {
    return getBackend().watchOnlineGame(gameId, onChange)
  } catch {
    // No watch is a game that has to be refreshed by hand, not a broken one, so
    // this never takes the screen down with it.
    return () => {}
  }
}

/**
 * An online game dressed as a Session, which is what the board renders.
 *
 * `youAre` is the point of the exercise: every seat here can be a person, so
 * without it the board would face somebody else's corner and the game would be
 * filed under their result.
 */
export function sessionFor(game: OnlineGame, playerId: string): Session {
  const yours = colorsOf(game, playerId)
  return {
    id: game.id,
    mode: 'online',
    seats: game.seats,
    youAre: yours[0],
    // No clocks online. A budget of seconds means nothing in a game where the
    // next turn might be tomorrow morning.
    timed: false,
    state: stateOf(game),
  }
}

/**
 * Files a finished online game into this device's history, once, so it counts
 * towards your stats like any other game.
 *
 * Done at the point the finished game is *seen* rather than when the last move
 * is written, because the player who ends a game is usually not the only one in
 * it: everybody records it when they next open it, each on their own device and
 * each under their own seat. `recordFinishedGame` ignores a game it has already
 * filed, which is what makes calling this on every open safe.
 */
export function recordIfFinished(game: OnlineGame, playerId: string): GameRecord | null {
  const session = sessionFor(game, playerId)
  if (!session.state.gameOver) return null
  // A game somebody is watching but not seated in has no result of theirs to file.
  if (!session.youAre) return null
  return recordFinishedGame(session)
}

/** Who else is in a game: "@dave", "@dave and @sam", "@dave and 2 computers". */
export function describePlayers(game: OnlineGame, playerId: string): string {
  const names: string[] = []
  let computers = 0
  const counted = new Set<string>()

  for (const color of COLORS) {
    const seat = game.seats[color]
    if (seat.kind === 'computer') {
      computers++
      continue
    }
    if (!seat.playerId || seat.playerId === playerId || counted.has(seat.playerId)) continue
    counted.add(seat.playerId)
    names.push(`@${seat.username ?? 'someone'}`)
  }

  if (computers > 0) {
    names.push(computers === 1 ? 'the computer' : `${computers} computers`)
  }
  return joinWords(names)
}

/**
 * Anything about the arrangement worth knowing at a glance, or empty when there
 * is nothing unusual. Two colors each earns its place: it changes how the game
 * plays, and you cannot tell from the board alone whose second color is whose.
 */
export function describeSetup(game: OnlineGame, playerId: string): string {
  return colorsOf(game, playerId).length > 1 ? 'two colors each' : ''
}

function joinWords(words: string[]): string {
  if (words.length === 0) return 'nobody else'
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** Your color for a game, for the dot beside it in the list. */
export function yourColorIn(game: OnlineGame, playerId: string): Color | undefined {
  return colorsOf(game, playerId)[0]
}

export { summarize }
