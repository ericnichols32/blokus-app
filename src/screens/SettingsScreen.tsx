import { useState } from 'react'
import { strengthLabel } from '../game'
import { clampTurnSeconds } from '../settings'
import type { Settings } from '../settings'
import { MAX_TURN_SECONDS, MIN_TURN_SECONDS } from '../turnClock'
import './SettingsScreen.css'

/** The lengths worth one tap; anything else goes in the field beside them. */
const TURN_PRESETS = [10, 15, 30, 60]

/**
 * Slider positions, as whole steps. Twenty of them is fine enough that the scale
 * reads as continuous while still landing exactly on the three measured levels —
 * easy at 0, medium at 10, hard at 20.
 */
const STRENGTH_STEPS = 20

/** What the computer does differently as the slider moves right. */
function strengthBlurb(strength: number): string {
  if (strength >= 0.75) return 'Blocks you and plays for reach'
  if (strength >= 0.4) return 'Builds space and takes openings'
  return 'Plays big pieces, not much else'
}

interface SettingsScreenProps {
  settings: Settings
  onChange: (settings: Settings) => void
  onClose: () => void
}

export function SettingsScreen({ settings, onChange, onClose }: SettingsScreenProps) {
  /**
   * What is in the custom field while it is being edited, or null when it should
   * just mirror the saved setting. Without this, clearing the field to retype it
   * would read as an empty value and snap the setting back to the default under
   * the user's fingers.
   */
  const [draft, setDraft] = useState<string | null>(null)

  function commitDraft(text: string) {
    setDraft(text)
    // Only a genuine number moves the setting; a blank or half-typed field is
    // left alone until it becomes one.
    if (text.trim() !== '' && Number.isFinite(Number(text))) {
      onChange({ ...settings, turnSeconds: clampTurnSeconds(text) })
    }
  }

  return (
    <div className="screen inner settings">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Settings</h1>
      </header>

      <section>
        <h2>During a game</h2>
        <button
          type="button"
          className="toggle-row"
          role="switch"
          aria-checked={settings.showLiveScores}
          onClick={() => onChange({ ...settings, showLiveScores: !settings.showLiveScores })}
        >
          <span className="toggle-text">
            <span>Live score counter</span>
            <span className="sub">Shows how many squares each player has left</span>
          </span>
          <span className={`switch ${settings.showLiveScores ? 'on' : ''}`} aria-hidden="true">
            <span className="knob" />
          </span>
        </button>
      </section>

      <section>
        <h2>Timed games</h2>
        <div className="row-label">
          <span>Seconds per turn</span>
          <span className="sub">
            Each turn gives you this long to pick a piece, then this long again to place it
          </span>
        </div>
        <div className="chip-row" role="radiogroup" aria-label="Seconds per turn">
          {TURN_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === settings.turnSeconds}
              className={`chip ${s === settings.turnSeconds ? 'selected' : ''}`}
              onClick={() => {
                setDraft(null)
                onChange({ ...settings, turnSeconds: s })
              }}
            >
              {s}s
            </button>
          ))}
          <input
            type="number"
            className="chip-input"
            aria-label="Custom seconds per turn"
            min={MIN_TURN_SECONDS}
            max={MAX_TURN_SECONDS}
            value={draft ?? String(settings.turnSeconds)}
            onChange={(e) => commitDraft(e.target.value)}
            // Leaving the field shows what was actually saved, so an out-of-range
            // entry visibly settles on the value it was clamped to.
            onBlur={() => setDraft(null)}
          />
        </div>
        <p className="note">
          Between {MIN_TURN_SECONDS} and {MAX_TURN_SECONDS} seconds. Applies to your next game.
        </p>
      </section>

      <section>
        <h2>Computer opponents</h2>
        <div className="row-label">
          <span className="readout">
            <span>Difficulty</span>
            <strong>{strengthLabel(settings.strength)}</strong>
          </span>
          <span className="sub">{strengthBlurb(settings.strength)}</span>
        </div>
        <input
          type="range"
          className="strength-slider"
          min={0}
          max={STRENGTH_STEPS}
          step={1}
          value={Math.round(settings.strength * STRENGTH_STEPS)}
          aria-label="Difficulty"
          aria-valuetext={strengthLabel(settings.strength)}
          onChange={(e) => onChange({ ...settings, strength: Number(e.target.value) / STRENGTH_STEPS })}
        />
        <div className="scale-ends" aria-hidden="true">
          <span>Easy</span>
          <span>Hard</span>
        </div>
        {/* Says so plainly, because the setting has no effect on a game that is
            already under way — the seats took their strength at kick-off. */}
        <p className="note">Applies to your next game.</p>
      </section>
    </div>
  )
}
