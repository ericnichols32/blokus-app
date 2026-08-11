import { BOARD_SIZE, COLORS } from './game'
import type { Color, Point } from './game'

/**
 * How one square should be drawn, once occupancy, the piece being dragged and
 * the opening markers have all been resolved against each other.
 */
export type CellPaint =
  | { kind: 'empty' }
  /** Nobody has opened on this start corner yet; it is tinted with their colour. */
  | { kind: 'start'; color: Color }
  | { kind: 'placed'; color: Color }
  /** Under the piece in hand, on a square that is free. */
  | { kind: 'footprint'; valid: boolean }
  /** Under the piece in hand, on a square that is already taken. */
  | { kind: 'blocked'; color: Color }

/**
 * The precedence between the four things that can want to paint a square.
 *
 * The rule that matters is the first one: a footprint square lying on an
 * occupied cell is reported as `blocked` rather than falling through to
 * `placed`. It used to be skipped entirely, which meant that late in the game —
 * when most of a piece can be overlapping other pieces — the parts of the shape
 * that were in the way simply weren't drawn, leaving no way to see where the
 * piece was or why it wouldn't fit.
 */
export function paintCell(
  occupant: Color | null,
  inFootprint: boolean,
  footprintValid: boolean,
  opener: Color | null,
  openerHasPlayed: boolean,
): CellPaint {
  if (occupant) {
    return inFootprint ? { kind: 'blocked', color: occupant } : { kind: 'placed', color: occupant }
  }
  if (inFootprint) return { kind: 'footprint', valid: footprintValid }
  if (opener && !openerHasPlayed) return { kind: 'start', color: opener }
  return { kind: 'empty' }
}

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
