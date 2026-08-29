import { COLORS, PIECE_BY_ID, PIECE_DEFINITIONS } from './game'
import type { Color, PieceId, Strength } from './game'
import type { GameRecord, GameRecordPlayer } from './history'

/**
 * Everything the stats screen shows, derived from the recorded games and nothing
 * else. Kept out of the component so it can be tested against a handful of made
 * up games rather than by playing them.
 *
 * A game only counts towards a personal record if the record says which seat
 * was yours. Games from the old pass-and-play mode don't: four people shared one
 * phone, so there is no "you" to attribute a win to. They are counted separately
 * rather than silently dropped, so the totals here still add up against the
 * number on the home screen.
 */
export interface Stats {
  /** Solo games — the ones every figure below is drawn from. */
  games: number
  /** Games in the history with no attributable seat — all of them legacy. */
  sharedGames: number
  wins: number
  /** Finished level with at least one other player, top of the pile. */
  draws: number
  losses: number
  perfectGames: number
  /** Null rather than zero when there is nothing to average yet. */
  averagePiecesLeft: number | null
  averageSquaresLeft: number | null
  /** Computed but not currently on the screen — the tile it had gave way to squares left. */
  bestScore: number | null
  /** One row per color you have actually played, most-played first. */
  colors: ColorTally[]
  favoriteColor: Color | null
  /**
   * The piece you place more often than your opponents do, and the one you are
   * most often left holding. Null until there are enough games for either to
   * mean anything — see MIN_GAMES_FOR_FAVORITES.
   */
  favoritePiece: PieceTally | null
  leftBehindPiece: PieceTally | null
  recent: RecentGame[]
}

export interface ColorTally {
  color: Color
  played: number
  won: number
}

export interface PieceTally {
  pieceId: PieceId
  /**
   * Your count of whatever the tally is measuring: games you placed this piece
   * in for the favourite, games you were left holding it for the other.
   */
  yours: number
  /**
   * The opponent seats' rate for the same thing, as a fraction of 1 — their
   * placement rate alongside a favourite, their leave rate alongside a piece you
   * are stuck with.
   */
  theirRate: number
  /**
   * Your rate minus theirs, so positive means you place it more than they do.
   * Only meaningful on the favourite, which is ranked on it; zero on the piece
   * you are left holding, which is ranked on the plain count.
   */
  edge: number
}

export type Outcome = 'win' | 'draw' | 'loss'

export interface RecentGame {
  id: string
  finishedAt: string
  color: Color
  score: number
  piecesLeft: number
  perfectGame: boolean
  outcome: Outcome
  timed: boolean
  strength: Strength | null
}

/**
 * Below this many games the favourites are noise — with two games played, any
 * piece you happened to place twice ties for first. The screen says it is still
 * counting rather than showing a number that will change completely next game.
 */
export const MIN_GAMES_FOR_FAVORITES = 3

/** How many games the recent list shows. */
const RECENT_LIMIT = 10

const ALL_PIECE_IDS: PieceId[] = PIECE_DEFINITIONS.map((p) => p.id)

/**
 * Win, draw or loss for one seat. `rank` is shared between equal scores, so
 * coming first alongside somebody else is a draw at the top rather than a win —
 * which matches what the game-over screen already tells you.
 */
export function outcomeFor(record: GameRecord, player: GameRecordPlayer): Outcome {
  if (player.rank !== 1) return 'loss'
  return record.players.filter((p) => p.rank === 1).length > 1 ? 'draw' : 'win'
}

/** Your seat in a solo game, or null if this record has no human seat to read. */
function yourSeat(record: GameRecord): GameRecordPlayer | null {
  if (!record.yourColor) return null
  return record.players.find((p) => p.color === record.yourColor) ?? null
}

/**
 * Newest first. Sorted by the recorded finish time rather than trusting the
 * order in storage, since a game synced or restored out of order would otherwise
 * show up in the wrong place. A record with no usable timestamp sorts last.
 */
function newestFirst(records: GameRecord[]): GameRecord[] {
  return [...records].sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
}

