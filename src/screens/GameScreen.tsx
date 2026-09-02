import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from '../components/Board'
import { PieceIcon } from '../components/PieceIcon'
import { PieceTray } from '../components/PieceTray'
import { ScoreStrip } from '../components/ScoreStrip'
import { usePalette } from '../colors'
import {
  BOARD_SIZE,
  applyMove,
  checkPlacement,
  chooseMove,
  chooseTimeoutMove,
  finalizeScores,
  getOrientationCells,
  STRONGEST,
} from '../game'
import type { Cell, Color, GameState, PieceId, Point } from '../game'
import { rotateCells } from '../game'
import { rotationFacing, screenToBoard } from '../boardView'
import { clampZoom, NO_ZOOM, ZOOM_SNAP_BACK } from '../boardZoom'
import type { Zoom } from '../boardZoom'
import type { ViewRotation } from '../boardView'
import type { Session } from '../session'
import type { Settings } from '../settings'
import { phaseFor, remaining, secondsLeft, startTurn, switchPhase } from '../turnClock'
import type { ClockState } from '../turnClock'
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

/**
 * How often the countdown re-reads the wall clock. Fast enough that the number
 * changes on time and expiry fires promptly, slow enough not to re-render the
 * board four times a second.
 *
 * Everything is derived from timestamps rather than counted down tick by tick,
 * so a backgrounded tab — where browsers throttle timers to about once a second
 * — comes back with the correct time elapsed instead of a clock that paused.
 */
const TICK_MS = 200

/**
 * What an online game needs from the board that a solo game doesn't.
 *
 * Present only for an online game, and its presence is what switches the board
 * out of playing-locally mode: a move is handed to `submit` instead of being
 * applied here, and the computers are left alone because whoever's write lands
 * plays them (see online.ts — nothing on a server can).
 */

export interface OnlineControls {
  /** Whether the color on turn is one of yours. */
  yourTurn: boolean
  /** A line for the header: whose move this is. */
  status: string
  /** A turn is in flight. The board locks so it can't be played twice. */
  busy: boolean
  /** Why the last attempt failed, if it did. */
  error: string | null
  submit: (move: { pieceId: PieceId; cells: Point[] }) => void
}

interface GameScreenProps {
  session: Session
  settings: Settings
  onStateChange: (state: GameState) => void
  onExit: () => void
  onPlayAgain: () => void
  /**
   * Abandon this game and set up a fresh one.
   *
   * Only given for a solo game, and this is the only route to one: the home
   * screen resumes a solo game in progress rather than offering a choice, so
   * without a way out from in here a game you had lost interest in would be the
   * only game you could ever play again.
   */
  onNewGame?: () => void
  online?: OnlineControls
}

