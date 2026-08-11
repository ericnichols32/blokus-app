import { useEffect, useState } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { COLORS } from '../game'
import type { Color } from '../game'
import { drawFirstColor } from '../session'
import './SoloSetupScreen.css'

interface SoloSetupScreenProps {
  /** The configured turn budget, so the label matches the clock you'll get. */
  turnSeconds: number
  onStart: (color: Color, timed: boolean, firstColor: Color) => void
  onCancel: () => void
}

/** How long the draw takes: enough ticks to read as a shuffle, not a stutter. */
const SPIN_TICKS = 14
const SPIN_TICK_MS = 85
/** A beat on the result before the board appears, so the answer registers. */
const SETTLE_MS = 900

/**
 * Colour and the clock. Difficulty lives in settings, because it is a standing
 * preference; whether you want a timer is a mood you pick per game, so it stays
 * here where you are already starting one.
 */
export function SoloSetupScreen({ turnSeconds, onStart, onCancel }: SoloSetupScreenProps) {
  // Blue opens in standard Blokus, so it's the friendliest default.
  const [color, setColor] = useState<Color>('blue')
  const [timed, setTimed] = useState(false)
  /** The drawn opener. Non-null means the draw is running or has landed. */
  const [drawn, setDrawn] = useState<Color | null>(null)
  const [shown, setShown] = useState<Color>(COLORS[0])
  const [settled, setSettled] = useState(false)

  // Cycles the swatch and stops on the colour already drawn. The result is
  // decided up front rather than by where the animation happens to stop, so the
  // draw is fair however the timers land.
  useEffect(() => {
    if (drawn === null) return

    let tick = 0
    const id = setInterval(() => {
      tick += 1
      if (tick >= SPIN_TICKS) {
        clearInterval(id)
        setShown(drawn)
        setSettled(true)
      } else {
        setShown(COLORS[tick % COLORS.length])
      }
    }, SPIN_TICK_MS)

    return () => clearInterval(id)
  }, [drawn])

  useEffect(() => {
    if (!settled || drawn === null) return
    const id = setTimeout(() => onStart(color, timed, drawn), SETTLE_MS)
    return () => clearTimeout(id)
  }, [settled, drawn, color, timed, onStart])

  if (drawn !== null) {
    return (
      <div className="screen inner setup draw">
        <p className="draw-caption">Drawing for who goes first…</p>
        <div
          className={`draw-swatch ${settled ? 'settled' : ''}`}
          style={{ background: COLOR_HEX[shown] }}
          aria-hidden="true"
        />
        {/* Only announced once it has landed, so a screen reader isn't read the
            whole shuffle one colour at a time. */}
        <p className="draw-result" aria-live="polite">
          {settled ? `${COLOR_LABEL[shown]} goes first` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="screen inner setup">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1>Play the computer</h1>
      </header>

      <section>
        <h2>Your colour</h2>
        <div className="colour-row" role="radiogroup" aria-label="Your colour">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              className={`colour-chip ${c === color ? 'selected' : ''}`}
              onClick={() => setColor(c)}
            >
              <span className="swatch" style={{ background: COLOR_HEX[c] }} />
              <span>{COLOR_LABEL[c]}</span>
            </button>
          ))}
        </div>
        <p className="note">Who goes first is drawn at random once you start.</p>
      </section>

      <section>
        <h2>Clock</h2>
        <div className="stack" role="radiogroup" aria-label="Clock">
          <button
            type="button"
            role="radio"
            aria-checked={!timed}
            className={`btn tall ${timed ? '' : 'selected'}`}
            onClick={() => setTimed(false)}
          >
            <span>Open game</span>
            <span className="sub">Take as long as you like</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={timed}
            className={`btn tall ${timed ? 'selected' : ''}`}
            onClick={() => setTimed(true)}
          >
            <span>Timed</span>
            <span className="sub">
              {turnSeconds}s to pick a piece, {turnSeconds}s to place it
            </span>
          </button>
        </div>
        {timed && (
          // Says what running out actually does, since a clock that plays for
          // you is not what most people expect a clock to do.
          <p className="note">
            Run out of time and the app picks for you — a legal move, but not a good one.
          </p>
        )}
      </section>

      <button type="button" className="btn primary tall" onClick={() => setDrawn(drawFirstColor())}>
        <span>Start game</span>
      </button>
    </div>
  )
}
