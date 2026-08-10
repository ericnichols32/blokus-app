import { describe, expect, it } from 'vitest'
import { boardToScreen, rotationFacing, screenToBoard, VIEW_ROTATIONS } from '../boardView'
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
