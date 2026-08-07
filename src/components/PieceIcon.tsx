import { COLOR_HEX } from '../colors'
import type { Cell, Color } from '../game'

interface PieceIconProps {
  cells: readonly Cell[]
  color: Color
  cellSize?: number
}

export function PieceIcon({ cells, color, cellSize = 10 }: PieceIconProps) {
  const maxCol = Math.max(...cells.map((c) => c[0])) + 1
  const maxRow = Math.max(...cells.map((c) => c[1])) + 1
  const filled = new Set(cells.map(([c, r]) => `${c},${r}`))

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${maxCol}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${maxRow}, ${cellSize}px)`,
        gap: 1,
      }}
    >
      {Array.from({ length: maxRow }).map((_, row) =>
        Array.from({ length: maxCol }).map((_, col) => (
          <div
            key={`${col},${row}`}
            style={{
              width: cellSize,
              height: cellSize,
              background: filled.has(`${col},${row}`) ? COLOR_HEX[color] : 'transparent',
              borderRadius: 2,
            }}
          />
        )),
      )}
    </div>
  )
}
