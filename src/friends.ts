import { normalizeUsername } from './account'
import type { Account } from './account'
import { getBackend } from './backend'
import type { PlayerProfile } from './backend'
import type { GameRecord } from './history'
import { listEntry, opponentsOf } from './online'
import type { ListEntry, OnlineGame } from './online'
import { OnlineError } from './onlineActions'
import { computeFriends } from './stats'

/**
 * The people on your friends page, and everything a card about one of them
 * shows.
 *
 * Two rules decide who is on this page, and they are worth stating together
 * because either alone would be wrong:
 *
 * 1. You add people by name. The page is your list, not a log of everyone you
 *    have ever been seated with.
 * 2. Anyone who starts a game with you is added anyway. Without this, a friend
 *    could invite you to a game you would never see, and they would sit waiting
 *    for a turn that could not arrive — the list would be quietly hiding a game
 *    rather than tidying one away.
 *
 * The list lives on the profile, not on the device, so signing in on another
 * phone doesn't land on an empty page.
 */

/** One card: a person, and how things stand between you. */
export interface FriendCard {
  playerId: string
  username: string
  photo?: string
  /**
   * Live one-on-one games with them, the most urgent first.
   *
   * One-on-one only. A game with two or three friends in it belongs to all of
   * them at once, and putting it on each of their cards would show the same
   * game three times and make "resume" ambiguous — so those live on the group
   * tile instead.
   */
  games: ListEntry[]
  /** Lifetime head to head, or null if you have never finished one together. */
  record: FriendRecord | null
}

/** Games finished above them, level with them, and below them. */
export interface FriendRecord {
  wins: number
  draws: number
  losses: number
}

/** Everything the friends page draws, worked out in one pass. */
export interface FriendsView {
  friends: FriendCard[]
  /** Live games with more than one other person in them. */
  groupGames: ListEntry[]
  /** Everything over, newest first, for the past-games list. */
  finished: ListEntry[]
  /** How many live games are waiting on you, across all of them. */
  waitingOnYou: number
  /** How many games are still going at all, whoever they wait on. */
  liveGames: number
}

/**
 * Sorts the cards into the order the question "what can I do right now?" wants
 * answering in: your turn, then theirs, then people you have no game with.
 */
function cardRank(card: FriendCard): number {
  if (card.games.some((g) => g.yourTurn)) return 0
  if (card.games.length > 0) return 1
  return 2
}

/** When anything last happened with this person, for ordering inside a rank. */
function lastActivity(card: FriendCard): string {
  return card.games[0]?.game.updatedAt ?? ''
}

/**
 * Builds the whole page from what has already been fetched.
 *
 * Pure on purpose: everything that decides what a card says can then be tested
 * without a store, a network or a rendered screen.
 */
export function buildFriendsView(
  profiles: PlayerProfile[],
  games: OnlineGame[],
  history: GameRecord[],
  playerId: string,
): FriendsView {
  const entries = games.map((game) => listEntry(game, playerId))
  const live = entries.filter((e) => !e.finished)

  const finished = entries
    .filter((e) => e.finished)
    .sort((a, b) => (b.game.updatedAt ?? '').localeCompare(a.game.updatedAt ?? ''))

  const groupGames = live
    .filter((e) => opponentsOf(e.game, playerId).length > 1)
    .sort(byUrgency)

  // Every live game against exactly one other person, filed under them.
  const duels = new Map<string, ListEntry[]>()
  for (const entry of live) {
    const others = opponentsOf(entry.game, playerId)
    if (others.length !== 1) continue
    const list = duels.get(others[0].playerId) ?? []
    list.push(entry)
    duels.set(others[0].playerId, list)
  }

  const records = new Map(computeFriends(history, playerId).friends.map((f) => [f.playerId, f]))

  const friends = profiles.map((profile): FriendCard => {
    const stats = records.get(profile.playerId)
    return {
      playerId: profile.playerId,
      username: profile.username,
      photo: profile.photo,
      games: (duels.get(profile.playerId) ?? []).sort(byUrgency),
      record: stats ? { wins: stats.wins, draws: stats.draws, losses: stats.losses } : null,
    }
  })

  friends.sort(
    (a, b) =>
      cardRank(a) - cardRank(b) ||
      lastActivity(b).localeCompare(lastActivity(a)) ||
      a.username.localeCompare(b.username),
  )

  return {
    friends,
    groupGames,
    finished,
    waitingOnYou: live.filter((e) => e.yourTurn).length,
    liveGames: live.length,
  }
}

/** Your turn first, then whatever moved most recently. */
function byUrgency(a: ListEntry, b: ListEntry): number {
  if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1
  return (b.game.updatedAt ?? '').localeCompare(a.game.updatedAt ?? '')
}

/**
 * Who should be on the page: the list you have built, plus anyone currently in
 * a game with you who isn't on it yet.
 *
 * Finished games deliberately don't count. Somebody you played once, before any
 * of this existed, isn't a friend you chose — and their result is on the stats
 * screen either way.
 */
export function withGameOpponents(
  friendIds: string[],
  games: OnlineGame[],
  playerId: string,
): string[] {
  const ids = new Set(friendIds)
  for (const game of games) {
    if (game.finished) continue
    for (const other of opponentsOf(game, playerId)) ids.add(other.playerId)
  }
  // The stored order is the order they were added, which is worth keeping: it
  // is the only thing here that isn't recomputed every time.
  return [...ids].filter((id) => id !== playerId)
}

