import { describe, expect, it, vi } from 'vitest'
import { chooseMove } from '../ai'
import { checkPlacement, createEmptyBoard } from '../board'
import type { Board } from '../board'
import { applyMove, createGame, findLegalPlacements, findReachableCells, hasLegalPlacement } from '../engine'
import { getOrientationCells, getOrientations, PIECE_DEFINITIONS } from '../pieces'
import { BOARD_SIZE, COLORS } from '../types'
import type { Cell, Color, Point } from '../types'

vi.setConfig({ testTimeout: 60_000 })

/** Every square this shape could legally cover, found by scanning the board. */
function reachableByScan(
  board: Board,
  color: Color,
  shape: readonly Cell[],
  first: boolean,
): Set<string> {
  const out = new Set<string>()
  for (let row = -BOARD_SIZE; row < BOARD_SIZE; row++) {
    for (let col = -BOARD_SIZE; col < BOARD_SIZE; col++) {
      const cells: Point[] = shape.map(([c, r]) => [col + c, row + r] as Point)
      if (!checkPlacement(board, color, cells, first).valid) continue
      for (const [c, r] of cells) out.add(`${c},${r}`)
    }
  }
  return out
}

const asSet = (points: Point[]) => new Set(points.map(([c, r]) => `${c},${r}`))

/** A part-played board, so hints are exercised against real positions. */
function boardAfter(moves: number): Board {
  let state = createGame(COLORS)
  for (let i = 0; i < moves && !state.gameOver; i++) {
    const player = state.players[state.currentPlayerIndex]
    const opponents = state.players.filter((p) => p !== player).map((p) => p.color)
    const move = chooseMove(state.board, player, opponents, 'hard')
    if (!move) break
    state = applyMove(state, move)
  }
  return state.board
}

describe('findReachableCells', () => {
  it('matches a full scan of the board, for every shape', () => {
    const board = boardAfter(16)

    for (const color of COLORS) {
      for (const { id } of PIECE_DEFINITIONS) {
        // Two orientations per piece, including a reflected one.
        for (const [steps, flipped] of [
          [0, false],
          [1, true],
        ] as const) {
          const shape = getOrientationCells(id, steps, flipped)
          expect(asSet(findReachableCells(board, color, shape, false))).toEqual(
            reachableByScan(board, color, shape, false),
          )
        }
      }
    }
  })

  it('on an opening board, only the start corner is reachable', () => {
    const board = createEmptyBoard()
    const shape = getOrientationCells('monomino', 0, false)

    expect(findReachableCells(board, 'blue', shape, true)).toEqual([[0, 0]])
    // Nothing at all before you have taken your corner.
    expect(findReachableCells(board, 'blue', shape, false)).toEqual([])
  })

  it('reports nothing once a colour is walled in', () => {
    const board = createEmptyBoard()
    // Box blue into its corner: its only diagonal escape is taken by red.
    board[0][0] = 'blue'
    board[1][1] = 'red'
    const shape = getOrientationCells('monomino', 0, false)

    expect(findReachableCells(board, 'blue', shape, false)).toEqual([])
  })
})

describe('hasLegalPlacement', () => {
  it('agrees with the full placement search on a played board', () => {
    const board = boardAfter(24)

    for (const color of COLORS) {
      for (const { id } of PIECE_DEFINITIONS) {
        expect(hasLegalPlacement(board, color, id, false)).toBe(
          findLegalPlacements(board, color, id, false).length > 0,
        )
      }
    }
  })

  it('agrees with a full scan on an opening board', () => {
    const board = createEmptyBoard()

    for (const { id } of PIECE_DEFINITIONS) {
      // Scanned across every orientation, independently of the contact-point
      // search the implementation uses.
      const fitsByScan = getOrientations(id).some(
        (o) => reachableByScan(board, 'blue', o.cells, true).size > 0,
      )
      expect(hasLegalPlacement(board, 'blue', id, true)).toBe(fitsByScan)
    }
  })

  it('rules out opening with the X pentomino, which cannot reach a corner', () => {
    // The plus shape needs a clear square on all four sides of its centre, so
    // it can never cover the corner square a first move has to occupy.
    const board = createEmptyBoard()
    expect(hasLegalPlacement(board, 'blue', 'pentomino-X', true)).toBe(false)
    expect(hasLegalPlacement(board, 'blue', 'pentomino-V', true)).toBe(true)
  })

  it('is false for every piece when a colour has no corner left', () => {
    const board = createEmptyBoard()
    board[0][0] = 'blue'
    board[1][1] = 'red'

    for (const { id } of PIECE_DEFINITIONS) {
      expect(hasLegalPlacement(board, 'blue', id, false)).toBe(false)
    }
  })

  it('finds the one piece that still fits a tight gap', () => {
    const board = createEmptyBoard()
    board[0][0] = 'blue'
    // Leave exactly one square diagonally open, hemmed in by red.
    board[0][2] = 'red'
    board[2][0] = 'red'
    board[2][2] = 'red'
    board[1][2] = 'red'
    board[2][1] = 'red'

    expect(hasLegalPlacement(board, 'blue', 'monomino', false)).toBe(true)
    expect(hasLegalPlacement(board, 'blue', 'pentomino-X', false)).toBe(false)
  })
})
