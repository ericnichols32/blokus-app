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
  findContactPoints,
  findReachableCells,
  getOrientationCells,
  hasLegalPlacement,
} from '../game'
import type { Cell, GameState, PieceId, Point } from '../game'
import type { Session } from '../session'
import './GameScreen.css'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * The filled cell nearest the shape's centre of mass. Used as the point the
 * piece is "held" by, so it sits under the finger instead of hanging down and
 * to the right of it — the bounding-box origin isn't even a filled square for
 * shapes like the X- and S-pentominoes.
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

const HINTS_KEY = 'blokus:hints'

// On by default: knowing where a piece may legally go is the rule newcomers
// lose track of, and an experienced player can switch it off once.
function loadHintsPreference(): boolean {
  try {
    return localStorage.getItem(HINTS_KEY) !== 'off'
  } catch {
    return true
  }
}

interface GameScreenProps {
  session: Session
  onStateChange: (state: GameState) => void
  onUndo: () => void
  canUndo: boolean
  onExit: () => void
  onPlayAgain: () => void
}

export function GameScreen({
  session,
  onStateChange,
  onUndo,
  canUndo,
  onExit,
  onPlayAgain,
}: GameScreenProps) {
  const gameState = session.state
  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null)
  const [rotationSteps, setRotationSteps] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)
  const [dragPointerPos, setDragPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [hintsOn, setHintsOn] = useState(loadHintsPreference)
  const boardRef = useRef<HTMLDivElement>(null)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const currentSeat = session.seats[currentPlayer.color]
  const isComputerTurn = currentSeat.kind === 'computer' && !gameState.gameOver

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
        currentSeat.difficulty ?? 'medium',
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

  // Hints belong to whoever is about to move, so they go quiet while a computer
  // is thinking rather than flashing that seat's options on screen.
  const showHints = hintsOn && !isComputerTurn
  const isFirstMove = !currentPlayer.hasPlayedFirstMove

  const contactCells: Point[] = useMemo(
    () => (showHints ? findContactPoints(gameState.board, currentPlayer.color, isFirstMove) : []),
    [showHints, gameState.board, currentPlayer.color, isFirstMove],
  )

  const hintCells: Point[] = useMemo(
    () =>
      showHints && currentCells.length > 0
        ? findReachableCells(gameState.board, currentPlayer.color, currentCells, isFirstMove)
        : [],
    [showHints, currentCells, gameState.board, currentPlayer.color, isFirstMove],
  )

  // Checked across every rotation, so "doesn't fit" means genuinely unplayable
  // rather than just wrong way round. Counts as a hint, so it follows the
  // toggle — someone who switched hints off is choosing to work it out.
  const selectedFitsSomewhere = useMemo(
    () =>
      !showHints ||
      selectedPieceId === null ||
      hasLegalPlacement(gameState.board, currentPlayer.color, selectedPieceId, isFirstMove),
    [showHints, selectedPieceId, gameState.board, currentPlayer.color, isFirstMove],
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

  function anchorFromCell(col: number, row: number, cells: readonly Cell[]) {
    const [grabCol, grabRow] = grabCell(cells)
    setAnchor([col - grabCol, row - grabRow])
  }

  function handleCellTap(col: number, row: number) {
    if (!selectedPieceId || isComputerTurn) return
    anchorFromCell(col, row, currentCells)
  }

  function updateAnchorFromPoint(clientX: number, clientY: number, cells: readonly Cell[]) {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect || cells.length === 0) return
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
      setAnchor(null)
      return
    }
    const cellSize = rect.width / BOARD_SIZE
    const col = clamp(Math.floor((clientX - rect.left) / cellSize), 0, BOARD_SIZE - 1)
    const row = clamp(Math.floor((clientY - rect.top) / cellSize), 0, BOARD_SIZE - 1)
    anchorFromCell(col, row, cells)
  }

  function handleDragStart(id: PieceId, e: React.PointerEvent<HTMLButtonElement>) {
    if (isComputerTurn) return
    const cells = id === selectedPieceId ? currentCells : getOrientationCells(id, 0, false)
    selectPiece(id)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragPointerId(e.pointerId)
    setDragPointerPos({ x: e.clientX, y: e.clientY })
    updateAnchorFromPoint(e.clientX, e.clientY, cells)
  }

  function handleDragMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== dragPointerId) return
    setDragPointerPos({ x: e.clientX, y: e.clientY })
    updateAnchorFromPoint(e.clientX, e.clientY, currentCells)
  }

  function handleDragEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerId !== dragPointerId) return
    setDragPointerId(null)
    setDragPointerPos(null)
  }

  function toggleHints() {
    setHintsOn((on) => {
      try {
        localStorage.setItem(HINTS_KEY, on ? 'off' : 'on')
      } catch {
        // Storage unavailable; the choice just won't stick between sessions.
      }
      return !on
    })
  }

  // Undo can land back on the same player, which leaves the turn-change effect
  // below unfired — so drop any piece in hand here rather than relying on it.
  function handleUndo() {
    clearSelection()
    setRotationSteps(0)
    setFlipped(false)
    onUndo()
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

  return (
    <div className="screen game">
      <header className="status-bar">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Back to menu">
          ‹
        </button>
        <span className="dot" style={{ background: COLOR_HEX[currentPlayer.color] }} />
        <span className="turn-label">
          {COLOR_LABEL[currentPlayer.color]}
          {isComputerTurn ? ' is thinking…' : "'s turn"}
        </span>
        <button
          type="button"
          className="icon-btn push-right"
          onClick={toggleHints}
          aria-pressed={hintsOn}
          aria-label={hintsOn ? 'Turn hints off' : 'Turn hints on'}
          title={hintsOn ? 'Turn hints off' : 'Turn hints on'}
        >
          {hintsOn ? '💡' : '○'}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={handleUndo}
          disabled={!canUndo || isComputerTurn}
          aria-label="Undo your last move"
          title="Undo your last move"
        >
          ↶
        </button>
      </header>

      <ScoreStrip session={session} />

      <div className="board-area">
        <Board
          ref={boardRef}
          board={gameState.board}
          previewCells={previewCells}
          previewColor={hasSelection ? currentPlayer.color : null}
          previewValid={previewCheck?.valid ?? false}
          contactCells={contactCells}
          hintCells={hintCells}
          hintColor={currentPlayer.color}
          onCellTap={handleCellTap}
        />

        {/* Floats over the foot of the board rather than sitting in the stack,
            so a warning appearing mid-turn costs no height and shifts nothing
            under your finger. */}
        {hasSelection && !selectedFitsSomewhere && (
          <p className="play-note" aria-live="polite">
            That piece won&rsquo;t fit anywhere &mdash; try a smaller one.
          </p>
        )}
      </div>

      {/* Only while the piece is off the board — once it's over the grid the
          board preview shows exactly where it will land. */}
      {dragPointerPos && hasSelection && !clampedAnchor && (
        <div className="drag-ghost" style={{ left: dragPointerPos.x, top: dragPointerPos.y }}>
          <PieceIcon cells={currentCells} color={currentPlayer.color} cellSize={16} />
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
        <button
          type="button"
          className="btn primary"
          disabled={!hasSelection || !clampedAnchor || !previewCheck?.valid || !canInteract}
          onClick={confirmPlacement}
        >
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
        onSelect={selectPiece}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />
    </div>
  )
}
