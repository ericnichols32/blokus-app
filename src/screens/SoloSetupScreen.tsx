import { useState } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { COLORS } from '../game'
import type { Color } from '../game'
import './SoloSetupScreen.css'

interface SoloSetupScreenProps {
  onStart: (color: Color, timed: boolean) => void
  onCancel: () => void
}

/**
 * Colour and the clock. Difficulty lives in settings, because it is a standing
 * preference; whether you want a timer is a mood you pick per game, so it stays
 * here where you are already starting one.
 */
export function SoloSetupScreen({ onStart, onCancel }: SoloSetupScreenProps) {
  // Blue opens in standard Blokus, so it's the friendliest default.
  const [color, setColor] = useState<Color>('blue')
  const [timed, setTimed] = useState(false)

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
        <p className="note">
          {color === 'blue' ? 'Blue moves first.' : `Blue moves first, then play reaches ${COLOR_LABEL[color].toLowerCase()}.`}
        </p>
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
            <span className="sub">15s to pick a piece, 15s to place it</span>
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

      <button type="button" className="btn primary tall" onClick={() => onStart(color, timed)}>
        <span>Start game</span>
      </button>
    </div>
  )
}
