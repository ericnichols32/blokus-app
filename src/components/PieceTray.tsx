import { COLOR_HEX } from '../colors'
import { PIECE_BY_ID } from '../game'
import type { Color, PieceId } from '../game'
import { PieceIcon } from './PieceIcon'
import './PieceTray.css'

interface PieceTrayProps {
  pieceIds: PieceId[]
  color: Color
  selectedPieceId: PieceId | null
  onSelect: (pieceId: PieceId) => void
  onDragStart: (pieceId: PieceId, e: React.PointerEvent<HTMLButtonElement>) => void
  onDragMove: (e: React.PointerEvent<HTMLButtonElement>) => void
  onDragEnd: (e: React.PointerEvent<HTMLButtonElement>) => void
}

export function PieceTray({
  pieceIds,
  color,
  selectedPieceId,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: PieceTrayProps) {
  return (
    <div className="piece-tray" style={{ borderColor: COLOR_HEX[color] }}>
      {pieceIds.map((id) => (
        <button
          key={id}
          type="button"
          className={`piece-tray-item ${id === selectedPieceId ? 'selected' : ''}`}
          onClick={() => onSelect(id)}
          onPointerDown={(e) => onDragStart(id, e)}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <PieceIcon cells={PIECE_BY_ID[id].cells} color={color} cellSize={8} />
        </button>
      ))}
    </div>
  )
}
