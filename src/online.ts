import { applyMove, chooseMove, COLORS, createGame, replayMoves, STRONGEST } from './game'
import type { Color, GameState, PlacedPiece, Strength } from './game'
import { newGameId } from './session'
import type { Seat } from './session'

/**
 * A game played against friends, across days and devices.
 *
 * The canonical state is the **move list**, not a board. `replayMoves` rebuilds
 * the exact state from it — whose turn it is, who has passed out, every hand —
 * so a game is small enough to sit in one document, two devices can never
 * disagree about what happened, and appending a move is the only write there is.
 * Anything derived (the board, the turn) is recomputed on open.
 *
 * Every game seats all four colors whatever the number of people, because a
 * 20x20 board with two colors on it is a much slacker game: with half the
 * pieces never coming out there is so much free space that blocking barely
 * matters. How the spare colors get filled is the creator's choice — see
 * `SeatFill`.
 */
export interface OnlineGame {
  id: string
  createdAt: string
  /** Touched on every move, so the games list can sort by what moved last. */
  updatedAt: string
  seats: Record<Color, OnlineSeat>
  /**
   * The color that opens, drawn when the game is made.
   *
   * Stored because an empty move list has nothing to infer it from, and seats go
   * out in board order — so without a draw the person who created the game would
   * open every single time, which is a standing advantage rather than a game.
   * Once a move exists, `replayMoves` recovers the opener from it and this is
   * only a cross-check.
   */
  firstColor: Color
  /**
   * The people in this game. Denormalised out of `seats` so the store can find
   * "every game @eric is in" with one query, which it cannot do across the
   * four separate fields of a map.
   */
  playerIds: string[]
  moves: PlacedPiece[]
  /**
   * Set when the game ends. Stored rather than derived so the list can separate
   * finished games from live ones without replaying every one of them.
   */
  finished: boolean
}

/**
 * One color's seat. A human seat carries who owns it; the same player may own
 * two colors, which is how a two-player game uses the whole board.
 */
export interface OnlineSeat extends Seat {
  /** Absent on a computer seat. */
  playerId?: string
  /** Kept alongside the id so the board can name people without a second lookup. */
  username?: string
}

/** How the colors nobody claimed are dealt with. */
export type SeatFill =
  /** Each person plays two colors, on opposite corners. Two players only. */
  | 'double'
  /** The computer takes what is left over. */
  | 'computer'

export interface Participant {
  playerId: string
  username: string
}

/**
 * Opposite corners, so a player holding two colors holds two that start as far
 * apart as the board allows. Adjacent corners would hand them a contiguous
 * quarter of the board to build from, which is a different and much stronger
 * game than the one everyone else is playing.
 */
const DOUBLE_PAIRS: [Color, Color][] = [
  ['blue', 'red'],
  ['yellow', 'green'],
]

export class SeatingError extends Error {}

/**
 * Lays out the four colors over the people playing.
 *
 * `participants` is in join order with the creator first, and seats are handed
 * out in board order, so the creator opens unless the draw says otherwise.
 */
export function assignSeats(
  participants: Participant[],
  fill: SeatFill,
  strength: Strength = STRONGEST,
): Record<Color, OnlineSeat> {
  if (participants.length < 2) {
    throw new SeatingError('An online game needs at least two people.')
  }
  if (participants.length > COLORS.length) {
    throw new SeatingError(`No more than ${COLORS.length} people can play.`)
  }
  if (fill === 'double' && participants.length !== 2) {
    throw new SeatingError('Two colors each only works with exactly two players.')
  }

  const seats = {} as Record<Color, OnlineSeat>

  if (fill === 'double') {
    DOUBLE_PAIRS.forEach((pair, i) => {
      for (const color of pair) {
        seats[color] = { kind: 'human', ...participants[i] }
      }
    })
    return seats
  }

  COLORS.forEach((color, i) => {
    const person = participants[i]
    seats[color] = person ? { kind: 'human', ...person } : { kind: 'computer', strength }
  })
  return seats
}

/**
 * The fills that make sense for a given number of people, in the order they
 * should be offered. Three players can only be filled by the computer: two
 * colors each would need six.
 */
