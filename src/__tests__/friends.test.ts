import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignSeats } from '../online'
import type { OnlineGame, Participant } from '../online'
import type { GameRecord } from '../history'
import type { PlayerProfile } from '../backend'
import { resetBackend } from '../backend'
import { buildFriendsView, loadFriendProfiles, withGameOpponents } from '../friends'
import { avatarHue, avatarLetter } from '../photo'
import { stubBackend } from './helpers/backendStub'

const eric: Participant = { playerId: 'p-eric', username: 'eric' }
const dave: Participant = { playerId: 'p-dave', username: 'dave' }
const sam: Participant = { playerId: 'p-sam', username: 'sam' }

const me = { playerId: 'p-eric', username: 'eric' }

function profile(playerId: string, username: string): PlayerProfile {
  return { playerId, username, createdAt: '2026-08-01T00:00:00Z' }
}

/**
 * A game with no moves in it. `listEntry` works out whose turn that is from
 * `firstColor` alone, which is all these tests need — and it keeps them off the
 * slow path of playing real boards out.
 */
function game(over: {
  id: string
  people: Participant[]
  firstColor: OnlineGame['firstColor']
  updatedAt: string
  finished?: boolean
}): OnlineGame {
  return {
    id: over.id,
    createdAt: over.updatedAt,
    updatedAt: over.updatedAt,
    seats: assignSeats(over.people, 'computer'),
    firstColor: over.firstColor,
    playerIds: [...new Set(over.people.map((p) => p.playerId))],
    moves: [],
    finished: over.finished ?? false,
  }
}

/** A finished game as the history stores it: two people, `winner` on top. */
function record(id: string, winner: string, loser: string, finishedAt: string): GameRecord {
  return {
    id,
    finishedAt,
    mode: 'online',
    strength: null,
    timed: false,
    yourColor: 'blue',
    movesPlayed: 40,
    players: [
      {
        color: 'blue',
        seat: 'human',
        score: 10,
        remainingSquares: 5,
        piecesLeft: [],
        perfectGame: false,
        rank: 1,
        playerId: winner,
        username: winner.replace('p-', ''),
      },
      {
        color: 'yellow',
        seat: 'human',
        score: 4,
        remainingSquares: 20,
        piecesLeft: [],
        perfectGame: false,
        rank: 2,
        playerId: loser,
        username: loser.replace('p-', ''),
      },
    ],
  }
}

