import { describeSession, isResumable } from '../session'
import type { Session } from '../session'
import './HomeScreen.css'

interface HomeScreenProps {
  saved: Session | null
  onResume: () => void
  onPlaySolo: () => void
  onPassAndPlay: () => void
}

export function HomeScreen({ saved, onResume, onPlaySolo, onPassAndPlay }: HomeScreenProps) {
  const resumable = saved !== null && isResumable(saved)

  return (
    <div className="screen home">
      <div className="home-header">
        <div className="logo" aria-hidden="true">
          <span className="logo-cell c1" />
          <span className="logo-cell c2" />
          <span className="logo-cell c3" />
          <span className="logo-cell c4" />
        </div>
        <h1>Blokus</h1>
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

        <button type="button" className="btn tall" disabled>
          <span>Stats</span>
          <span className="sub">Not built yet</span>
        </button>
      </div>

      {resumable && (
        <p className="hint">Starting a new game replaces the one in progress.</p>
      )}
    </div>
  )
}
