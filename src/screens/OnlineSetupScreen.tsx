import { useState } from 'react'
import { usePalette } from '../colors'
import { COLORS } from '../game'
import { fillsFor } from '../online'
import type { SeatFill } from '../online'
import { OnlineError, startGame } from '../onlineActions'
import type { Settings } from '../settings'
import type { Account } from '../account'
import './OnlineSetupScreen.css'

interface OnlineSetupScreenProps {
  account: Account
  settings: Settings
  /**
   * Somebody's name, already typed in — a game started from their card on the
   * friends page has already said who it is against.
   */
  initialFriend?: string
  /** No seat to pass: colours are dealt when the game is made. */
  onEditColors: () => void
  onStarted: (gameId: string) => void
  onCancel: () => void
}

/** One, two or three friends — four people is the most a board seats. */
const FRIEND_COUNTS = [1, 2, 3]

const FILL_LABEL: Record<SeatFill, string> = {
  double: 'Two colors each',
  computer: 'Computer takes the rest',
}

const FILL_BLURB: Record<SeatFill, string> = {
  double: 'You play two colors and so do they, on opposite corners — the proper two-player game',
  computer: 'You each play one color and the computer fills the empty seats',
}

export function OnlineSetupScreen({
  account,
  settings,
  initialFriend,
  onEditColors,
  onStarted,
  onCancel,
}: OnlineSetupScreenProps) {
  const palette = usePalette()
  const [friendCount, setFriendCount] = useState(1)
  const [names, setNames] = useState<string[]>([initialFriend ?? '', '', ''])
  const [fill, setFill] = useState<SeatFill>('double')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fills = fillsFor(friendCount + 1)
  // Three people can only be computer-filled, so a 'double' left over from a
  // two-player choice has to give way rather than be silently sent to seating.
  const effectiveFill = fills.includes(fill) ? fill : fills[0]

  function changeCount(count: number) {
    setFriendCount(count)
    setError(null)
  }

  function setName(index: number, value: string) {
    setNames((current) => current.map((n, i) => (i === index ? value : n)))
    setError(null)
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const wanted = names.slice(0, friendCount)
      if (wanted.some((n) => n.trim() === '')) {
        throw new OnlineError(
          friendCount === 1 ? "Type your friend's name." : 'Type a name for each friend.',
        )
      }
      const game = await startGame(account, wanted, effectiveFill, settings.strength)
      onStarted(game.id)
    } catch (e) {
      setError(e instanceof OnlineError ? e.message : "Couldn't start that game. Try again.")
      setBusy(false)
    }
  }

  return (
    <div className="screen inner setup online-setup">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Back">
          ‹
        </button>
        <h1>New game</h1>
      </header>

      <section>
        <h2>How many friends</h2>
        <div className="chip-row" role="radiogroup" aria-label="How many friends">
          {FRIEND_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              role="radio"
              aria-checked={count === friendCount}
              className={`chip ${count === friendCount ? 'selected' : ''}`}
              onClick={() => changeCount(count)}
            >
              {count}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{friendCount === 1 ? 'Their name' : 'Their names'}</h2>
        <div className="stack">
          {Array.from({ length: friendCount }, (_, i) => (
            <label key={i} className="name-row">
              <span className="at">@</span>
              <input
                type="text"
                value={names[i]}
                onChange={(e) => setName(i, e.target.value)}
                placeholder="their name"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Friend ${i + 1}'s name`}
              />
            </label>
          ))}
        </div>
        <p className="note">
          The name they picked when they opened the app. They have to have picked one already.
        </p>
      </section>

      <section>
        <h2>The other two seats</h2>
        {fills.length === 1 ? (
          <p className="note">
            {/* Not a choice to offer: with three people, two colors each would need
                six colors. Said plainly rather than shown as one dead option. */}
            With {friendCount} friends there's one seat spare, and the computer takes it. Two colors
            each only works when there are two of you.
          </p>
        ) : (
          <div className="stack" role="radiogroup" aria-label="The other two seats">
            {fills.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === effectiveFill}
                className={`btn tall ${option === effectiveFill ? 'selected' : ''}`}
                onClick={() => setFill(option)}
              >
                <span>{FILL_LABEL[option]}</span>
                <span className="sub">{FILL_BLURB[option]}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Colors</h2>
          <button
            type="button"
            className="icon-btn edit-colors"
            onClick={onEditColors}
            aria-label="Edit colors"
            title="Edit colors"
          >
            ✎
          </button>
        </div>
        <div className="color-preview" aria-hidden="true">
          {COLORS.map((c) => (
            <span key={c} style={{ background: palette[c].hex }} />
          ))}
        </div>
        <p className="note">
          Seats are handed out in board order, and who opens is drawn at random once the game
          starts — so creating it isn't an advantage.
        </p>
      </section>

      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn primary tall"
        disabled={busy}
        onClick={() => void start()}
      >
        <span>{busy ? 'Starting…' : 'Start game'}</span>
      </button>
    </div>
  )
}
