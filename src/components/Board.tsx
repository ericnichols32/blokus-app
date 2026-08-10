import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import type { ViewRotation } from '../boardView'
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
  /** Quarter-turns clockwise to show the board at. */
  rotation: ViewRotation
  /**
   * The board is one drag surface rather than a grid of tappable squares: with
   * a piece in hand, pressing anywhere picks it up and moves it, and a tap is
   * just a drag that went nowhere. That is what lets a piece already sitting on
   * the board be picked up again instead of being stranded there.
   */
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}

export const Board = forwardRef<HTMLDivElement, BoardProps>(function Board(
  { board, previewCells, previewColor, previewValid, rotation, onPointerDown, onPointerMove, onPointerUp },
  ref,
) {
  const previewSet = new Set(previewCells.map(([c, r]) => `${c},${r}`))

  // The turn is a CSS transform on the whole grid rather than a reordering of
  // the cells, so board coordinates never change — only drag, which does its
  // own arithmetic, has to account for the angle.
  const boardStyle: CSSProperties = {
    transform: rotation === 0 ? undefined : `rotate(${rotation * 90}deg)`,
  }

  return (
    <div
      className="board"
      ref={ref}
      style={boardStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {board.map((rowCells, row) =>
        rowCells.map((occupant, col) => {
          const key = `${col},${row}`
          const isPreview = !occupant && previewColor !== null && previewSet.has(key)

          // Valid previews tint with the player's colour; invalid ones use a
          // colour-independent hatch so "illegal" never reads as "the red player".
          let className = 'board-cell'
          if (isPreview) className += previewValid ? ' preview-valid' : ' preview-invalid'
          else if (!occupant && START_CORNER_SET.has(key)) className += ' start-corner'

          const style: CSSProperties = {}
          if (occupant) style.background = COLOR_HEX[occupant]
          else if (isPreview && previewValid) style.background = `${COLOR_HEX[previewColor]}99`

          return (
            <div
              key={key}
              className={className}
              style={style}
              role="img"
              aria-label={describeCell(col, row, occupant)}
            />
          )
        }),
      )}
    </div>
  )
})
