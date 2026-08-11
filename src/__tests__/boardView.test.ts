import { describe, expect, it } from 'vitest'
import { boardToScreen, paintCell, rotationFacing, screenToBoard, VIEW_ROTATIONS } from '../boardView'
import { BOARD_SIZE, COLORS, START_CORNERS } from '../game'
import type { Point } from '../game'

const LAST = BOARD_SIZE - 1

describe('rotationFacing', () => {
  it('puts each colour’s home corner at the bottom left', () => {
    for (const color of COLORS) {
      const onScreen = boardToScreen(START_CORNERS[color], rotationFacing(color))
      expect(onScreen).toEqual([0, LAST])
    }
  })

  it('leaves green alone, since it already starts bottom left', () => {
    expect(rotationFacing('green')).toBe(0)
  })
})

describe('boardToScreen', () => {
  it('turns clockwise: the top-left square moves to the top right', () => {
    expect(boardToScreen([0, 0], 1)).toEqual([LAST, 0])
    expect(boardToScreen([0, 0], 2)).toEqual([LAST, LAST])
    expect(boardToScreen([0, 0], 3)).toEqual([0, LAST])
  })

  it('leaves everything where it is when unrotated', () => {
    expect(boardToScreen([3, 7], 0)).toEqual([3, 7])
  })

  it('keeps the centre of an odd-sized span in place across all rotations', () => {
    // The four corners map onto each other, so the set is unchanged.
    const corners: Point[] = [
      [0, 0],
      [LAST, 0],
      [LAST, LAST],
      [0, LAST],
    ]
    for (const rotation of VIEW_ROTATIONS) {
      const moved = corners.map((c) => boardToScreen(c, rotation))
      expect(new Set(moved.map(String))).toEqual(new Set(corners.map(String)))
    }
  })
})

describe('paintCell', () => {
  it('draws the footprint on squares that are already taken', () => {
    // The regression this exists for: an overlapped square used to be left as
    // plain `placed`, so the part of the piece that was in the way vanished.
    expect(paintCell('red', true, false, null, true)).toEqual({ kind: 'blocked', color: 'red' })
  })

  it('reports every square of the footprint, however much of it is blocked', () => {
    const footprint: ReturnType<typeof paintCell>[] = [
      paintCell(null, true, false, null, true),
      paintCell('red', true, false, null, true),
      paintCell('green', true, false, null, true),
    ]
    expect(footprint.every((p) => p.kind === 'footprint' || p.kind === 'blocked')).toBe(true)
  })

  it('leaves occupied squares alone when nothing is being dragged over them', () => {
    expect(paintCell('blue', false, false, null, true)).toEqual({ kind: 'placed', color: 'blue' })
  })

  it('distinguishes a legal footprint square from an illegal one', () => {
    expect(paintCell(null, true, true, null, true)).toEqual({ kind: 'footprint', valid: true })
    expect(paintCell(null, true, false, null, true)).toEqual({ kind: 'footprint', valid: false })
  })

  it('marks a start corner only until that colour has opened', () => {
    expect(paintCell(null, false, false, 'yellow', false)).toEqual({ kind: 'start', color: 'yellow' })
    expect(paintCell(null, false, false, 'yellow', true)).toEqual({ kind: 'empty' })
  })

  it('lets the footprint win over a start corner marker', () => {
    expect(paintCell(null, true, true, 'blue', false)).toEqual({ kind: 'footprint', valid: true })
  })

  it('calls a plain empty square empty', () => {
    expect(paintCell(null, false, false, null, true)).toEqual({ kind: 'empty' })
  })
})

describe('screenToBoard', () => {
  it('undoes boardToScreen for every square at every rotation', () => {
    for (const rotation of VIEW_ROTATIONS) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const point: Point = [col, row]
          expect(screenToBoard(boardToScreen(point, rotation), rotation)).toEqual(point)
        }
      }
    }
  })

  it('stays on the board for every screen position', () => {
    for (const rotation of VIEW_ROTATIONS) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const [col, row] = screenToBoard([x, y], rotation)
          expect(col).toBeGreaterThanOrEqual(0)
          expect(col).toBeLessThan(BOARD_SIZE)
          expect(row).toBeGreaterThanOrEqual(0)
          expect(row).toBeLessThan(BOARD_SIZE)
        }
      }
    }
  })
})