export function fillsFor(playerCount: number): SeatFill[] {
  if (playerCount === 2) return ['double', 'computer']
  return ['computer']
}

export function createOnlineGame(
  participants: Participant[],
  fill: SeatFill,
  strength: Strength = STRONGEST,
  now = new Date(),
  random: () => number = Math.random,
): OnlineGame {
  const seats = assignSeats(participants, fill, strength)
  const stamp = now.toISOString()

  const game: OnlineGame = {
    id: newGameId(),
    createdAt: stamp,
    updatedAt: stamp,
    seats,
    firstColor: COLORS[Math.floor(random() * COLORS.length)],
    // De-duplicated: a player holding two colors is still one person in a query.
    playerIds: [...new Set(participants.map((p) => p.playerId))],
    moves: [],
    finished: false,
  }

  // If the draw opened on a computer, its move has to be in the game before
  // anyone sees it: until a person is on turn, nobody has a legal action, and a
  // game where nobody can act is one nobody can rescue.
  return { ...game, moves: advanceComputers(game, stateOf(game), random) }
}

/**
 * Rebuilds the board and turn from the move list.
 *
 * The opener comes from the first move when there is one and from the stored
 * draw when there isn't — `replayMoves` reads it off move zero, which an empty
 * list doesn't have.
 */
export function stateOf(game: OnlineGame): GameState {
  return stateFrom(game.firstColor, game.moves)
}

function stateFrom(firstColor: Color, moves: PlacedPiece[]): GameState {
  return moves.length > 0 ? replayMoves(COLORS, moves) : createGame(COLORS, firstColor)
}

/** The color due to play, or null once the game is over. */
export function colorToPlay(state: GameState): Color | null {
  if (state.gameOver) return null
  return state.players[state.currentPlayerIndex].color
}

/**
 * Whether `playerId` is the one holding the color due to play. False on a
 * computer's turn and on a finished game — see `advanceComputers` for why a
 * computer's turn never sits waiting for long.
 */
export function isYourTurn(game: OnlineGame, playerId: string, state = stateOf(game)): boolean {
  const color = colorToPlay(state)
  if (!color) return false
  const seat = game.seats[color]
  return seat.kind === 'human' && seat.playerId === playerId
}

/** Every color `playerId` is playing, in board order. */
export function colorsOf(game: OnlineGame, playerId: string): Color[] {
  return COLORS.filter((c) => game.seats[c].playerId === playerId)
}

/** The other people in the game, each listed once. */
export function opponentsOf(game: OnlineGame, playerId: string): Participant[] {
  const seen = new Map<string, Participant>()
  for (const color of COLORS) {
    const seat = game.seats[color]
    if (seat.kind !== 'human' || !seat.playerId || seat.playerId === playerId) continue
    if (!seen.has(seat.playerId)) {
      seen.set(seat.playerId, { playerId: seat.playerId, username: seat.username ?? '' })
    }
  }
  return [...seen.values()]
}

/**
 * Plays out every computer turn that follows, and returns the moves to append.
 *
 * This is why an online game never stalls. Nothing runs on a server, so a
 * computer seat has no one to move it — if the app simply waited for the
 * computer's turn to be taken, a game with a bot in it would stop dead the
 * moment the turn reached it and no human could unstick it, because it would
 * never be any human's turn again. So the device that just moved keeps going
 * until the turn comes back to a person, and writes the whole run at once.
 *
 * The `guard` is a hard stop on the loop rather than a belief about game length:
 * every iteration must consume a piece, so the loop cannot outlast the pieces,
 * and a run that long means the engine and the search disagree.
 */
export function advanceComputers(
  game: OnlineGame,
  from: GameState,
  random: () => number = Math.random,
): PlacedPiece[] {
  const added: PlacedPiece[] = []
  let state = from
  let guard = 0

  while (!state.gameOver) {
    const color = colorToPlay(state)
    if (!color) break

    const seat = game.seats[color]
    if (seat.kind !== 'computer') break
    if (guard++ > COLORS.length * 21) break

    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p.color !== color).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, seat.strength ?? STRONGEST, random)
    // advanceTurn only stops on a player who has a move, so null here would mean
    // the engine and the search disagree. Stopping leaves the turn where it is,
    // which is recoverable; forcing an illegal move would not be.
    if (!move) break

    state = applyMove(state, move)
    added.push(state.placedPieces[state.placedPieces.length - 1])
  }

  return added
}