describe('buildFriendsView', () => {
  it('puts the friend who is waiting on you first', () => {
    // Seats go out in board order, so blue is eric's and yellow is the other
    // person's in each of these.
    const yours = game({
      id: 'yours',
      people: [eric, dave],
      firstColor: 'blue',
      updatedAt: '2026-08-01T00:00:00Z',
    })
    const theirs = game({
      id: 'theirs',
      people: [eric, sam],
      firstColor: 'yellow',
      // More recent, and still ranked below the one that needs you.
      updatedAt: '2026-08-30T00:00:00Z',
    })

    const view = buildFriendsView(
      [profile('p-sam', 'sam'), profile('p-dave', 'dave')],
      [yours, theirs],
      [],
      'p-eric',
    )

    expect(view.friends.map((f) => f.username)).toEqual(['dave', 'sam'])
    expect(view.waitingOnYou).toBe(1)
    expect(view.liveGames).toBe(2)
  })

  it('sorts friends with no game last, after everyone you are mid-game with', () => {
    const theirs = game({
      id: 'theirs',
      people: [eric, sam],
      firstColor: 'yellow',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    const view = buildFriendsView(
      [profile('p-dave', 'dave'), profile('p-sam', 'sam')],
      [theirs],
      [],
      'p-eric',
    )

    expect(view.friends.map((f) => f.username)).toEqual(['sam', 'dave'])
    expect(view.friends[1].games).toEqual([])
  })

  it('keeps a game with two friends off both their cards', () => {
    // It belongs to all of them at once. On a card it would appear twice and
    // "resume" would mean something different depending on which was tapped.
    const group = game({
      id: 'group',
      people: [eric, dave, sam],
      firstColor: 'blue',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    const view = buildFriendsView(
      [profile('p-dave', 'dave'), profile('p-sam', 'sam')],
      [group],
      [],
      'p-eric',
    )

    expect(view.groupGames.map((e) => e.game.id)).toEqual(['group'])
    expect(view.friends.every((f) => f.games.length === 0)).toBe(true)
    // Still waiting on you, whichever list it is drawn in.
    expect(view.waitingOnYou).toBe(1)
  })

  it('keeps finished games out of the cards and in their own pile', () => {
    const done = game({
      id: 'done',
      people: [eric, dave],
      firstColor: 'blue',
      updatedAt: '2026-08-31T00:00:00Z',
      finished: true,
    })

    const view = buildFriendsView([profile('p-dave', 'dave')], [done], [], 'p-eric')

    expect(view.finished.map((e) => e.game.id)).toEqual(['done'])
    expect(view.friends[0].games).toEqual([])
    expect(view.liveGames).toBe(0)
  })

  it('counts the lifetime record from your side', () => {
    const history = [
      record('g1', 'p-eric', 'p-dave', '2026-08-01T00:00:00Z'),
      record('g2', 'p-dave', 'p-eric', '2026-08-02T00:00:00Z'),
      record('g3', 'p-eric', 'p-dave', '2026-08-03T00:00:00Z'),
    ]

    const view = buildFriendsView([profile('p-dave', 'dave')], [], history, 'p-eric')

    // Two beaten, one lost — the same numbers read from dave's phone would be
    // the other way round, which is why the card spells out which is which.
    expect(view.friends[0].record).toEqual({ wins: 2, draws: 0, losses: 1 })
  })

  it('has no record at all for someone you have never finished a game with', () => {
    const view = buildFriendsView([profile('p-dave', 'dave')], [], [], 'p-eric')
    expect(view.friends[0].record).toBeNull()
  })
})

describe('withGameOpponents', () => {
  it('adds somebody who started a game with you', () => {
    // The rule that stops a game going missing: the page is your list, but an
    // invitation from outside it still has to be visible.
    const theirs = game({
      id: 'theirs',
      people: [eric, dave],
      firstColor: 'yellow',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    expect(withGameOpponents([], [theirs], 'p-eric')).toEqual(['p-dave'])
  })

  it('leaves the order of the people you added alone', () => {
    const theirs = game({
      id: 'theirs',
      people: [eric, sam],
      firstColor: 'yellow',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    expect(withGameOpponents(['p-dave'], [theirs], 'p-eric')).toEqual(['p-dave', 'p-sam'])
  })

  it('does not add somebody from a game that is already over', () => {
    // A game you played once, years ago, is not a friend you chose — and the
    // result is on the stats screen either way.
    const done = game({
      id: 'done',
      people: [eric, dave],
      firstColor: 'blue',
      updatedAt: '2026-08-30T00:00:00Z',
      finished: true,
    })

    expect(withGameOpponents([], [done], 'p-eric')).toEqual([])
  })

  it('never lists you as your own friend', () => {
    expect(withGameOpponents(['p-eric', 'p-dave'], [], 'p-eric')).toEqual(['p-dave'])
  })
})

describe('loadFriendProfiles', () => {
  beforeEach(() => {
    resetBackend(null)
  })

  it('saves the new arrival so they stay after the game ends', () => {
    const updateProfile = vi.fn(() => Promise.resolve())
    resetBackend(
      stubBackend({
        getPlayer: (id) =>
          Promise.resolve(id === 'p-eric' ? profile('p-eric', 'eric') : profile(id, 'dave')),
        updateProfile,
      }),
    )

    const theirs = game({
      id: 'theirs',
      people: [eric, dave],
      firstColor: 'yellow',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    return loadFriendProfiles(me, [theirs]).then(({ profiles }) => {
      expect(profiles.map((p) => p.playerId)).toEqual(['p-dave'])
      expect(updateProfile).toHaveBeenCalledWith('p-eric', { friendIds: ['p-dave'] })
    })
  })

  it('does not write when nothing changed', async () => {
    // Opening the page is a read. A write every time would be a write every
    // time the app comes back to the foreground.
    const updateProfile = vi.fn(() => Promise.resolve())
    resetBackend(
      stubBackend({
        getPlayer: (id) =>
          Promise.resolve(
            id === 'p-eric'
              ? { ...profile('p-eric', 'eric'), friendIds: ['p-dave'] }
              : profile(id, 'dave'),
          ),
        updateProfile,
      }),
    )

    await loadFriendProfiles(me, [])
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('still lists a friend whose profile has gone, under the name on their seat', async () => {
    // Dropping them would take the game with them, and the game is real.
    resetBackend(
      stubBackend({
        getPlayer: (id) => Promise.resolve(id === 'p-eric' ? profile('p-eric', 'eric') : null),
      }),
    )

    const theirs = game({
      id: 'theirs',
      people: [eric, dave],
      firstColor: 'yellow',
      updatedAt: '2026-08-30T00:00:00Z',
    })

    const { profiles } = await loadFriendProfiles(me, [theirs])
    expect(profiles).toEqual([{ playerId: 'p-dave', username: 'dave', createdAt: '' }])
  })
})

describe('the stand-in for a missing photo', () => {
  it('takes the first letter of the name', () => {
    expect(avatarLetter('eric')).toBe('E')
    expect(avatarLetter('_jenna')).toBe('J')
    expect(avatarLetter('  dave')).toBe('D')
  })

  it('has something to show for a name with no letters in it', () => {
    expect(avatarLetter('___')).toBe('?')
  })

  it('gives a name the same colour every time', () => {
    // The tile is recognised by colour before it is read, so a hue that moved
    // between loads would make the grid harder to scan, not easier.
    expect(avatarHue('eric')).toBe(avatarHue('eric'))
    expect(avatarHue('Eric')).toBe(avatarHue('eric'))
    expect(avatarHue('eric')).not.toBe(avatarHue('dave'))
  })
})
