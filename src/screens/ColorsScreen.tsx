import { usePalette } from '../colors'
import { COLORS } from '../game'
import type { Color } from '../game'
import { colorName, DEFAULT_PALETTE_ID, hasOverrides, PALETTES, resolvePalette } from '../palette'
import type { Settings } from '../settings'
import './ColorsScreen.css'

interface ColorsScreenProps {
  settings: Settings
  onChange: (settings: Settings) => void
  onClose: () => void
  /**
   * The seat being edited by "just mine" — whichever colour is about to be
   * played. Without one there is no "yours" to change, so that half is hidden.
   */
  yourColor?: Color
}

/**
 * Repainting the board: a whole set of four, or just your own seat.
 *
 * Nothing here touches a game. The seats keep their real names underneath, so
 * this can be changed mid-game, and two people in the same online game can be
 * looking at completely different colours without disagreeing about anything.
 */
export function ColorsScreen({ settings, onChange, onClose, yourColor }: ColorsScreenProps) {
  const palette = usePalette()
  const overridden = hasOverrides(settings.colorOverrides)

  function choosePalette(paletteId: string) {
    onChange({ ...settings, paletteId })
  }

  function paintSeat(color: Color, hex: string) {
    onChange({ ...settings, colorOverrides: { ...settings.colorOverrides, [color]: hex } })
  }

  function clearOverrides() {
    onChange({ ...settings, colorOverrides: {} })
  }

  return (
    <div className="screen inner colors">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Colors</h1>
      </header>

      {yourColor && (
        <section>
          <h2>Just yours</h2>
          <label className="own-color">
            <span
              className="own-swatch"
              style={{ background: palette[yourColor].hex }}
              aria-hidden="true"
            />
            <span className="own-text">
              <strong>{palette[yourColor].name}</strong>
              <span className="sub">Tap to pick any color you like</span>
            </span>
            {/* The platform's own colour picker — a real wheel on a phone, and
                far better than anything hand-drawn here would be. */}
            <input
              type="color"
              value={palette[yourColor].hex}
              onChange={(e) => paintSeat(yourColor, e.target.value)}
              aria-label={`Your color, currently ${palette[yourColor].name}`}
            />
          </label>
          <p className="note">
            Only changes how it looks to you. Your friends see whatever they picked.
          </p>
        </section>
      )}

      <section>
        <h2>All four</h2>
        <div className="stack" role="radiogroup" aria-label="Color palette">
          {PALETTES.map((option) => {
            const selected = option.id === settings.paletteId
            // Shown as the palette itself, not as it would look after your own
            // seat is painted over it — otherwise every row would look the same.
            const swatches = resolvePalette(option.id)
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`palette-row ${selected ? 'selected' : ''}`}
                onClick={() => choosePalette(option.id)}
              >
                <span className="palette-swatches" aria-hidden="true">
                  {COLORS.map((c) => (
                    <span key={c} style={{ background: swatches[c].hex }} />
                  ))}
                </span>
                <span className="palette-text">
                  <span className="palette-name">{option.name}</span>
                  {option.note && <span className="sub">{option.note}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {overridden && (
        <section>
          <h2>Painted by hand</h2>
          <ul className="override-list">
            {COLORS.filter((c) => settings.colorOverrides[c]).map((c) => (
              <li key={c}>
                <span className="dot" style={{ background: palette[c].hex }} />
                <span>{colorName(palette[c].hex)}</span>
              </li>
            ))}
          </ul>
          <p className="note">
            {/* A hand-painted seat sits on top of every palette, so switching
                palettes below and seeing nothing change is otherwise baffling. */}
            These stay put whichever palette you pick, which is why changing the set above may not
            change all four.
          </p>
          <button type="button" className="btn" onClick={clearOverrides}>
            Undo my own colors
          </button>
        </section>
      )}

      {settings.paletteId !== DEFAULT_PALETTE_ID && (
        <button type="button" className="btn quiet" onClick={() => choosePalette(DEFAULT_PALETTE_ID)}>
          Back to the classic colors
        </button>
      )}
    </div>
  )
}
