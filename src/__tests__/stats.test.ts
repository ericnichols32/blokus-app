import { describe, expect, it } from 'vitest'
import { COLORS, DIFFICULTY_STRENGTH as S, PIECE_DEFINITIONS } from '../game'
import type { Color, PieceId } from '../game'
import type { GameRecord, GameRecordPlayer } from '../history'
import { computeFriends, computeStats, MIN_GAMES_FOR_FAVORITES, outcomeFor } from '../stats'

const ALL_PIECE_IDS = PIECE_DEFINITIONS.map((p) => p.id)

/**
 * Records are built here rather than played out: every figure on the screen is a
 * function of the summary, so a fabricated summary tests it exactly, and lets a
 * test state the finishing order it cares about instead of hoping the AI
 * produces one. The engine's own tests cover whether a real game summarises
 * correctly.
 */
function game(options: {
  id?: string
  yourColor?: Color | null
  /** Your finishing position. Everyone else is filled in below you. */
  yourRank?: number
  /** Colours that tie with you at your rank, for testing draws. */
  tiedWith?: Color[]
  yourPiecesLeft?: PieceId[]
  /** Pieces each opponent is left holding; defaults to none. */
  theirPiecesLeft?: PieceId[]
  yourScore?: number
  perfectGame?: boolean
  finishedAt?: string
  timed?: boolean
}): GameRecord {
  const {
    id = Math.random().toString(36).slice(2),
    yourColor = 'blue',
    yourRank = 1,
    tiedWith = [],
    yourPiecesLeft = [],
    theirPiecesLeft = [],
    yourScore = -yourPiecesLeft.length,
    perfectGame = false,
    finishedAt = '2026-08-01T12:00:00.000Z',
    timed = false,
  } = options

  const players: GameRecordPlayer[] = COLORS.map((color, i) => {
    const isYou = color === yourColor
    const tied = tiedWith.includes(color)
    return {
      color,
      seat: isYou ? 'human' : 'computer',
      score: isYou ? yourScore : -20 - i,
      remainingSquares: isYou ? yourPiecesLeft.length * 4 : 20,
      piecesLeft: isYou ? yourPiecesLeft : theirPiecesLeft,
      perfectGame: isYou ? perfectGame : false,
      rank: isYou || tied ? yourRank : yourRank === 1 ? 2 : 1,
    }
  })

  return {
    id,
    finishedAt,
    mode: yourColor ? 'solo' : 'pass-and-play',
    strength: yourColor ? S.hard : null,
    timed,
    yourColor,
    movesPlayed: 60,
    players,
  }
}

/** Enough wins to clear the favourites threshold, all with the same colour. */
function someGames(count: number, options: Parameters<typeof game>[0] = {}): GameRecord[] {
  return Array.from({ length: count }, (_, i) => game({ ...options, id: `g${i}` }))
}

describe('an empty history', () => {
  it('reports nothing rather than zeroes that look like results', () => {
    const stats = computeStats([])

    expect(stats.games).toBe(0)
    expect(stats.averagePiecesLeft).toBeNull()
    expect(stats.averageSquaresLeft).toBeNull()
    expect(stats.bestScore).toBeNull()
    expect(stats.favoriteColor).toBeNull()
    expect(stats.favoritePiece).toBeNull()
    expect(stats.colors).toEqual([])
    expect(stats.recent).toEqual([])
  })
})

describe('the win, draw and loss record', () => {
  it('counts coming first alone as a win', () => {
    const stats = computeStats([game({ yourRank: 1 })])
    expect([stats.wins, stats.draws, stats.losses]).toEqual([1, 0, 0])
  })

  it('counts coming first alongside somebody as a draw', () => {
    // The record shares a rank between equal scores, so "first" is not the same
    // question as "won" — this is the case that would otherwise inflate wins.
    const stats = computeStats([game({ yourRank: 1, tiedWith: ['red'] })])
    expect([stats.wins, stats.draws, stats.losses]).toEqual([0, 1, 0])
  })

  it('counts anything below first as a loss', () => {
    const stats = computeStats([game({ yourRank: 2 }), game({ yourRank: 4 })])
    expect([stats.wins, stats.draws, stats.losses]).toEqual([0, 0, 2])
  })

  it('adds up to the number of games counted', () => {
    const stats = computeStats([
      game({ yourRank: 1 }),
      game({ yourRank: 1, tiedWith: ['green'] }),
      game({ yourRank: 3 }),
    ])
    expect(stats.wins + stats.draws + stats.losses).toBe(stats.games)
  })
})