export function GameScreen({
  session,
  settings,
  onStateChange,
  onExit,
  onPlayAgain,
  onNewGame,
  online,
}: GameScreenProps) {
  const gameState = session.state
  const palette = usePalette()
  const [selectedPieceId, setSelectedPieceId] = useState<PieceId | null>(null)
  const [rotationSteps, setRotationSteps] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [anchor, setAnchor] = useState<[number, number] | null>(null)
  const [dragPointerPos, setDragPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [clock, setClock] = useState<ClockState | null>(null)
  /** The back-arrow menu: shut, open, or asking before it throws a game away. */
  const [menu, setMenu] = useState<'shut' | 'open' | 'confirm'>('shut')
  // Bumped by the ticker purely to re-read the wall clock; the countdown is
  // derived, so nothing but the displayed number depends on this.
  const [, tick] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)

  /**
   * Refs, not state: a pointermove can arrive before React has re-rendered from
   * the pointerdown that started the drag, and a handler reading its own render's
   * state would drop that move. Both are only ever read inside event handlers,
   * so nothing needs to re-render when they change.
   */
  const dragPointerId = useRef<number | null>(null)
  const dragCells = useRef<readonly Cell[]>([])

  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM)
  /**
   * Every finger currently on the board. Two of them is a pinch rather than a
   * placement, and the count is the only way to tell the difference at the
   * moment the second one lands.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef<{ distance: number; mid: { x: number; y: number }; zoom: Zoom } | null>(
    null,
  )

  const currentPlayer = gameState.players[gameState.currentPlayerIndex]
  const currentSeat = session.seats[currentPlayer.color]
  /*
   * Online, the computers are never played here. They are played by whichever
   * device writes the turn before theirs, in the same write — so a board that
   * also played them locally would race that write and try to play the same
   * seat twice from two places.
   */
  const isComputerTurn = !online && currentSeat.kind === 'computer' && !gameState.gameOver

  /**
   * Whose pieces the tray shows.
   *
   * Your own, unless the seat on turn is already yours. The tray is your hand,
   * and on somebody else's turn it used to fill with *their* pieces — which
   * looked like your set had been replaced, and told you nothing you can act on.
   * Holding two colours is why this can't just be `youAre`: on your own turn the
   * seat playing may be your second colour.
   */
  const currentIsYours = online ? online.yourTurn : currentSeat.kind === 'human'
  const handColor = currentIsYours ? currentPlayer.color : (session.youAre ?? currentPlayer.color)
  const handPlayer = gameState.players.find((p) => p.color === handColor) ?? currentPlayer

  /**
   * The angle the board sits at: your own corner nearest you, so the shape in
   * your hand lands the way it looks. Fixed for the whole game now that every
   * mode seats one person per device — it followed the turn under pass and play,
   * where the phone changed hands mid-game.
   */
  const seatRotation = useMemo(() => {
    // youAre, not "the first human seat": online, three of the human seats are
    // other people, and facing one of theirs would put your corner anywhere.
    const yours =
      session.youAre ??
      (Object.keys(session.seats) as Color[]).find((c) => session.seats[c].kind === 'human')
    return rotationFacing(yours ?? currentPlayer.color)
  }, [session.youAre, session.seats, currentPlayer.color])

  /**
   * Quarter-turns the player has added by hand, on top of their seat's angle.
   * Never reset, since the angle underneath it no longer moves.
   */
  const [nudge, setNudge] = useState(0)

  const viewRotation = (((seatRotation + nudge) % 4) + 4) % 4 as ViewRotation

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
      const move = chooseMove(gameState.board, currentPlayer, opponents, currentSeat.strength ?? STRONGEST)
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

  const awaitingFirstMove = useMemo(
    () => gameState.players.filter((p) => !p.hasPlayedFirstMove).map((p) => p.color),
    [gameState.players],
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

  /** The clock only runs on a person's turn, in a game that asked for one. */
  // Never online: a fifteen-second budget means nothing in a game whose next
  // turn might be tomorrow morning.
  const clockRunning = session.timed && !online && !isComputerTurn && !gameState.gameOver
  const phase = phaseFor(selectedPieceId)

  /**
   * What happens when a budget runs out.
   *
   * Selecting: a piece is chosen for you, and the placement clock then gives
   * you the full fifteen seconds to put it down — you lost the choice, not the
   * turn.
   *
   * Placing: if the piece is already sitting somewhere legal, that is where it
   * goes. You did the work and only missed the confirming tap, and moving it
   * somewhere worse at that point would be the app taking a game off you rather
   * than keeping it moving. Otherwise a legal spot is picked, mediocre by
   * construction.
   */
  const expire = useCallback(() => {
    const opponents = gameState.players
      .filter((p) => p.color !== currentPlayer.color)
      .map((p) => p.color)

    if (phaseFor(selectedPieceId) === 'select') {
      const move = chooseTimeoutMove(gameState.board, currentPlayer, opponents)
      if (!move) return
      setRotationSteps(0)
      setFlipped(false)
      setAnchor(null)
      setSelectedPieceId(move.pieceId)
      return
    }

    if (selectedPieceId && clampedAnchor && previewCheck?.valid) {
      onStateChange(applyMove(gameState, { pieceId: selectedPieceId, cells: previewCells }))
      clearSelection()
      return
    }

    const move = chooseTimeoutMove(
      gameState.board,
      currentPlayer,
      opponents,
      selectedPieceId ?? undefined,
    )
    if (!move) return
    onStateChange(applyMove(gameState, move))
    clearSelection()
  }, [
    gameState,
    currentPlayer,
    selectedPieceId,
    clampedAnchor,
    previewCheck,
    previewCells,
    onStateChange,
    clearSelection,
  ])

  // A fresh pair of budgets each time the turn reaches a person. Keyed on the
  // move count rather than on whose turn it is, because once everyone else has
  // passed out the turn can come back round to the same player — and a clock
  // that only reset when the colour changed would then never reset at all.
  useEffect(() => {
    setClock(clockRunning ? startTurn(Date.now(), settings.turnSeconds * 1000) : null)
  }, [clockRunning, gameState.placedPieces.length, settings.turnSeconds])

  // Picking a piece up stops the selection clock and starts the placement one;
  // putting it back does the reverse. Neither is refilled — see turnClock.ts.
  useEffect(() => {
    setClock((current) => (current ? switchPhase(current, phase, Date.now()) : current))
  }, [phase])

  /**
   * The ticker reaches `expire` through a ref rather than through its own
   * dependencies, and this is load-bearing rather than tidiness.
   *
   * `expire` is rebuilt whenever the preview moves, which during a drag is
   * every pointer event. Depending on it directly would tear down and restart
   * the interval dozens of times a second, so the 200ms would never elapse and
   * a player who simply kept dragging would run past the deadline untouched —
   * the one way to hold a turn open that the clock is meant to prevent.
   */
  const expireRef = useRef(expire)
  useEffect(() => {
    expireRef.current = expire
  }, [expire])

  useEffect(() => {
    if (!clock) return

    const id = setInterval(() => {
      if (remaining(clock, Date.now()) <= 0) expireRef.current()
      else tick((n) => n + 1)
    }, TICK_MS)

    return () => clearInterval(id)
  }, [clock])

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
    /*
     * The lift is measured in unzoomed cells, so it stays the same distance up
     * the screen however far the board is zoomed. It exists to clear a
     * fingertip, and a fingertip does not get bigger with the board — left in
     * scaled cells, a zoomed board would fling the piece half a screen away.
     */
    const aimY = clientY - (LIFT_IN_CELLS * cellSize) / zoom.scale

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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // A second finger turns the gesture into a pinch. Whatever the first one was
    // doing is abandoned rather than finished — two fingers on a board is nobody
    // trying to place a piece, and letting the drag continue would have the
    // piece chase one finger while the board moved under it.
    if (pointers.current.size >= 2) {
      dragPointerId.current = null
      setDragPointerPos(null)
      beginPinch()
      return
    }

    if (isComputerTurn || !selectedPieceId) return
    beginDrag(e, currentCells)
  }

  function handleDragMove(e: React.PointerEvent<Element>) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pointers.current.size >= 2) {
      updatePinch()
      return
    }

    if (e.pointerId !== dragPointerId.current) return
    setDragPointerPos({ x: e.clientX, y: e.clientY })
    updateAnchorFromPoint(e.clientX, e.clientY, dragCells.current)
  }

  function handleDragEnd(e: React.PointerEvent<Element>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) {
      pinchStart.current = null
      // Let all the way out and it goes back square, rather than resting a
      // percent or two off true for the rest of the game.
      setZoom((current) => (current.scale <= ZOOM_SNAP_BACK ? NO_ZOOM : current))
    }

    if (e.pointerId !== dragPointerId.current) return
    dragPointerId.current = null
    setDragPointerPos(null)
  }

  /** The two fingers as they are right now, or null if there aren't two. */
  function twoFingers() {
    const [a, b] = [...pointers.current.values()]
    if (!a || !b) return null
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    }
  }

  function beginPinch() {
    const fingers = twoFingers()
    if (!fingers || fingers.distance === 0) return
    pinchStart.current = { distance: fingers.distance, mid: fingers.mid, zoom }
  }

  function updatePinch() {
    const start = pinchStart.current
    const fingers = twoFingers()
    if (!start || !fingers || start.distance === 0) return

    const size = boardRef.current?.getBoundingClientRect().width
    if (!size) return

    /*
     * Zooming is about the middle of the board and panning follows the midpoint
     * of the two fingers. Not a true focal-point zoom, which pins the exact spot
     * between the fingers: that reads better in a photo viewer, and here it
     * fights the clamp that keeps the board covering its frame, since the board
     * must never be draggable off into empty space. Panning with the same two
     * fingers reaches every corner anyway.
     */
    const scale = start.zoom.scale * (fingers.distance / start.distance)
    setZoom(
      clampZoom(
        {
          scale,
          x: start.zoom.x + (fingers.mid.x - start.mid.x),
          y: start.zoom.y + (fingers.mid.y - start.mid.y),
        },
        // The frame's size, not the scaled board's: the clamp is expressed in
        // how far the board may hang off its own unzoomed footprint.
        size / start.zoom.scale,
      ),
    )
  }

  function confirmPlacement() {
    if (!selectedPieceId || !clampedAnchor || !previewCheck?.valid) return

    // Online the move is written to the store and the board comes back from it,
    // so nothing is applied locally — a local board that ran ahead of the store
    // would show a move that might still be refused.
    if (online) {
      online.submit({ pieceId: selectedPieceId, cells: previewCells })
      clearSelection()
      return
    }

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
              <li key={color} style={{ borderColor: palette[color].hex }}>
                <span className="rank">#{rank}</span>
                <span className="dot" style={{ background: palette[color].hex }} />
                <span className="who">
                  {seat.kind === 'computer'
                    ? 'Computer'
                    : online
                      ? color === session.youAre
                        ? 'You'
                        : `@${seat.username ?? 'player'}`
                      : palette[color].name}
                  {seat.kind === 'computer' && <span className="tag">CPU</span>}
                </span>
                <span className="score">{scores[color].score}</span>
                {scores[color].perfectGame && <span className="badge">Perfect game</span>}
              </li>
            )
          })}
        </ul>
        <div className="stack">
          {!online && (
            <button type="button" className="btn primary" onClick={onPlayAgain}>
              Play again
            </button>
          )}
          <button type="button" className={online ? 'btn primary' : 'btn'} onClick={onExit}>
            {online ? 'Back to your games' : 'Back to menu'}
          </button>
        </div>
      </div>
    )
  }

  const hasSelection = selectedPieceId !== null
  // Online you can look at any board but only play your own turn, and only one
  // move at a time — `busy` covers the gap while a turn is being written.
  const canInteract = !isComputerTurn && (!online || (online.yourTurn && !online.busy))
  const canPlace = hasSelection && !!clampedAnchor && !!previewCheck?.valid && canInteract

  const countdown = clock ? secondsLeft(clock, Date.now()) : null
  /**
   * Cancel goes away once the selection clock is spent, which is the case after
   * a piece has been chosen for you. Without this it would look like an escape
   * and behave like a loop: dropping back into a selection phase with no time
   * left simply re-picks the same piece, since the choice is deterministic.
   */
  const selectionSpent = clock !== null && clock.phase === 'place' && clock.selectLeft <= 0

  return (
    <div
      className="screen game"
      // The board sizes itself against everything stacked around it, so the
      // optional score strip has to declare the height it costs.
      style={{ '--extra-chrome': settings.showLiveScores ? '46px' : '0px' } as React.CSSProperties}
    >
      <header className="status-bar">
        <button
          type="button"
          className="icon-btn"
          // Online there is nothing to choose between: leaving goes back to your
          // friends, and a new game is started from one of their cards.
          onClick={() => (onNewGame ? setMenu('open') : onExit())}
          aria-label={onNewGame ? 'Menu' : 'Back to menu'}
        >
          ‹
        </button>
        <span className="dot" style={{ background: palette[currentPlayer.color].hex }} />
        {/* Online, a color name doesn't say whose move it is — there are three
            other people, and which color each holds is not what you remember
            about them. So the status names the person instead. */}
        <span className="turn-label">
          {online ? (
            online.status
          ) : (
            <>
              {palette[currentPlayer.color].name}
              {isComputerTurn ? ' is thinking…' : "'s turn"}
            </>
          )}
        </span>

        {countdown !== null && (
          <span
            className={`clock ${countdown <= 5 ? 'urgent' : ''}`}
            // Announced politely and only as it gets tight — a countdown read
            // out every second would talk over everything else.
            aria-live={countdown <= 5 ? 'polite' : 'off'}
          >
            {/* Read off the clock rather than off the selection, so the word and
                the number always describe the same budget. They disagree for a
                frame otherwise: the move lands, the selection clears, and the
                label flips to "Pick" while the number is still the spent
                placement clock — which renders as a flash of "Pick 0". */}
            <span className="clock-what">{clock?.phase === 'select' ? 'Pick' : 'Place'}</span>
            <span className="clock-secs">{countdown}</span>
          </span>
        )}

        {/* Up here rather than in the row below, which holds Rotate and Flip for
            the piece in hand — two controls both called "rotate", one turning the
            piece and one the whole board, is the confusion worth avoiding. */}
        <button
          type="button"
          className="icon-btn turn-board"
          onClick={() => setNudge((n) => n + 1)}
          aria-label="Turn the board a quarter turn"
          title="Turn the board"
        >
          ⟳
        </button>
      </header>

      {online?.error && (
        <p className="turn-error" role="alert">
          {online.error}
        </p>
      )}

      {settings.showLiveScores && <ScoreStrip session={session} />}

      <div className="board-area">
        <div
          className="board-zoom"
          style={{
            transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
          }}
        >
          <Board
            ref={boardRef}
            board={gameState.board}
            previewCells={previewCells}
            previewColor={hasSelection ? currentPlayer.color : null}
            previewValid={previewCheck?.valid ?? false}
            rotation={viewRotation}
            awaitingFirstMove={awaitingFirstMove}
            onPointerDown={handleBoardDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          />
        </div>
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
          disabled={!hasSelection || !canInteract || selectionSpent}
          onClick={clearSelection}
        >
          Cancel
        </button>
      </div>

      <PieceTray
        pieceIds={handPlayer.remainingPieceIds}
        color={handColor}
        selectedPieceId={selectedPieceId}
        selectedIsOnBoard={clampedAnchor !== null}
        rotation={viewRotation}
        onSelect={selectPiece}
        onDragStart={handleTrayDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      />

      {menu !== 'shut' && onNewGame && (
        <div className="board-menu-backdrop" onClick={() => setMenu('shut')}>
          <div className="board-menu" onClick={(event) => event.stopPropagation()}>
            {menu === 'open' ? (
              <>
                <button type="button" className="btn tall" onClick={onExit}>
                  <span>Back to menu</span>
                  <span className="sub">This game keeps waiting for you</span>
                </button>
                <button type="button" className="btn tall" onClick={() => setMenu('confirm')}>
                  <span>Start a new game</span>
                  <span className="sub">Pick a colour and a clock again</span>
                </button>
              </>
            ) : (
              <>
                {/* Asked plainly, because there is no undo: the board is kept in
                    one place and starting another overwrites it. */}
                <p className="board-menu-ask">
                  Start a new game? This board is replaced, and it can't be got back.
                </p>
                <button type="button" className="btn primary" onClick={onNewGame}>
                  Yes, new game
                </button>
                <button type="button" className="btn quiet" onClick={() => setMenu('open')}>
                  Keep playing this one
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
