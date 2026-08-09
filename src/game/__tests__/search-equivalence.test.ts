import { describe, expect, it } from 'vitest'
import { checkPlacement, cellsForPlacement, createEmptyBoard, placeCells } from '../board'
import type { Board } from '../board'
import { getOrientations, PIECE_DEFINITIONS } from '../pieces'
import { findLegalPlacements, hasAnyLegalMove } from '../engine'
import type { PlayerState } from '../engine'
import { BOARD_SIZE } from '../types'
import type { Color, PieceId, Point } from '../types'

// The original exhaustive scan, kept here purely as an oracle.
function bruteForce(board: Board, color: Color, pieceId: PieceId, first: boolean): Point[][] {
  const out: Point[][] = []
  for (const o of getOrientations(pieceId)) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cells = cellsForPlacement(o, [col, row])
        if (checkPlacement(board, color, cells, first).valid) out.push(cells)
      }
    }
  }
  return out
}

const norm = (list: Point[][]) =>
  new Set(list.map((cells) => cells.map(([c, r]) => `${c},${r}`).sort().join('|')))

function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

// Build a messy but legal-ish board by scattering blobs of each colour.
function randomBoard(seed: number): Board {
  const rand = seededRandom(seed)
  let board = createEmptyBoard()
  const colors: Color[] = ['blue', 'yellow', 'red', 'green']
  for (let i = 0; i < 40; i++) {
    const color = colors[Math.floor(rand() * 4)]
    const col = Math.floor(rand() * BOARD_SIZE)
    const row = Math.floor(rand() * BOARD_SIZE)
    const cells: Point[] = [[col, row]]
    if (rand() > 0.5 && col + 1 < BOARD_SIZE) cells.push([col + 1, row])
    if (rand() > 0.5 && row + 1 < BOARD_SIZE) cells.push([col, row + 1])
    const free = cells.every(([c, r]) => board[r][c] === null)
    if (free) board = placeCells(board, color, cells)
  }
  return board
}

describe('optimised search matches the exhaustive scan', () => {
  it('agrees on every piece across many random boards', () => {
    const colors: Color[] = ['blue', 'yellow', 'red', 'green']
    let compared = 0
    for (let seed = 1; seed <= 25; seed++) {
      const board = randomBoard(seed)
      for (const color of colors) {
        for (const { id } of PIECE_DEFINITIONS) {
          for (const first of [true, false]) {
            expect(norm(findLegalPlacements(board, color, id, first)))
              .toEqual(norm(bruteForce(board, color, id, first)))
            compared++
          }
        }
      }
    }
    expect(compared).toBe(25 * 4 * 21 * 2)
  })

  it('agrees with the empty board, where every first move is available', () => {
    const board = createEmptyBoard()
    for (const { id } of PIECE_DEFINITIONS) {
      expect(norm(findLegalPlacements(board, 'blue', id, true)))
        .toEqual(norm(bruteForce(board, 'blue', id, true)))
      expect(findLegalPlacements(board, 'blue', id, false)).toHaveLength(0)
    }
  })

  it('agrees on hasAnyLegalMove', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const board = randomBoard(seed)
      for (const color of ['blue', 'yellow', 'red', 'green'] as Color[]) {
        for (const first of [true, false]) {
          const player: PlayerState = {
            color,
            remainingPieceIds: PIECE_DEFINITIONS.map((p) => p.id),
            hasPlayedFirstMove: !first,
            lastPiecePlayedId: null,
            passedOut: false,
          }
          const expected = PIECE_DEFINITIONS.some(
            (p) => bruteForce(board, color, p.id, first).length > 0,
          )
          expect(hasAnyLegalMove(board, player)).toBe(expected)
        }
      }
    }
  })
})