describe('legacy games with no attributable seat', () => {
  // Written by the pass-and-play mode, which the app no longer offers. Records
  // of them still sit in people's history, so they still have to be handled.
  it('are counted apart, since there is no "you" to credit', () => {
    const stats = computeStats([game({ yourColor: 'blue' }), game({ yourColor: null })])

    expect(stats.games).toBe(1)
    expect(stats.sharedGames).toBe(1)
    // The unattributable game must not show up as a win for anybody.
    expect(stats.wins + stats.draws + stats.losses).toBe(1)
    expect(stats.recent).toHaveLength(1)
  })

  it('do not drag the averages around', () => {
    const withShared = computeStats([game({ yourPiecesLeft: ['monomino'] }), game({ yourColor: null })])
    const alone = computeStats([game({ yourPiecesLeft: ['monomino'] })])

    expect(withShared.averagePiecesLeft).toBe(alone.averagePiecesLeft)
  })
})

describe('a solo game whose human seat is missing', () => {
  it('is treated as unattributable rather than throwing', () => {
    // yourColor names a colour that isn't in the players list — only reachable
    // through damaged storage, but it must not take the whole screen down.
    const broken = game({})
    broken.players = broken.players.filter((p) => p.color !== 'blue')

    const stats = computeStats([broken])
    expect(stats.games).toBe(0)
    expect(stats.sharedGames).toBe(1)
  })
})

describe('averages and bests', () => {
  it('averages the pieces and squares you were left holding', () => {
    const stats = computeStats([
      game({ yourPiecesLeft: [] }),
      game({ yourPiecesLeft: ['monomino', 'domino'] }),
      game({ yourPiecesLeft: ['pentomino-X'] }),
    ])

    expect(stats.averagePiecesLeft).toBeCloseTo(1)
    // The fixture puts four squares on every leftover piece.
    expect(stats.averageSquaresLeft).toBeCloseTo(4)
  })

  it('takes the highest score, not the last one', () => {
    const stats = computeStats([
      game({ yourScore: -14 }),
      game({ yourScore: 20 }),
      game({ yourScore: -3 }),
    ])
    expect(stats.bestScore).toBe(20)
  })

  it('counts perfect games', () => {
    const stats = computeStats([
      game({ perfectGame: true }),
      game({ perfectGame: false }),
      game({ perfectGame: true }),
    ])
    expect(stats.perfectGames).toBe(2)
  })
})

describe('colours', () => {
  it('lists only the colours you have played, most played first', () => {
    const stats = computeStats([
      game({ yourColor: 'red' }),
      game({ yourColor: 'red' }),
      game({ yourColor: 'green' }),
    ])

    expect(stats.colors.map((c) => c.color)).toEqual(['red', 'green'])
    expect(stats.colors[0]).toEqual({ color: 'red', played: 2, won: 2 })
    expect(stats.favoriteColor).toBe('red')
  })

  it('counts wins per colour without counting draws among them', () => {
    const stats = computeStats([
      game({ yourColor: 'blue', yourRank: 1 }),
      game({ yourColor: 'blue', yourRank: 1, tiedWith: ['red'] }),
      game({ yourColor: 'blue', yourRank: 2 }),
    ])

    expect(stats.colors[0]).toEqual({ color: 'blue', played: 3, won: 1 })
  })

  it('breaks a tie on games played the same way every time', () => {
    const history = [game({ yourColor: 'green' }), game({ yourColor: 'yellow' })]
    const forwards = computeStats(history).colors.map((c) => c.color)
    const backwards = computeStats([...history].reverse()).colors.map((c) => c.color)

    expect(forwards).toEqual(backwards)
  })
})

