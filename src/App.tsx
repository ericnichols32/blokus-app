import { useMemo, useState } from 'react'
import { Board } from './components/Board'
import { PieceTray } from './components/PieceTray'
import { COLOR_HEX, COLOR_LABEL } from './colors'
import {
  COLORS,
  applyMove,
  checkPlacement,
  createGame,
  finalizeScores,
  getOrientationCells,
} from './game'
import type { Cell, PieceId } from './game'
import './App.css'

function App() {
  const [gameState, setGameState] = useState(() => createGame(COLORS))
  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null)
  const [rotationSteps, setRotationSteps] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]

  const currentCells: Cell[] = useMemo(
    () => (selectedPieceId ? getOrientationCells(selectedPieceId, rotationSteps, flipped) : []),
    [selectedPieceId, rotationSteps, flipped],
  )

  const previewCells = useMemo(
    () => (anchor ? currentCells.map(([c, r]) => [anchor[0] + c, anchor[1] + r] as const) : []),
    [anchor, currentCells],
  )

  const previewCheck = useMemo(() => {
    if (!anchor || !selectedPieceId) return null
    return checkPlacement(
      gameState.board,
      currentPlayer.color,
      previewCells,
      !currentPlayer.hasPlayedFirstMove,
    )
  }, [anchor, selectedPieceId, gameState.board, currentPlayer, previewCells])

  function selectPiece(id: PieceId) {
    setSelectedPieceId(id)
    setRotationSteps(0)
    setFlipped(false)
    setAnchor(null)
    setErrorMessage(null)
  }

  function handleCellTap(col: number, row: number) {
    if (!selectedPieceId) return
    setAnchor([col, row])
    setErrorMessage(null)
  }

  function cancelSelection() {
    setSelectedPieceId(null)
    setAnchor(null)
    setErrorMessage(null)
  }

  function confirmPlacement() {
    if (!selectedPieceId || !anchor) return
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
    const ranked = COLORS.slice().sort((a, b) => scores[b].score - scores[a].score)
    return (
      <div className="app game-over">
        <h1>Game Over</h1>
        <ul className="scoreboard">
          {ranked.map((color, i) => (
            <li key={color} style={{ borderColor: COLOR_HEX[color] }}>
              <span className="rank">#{i + 1}</span>
              <span className="dot" style={{ background: COLOR_HEX[color] }} />
              <span>{COLOR_LABEL[color]}</span>
              <span className="score">{scores[color].score}</span>
              {scores[color].perfectGame && <span className="badge">Perfect game!</span>}
            </li>
          ))}
        </ul>
        <button type="button" className="primary" onClick={newGame}>
          New Game
        </button>
      </div>
    )
  }

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
        board={gameState.board}
        previewCells={previewCells}
        previewColor={selectedPieceId ? currentPlayer.color : null}
        previewValid={previewCheck?.valid ?? false}
        onCellTap={handleCellTap}
      />

      {errorMessage && <div className="error-banner">{errorMessage}</div>}

      {selectedPieceId && (
        <div className="piece-controls">
          <button type="button" onClick={() => setRotationSteps((s) => s + 1)}>
            Rotate
          </button>
          <button type="button" onClick={() => setFlipped((f) => !f)}>
            Flip
          </button>
          <button
            type="button"
            className="primary"
            disabled={!anchor || !previewCheck?.valid}
            onClick={confirmPlacement}
          >
            Place
          </button>
          <button type="button" onClick={cancelSelection}>
            Cancel
          </button>
        </div>
      )}

      <PieceTray
        pieceIds={currentPlayer.remainingPieceIds}
        color={currentPlayer.color}
        selectedPieceId={selectedPieceId}
        onSelect={selectPiece}
      />
    </div>
  )
}

export default App