export function computeStats(history: GameRecord[]): Stats {
  const solo: { record: GameRecord; you: GameRecordPlayer }[] = []
  let sharedGames = 0

  for (const record of newestFirst(history)) {
    const you = yourSeat(record)
    if (you) solo.push({ record, you })
    else sharedGames++
  }

  const games = solo.length
  let wins = 0
  let draws = 0
  let losses = 0
  let perfectGames = 0
  let piecesLeftTotal = 0
  let squaresLeftTotal = 0
  let bestScore: number | null = null

  const played = new Map<Color, number>()
  const wonWith = new Map<Color, number>()

  // Per piece: the games you placed it in, and the opponent seats that placed
  // it in those same games. Comparing the two is what makes "favourite" mean
  // something — see favoritePieceFrom.
  const yoursByPiece = new Map<PieceId, number>()
  const theirsByPiece = new Map<PieceId, number>()
  const leftByPiece = new Map<PieceId, number>()
  let opponentSeats = 0

  for (const { record, you } of solo) {
    const outcome = outcomeFor(record, you)
    if (outcome === 'win') wins++
    else if (outcome === 'draw') draws++
    else losses++

    if (you.perfectGame) perfectGames++
    piecesLeftTotal += you.piecesLeft.length
    squaresLeftTotal += you.remainingSquares
    bestScore = bestScore === null ? you.score : Math.max(bestScore, you.score)

    played.set(you.color, (played.get(you.color) ?? 0) + 1)
    if (outcome === 'win') wonWith.set(you.color, (wonWith.get(you.color) ?? 0) + 1)

    const yoursLeft = knownPieces(you.piecesLeft)
    for (const id of ALL_PIECE_IDS) {
      if (yoursLeft.has(id)) leftByPiece.set(id, (leftByPiece.get(id) ?? 0) + 1)
      else yoursByPiece.set(id, (yoursByPiece.get(id) ?? 0) + 1)
    }

    for (const other of record.players) {
      if (other.color === you.color) continue
      opponentSeats++
      const theirLeft = knownPieces(other.piecesLeft)
      for (const id of ALL_PIECE_IDS) {
        if (!theirLeft.has(id)) theirsByPiece.set(id, (theirsByPiece.get(id) ?? 0) + 1)
      }
    }
  }

  const colors = COLORS.filter((c) => (played.get(c) ?? 0) > 0)
    .map((color) => ({
      color,
      played: played.get(color) ?? 0,
      won: wonWith.get(color) ?? 0,
    }))
    // Most played first, then the one you win with most, then board order — so
    // the list never reshuffles itself between two renders of the same history.
    .sort((a, b) => b.played - a.played || b.won - a.won || COLORS.indexOf(a.color) - COLORS.indexOf(b.color))

  const enough = games >= MIN_GAMES_FOR_FAVORITES

  return {
    games,
    sharedGames,
    wins,
    draws,
    losses,
    perfectGames,
    averagePiecesLeft: games > 0 ? piecesLeftTotal / games : null,
    averageSquaresLeft: games > 0 ? squaresLeftTotal / games : null,
    bestScore,
    colors,
    favoriteColor: colors[0]?.color ?? null,
    favoritePiece: enough
      ? favoritePieceFrom(games, opponentSeats, yoursByPiece, theirsByPiece)
      : null,
    leftBehindPiece: enough ? leftBehindFrom(opponentSeats, leftByPiece, theirsByPiece) : null,
    recent: solo.slice(0, RECENT_LIMIT).map(({ record, you }) => ({
      id: record.id,
      finishedAt: record.finishedAt,
      color: you.color,
      score: you.score,
      piecesLeft: you.piecesLeft.length,
      perfectGame: you.perfectGame,
      outcome: outcomeFor(record, you),
      timed: record.timed,
      strength: record.strength,
    })),
  }
}

/** Drops anything in a stored list that isn't one of the 21 pieces. */
function knownPieces(ids: PieceId[]): Set<PieceId> {
  return new Set(ids.filter((id) => id in PIECE_BY_ID))
}

/**
 * Your favourite piece, as the one you place more often than your opponents do
 * in the same games.
 *
 * A plain count of what you place most would name the monomino for everybody:
 * small pieces fit anywhere, so they are the ones that reliably get down, and
 * the answer would say more about Blokus than about you. Measuring against the
 * other seats in the very same games cancels that baseline out — every piece is
 * equally easy for them too — and what is left is a genuine preference.
 */
function favoritePieceFrom(
  games: number,
  opponentSeats: number,
  yoursByPiece: Map<PieceId, number>,
  theirsByPiece: Map<PieceId, number>,
): PieceTally | null {
  return bestBy(
    (id) => {
      const yours = yoursByPiece.get(id) ?? 0
      const theirRate = opponentSeats > 0 ? (theirsByPiece.get(id) ?? 0) / opponentSeats : 0
      return { pieceId: id, yours, theirRate, edge: yours / games - theirRate }
    },
    (tally) => tally.edge,
  )
}

/**
 * The piece you most often end up still holding — ranked on the plain count,
 * because that is what "most" means where it is shown, and a piece you were
 * stuck with eight times has to beat one you were stuck with three times.
 *
 * Deliberately not the differential used for the favourite. There, comparing
 * against the opponents is the point: it strips out the fact that small pieces
 * are easy for everybody. Here it would do the opposite — the piece everyone
 * struggles to place is exactly the one you are genuinely left holding, and
 * subtracting their struggle would hide it behind something rarer.
 *
 * The opponents' rate still rides along, so the screen can say whether it is a
 * common problem or particularly yours.
 */