describe('favourite and left-behind pieces', () => {
  it('waits for enough games before naming either', () => {
    const stats = computeStats(someGames(MIN_GAMES_FOR_FAVORITES - 1, { yourPiecesLeft: ['pentomino-X'] }))

    expect(stats.games).toBe(MIN_GAMES_FOR_FAVORITES - 1)
    expect(stats.favoritePiece).toBeNull()
    expect(stats.leftBehindPiece).toBeNull()
  })

  it('names the piece you place that your opponents do not', () => {
    // You place everything; they leave the X behind every time. Nothing else
    // separates you from them, so the X is the only real preference on show.
    const stats = computeStats(
      someGames(MIN_GAMES_FOR_FAVORITES, { yourPiecesLeft: [], theirPiecesLeft: ['pentomino-X'] }),
    )

    expect(stats.favoritePiece?.pieceId).toBe('pentomino-X')
    expect(stats.favoritePiece?.yours).toBe(MIN_GAMES_FOR_FAVORITES)
    expect(stats.favoritePiece?.theirRate).toBe(0)
    expect(stats.favoritePiece?.edge).toBeCloseTo(1)
  })

  it('does not just name the piece everybody finds easy to place', () => {
    // Everyone places the monomino every game, so it cannot be *your* favourite.
    // Without measuring against the opponents this is exactly what would win.
    const stats = computeStats(
      someGames(MIN_GAMES_FOR_FAVORITES, {
        yourPiecesLeft: [],
        theirPiecesLeft: ALL_PIECE_IDS.filter((id) => id !== 'monomino' && id !== 'pentomino-F'),
      }),
    )

    expect(stats.favoritePiece?.pieceId).not.toBe('monomino')
    expect(stats.favoritePiece?.pieceId).not.toBe('pentomino-F')
  })

  it('names the piece you are most often left holding', () => {
    const stats = computeStats([
      ...someGames(MIN_GAMES_FOR_FAVORITES, { yourPiecesLeft: ['pentomino-I', 'domino'] }),
      game({ id: 'extra', yourPiecesLeft: ['pentomino-I'] }),
    ])

    expect(stats.leftBehindPiece?.pieceId).toBe('pentomino-I')
    expect(stats.leftBehindPiece?.yours).toBe(MIN_GAMES_FOR_FAVORITES + 1)
  })

  it('counts left-behind plainly, even when opponents struggle with it too', () => {
    // The piece you are stuck with is usually one everybody finds hard to place,
    // so measuring it against the opponents the way the favourite is measured
    // buries it: a piece left behind three times but never by them would win
    // over one left behind in every game. "Most" has to mean most.
    const history = [
      ...someGames(4, { yourPiecesLeft: ['pentomino-X'], theirPiecesLeft: ['pentomino-X'] }),
      game({ id: 'rare', yourPiecesLeft: ['monomino'], theirPiecesLeft: [] }),
    ]

    expect(computeStats(history).leftBehindPiece?.pieceId).toBe('pentomino-X')
  })

  it('says nothing when you have never been left holding anything', () => {
    const stats = computeStats(someGames(MIN_GAMES_FOR_FAVORITES, { yourPiecesLeft: [] }))
    expect(stats.leftBehindPiece).toBeNull()
  })

  it('picks the same piece out of a tie every time', () => {
    // With every piece equally placed, the choice rests entirely on the tie
    // break — and an unstable one would rename your favourite piece on a reload.
    const history = someGames(MIN_GAMES_FOR_FAVORITES, { yourPiecesLeft: [] })
    const first = computeStats(history).favoritePiece?.pieceId
    const again = computeStats([...history].reverse()).favoritePiece?.pieceId

    expect(first).toBe(again)
    expect(first).toBeTruthy()
  })

  it('ignores a piece id that is not one of the 21', () => {
    const history = someGames(MIN_GAMES_FOR_FAVORITES, {
      yourPiecesLeft: ['not-a-piece' as PieceId],
    })

    const stats = computeStats(history)
    // The junk id is dropped, which leaves nothing legitimately left behind.
    expect(stats.leftBehindPiece).toBeNull()
    expect(stats.averagePiecesLeft).toBe(1)
  })
})

describe('the recent list', () => {
  it('puts the newest game first, whatever order storage held', () => {
    const stats = computeStats([
      game({ id: 'middle', finishedAt: '2026-08-05T12:00:00.000Z' }),
      game({ id: 'newest', finishedAt: '2026-08-09T12:00:00.000Z' }),
      game({ id: 'oldest', finishedAt: '2026-08-01T12:00:00.000Z' }),
    ])

    expect(stats.recent.map((r) => r.id)).toEqual(['newest', 'middle', 'oldest'])
  })

  it('stops at ten games without affecting the totals', () => {
    const stats = computeStats(someGames(14, { yourPiecesLeft: ['monomino'] }))

    expect(stats.recent).toHaveLength(10)
    expect(stats.games).toBe(14)
    expect(stats.wins).toBe(14)
  })

  it('carries what each row shows', () => {
    const stats = computeStats([
      game({
        id: 'one',
        yourColor: 'green',
        yourRank: 2,
        yourScore: -7,
        yourPiecesLeft: ['domino'],
        timed: true,
      }),
    ])

    expect(stats.recent[0]).toMatchObject({
      id: 'one',
      color: 'green',
      score: -7,
      piecesLeft: 1,
      outcome: 'loss',
      timed: true,
      strength: S.hard,
    })
  })
})

describe('outcomeFor', () => {
  it('reads a rank against the rest of the table', () => {
    const record = game({ yourRank: 1, tiedWith: ['red'] })
    const you = record.players.find((p) => p.color === 'blue')!
    const loser = record.players.find((p) => p.color === 'yellow')!

    expect(outcomeFor(record, you)).toBe('draw')
    expect(outcomeFor(record, loser)).toBe('loss')
  })
})

