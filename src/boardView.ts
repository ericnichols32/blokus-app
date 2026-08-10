import { BOARD_SIZE, COLORS } from './game'
import type { Color, Point } from './game'

/**
 * How far the board is turned on screen, in quarter-turns clockwise. The game
 * itself never sees this: board coordinates stay fixed and only the view moves,
 * the same way turning a physical board doesn't renumber the squares.
 */
export type ViewRotation = 0 | 1 | 2 | 3

export const VIEW_ROTATIONS: ViewRotation[] = [0, 1, 2, 3]

/**
 * The rotation that brings a colour's home corner to the bottom left — the
 * corner nearest a player sitting on that side.
 *
 * Turn order runs clockwise from blue in the top left, so each colour needs one
 * fewer quarter-turn than the one before: blue 3, yellow 2, red 1, green 0
 * (green already starts bottom left).
 */
export function rotationFacing(color: Color): ViewRotation {
  const index = COLORS.indexOf(color)
  return ((3 - index) % 4) as ViewRotation
}

/**
 * Where a board square is drawn once the view is turned. Clockwise, so the
 * top-left square moves to the top right at one quarter-turn.
 */
export function boardToScreen([col, row]: Point, rotation: ViewRotation): Point {
  const last = BOARD_SIZE - 1
  switch (rotation) {
    case 1:
      return [last - row, col]
    case 2:
      return [last - col, last - row]
    case 3:
      return [row, last - col]
    default:
      return [col, row]
  }
}

/**
 * The inverse: which board square sits under a point on screen. Needed because
 * dragging maps a finger position onto the grid by hand, rather than relying on
 * the browser to hit-test a cell.
 */
export function screenToBoard([x, y]: Point, rotation: ViewRotation): Point {
  const last = BOARD_SIZE - 1
  switch (rotation) {
    case 1:
      return [y, last - x]
    case 2:
      return [last - x, last - y]
    case 3:
      return [last - y, x]
    default:
      return [x, y]
  }
}
