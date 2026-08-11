import { forwardRef } from 'react'
import type { CSSProperties } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { paintCell } from '../boardView'
import type { ViewRotation } from '../boardView'
import { START_CORNERS } from '../game'
import type { Board as BoardState, Color, Point } from '../game'
import './Board.css'

/** Which colour opens on each start corner, keyed by position. */
const START_CORNER_COLOR = new Map<string, Color>(
  (Object.entries(START_CORNERS) as [Color, Point][]).map(([color, [c, r]]) => [`${c},${r}`, color]),
)

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
   * Colours that have not opened yet, so their start corner is still worth
   * pointing at. Each corner drops its marker as soon as that colour plays.
   */
  awaitingFirstMove: Color[]
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
  {
    board,
    previewCells,
    previewColor,
    previewValid,
    rotation,
    awaitingFirstMove,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  },
  ref,
) {
  const previewSet = new Set(previewCells.map(([c, r]) => `${c},${r}`))
  const awaiting = new Set(awaitingFirstMove)

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
          const opener = START_CORNER_COLOR.get(key) ?? null
          const paint = paintCell(
            occupant,
            previewColor !== null && previewSet.has(key),
            previewValid,
            opener,
            opener === null || !awaiting.has(opener),
          )

          let className = 'board-cell'
          const style: CSSProperties = {}

          switch (paint.kind) {
            case 'placed':
              style.background = COLOR_HEX[paint.color]
              break
            case 'blocked':
              // Keeps the occupant's colour so you can see what is in the way;
              // Board.css draws the bright ring and wash over the top of it.
              className += ' preview-blocked'
              style.background = COLOR_HEX[paint.color]
              break
            case 'footprint':
              // Valid previews tint with the player's colour; invalid ones use a
              // colour-independent hatch so "illegal" never reads as "the red player".
              className += paint.valid ? ' preview-valid' : ' preview-invalid'
              if (paint.valid && previewColor) style.background = `${COLOR_HEX[previewColor]}99`
              break
            case 'start':
              className += ' start-corner'
              style.background = `${COLOR_HEX[paint.color]}40`
              break
          }

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