function leftBehindFrom(
  opponentSeats: number,
  leftByPiece: Map<PieceId, number>,
  theirsByPiece: Map<PieceId, number>,
): PieceTally | null {
  const best = bestBy(
    (id) => {
      const left = leftByPiece.get(id) ?? 0
      const placedByThem = opponentSeats > 0 ? (theirsByPiece.get(id) ?? 0) / opponentSeats : 1
      return { pieceId: id, yours: left, theirRate: 1 - placedByThem, edge: 0 }
    },
    (tally) => tally.yours,
  )
  // Nothing left behind in any game is a perfect record, not a statistic.
  return best && best.yours > 0 ? best : null
}

/**
 * Highest `rank` wins. Ties break on the bigger piece and then on the fixed
 * piece order, so the same history always names the same piece — with 21 pieces
 * and a handful of games, exact ties are common rather than a corner case.
 */
function bestBy(
  measure: (id: PieceId) => PieceTally,
  rank: (tally: PieceTally) => number,
): PieceTally | null {
  let best: PieceTally | null = null
  for (const id of ALL_PIECE_IDS) {
    const candidate = measure(id)
    if (
      best === null ||
      rank(candidate) > rank(best) ||
      (rank(candidate) === rank(best) && pieceSize(id) > pieceSize(best.pieceId))
    ) {
      best = candidate
    }
  }
  return best
}

function pieceSize(id: PieceId): number {
  return PIECE_BY_ID[id].cells.length
}

/**
 * Your record against one person, across every game you have both been in.
 *
 * "Beat them" means finishing above them, not winning the game — in a
 * four-player game those are different questions, and the one you actually
 * argue about afterwards is the first.
 */
export interface FriendStats {
  playerId: string
  /** The most recent name they were recorded under. */
  username: string
  games: number
  /** Games you finished above them. */
  wins: number
  /** Games you finished level with them. */
  draws: number
  losses: number
  yourAverageScore: number
  theirAverageScore: number
  /** Newest first. */
  meetings: FriendMeeting[]
}

export interface FriendMeeting {
  id: string
  finishedAt: string
  /** How you did against them, not how the game went overall. */
  outcome: Outcome
  yourScore: number
  theirScore: number
  yourColor: Color
  theirColor: Color
  /** Whether the game as a whole was yours — a different question. */
  wonOverall: boolean
}

/**
 * Everyone you have played, most recently met first.
 *
 * Only games that recorded who held each seat can be counted, which means
 * online games finished after that was stored. `unattributedGames` is how many
 * are known to be missing, so the screen can say so rather than quietly
 * under-counting somebody's record.
 */
export interface FriendsSummary {
  friends: FriendStats[]
  unattributedGames: number
}

export function computeFriends(history: GameRecord[], playerId: string): FriendsSummary {
  const byPlayer = new Map<string, FriendStats>()
  let unattributed = 0

  for (const record of newestFirst(history)) {
    const you = record.players.find((p) => p.playerId === playerId)
    if (!you) {
      // An online game from before seats carried names. Counted so the screen
      // can admit to it; solo games are not missing anything.
      if (record.mode === 'online') unattributed++
      continue
    }

    for (const them of record.players) {
      if (them.seat !== 'human' || !them.playerId || them.playerId === playerId) continue

      const friend =
        byPlayer.get(them.playerId) ??
        ({
          playerId: them.playerId,
          username: them.username ?? 'someone',
          games: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          yourAverageScore: 0,
          theirAverageScore: 0,
          meetings: [],
        } satisfies FriendStats)

      // Head to head: who finished above whom.
      const outcome: Outcome =
        you.rank === them.rank ? 'draw' : you.rank < them.rank ? 'win' : 'loss'

      friend.games++
      if (outcome === 'win') friend.wins++
      else if (outcome === 'draw') friend.draws++
      else friend.losses++

      friend.yourAverageScore += you.score
      friend.theirAverageScore += them.score
      friend.meetings.push({
        id: record.id,
        finishedAt: record.finishedAt,
        outcome,
        yourScore: you.score,
        theirScore: them.score,
        yourColor: you.color,
        theirColor: them.color,
        wonOverall: you.rank === 1 && record.players.filter((p) => p.rank === 1).length === 1,
      })

      byPlayer.set(them.playerId, friend)
    }
  }

  const friends = [...byPlayer.values()].map((friend) => ({
    ...friend,
    yourAverageScore: friend.yourAverageScore / friend.games,
    theirAverageScore: friend.theirAverageScore / friend.games,
  }))

  // Most recently played first: who you are in the middle of a run with is more
  // use than who you have played most since the beginning of time.
  friends.sort((a, b) =>
    (b.meetings[0]?.finishedAt ?? '').localeCompare(a.meetings[0]?.finishedAt ?? ''),
  )

  return { friends, unattributedGames: unattributed }
}
