import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { PieceIcon } from '../components/PieceIcon'
import { PieceTray } from '../components/PieceTray'
import { ScoreStrip } from '../components/ScoreStrip'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import {
  BOARD_SIZE,
  applyMove,
  checkPlacement,
  chooseMove,
  finalizeScores,
  getOrientationCells,
} from '../game'
import type { Cell, Color, GameState, PieceId, Point } from '../game'
import { rotateCells } from '../game'
import { rotationFacing, screenToBoard } from '../boardView'
import type { Session } from '../session'
import type { Settings } from '../settings'
import './GameScreen.css'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * How far above the touch point the piece is aimed, in board squares. A piece
 * sitting under the touch point is a piece you are aiming blind, because your
 * fingertip covers it. Lifting it clear is the whole trick — the squares it
 * would land on still light up on the board, so the two read as one gesture.
 *
 * Constant rather than proportional to the piece: a lift that changed size with
 * the shape in hand would be something you have to relearn every move. That
 * means it has to be sized for the worst case instead. The piece hangs from the
 * filled square nearest its middle, so the furthest anything hangs below the
 * touch point is two squares — a five-tall piece held by its centre — and this
 * clears even that by well over a square.
 */
const LIFT_IN_CELLS = 3.4

/**
 * The filled cell nearest the shape's centre of mass. Used as the point the
 * piece is "held" by, so it sits squarely above the finger instead of hanging
 * down and to the right of it — the bounding-box origin isn't even a filled
 * square for shapes like the X- and S-pentominoes.
 */
function grabCell(cells: readonly Cell[]): Cell {
  const centreCol = cells.reduce((sum, [c]) => sum + c, 0) / cells.length
  const centreRow = cells.reduce((sum, [, r]) => sum + r, 0) / cells.length
  let best = cells[0]
  let bestDistance = Infinity
  for (const cell of cells) {
    const distance = (cell[0] - centreCol) ** 2 + (cell[1] - centreRow) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = cell
    }
  }
  return best
}

/** Long enough to read as deliberation rather than a glitch. */
const COMPUTER_THINKING_MS = 550

interface GameScreenProps {
  session: Session
  settings: Settings
  onStateChange: (state: GameState) => void
  onExit: () => void
  onPlayAgain: () => void
}

