import { checkPlacement, cellsForPlacement, createEmptyBoard, placeCells } from './board'
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

/** All valid cell sets for placing this piece anywhere on the board right now. */
export function findLegalPlacements(
  board: Board,
  color: Color,
  pieceId: PieceId,
  isFirstMoveForColor: boolean,
): Point[][] {
  const results: Point[][] = []
  for (const orientation of getOrientations(pieceId)) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cells = cellsForPlacement(orientation, [col, row])
        if (checkPlacement(board, color, cells, isFirstMoveForColor).valid) {
          results.push(cells)
        }
      }
    }
  }
  return results
}

/** Short-circuiting existence check, cheaper than findLegalPlacements when you just need a yes/no. */
export function hasAnyLegalMove(board: Board, player: PlayerState): boolean {
  for (const pieceId of player.remainingPieceIds) {
    for (const orientation of getOrientations(pieceId)) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const cells = cellsForPlacement(orientation, [col, row])
          if (checkPlacement(board, player.color, cells, !player.hasPlayedFirstMove).valid) {
            return true
          }
        }
      }
    }
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
