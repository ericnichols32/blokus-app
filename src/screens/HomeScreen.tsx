import { describeSession, isResumable } from '../session'
import type { Session } from '../session'
import type { Account } from '../account'
import './HomeScreen.css'

interface HomeScreenProps {
  saved: Session | null
  /** Who is signed in, or null if nobody has claimed a name on this device. */
  account: Account | null
  /** Finished games banked so far, waiting for the stats screen. */
  gamesRecorded: number
  onResume: () => void
  onPlaySolo: () => void
  onPassAndPlay: () => void
  onSettings: () => void
  onAccount: () => void
}

export function HomeScreen({
  saved,
  account,
  gamesRecorded,
  onResume,
  onPlaySolo,
  onPassAndPlay,
  onSettings,
  onAccount,
}: HomeScreenProps) {
  const resumable = saved !== null && isResumable(saved)

  return (
    <div className="screen home">
      {/* Opposite the gear, so the two things you set once sit in the corners
          and the buttons that start a game keep the middle to themselves. */}
      <button type="button" className="account-chip" onClick={onAccount}>
        {account ? `@${account.username}` : 'Sign in'}
      </button>

      <div className="home-header">
        <div className="logo" aria-hidden="true">
          <span className="logo-cell c1" />
          <span className="logo-cell c2" />
          <span className="logo-cell c3" />
          <span className="logo-cell c4" />
        </div>
        <h1>Blokus</h1>
        <button
          type="button"
          className="icon-btn settings-btn"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      <div className="stack">
        {resumable && (
          <button type="button" className="btn primary tall" onClick={onResume}>
            <span>Resume game</span>
            <span className="sub">{describeSession(saved)}</span>
          </button>
        )}

        <button
          type="button"
          className={resumable ? 'btn tall' : 'btn primary tall'}
          onClick={onPlaySolo}
        >
          <span>Play the computer</span>
          <span className="sub">You against three opponents</span>
        </button>

        <button type="button" className="btn tall" onClick={onPassAndPlay}>
          <span>Pass and play</span>
          <span className="sub">Four players, one device</span>
        </button>

        <button type="button" className="btn tall" disabled>
          <span>Play a friend online</span>
          <span className="sub">Not built yet</span>
        </button>

        {/* Still unbuilt, but games are being banked for it now — so say what
            is actually there rather than implying nothing is happening. */}
        <button type="button" className="btn tall" disabled>
          <span>Stats</span>
          <span className="sub">
            {gamesRecorded === 0
              ? 'Not built yet — finished games will be saved'
              : `Not built yet — ${gamesRecorded} ${
                  gamesRecorded === 1 ? 'game' : 'games'
                } saved so far`}
          </span>
        </button>
      </div>

      {resumable && (
        <p className="hint">Starting a new game replaces the one in progress.</p>
      )}
    </div>
  )
}
