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
  /** Empty squares where the current player could gain a corner. */
  contactCells: Point[]
  /** Empty squares the piece in hand could legally cover. */
  hintCells: Point[]
  /** Colour the hint marks are drawn in — the current player's. */
  hintColor: Color
  onCellTap: (col: number, row: number) => void
}

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  {
    board,
    previewCells,
    previewColor,
    previewValid,
    contactCells,
    hintCells,
    hintColor,
    onCellTap,
  },
  ref,
) {
  const previewSet = new Set(previewCells.map(([c, r]) => `${c},${r}`))
  const contactSet = new Set(contactCells.map(([c, r]) => `${c},${r}`))
  const hintSet = new Set(hintCells.map(([c, r]) => `${c},${r}`))

  // Hex with an alpha suffix rather than color-mix, so the tint renders the
  // same on older iOS Safari — this runs as a home-screen app.
  const hintStyle = {
    '--hint-tint': `${COLOR_HEX[hintColor]}2e`,
    '--hint-dot': `${COLOR_HEX[hintColor]}cc`,
  } as CSSProperties

  return (
    <div className="board" ref={ref} style={hintStyle}>
      {board.map((rowCells, row) =>
        rowCells.map((occupant, col) => {
          const key = `${col},${row}`
          const isPreview = !occupant && previewColor !== null && previewSet.has(key)

          // Valid previews tint with the player's colour; invalid ones use a
          // colour-independent hatch so "illegal" never reads as "the red player".
          // Hints sit underneath the piece you are aiming, so the preview always
          // wins where the two overlap.
          let className = 'board-cell'
          if (isPreview) {
            className += previewValid ? ' preview-valid' : ' preview-invalid'
          } else if (!occupant) {
            if (hintSet.has(key)) className += ' hint-reachable'
            if (contactSet.has(key)) className += ' hint-corner'
            else if (START_CORNER_SET.has(key)) className += ' start-corner'
          }

          const style: CSSProperties = {}
          if (occupant) style.background = COLOR_HEX[occupant]
          else if (isPreview && previewValid) style.background = `${COLOR_HEX[previewColor]}99`

          return (
            <button
              key={key}
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