export class TurnError extends Error {}

/**
 * Your move, plus any computer replies it triggers, applied to a copy of the
 * game.
 *
 * The board is rebuilt from the stored moves rather than trusted from the
 * caller, so a screen left open on a stale game cannot write a move into a
 * position that no longer exists — it fails here instead.
 */
export function submitMove(
  game: OnlineGame,
  playerId: string,
  move: { pieceId: PlacedPiece['pieceId']; cells: PlacedPiece['cells'] },
  now = new Date(),
  random: () => number = Math.random,
): OnlineGame {
  const state = stateOf(game)
  const color = colorToPlay(state)

  if (!color) throw new TurnError('This game has finished.')
  if (!isYourTurn(game, playerId, state)) {
    throw new TurnError(`It is ${game.seats[color].username ?? 'the computer'}'s turn.`)
  }

  // applyMove validates legality and throws on anything illegal, so this is
  // also the check that the placement is legal at all.
  const played = applyMove(state, { pieceId: move.pieceId, cells: move.cells })
  const yours = played.placedPieces[played.placedPieces.length - 1]
  const replies = advanceComputers(game, played, random)

  const moves = [...game.moves, yours, ...replies]
  return {
    ...game,
    moves,
    updatedAt: now.toISOString(),
    finished: stateFrom(game.firstColor, moves).gameOver,
  }
}

/** A short line saying what a game is waiting for. */
function statusLine(game: OnlineGame, state: GameState, yourTurn: boolean): string {
  if (state.gameOver) return 'Finished'
  if (yourTurn) return 'Your turn'

  const color = colorToPlay(state)
  // Only ever seen in the gap before whoever moved last writes the replies.
  if (color && game.seats[color].kind === 'computer') return 'Computer thinking'
  return `Waiting on @${(color && game.seats[color].username) || 'someone'}`
}

/**
 * The authoritative read of a game: replays the moves, so everything in it is
 * derived from the only thing that is true. Use it when opening a game.
 */
export interface GameSummary {
  game: OnlineGame
  state: GameState
  yourTurn: boolean
  finished: boolean
  status: string
}

export function summarize(game: OnlineGame, playerId: string): GameSummary {
  const state = stateOf(game)
  const yourTurn = isYourTurn(game, playerId, state)
  return { game, state, yourTurn, finished: state.gameOver, status: statusLine(game, state, yourTurn) }
}

/**
 * One row of the games list. No board, on purpose — see `listEntry`.
 */
export interface ListEntry {
  game: OnlineGame
  yourTurn: boolean
  finished: boolean
  status: string
}

/**
 * A row for the list, without replaying a game it doesn't have to.
 *
 * Rebuilding a full game costs real time — tens of milliseconds each — so a list
 * that replayed every finished game would get slower every time somebody
 * finished one, for no gain: a finished game has no turn to work out. So the
 * stored `finished` flag is trusted *here only*, and live games are still
 * replayed to find whose turn it is.
 *
 * The cost of that trust is bounded and recoverable: a flag wrongly set would
 * file a live game under finished in this list, and opening it replays the moves
 * and shows the truth. Nothing is written from this path.
 */
export function listEntry(game: OnlineGame, playerId: string): ListEntry {
  if (game.finished) return { game, yourTurn: false, finished: true, status: 'Finished' }

  const state = stateOf(game)
  const yourTurn = isYourTurn(game, playerId, state)
  return { game, yourTurn, finished: state.gameOver, status: statusLine(game, state, yourTurn) }
}

/**
 * Your games: the ones waiting on you first, then the rest by most recent move,
 * with finished games below both. The list is a to-do before it is a history.
 */
export function sortForPlayer(games: OnlineGame[], playerId: string): ListEntry[] {
  return games
    .map((game) => listEntry(game, playerId))
    .sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? 1 : -1
      if (a.yourTurn !== b.yourTurn) return a.yourTurn ? -1 : 1
      return (b.game.updatedAt ?? '').localeCompare(a.game.updatedAt ?? '')
    })
}