describe('per-friend records', () => {
  /** An online game, with who held each seat recorded. */
  function online(options: {
    id?: string
    finishedAt?: string
    /** playerId → rank. Yours is 'me'. */
    ranks: Record<string, number>
    scores?: Record<string, number>
  }): GameRecord {
    const ids = Object.keys(options.ranks)
    const players: GameRecordPlayer[] = ids.map((id, i) => ({
      color: COLORS[i],
      seat: 'human',
      score: options.scores?.[id] ?? -options.ranks[id],
      remainingSquares: 0,
      piecesLeft: [],
      perfectGame: false,
      rank: options.ranks[id],
      playerId: id,
      username: id,
    }))
    return {
      id: options.id ?? Math.random().toString(36).slice(2),
      finishedAt: options.finishedAt ?? '2026-08-01T12:00:00.000Z',
      mode: 'online',
      strength: null,
      timed: false,
      yourColor: players.find((p) => p.playerId === 'me')!.color,
      movesPlayed: 60,
      players,
    }
  }

  it('counts finishing above them, which is not the same as winning', () => {
    // Second of four, but ahead of dave: a loss overall and a win against him.
    const stats = computeFriends([online({ ranks: { winner: 1, me: 2, dave: 3 } })], 'me')

    const dave = stats.friends.find((f) => f.username === 'dave')!
    expect(dave.wins).toBe(1)
    expect(dave.losses).toBe(0)
    expect(dave.meetings[0].outcome).toBe('win')
    // And the game itself was not yours.
    expect(dave.meetings[0].wonOverall).toBe(false)
  })

  it('counts finishing level as a draw between you', () => {
    const stats = computeFriends([online({ ranks: { me: 1, dave: 1 } })], 'me')
    expect(stats.friends[0]).toMatchObject({ wins: 0, draws: 1, losses: 0 })
  })

  it('builds a record over several games', () => {
    const stats = computeFriends(
      [
        online({ id: 'a', ranks: { me: 1, dave: 2 } }),
        online({ id: 'b', ranks: { me: 3, dave: 1 } }),
        online({ id: 'c', ranks: { me: 2, dave: 2 } }),
      ],
      'me',
    )

    expect(stats.friends[0]).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1 })
  })

  it('keeps each friend apart in a game with several', () => {
    const stats = computeFriends([online({ ranks: { me: 2, dave: 1, sam: 3 } })], 'me')

    expect(stats.friends.find((f) => f.username === 'dave')!.losses).toBe(1)
    expect(stats.friends.find((f) => f.username === 'sam')!.wins).toBe(1)
  })

  it('averages both scores, so the record has a size as well as a shape', () => {
    const stats = computeFriends(
      [
        online({ ranks: { me: 1, dave: 2 }, scores: { me: -4, dave: -20 } }),
        online({ ranks: { me: 1, dave: 2 }, scores: { me: -10, dave: -30 } }),
      ],
      'me',
    )

    expect(stats.friends[0].yourAverageScore).toBe(-7)
    expect(stats.friends[0].theirAverageScore).toBe(-25)
  })

  it('puts whoever you played most recently first', () => {
    const stats = computeFriends(
      [
        online({ ranks: { me: 1, dave: 2 }, finishedAt: '2026-08-01T00:00:00.000Z' }),
        online({ ranks: { me: 1, sam: 2 }, finishedAt: '2026-08-09T00:00:00.000Z' }),
      ],
      'me',
    )

    expect(stats.friends.map((f) => f.username)).toEqual(['sam', 'dave'])
  })

  it('never counts you as your own opponent', () => {
    const stats = computeFriends([online({ ranks: { me: 1, dave: 2 } })], 'me')
    expect(stats.friends.map((f) => f.playerId)).toEqual(['dave'])
  })

  it('ignores computer seats', () => {
    const record = online({ ranks: { me: 1, dave: 2 } })
    record.players.push({
      color: 'green',
      seat: 'computer',
      score: -30,
      remainingSquares: 30,
      piecesLeft: [],
      perfectGame: false,
      rank: 3,
    })

    expect(computeFriends([record], 'me').friends).toHaveLength(1)
  })

  it('owns up to online games that recorded no names', () => {
    // Everything played before seats carried names. Counted rather than quietly
    // left out, so a thin record is explained instead of just looking wrong.
    const older = online({ ranks: { me: 1, dave: 2 } })
    for (const p of older.players) {
      delete p.playerId
      delete p.username
    }

    const stats = computeFriends([older, online({ ranks: { me: 1, sam: 2 } })], 'me')
    expect(stats.unattributedGames).toBe(1)
    expect(stats.friends.map((f) => f.username)).toEqual(['sam'])
  })

  it('does not count a solo game as unattributed', () => {
    // A solo game has no friend in it to miss.
    expect(computeFriends([game({})], 'me').unattributedGames).toBe(0)
  })
})