/**
 * Fetches everyone on your list, adding anyone who has started a game with you.
 *
 * Returns profiles rather than cards so the caller can pair them with games it
 * already holds, and hands back your own profile alongside them — it was read
 * to get the list, and it carries your photo. A friend whose profile has gone is still listed, under the
 * name their seat in the game carries — dropping them would take the game with
 * them.
 */
export async function loadFriendProfiles(
  account: Account,
  games: OnlineGame[],
): Promise<{ me: PlayerProfile | null; profiles: PlayerProfile[] }> {
  const backend = getBackend()

  let me: PlayerProfile | null = null
  let stored: string[] = []
  try {
    me = await backend.getPlayer(account.playerId)
    stored = me?.friendIds ?? []
  } catch {
    // Can't read the list. Whoever is mid-game with you is still worth showing,
    // so carry on with what the games themselves say rather than showing none.
  }

  const wanted = withGameOpponents(stored, games, account.playerId)

  // Only write when it actually changed, so opening the page isn't a write.
  if (wanted.length !== stored.length || wanted.some((id, i) => id !== stored[i])) {
    try {
      await backend.updateProfile(account.playerId, { friendIds: wanted })
    } catch {
      // The page still works this time; it just won't remember the new arrival
      // until a later load manages the write.
    }
  }

  const fallbackNames = new Map<string, string>()
  for (const game of games) {
    for (const other of opponentsOf(game, account.playerId)) {
      if (other.username) fallbackNames.set(other.playerId, other.username)
    }
  }

  const profiles = await Promise.all(
    wanted.map(async (id): Promise<PlayerProfile | null> => {
      try {
        const profile = await backend.getPlayer(id)
        if (profile) return profile
      } catch {
        // Treated the same as a missing profile: the seat still names them.
      }
      const username = fallbackNames.get(id)
      return username ? { playerId: id, username, createdAt: '' } : null
    }),
  )

  return { me, profiles: profiles.filter((p): p is PlayerProfile => p !== null) }
}

/**
 * Adds somebody by name.
 *
 * The name is looked up rather than trusted, for the same reason inviting one
 * is: a card for a name nobody owns is a card you can never start a game from.
 */
export async function addFriend(account: Account, username: string): Promise<PlayerProfile> {
  const name = username.trim()
  if (!name) throw new OnlineError('Type a name first.')

  if (normalizeUsername(name) === normalizeUsername(account.username)) {
    throw new OnlineError("That's you.")
  }

  const backend = getBackend()

  let profile: PlayerProfile | null
  try {
    profile = await backend.lookupUsername(name)
  } catch {
    throw new OnlineError("Couldn't reach the server to check that name. Try again in a moment.")
  }
  if (!profile) {
    throw new OnlineError(
      `Nobody is called @${name} yet. They need to open the link and pick that name first.`,
    )
  }

  const stored = await currentFriendIds(account)
  if (stored.includes(profile.playerId)) {
    throw new OnlineError(`@${profile.username} is already on your list.`)
  }

  try {
    await backend.updateProfile(account.playerId, { friendIds: [...stored, profile.playerId] })
  } catch {
    throw new OnlineError("Couldn't save that. Check your connection and try again.")
  }

  return profile
}

/**
 * Takes somebody off the list.
 *
 * Refused while a game with them is still going, because the auto-add above
 * would put them straight back — and a removal that undoes itself looks like a
 * bug rather than a rule.
 */
export async function removeFriend(
  account: Account,
  playerId: string,
  games: OnlineGame[],
): Promise<void> {
  const inPlay = games.some(
    (game) =>
      !game.finished && opponentsOf(game, account.playerId).some((o) => o.playerId === playerId),
  )
  if (inPlay) {
    throw new OnlineError('You have a game going with them. Finish it first.')
  }

  const stored = await currentFriendIds(account)
  try {
    await getBackend().updateProfile(account.playerId, {
      friendIds: stored.filter((id) => id !== playerId),
    })
  } catch {
    throw new OnlineError("Couldn't save that. Check your connection and try again.")
  }
}

/** Puts a new photo on your profile, or takes the current one off. */
export async function savePhoto(account: Account, photo: string | null): Promise<void> {
  try {
    await getBackend().updateProfile(account.playerId, { photo })
  } catch {
    throw new OnlineError("Couldn't save your photo. Check your connection and try again.")
  }
}

async function currentFriendIds(account: Account): Promise<string[]> {
  try {
    return (await getBackend().getPlayer(account.playerId))?.friendIds ?? []
  } catch {
    throw new OnlineError("Couldn't reach your profile. Try again in a moment.")
  }
}

/**
 * The last set of friends this device saw, so the grid draws faces immediately
 * on open instead of a screenful of empty circles while the profiles are
 * fetched. Photos are the reason: they are the slowest part of the page and the
 * part that makes it recognisable at a glance.
 */
const CACHE_KEY = 'blokus:friends:v1'

export function cachedProfiles(): PlayerProfile[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is PlayerProfile =>
        !!p && typeof p.playerId === 'string' && typeof p.username === 'string',
    )
  } catch {
    return []
  }
}

export function cacheProfiles(profiles: PlayerProfile[]): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      // Deliberately not the whole profile: a PIN hash is the one thing here
      // worth grinding offline, and nothing on this page needs it.
      JSON.stringify(
        profiles.map(({ playerId, username, createdAt, photo }) => ({
          playerId,
          username,
          createdAt,
          photo,
        })),
      ),
    )
  } catch {
    // Out of room, most likely a few photos' worth. The page still works; it
    // just paints its faces after the fetch instead of before it.
  }
}
