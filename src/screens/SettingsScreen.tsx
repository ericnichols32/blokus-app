import { DIFFICULTY_LABEL } from '../game'
import type { Difficulty } from '../game'
import type { Settings } from '../settings'
import './SettingsScreen.css'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  easy: 'Plays big pieces, not much else',
  medium: 'Builds space and takes openings',
  hard: 'Blocks you and plays for reach',
}

interface SettingsScreenProps {
  settings: Settings
  onChange: (settings: Settings) => void
  onClose: () => void
}

export function SettingsScreen({ settings, onChange, onClose }: SettingsScreenProps) {
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
        <h2>Computer opponents</h2>
        <div className="stack" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === settings.difficulty}
              className={`btn tall ${d === settings.difficulty ? 'selected' : ''}`}
              onClick={() => onChange({ ...settings, difficulty: d })}
            >
              <span>{DIFFICULTY_LABEL[d]}</span>
              <span className="sub">{DIFFICULTY_BLURB[d]}</span>
            </button>
          ))}
        </div>
        {/* Says so plainly, because the setting has no effect on a game that is
            already under way — the seats took their difficulty at kick-off. */}
        <p className="note">Applies to your next game.</p>
      </section>
    </div>
  )
}
