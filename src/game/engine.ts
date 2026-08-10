import {
  checkPlacement,
  cellsForPlacement,
  createEmptyBoard,
  findContactPoints,
  placeCells,
} from './board'
import type { Board } from './board'
import { getOrientations, PIECE_DEFINITIONS } from './pieces'
import { computeScore } from './scoring'
import type { ScoreResult } from './scoring'
import { BOARD_SIZE } from './types'
import type { Color, PieceId, PlacedPiece, Point } from './types'

export interface PlayerState {
  color: Color
  remainingPieceIds: PieceId[]
  hasPlayedFirstMove: boolean
  lastPiecePlayedId: PieceId | null
  /** True once this player has no legal move and is skipped for the rest of the game. */
  passedOut: boolean
}

export interface GameState {
  board: Board
  players: PlayerState[]
  currentPlayerIndex: number
  placedPieces: PlacedPiece[]
  gameOver: boolean
}

export interface Move {
  pieceId: PieceId
  cells: Point[]
}

const ALL_PIECE_IDS: PieceId[] = PIECE_DEFINITIONS.map((p) => p.id)

export function createGame(colors: Color[]): GameState {
  return {
    board: createEmptyBoard(),
    players: colors.map((color) => ({
      color,
      remainingPieceIds: [...ALL_PIECE_IDS],
      hasPlayedFirstMove: false,
      lastPiecePlayedId: null,
      passedOut: false,
    })),
    currentPlayerIndex: 0,
    placedPieces: [],
    gameOver: false,
  }
}

/**
 * Walks every placement of this piece that covers at least one contact point,
 * which is exactly the set that could possibly be legal. Anchors are
 * deduplicated, since different (contact point, piece cell) pairs frequently
 * describe the same position. Return true from `visit` to stop early.
 */
function eachCandidatePlacement(
  pieceId: PieceId,
  contactPoints: Point[],
  visit: (cells: Point[]) => boolean | void,
): void {
  for (const orientation of getOrientations(pieceId)) {
    const seenAnchors = new Set<number>()

    for (const [pointCol, pointRow] of contactPoints) {
      for (const [offsetCol, offsetRow] of orientation.cells) {
        const anchorCol = pointCol - offsetCol
        const anchorRow = pointRow - offsetRow
        // Anchors may sit off-board, so bias into a non-negative key range.
        const key = (anchorRow + BOARD_SIZE) * BOARD_SIZE * 4 + (anchorCol + BOARD_SIZE)
        if (seenAnchors.has(key)) continue
        seenAnchors.add(key)

        if (visit(cellsForPlacement(orientation, [anchorCol, anchorRow])) === true) return
      }
    }
  }
}

/** All valid cell sets for placing this piece anywhere on the board right now. */
export function findLegalPlacements(
  board: Board,
  color: Color,
  pieceId: PieceId,
  isFirstMoveForColor: boolean,
): Point[][] {
  const contactPoints = findContactPoints(board, color, isFirstMoveForColor)
  const results: Point[][] = []

  eachCandidatePlacement(pieceId, contactPoints, (cells) => {
    if (checkPlacement(board, color, cells, isFirstMoveForColor).valid) results.push(cells)
  })

  return results
}

/** Short-circuiting existence check, cheaper than findLegalPlacements when you just need a yes/no. */
export function hasAnyLegalMove(board: Board, player: PlayerState): boolean {
  const isFirstMove = !player.hasPlayedFirstMove
  const contactPoints = findContactPoints(board, player.color, isFirstMove)
  // A colour with nowhere left to touch a corner is finished, whatever it holds.
  if (contactPoints.length === 0) return false

  for (const pieceId of player.remainingPieceIds) {
    let found = false
    eachCandidatePlacement(pieceId, contactPoints, (cells) => {
      if (checkPlacement(board, player.color, cells, isFirstMove).valid) {
        found = true
        return true
      }
    })
    if (found) return true
  }

  return false
}

export function applyMove(state: GameState, move: Move): GameState {
  const player = state.players[state.currentPlayerIndex]
  const check = checkPlacement(state.board, player.color, move.cells, !player.hasPlayedFirstMove)
  if (!check.valid) {
    throw new Error(`Illegal move: ${check.reason}`)
  }
  if (!player.remainingPieceIds.includes(move.pieceId)) {
    throw new Error(`Illegal move: piece already played`)
  }

  const board = placeCells(state.board, player.color, move.cells)
  const players = state.players.map((p, i): PlayerState =>
    i === state.currentPlayerIndex
      ? {
          ...p,
          remainingPieceIds: p.remainingPieceIds.filter((id) => id !== move.pieceId),
          hasPlayedFirstMove: true,
          lastPiecePlayedId: move.pieceId,
        }
      : p,
  )
  const placedPieces = [
    ...state.placedPieces,
    { pieceId: move.pieceId, color: player.color, cells: move.cells },
  ]

  return advanceTurn({ ...state, board, players, placedPieces })
}

/** Moves to the next player who has a legal move, marking players with none as passed out. Ends the game when nobody can move. */
export function advanceTurn(state: GameState): GameState {
  const players = state.players.map((p) => ({ ...p }))
  const n = players.length

  for (let step = 1; step <= n; step++) {
    const idx = (state.currentPlayerIndex + step) % n
    const candidate = players[idx]
    if (candidate.passedOut) continue
    if (candidate.remainingPieceIds.length === 0) continue
    if (hasAnyLegalMove(state.board, candidate)) {
      return { ...state, players, currentPlayerIndex: idx }
    }
    candidate.passedOut = true
  }

  return { ...state, players, gameOver: true }
}

/**
 * Rebuilds a game from an ordered list of moves.
 *
 * `placedPieces` is already exactly that list, and turn order is a pure
 * function of the board — `advanceTurn` derives it — so replaying reproduces
 * the state exactly, including who passed out and on which turn. That is what
 * makes undo possible without storing a stack of past boards.
 *
 * Throws if the replay lands on the wrong player, which would mean the move
 * list and the turn rules disagree rather than that the caller asked for
 * something impossible.
 */
export function replayMoves(colors: Color[], moves: PlacedPiece[]): GameState {
  let state = createGame(colors)

  for (const [i, move] of moves.entries()) {
    const player = state.players[state.currentPlayerIndex]
    if (player.color !== move.color) {
      throw new Error(
        `Replay diverged at move ${i}: turn order says ${player.color}, move says ${move.color}`,
      )
    }
    state = applyMove(state, { pieceId: move.pieceId, cells: move.cells })
  }

  return state
}

export function finalizeScores(state: GameState): Record<Color, ScoreResult> {
  const result = {} as Record<Color, ScoreResult>
  for (const player of state.players) {
    result[player.color] = computeScore({
      remainingPieceIds: player.remainingPieceIds,
      lastPiecePlayedId: player.remainingPieceIds.length === 0 ? player.lastPiecePlayedId : null,
    })
  }
  return result
}
