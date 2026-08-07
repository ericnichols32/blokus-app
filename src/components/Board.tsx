import { forwardRef } from 'react'
import { COLOR_HEX } from '../colors'
import type { Board as BoardState, Cell, Color } from '../game'
import './Board.css'

interface BoardProps {
  board: BoardState
  previewCells: Cell[]
  previewColor: Color | null
  previewValid: boolean
  onCellTap: (col: number, row: number) => void
}

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  { board, previewCells, previewColor, previewValid, onCellTap },
  ref,
) {
  const previewSet = new Set(previewCells.map(([c, r]) => `${c},${r}`))

  return (
    <div className="board" ref={ref}>
      {board.map((rowCells, row) =>
        rowCells.map((occupant, col) => {
          const isPreview = previewSet.has(`${col},${row}`)
          let background = 'var(--cell-empty)'
          if (occupant) background = COLOR_HEX[occupant]
          else if (isPreview && previewColor) {
            background = previewValid ? `${COLOR_HEX[previewColor]}88` : 'rgba(255,0,0,0.35)'
          }
          return (
            <button
              key={`${col},${row}`}
              type="button"
              className="board-cell"
              style={{ background }}
              onClick={() => onCellTap(col, row)}
              aria-label={`cell ${col},${row}`}
            />
          )
        }),
      )}
    </div>
  )
})
