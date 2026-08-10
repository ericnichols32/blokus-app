import { useState } from 'react'
import { COLOR_HEX, COLOR_LABEL } from '../colors'
import { COLORS, DIFFICULTY_LABEL } from '../game'
import type { Color, Difficulty } from '../game'
import './SoloSetupScreen.css'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'Plays big pieces, not much else',
  medium: 'Builds space and takes openings',
  hard: 'Blocks you and plays for reach',
}

interface SoloSetupScreenProps {
  onStart: (color: Color, difficulty: Difficulty) => void
  onCancel: () => void
}

export function SoloSetupScreen({ onStart, onCancel }: SoloSetupScreenProps) {
  // Blue opens in standard Blokus, so it's the friendliest default.
  const [color, setColor] = useState<Color>('blue')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')

  return (
    <div className="screen setup">
      <header className="setup-header">
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
        <h2>Difficulty</h2>
        <div className="stack" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === difficulty}
              className={`btn tall ${d === difficulty ? 'selected' : ''}`}
              onClick={() => setDifficulty(d)}
            >
              <span>{DIFFICULTY_LABEL[d]}</span>
              <span className="sub">{DIFFICULTY_BLURB[d]}</span>
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="btn primary tall" onClick={() => onStart(color, difficulty)}>
        <span>Start game</span>
      </button>
    </div>
  )
}
