import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { START_CORNERS } from '../game'
import type { Board as BoardState, Color, Point } from '../game'
import './Board.css'

const START_CORNER_SET = new Set(Object.values(START_CORNERS).map(([c, r]) => `${c},${r}`))

function describeCell(col: number, row: number, occupant: Color | null): string {
  const where = `column ${col + 1}, row ${row + 1}`
  return occupant ? `${COLOR_LABEL[occupant]} at ${where}` : `Empty, ${where}`
}

interface BoardProps {
  board: BoardState
  /** Absolute board positions the pending piece would occupy. */
  previewCells: Point[]
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
          const isPreview = !occupant && previewColor !== null && previewSet.has(`${col},${row}`)

          // Valid previews tint with the player's colour; invalid ones use a
          // colour-independent hatch so "illegal" never reads as "the red player".
          let className = 'board-cell'
          if (isPreview) className += previewValid ? ' preview-valid' : ' preview-invalid'
          else if (!occupant && START_CORNER_SET.has(`${col},${row}`)) className += ' start-corner'

          const style: CSSProperties = {}
          if (occupant) style.background = COLOR_HEX[occupant]
          else if (isPreview && previewValid) style.background = `${COLOR_HEX[previewColor]}99`

          return (
            <button
              key={`${col},${row}`}
              type="button"
              tabIndex={-1}
              className={className}
              style={style}
              onClick={() => onCellTap(col, row)}
              aria-label={describeCell(col, row, occupant)}
            />
          )
        }),
      )}
    </div>
  )
})
