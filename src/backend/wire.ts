import type { PlacedPiece, Point } from '../game'
import type { OnlineGame } from '../online'

/**
 * How an online game is written to Firestore, which cannot store it as-is.
 *
 * **Firestore does not allow an array inside an array.** A move's `cells` is
 * exactly that — a list of `[col, row]` pairs — so every attempt to write one
 * comes back `INVALID_ARGUMENT: Nested arrays are not allowed`. The failure is
 * quiet in the worst way: creating a game works, because its move list is empty,
 * and the very first move is what fails.
 *
 * So each cell is stored as `"col,row"`. A string keeps the document readable in
 * the console, which matters for a format nobody can query anyway — the
 * alternative of flattening to `[c, r, c, r, …]` saves nothing and turns a
 * misread into silently wrong coordinates rather than an obvious one.
 *
 * This lives at the Firestore boundary because it is Firestore's limitation. The
 * rest of the app, and the device-only store, use `Point[]` throughout.
 */
export interface StoredOnlineGame extends Omit<OnlineGame, 'moves'> {
  moves: StoredMove[]
}

export interface StoredMove extends Omit<PlacedPiece, 'cells'> {
  cells: string[]
}

export function toStored(game: OnlineGame): StoredOnlineGame {
  return {
    ...game,
    moves: game.moves.map((move) => ({ ...move, cells: move.cells.map(encodeCell) })),
  }
}

export function fromStored(raw: StoredOnlineGame | OnlineGame): OnlineGame {
  const moves = Array.isArray(raw.moves) ? raw.moves : []
  return {
    ...(raw as OnlineGame),
    moves: moves.map((move) => ({
      ...move,
      cells: (move.cells as (string | Point)[]).map(decodeCell),
    })),
  }
}

function encodeCell([col, row]: Point): string {
  return `${col},${row}`
}

/**
 * Tolerates a cell that is already a pair, so a document written by a build from
 * before this encoding existed still replays instead of throwing.
 */
function decodeCell(cell: string | Point): Point {
  if (Array.isArray(cell)) return [Number(cell[0]), Number(cell[1])]
  const [col, row] = String(cell).split(',')
  return [Number(col), Number(row)]
}

/**
 * Whether any array in `value` contains another array — the shape Firestore
 * rejects. Exported for the tests that guard this boundary: the bug it exists to
 * catch was invisible in the types, since `Point[]` is a perfectly good
 * TypeScript type, and only surfaced against the real database.
 */
export function hasNestedArray(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => Array.isArray(item) || hasNestedArray(item))
  if (value && typeof value === 'object') return Object.values(value).some(hasNestedArray)
  return false
}