export function GameScreen({
  session,
  settings,
  onStateChange,
  onExit,
  onPlayAgain,
}: GameScreenProps) {
  const gameState = session.state
  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null)
  const [rotationSteps, setRotationSteps] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const [dragPointerPos, setDragPointerPos] = useState<{ x: number; y: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  /**
   * Refs, not state: a pointermove can arrive before React has re-rendered from
   * the pointerdown that started the drag, and a handler reading its own render's
   * state would drop that move. Both are only ever read inside event handlers,
   * so nothing needs to re-render when they change.
   */
  const dragPointerId = useRef<number | null>(null)
  const dragCells = useRef<readonly Cell[]>([])

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const currentSeat = session.seats[currentPlayer.color]
  const isComputerTurn = currentSeat.kind === 'computer' && !gameState.gameOver

  /**
   * The angle the board sits at. In pass and play that follows the turn, so
   * whoever picks the phone up is looking at it from their own corner; in solo
   * it is fixed to your seat, since you are always the same colour.
   */
  const viewRotation = useMemo(() => {
    if (session.mode === 'solo') {
      const yours = (Object.keys(session.seats) as Color[]).find(
        (c) => session.seats[c].kind === 'human',
      )
      return rotationFacing(yours ?? currentPlayer.color)
    }
    return rotationFacing(currentPlayer.color)
  }, [session.mode, session.seats, currentPlayer.color])

  const clearSelection = useCallback(() => {
    setSelectedPieceId(null)
    setAnchor(null)
  }, [])

  // Drive the computer seats. Re-runs whenever the turn lands on one.
  useEffect(() => {
    if (!isComputerTurn) return

    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const opponents = gameState.players
        .filter((p) => p.color !== currentPlayer.color)
        .map((p) => p.color)
      const move = chooseMove(
        gameState.board,
        currentPlayer,
        opponents,
        currentSeat.difficulty ?? 'hard',
      )
      // advanceTurn only stops on players who have a move, so null would mean
      // the engine and the search disagree — better to stall than to crash.
      if (move) onStateChange(applyMove(gameState, move))
    }, COMPUTER_THINKING_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isComputerTurn, gameState, currentPlayer, currentSeat, onStateChange])

  // Never leave a half-built placement attached to someone else's turn.
  useEffect(() => {
    clearSelection()
    setRotationSteps(0)
    setFlipped(false)
  }, [gameState.currentPlayerIndex, clearSelection])

  const currentCells: Cell[] = useMemo(
    () => (selectedPieceId ? getOrientationCells(selectedPieceId, rotationSteps, flipped) : []),
    [selectedPieceId, rotationSteps, flipped],
  )

  // Rotating or flipping mid-drag has to reach the pointer handlers, which read
  // the shape from a ref rather than from their own render.
  useEffect(() => {
    dragCells.current = currentCells
  }, [currentCells])

  // Keeping the whole piece on the board is the single clamp point, so rotating
  // near an edge nudges the piece back into bounds instead of silently clipping
  // the cells that fall off.
  const clampedAnchor = useMemo(() => {
    if (!anchor || currentCells.length === 0) return null
    const width = Math.max(...currentCells.map(([c]) => c)) + 1
    const height = Math.max(...currentCells.map(([, r]) => r)) + 1
    return [
      clamp(anchor[0], 0, BOARD_SIZE - width),
      clamp(anchor[1], 0, BOARD_SIZE - height),
    ] as const
  }, [anchor, currentCells])

  const previewCells: Point[] = useMemo(
    () =>
      clampedAnchor
        ? currentCells.map(([c, r]) => [clampedAnchor[0] + c, clampedAnchor[1] + r] as Point)
        : [],
    [clampedAnchor, currentCells],
  )

  const previewCheck = useMemo(() => {
    if (!clampedAnchor || !selectedPieceId) return null
    return checkPlacement(
      gameState.board,
      currentPlayer.color,
      previewCells,
      !currentPlayer.hasPlayedFirstMove,
    )
  }, [clampedAnchor, selectedPieceId, gameState.board, currentPlayer, previewCells])

  function selectPiece(id: PieceId) {
    if (isComputerTurn) return
    // Re-selecting the piece already in hand keeps its orientation and position,
    // so the click that follows a drag doesn't undo the drag.
    if (id !== selectedPieceId) {
      setRotationSteps(0)
      setFlipped(false)
      setAnchor(null)
    }
    setSelectedPieceId(id)
  }

  /**
   * Points the piece at the square LIFT_IN_CELLS above the touch, or takes it
   * off the board when that square isn't on one. Aiming from the lifted point
   * rather than the finger means you can reach the bottom row with your finger
   * below the board, and that letting go down in the tray reliably reads as
   * "put it back" rather than as a placement on the last row.
   */
  function updateAnchorFromPoint(clientX: number, clientY: number, cells: readonly Cell[]) {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect || cells.length === 0) return

    // The board is square, so its bounding box is unchanged by the rotation and
    // these stay valid — but the square being aimed at has to be turned back
    // into board coordinates.
    const cellSize = rect.width / BOARD_SIZE
    const aimY = clientY - LIFT_IN_CELLS * cellSize

    if (clientX < rect.left || clientX >= rect.right || aimY < rect.top || aimY >= rect.bottom) {
      setAnchor(null)
      return
    }

    const x = clamp(Math.floor((clientX - rect.left) / cellSize), 0, BOARD_SIZE - 1)
    const y = clamp(Math.floor((aimY - rect.top) / cellSize), 0, BOARD_SIZE - 1)
    const [col, row] = screenToBoard([x, y], viewRotation)
    const [grabCol, grabRow] = grabCell(cells)
    setAnchor([col - grabCol, row - grabRow])
  }

  function beginDrag(e: React.PointerEvent<Element>, cells: readonly Cell[]) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragPointerId.current = e.pointerId
    dragCells.current = cells
    setDragPointerPos({ x: e.clientX, y: e.clientY })
    updateAnchorFromPoint(e.clientX, e.clientY, cells)
  }

  function handleTrayDragStart(id: PieceId, e: React.PointerEvent<HTMLButtonElement>) {
    if (isComputerTurn) return
    // The piece just selected isn't in state yet, so read its shape directly.
    const cells = id === selectedPieceId ? currentCells : getOrientationCells(id, 0, false)
    selectPiece(id)
    beginDrag(e, cells)
  }

  /**
   * Pressing the board with a piece in hand picks it up, wherever on the board
   * you press — including a piece already parked there, which is what stops one
   * getting stranded in a spot it can't legally sit in.
   */
  function handleBoardDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (isComputerTurn || !selectedPieceId) return
    beginDrag(e, currentCells)
  }

  function handleDragMove(e: React.PointerEvent<Element>) {
    if (e.pointerId !== dragPointerId.current) return
    setDragPointerPos({ x: e.clientX, y: e.clientY })
    updateAnchorFromPoint(e.clientX, e.clientY, dragCells.current)
  }

  function handleDragEnd(e: React.PointerEvent<Element>) {
    if (e.pointerId !== dragPointerId.current) return
    dragPointerId.current = null
    setDragPointerPos(null)
  }

  function confirmPlacement() {
    if (!selectedPieceId || !clampedAnchor || !previewCheck?.valid) return
    onStateChange(applyMove(gameState, { pieceId: selectedPieceId, cells: previewCells }))
    clearSelection()
  }

  if (gameState.gameOver) {
    const scores = finalizeScores(gameState)
    const ranked = gameState.players
      .map((p) => p.color)
      .sort((a, b) => scores[b].score - scores[a].score)

    return (
      <div className="screen game-over">
        <h1>Game over</h1>
        <ul className="scoreboard">
          {ranked.map((color) => {
            // Equal scores share a rank rather than being ordered arbitrarily.
            const rank = ranked.findIndex((c) => scores[c].score === scores[color].score) + 1
            const seat = session.seats[color]
            return (
              <li key={color} style={{ borderColor: COLOR_HEX[color] }}>
                <span className="rank">#{rank}</span>
                <span className="dot" style={{ background: COLOR_HEX[color] }} />
                <span className="who">
                  {COLOR_LABEL[color]}
                  {seat.kind === 'computer' && <span className="tag">CPU</span>}
                </span>
                <span className="score">{scores[color].score}</span>
                {scores[color].perfectGame && <span className="badge">Perfect game</span>}
              </li>
            )
          })}
        </ul>
        <div className="stack">
          <button type="button" className="btn primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn" onClick={onExit}>
            Back to menu
          </button>
        </div>
      </div>
    )
  }

  const hasSelection = selectedPieceId !== null
  const canInteract = !isComputerTurn
  const canPlace = hasSelection && !!clampedAnchor && !!previewCheck?.valid && canInteract

  return (
    <div
      className="screen game"
      // The board sizes itself against everything stacked around it, so the
      // optional score strip has to declare the height it costs.
      style={{ '--extra-chrome': settings.showLiveScores ? '46px' : '0px' } as React.CSSProperties}
    >
      <header className="status-bar">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Back to menu">
          ‹
        </button>
        <span className="dot" style={{ background: COLOR_HEX[currentPlayer.color] }} />
        <span className="turn-label">
          {COLOR_LABEL[currentPlayer.color]}
          {isComputerTurn ? ' is thinking…' : "'s turn"}
        </span>
      </header>

      {settings.showLiveScores && <ScoreStrip session={session} />}

      <div className="board-area">
        <Board
          ref={boardRef}
          board={gameState.board}
          previewCells={previewCells}
          previewColor={hasSelection ? currentPlayer.color : null}
          previewValid={previewCheck?.valid ?? false}
          rotation={viewRotation}
          onPointerDown={handleBoardDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        />
      </div>

      {/* Only while the piece is off the board — once it's over the grid the
          board preview shows exactly where it will land. */}
      {dragPointerPos && hasSelection && !clampedAnchor && (
        <div className="drag-ghost" style={{ left: dragPointerPos.x, top: dragPointerPos.y }}>
          <PieceIcon
            cells={rotateCells(currentCells, viewRotation)}
            color={currentPlayer.color}
            cellSize={16}
          />
        </div>
      )}

      {/* Always rendered, so selecting a piece doesn't shift the board and tray. */}
      <div className="piece-controls">
        <button
          type="button"
          className="btn"
          disabled={!hasSelection || !canInteract}
          onClick={() => setRotationSteps((s) => s + 1)}
        >
          Rotate
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasSelection || !canInteract}
          onClick={() => setFlipped((f) => !f)}
        >
          Flip
        </button>
        <button type="button" className="btn primary" disabled={!canPlace} onClick={confirmPlacement}>
          Place
        </button>
        <button
          type="button"
          className="btn"
          disabled={!hasSelection || !canInteract}
          onClick={clearSelection}
        >
          Cancel
        </button>
      </div>

      <PieceTray
        pieceIds={currentPlayer.remainingPieceIds}
        color={currentPlayer.color}
        selectedPieceId={selectedPieceId}
        selectedIsOnBoard={clampedAnchor !== null}
        rotation={viewRotation}
        onSelect={selectPiece}
        onDragStart={handleTrayDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    </div>
  )
}
