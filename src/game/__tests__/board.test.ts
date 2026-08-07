import { describe, expect, it } from 'vitest'
import { checkPlacement, createEmptyBoard, placeCells } from '../board'
import type { Point } from '../types'

describe('checkPlacement', () => {
  it('rejects a first move that does not cover the color start corner', () => {
    const board = createEmptyBoard()
    const cells: Point[] = [[5, 5]]
    const result = checkPlacement(board, 'blue', cells, true)
    expect(result).toEqual({ valid: false, reason: 'must-cover-start-corner' })
  })

  it('accepts a first move covering blue start corner (0,0)', () => {
    const board = createEmptyBoard()
    const cells: Point[] = [[0, 0], [1, 0]]
    expect(checkPlacement(board, 'blue', cells, true).valid).toBe(true)
  })

  it('accepts a first move covering red start corner (19,19)', () => {
    const board = createEmptyBoard()
    const cells: Point[] = [[19, 19], [18, 19]]
    expect(checkPlacement(board, 'red', cells, true).valid).toBe(true)
  })

  it('rejects out-of-bounds placement', () => {
    const board = createEmptyBoard()
    expect(checkPlacement(board, 'blue', [[-1, 0], [0, 0]], true).valid).toBe(false)
    expect(checkPlacement(board, 'blue', [[0, 0], [20, 0]], true).valid).toBe(false)
  })

  it('rejects placement onto an occupied cell', () => {
    let board = createEmptyBoard()
    board = placeCells(board, 'blue', [[0, 0]])
    const result = checkPlacement(board, 'blue', [[0, 0], [1, 0]], false)
    expect(result).toEqual({ valid: false, reason: 'occupied' })
  })

  it('rejects a same-color piece that shares an edge with an existing same-color piece', () => {
    let board = createEmptyBoard()
    board = placeCells(board, 'blue', [[0, 0], [1, 0]])
    // (1,1) sits directly below (1,0) -> edge adjacent, same color
    const result = checkPlacement(board, 'blue', [[1, 1]], false)
    expect(result).toEqual({ valid: false, reason: 'edge-adjacent-same-color' })
  })

  it('requires a non-first move to touch an existing same-color piece at a corner', () => {
    let board = createEmptyBoard()
    board = placeCells(board, 'blue', [[0, 0], [1, 0]])
    // (5,5) touches nothing
    const result = checkPlacement(board, 'blue', [[5, 5]], false)
    expect(result).toEqual({ valid: false, reason: 'no-corner-contact' })
  })

  it('accepts a non-first move that only touches at a corner (diagonal)', () => {
    let board = createEmptyBoard()
    board = placeCells(board, 'blue', [[0, 0], [1, 0]])
    // (2,1) is diagonal to (1,0)
    const result = checkPlacement(board, 'blue', [[2, 1]], false)
    expect(result.valid).toBe(true)
  })

  it('allows different colors to touch edge-to-edge freely', () => {
    let board = createEmptyBoard()
    board = placeCells(board, 'blue', [[0, 0]])
    board = placeCells(board, 'yellow', [[2, 1]])
    // (1,0) is edge-adjacent to blue (fine, different color) and
    // corner-adjacent to yellow's existing piece (satisfies the corner rule)
    const result = checkPlacement(board, 'yellow', [[1, 0]], false)
    expect(result.valid).toBe(true)
  })
})
