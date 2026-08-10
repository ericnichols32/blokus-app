import { BOARD_SIZE, START_CORNERS } from './types'
import type { Color, Orientation, Point } from './types'

export type Board = (Color | null)[][]

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null))
}

export function isInBounds([col, row]: Point): boolean {
  return col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE
}

export function cellsForPlacement(orientation: Orientation, anchor: Point): Point[] {
  const [anchorCol, anchorRow] = anchor
  return orientation.cells.map(([c, r]) => [anchorCol + c, anchorRow + r] as Point)
}

const EDGE_NEIGHBORS: Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

const CORNER_NEIGHBORS: Point[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * Empty squares where this colour could legally gain a corner contact: diagonal
 * to one of its own cells, but not edge-adjacent to any of them.
 *
 * Every legal placement after the first move must cover at least one of these,
 * so they bound the whole search space. On the first move the only candidate is
 * the colour's start corner. A blocked player has none, which is what makes
 * "am I stuck?" cheap to answer.
 */
export function findContactPoints(
  board: Board,
  color: Color,
  isFirstMoveForColor: boolean,
): Point[] {
  if (isFirstMoveForColor) {
    const corner = START_CORNERS[color]
    return board[corner[1]][corner[0]] === null ? [corner] : []
  }

  const points: Point[] = []
  const seen = new Set<number>()

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== color) continue

      for (const [dc, dr] of CORNER_NEIGHBORS) {
        const c = col + dc
        const r = row + dr
        if (!isInBounds([c, r]) || board[r][c] !== null) continue

        const key = r * BOARD_SIZE + c
        if (seen.has(key)) continue

        const edgeAdjacent = EDGE_NEIGHBORS.some(([ec, er]) => {
          const nc = c + ec
          const nr = r + er
          return isInBounds([nc, nr]) && board[nr][nc] === color
        })
        if (edgeAdjacent) continue

        seen.add(key)
        points.push([c, r])
      }
    }
  }

  return points
}

export interface PlacementCheck {
  valid: boolean
  reason?: string
}

/**
 * Blokus placement rules: cells must be empty and in bounds; a color's
 * pieces may never share an edge with that same color; every piece after
 * the first must touch at least one existing piece of the same color at
 * a corner; the very first piece for a color must cover that color's
 * board corner.
 */
export function checkPlacement(
  board: Board,
  color: Color,
  cells: Point[],
  isFirstMoveForColor: boolean,
): PlacementCheck {
  for (const cell of cells) {
    if (!isInBounds(cell)) return { valid: false, reason: 'out-of-bounds' }
    const [col, row] = cell
    if (board[row][col] !== null) return { valid: false, reason: 'occupied' }
  }

  for (const [col, row] of cells) {
    for (const [dc, dr] of EDGE_NEIGHBORS) {
      const n: Point = [col + dc, row + dr]
      if (isInBounds(n) && board[n[1]][n[0]] === color) {
        return { valid: false, reason: 'edge-adjacent-same-color' }
      }
    }
  }

  if (isFirstMoveForColor) {
    const corner = START_CORNERS[color]
    const coversCorner = cells.some(([c, r]) => c === corner[0] && r === corner[1])
    if (!coversCorner) return { valid: false, reason: 'must-cover-start-corner' }
    return { valid: true }
  }

  const touchesCorner = cells.some(([col, row]) =>
    CORNER_NEIGHBORS.some(([dc, dr]) => {
      const n: Point = [col + dc, row + dr]
      return isInBounds(n) && board[n[1]][n[0]] === color
    }),
  )
  if (!touchesCorner) return { valid: false, reason: 'no-corner-contact' }

  return { valid: true }
}

export function placeCells(board: Board, color: Color, cells: Point[]): Board {
  const next = board.map((row) => row.slice())
  for (const [col, row] of cells) {
    next[row][col] = color
  }
  return next
}
