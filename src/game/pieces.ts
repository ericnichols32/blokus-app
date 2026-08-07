import type { Cell, Orientation, PieceDefinition, PieceId } from './types'

// Canonical shape for each of the 21 Blokus pieces (1 monomino, 1 domino,
// 2 trominoes, 5 tetrominoes, 12 pentominoes), as offsets from an arbitrary
// local origin. Rotations/reflections are generated at runtime.
export const PIECE_DEFINITIONS: PieceDefinition[] = [
  { id: 'monomino', cells: [[0, 0]] },
  { id: 'domino', cells: [[0, 0], [1, 0]] },

  { id: 'tromino-I', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'tromino-L', cells: [[0, 0], [1, 0], [0, 1]] },

  { id: 'tetromino-I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'tetromino-O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 'tetromino-L', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { id: 'tetromino-S', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { id: 'tetromino-T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },

  { id: 'pentomino-I', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 'pentomino-L', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] },
  { id: 'pentomino-N', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]] },
  { id: 'pentomino-P', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  { id: 'pentomino-T', cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
  { id: 'pentomino-U', cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'pentomino-V', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'pentomino-W', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
  { id: 'pentomino-X', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  { id: 'pentomino-Y', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1]] },
  { id: 'pentomino-Z', cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
  { id: 'pentomino-F', cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
]

export const PIECE_BY_ID: Record<PieceId, PieceDefinition> = Object.fromEntries(
  PIECE_DEFINITIONS.map((p) => [p.id, p]),
) as Record<PieceId, PieceDefinition>

function normalize(cells: Cell[]): Cell[] {
  const minCol = Math.min(...cells.map((c) => c[0]))
  const minRow = Math.min(...cells.map((c) => c[1]))
  return cells
    .map(([c, r]) => [c - minCol, r - minRow] as Cell)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

function rotate90(cells: Cell[]): Cell[] {
  // (col, row) -> (-row, col)
  return normalize(cells.map(([c, r]) => [-r, c] as Cell))
}

function flipHorizontal(cells: Cell[]): Cell[] {
  return normalize(cells.map(([c, r]) => [-c, r] as Cell))
}

function key(cells: Cell[]): string {
  return cells.map(([c, r]) => `${c},${r}`).join('|')
}

// Cells for a piece at an exact rotation/flip, independent of the
// deduplicated list below — handy for UI controls where rotating a
// visually-symmetric piece should still feel like it responded.
export function getOrientationCells(pieceId: PieceId, rotationSteps: number, flipped: boolean): Cell[] {
  const base = normalize(PIECE_BY_ID[pieceId].cells)
  let cells = flipped ? flipHorizontal(base) : base
  const steps = ((rotationSteps % 4) + 4) % 4
  for (let i = 0; i < steps; i++) cells = rotate90(cells)
  return cells
}

// All unique orientations (rotations x reflections) for a piece, deduplicated
// since symmetric pieces (e.g. the square or the plus) have fewer than 8.
export function getOrientations(pieceId: PieceId): Orientation[] {
  const base = normalize(PIECE_BY_ID[pieceId].cells)
  const rotations: (0 | 90 | 180 | 270)[] = [0, 90, 180, 270]
  const seen = new Set<string>()
  const orientations: Orientation[] = []

  for (const flipped of [false, true]) {
    let cells = flipped ? flipHorizontal(base) : base
    for (const rotation of rotations) {
      const k = key(cells)
      if (!seen.has(k)) {
        seen.add(k)
        orientations.push({ cells, rotation, flipped })
      }
      cells = rotate90(cells)
    }
  }

  return orientations
}
