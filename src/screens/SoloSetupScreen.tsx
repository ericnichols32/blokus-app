import { useState } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { COLORS } from '../game'
import type { Color } from '../game'
import './SoloSetupScreen.css'

interface SoloSetupScreenProps {
  onStart: (color: Color) => void
  onCancel: () => void
}

/**
 * Colour is the only choice here. Difficulty lives in settings and defaults to
 * hard, so starting a game is one decision rather than two.
 */
export function SoloSetupScreen({ onStart, onCancel }: SoloSetupScreenProps) {
  // Blue opens in standard Blokus, so it's the friendliest default.
  const [color, setColor] = useState<Color>('blue')

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

      <button type="button" className="btn primary tall" onClick={() => onStart(color)}>
        <span>Start game</span>
      </button>
    </div>
  )
}
