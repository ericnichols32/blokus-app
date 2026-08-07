export type Color = 'red' | 'yellow' | 'green' | 'blue'

// Standard Blokus turn order, running clockwise around the board:
// blue (top-left), yellow (top-right), red (bottom-right), green (bottom-left).
// Keep in sync with START_CORNERS.
export const COLORS: Color[] = ['blue', 'yellow', 'red', 'green']

// A cell offset relative to a piece's local origin.
export type Cell = readonly [col: number, row: number]

// An absolute board position.
export type Point = readonly [col: number, row: number]

export type PieceId =
  | 'monomino'
  | 'domino'
  | 'tromino-I'
  | 'tromino-L'
  | 'tetromino-I'
  | 'tetromino-O'
  | 'tetromino-L'
  | 'tetromino-S'
  | 'tetromino-T'
  | 'pentomino-I'
  | 'pentomino-L'
  | 'pentomino-N'
  | 'pentomino-P'
  | 'pentomino-T'
  | 'pentomino-U'
  | 'pentomino-V'
  | 'pentomino-W'
  | 'pentomino-X'
  | 'pentomino-Y'
  | 'pentomino-Z'
  | 'pentomino-F'

export interface PieceDefinition {
  id: PieceId
  cells: Cell[]
}

// A specific rotation/reflection of a piece, normalized so its
// cells' min col/row is 0.
export interface Orientation {
  cells: Cell[]
  rotation: 0 | 90 | 180 | 270
  flipped: boolean
}

export interface PlacedPiece {
  pieceId: PieceId
  color: Color
  cells: Point[]
}

export const BOARD_SIZE = 20

// Each color's designated starting corner, matching standard Blokus setup.
export const START_CORNERS: Record<Color, Point> = {
  blue: [0, 0],
  yellow: [BOARD_SIZE - 1, 0],
  red: [BOARD_SIZE - 1, BOARD_SIZE - 1],
  green: [0, BOARD_SIZE - 1],
}
