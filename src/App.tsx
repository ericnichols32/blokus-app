import { useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './components/Board'
import { PieceIcon } from './components/PieceIcon'
import { PieceTray } from './components/PieceTray'
import { COLOR_HEX, COLOR_LABEL } from './colors'
import {
  BOARD_SIZE,
  COLORS,
  applyMove,
  checkPlacement,
  createGame,
  finalizeScores,
  getOrientationCells,
} from './game'
import type { Cell, GameState, PieceId, Point } from './game'
import './App.css'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

// Bump when the shape of GameState changes, so stale saves are discarded
// rather than deserialised into something the engine can't handle.
const STORAGE_KEY = 'blokus:game:v1'

function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    const looksValid =
      Array.isArray(parsed?.board) &&
      parsed.board.length === BOARD_SIZE &&
      Array.isArray(parsed.players) &&
      parsed.players.length > 0
    return looksValid ? parsed : null
  } catch {
    return null
  }
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

function App() {
  const [gameState, setGameState] = useState(() => loadSavedGame() ?? createGame(COLORS))
  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null)
  const [rotationSteps, setRotationSteps] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)
  const [dragPointerPos, setDragPointerPos] = useState<{ x: number; y: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState))
    } catch {
      // Private browsing or a full quota. The game still plays; it just won't resume.
    }
  }, [gameState])

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
    // Re-selecting the piece already in hand keeps its orientation and position,
    // so the click that follows a drag doesn't undo the drag.
    if (id !== selectedPieceId) {
      setRotationSteps(0)
      setFlipped(false)
      setAnchor(null)
    }
    setSelectedPieceId(id)
    setErrorMessage(null)
  }

  function anchorFromCell(col: number, row: number, cells: readonly Cell[]) {
    const [grabCol, grabRow] = grabCell(cells)
    setAnchor([col - grabCol, row - grabRow])
  }

  function handleCellTap(col: number, row: number) {
    if (!selectedPieceId) return
    anchorFromCell(col, row, currentCells)
    setErrorMessage(null)
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

  function cancelSelection() {
    setSelectedPieceId(null)
    setAnchor(null)
    setErrorMessage(null)
  }

  function confirmPlacement() {
    if (!selectedPieceId || !clampedAnchor) return
    try {
      const next = applyMove(gameState, { pieceId: selectedPieceId, cells: previewCells })
      setGameState(next)
      setSelectedPieceId(null)
      setAnchor(null)
      setErrorMessage(null)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid move')
    }
  }

  function newGame() {
    setGameState(createGame(COLORS))
    setSelectedPieceId(null)
    setAnchor(null)
    setErrorMessage(null)
  }

  if (gameState.gameOver) {
    const scores = finalizeScores(gameState)
    const ranked = gameState.players
      .map((p) => p.color)
      .sort((a, b) => scores[b].score - scores[a].score)
    return (
      <div className="app game-over">
        <h1>Game Over</h1>
        <ul className="scoreboard">
          {ranked.map((color) => {
            // Equal scores share a rank rather than being ordered arbitrarily.
            const rank = ranked.findIndex((c) => scores[c].score === scores[color].score) + 1
            return (
              <li key={color} style={{ borderColor: COLOR_HEX[color] }}>
                <span className="rank">#{rank}</span>
                <span className="dot" style={{ background: COLOR_HEX[color] }} />
                <span>{COLOR_LABEL[color]}</span>
                <span className="score">{scores[color].score}</span>
                {scores[color].perfectGame && <span className="badge">Perfect game!</span>}
              </li>
            )
          })}
        </ul>
        <button type="button" className="primary" onClick={newGame}>
          New Game
        </button>
      </div>
    )
  }

  const hasSelection = selectedPieceId !== null

  return (
    <div className="app">
      <header className="status-bar">
        <span className="dot" style={{ background: COLOR_HEX[currentPlayer.color] }} />
        <span>{COLOR_LABEL[currentPlayer.color]}'s turn</span>
        <button type="button" className="link" onClick={newGame}>
          New Game
        </button>
      </header>

      <Board
        ref={boardRef}
        board={gameState.board}
        previewCells={previewCells}
        previewColor={hasSelection ? currentPlayer.color : null}
        previewValid={previewCheck?.valid ?? false}
        onCellTap={handleCellTap}
      />

      {/* Only while the piece is off the board — once it's over the grid the
          board preview shows exactly where it will land. */}
      {dragPointerPos && hasSelection && !clampedAnchor && (
        <div className="drag-ghost" style={{ left: dragPointerPos.x, top: dragPointerPos.y }}>
          <PieceIcon cells={currentCells} color={currentPlayer.color} cellSize={16} />
        </div>
      )}

      {errorMessage && <div className="error-banner">{errorMessage}</div>}

      {/* Always rendered, so selecting a piece doesn't shift the board and tray. */}
      <div className="piece-controls">
        <button type="button" disabled={!hasSelection} onClick={() => setRotationSteps((s) => s + 1)}>
          Rotate
        </button>
        <button type="button" disabled={!hasSelection} onClick={() => setFlipped((f) => !f)}>
          Flip
        </button>
        <button
          type="button"
          className="primary"
          disabled={!hasSelection || !clampedAnchor || !previewCheck?.valid}
          onClick={confirmPlacement}
        >
          Place
        </button>
        <button type="button" disabled={!hasSelection} onClick={cancelSelection}>
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

export default App
