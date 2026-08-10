import { COLOR_HEX } from '../colors'
import { PIECE_BY_ID, rotateCells } from '../game'
import type { Color, PieceId } from '../game'
import type { ViewRotation } from '../boardView'
import { PieceIcon } from './PieceIcon'
import './PieceTray.css'

/** Big enough to read the shape at a glance, small enough for six per row. */
const TRAY_CELL_SIZE = 11

interface PieceTrayProps {
  pieceIds: PieceId[]
  color: Color
  selectedPieceId: PieceId | null
  /** True while the selected piece is parked on the board waiting to be placed. */
  selectedIsOnBoard: boolean
  /** Turned with the board, so an icon matches the shape it will make on it. */
  rotation: ViewRotation
  onSelect: (pieceId: PieceId) => void
  onDragStart: (pieceId: PieceId, e: React.PointerEvent<HTMLButtonElement>) => void
  onDragMove: (e: React.PointerEvent<HTMLButtonElement>) => void
  onDragEnd: (e: React.PointerEvent<HTMLButtonElement>) => void
}

export function PieceTray({
  pieceIds,
  color,
  selectedPieceId,
  selectedIsOnBoard,
  rotation,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: PieceTrayProps) {
  return (
    <div className="piece-tray" style={{ borderColor: COLOR_HEX[color] }}>
      {pieceIds.map((id) => {
        const selected = id === selectedPieceId
        let className = 'piece-tray-item'
        if (selected) className += selectedIsOnBoard ? ' in-hand' : ' selected'

        return (
          <button
            key={id}
            type="button"
            className={className}
            aria-pressed={selected}
            onClick={() => onSelect(id)}
            onPointerDown={(e) => onDragStart(id, e)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <PieceIcon
              cells={rotateCells(PIECE_BY_ID[id].cells, rotation)}
              color={color}
              cellSize={TRAY_CELL_SIZE}
            />
          </button>
        )
      })}
    </div>
  )
}
