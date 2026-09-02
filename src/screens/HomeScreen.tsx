import { Avatar } from '../components/Avatar'
import { describeRound, isResumable } from '../session'
import type { Session } from '../session'
import type { Account } from '../account'
import './HomeScreen.css'

interface HomeScreenProps {
  saved: Session | null
  /** Who is signed in, or null if nobody has claimed a name on this device. */
  account: Account | null
  /** Your own photo, for the chip at the bottom. */
  photo?: string
  /** Online games waiting on your move. */
  waitingOnYou: number
  /** Online games still going, whoever they are waiting on. */
  liveGames: number
  onPlaySolo: () => void
  onPlayFriends: () => void
  onStats: () => void
  onSettings: () => void
  onAccount: () => void
}

/**
 * Two things to do, and everything else out of the way.
 *
 * The screen used to list every game in progress, every destination and a count
 * of finished games, which meant reading it before playing anything. There are
 * really only two intentions — play the computer, or play a person — so those
 * get the whole middle of the screen, and each one carries the single line that
 * says what tapping it will do right now.
 *
 * Your name, the stats and the settings sit in a quiet row at the bottom. They
 * are all things you visit occasionally and never twice in a row.
 */
export function HomeScreen({
  saved,
  account,
  photo,
  waitingOnYou,
  liveGames,
  onPlaySolo,
  onPlayFriends,
  onStats,
  onSettings,
  onAccount,
}: HomeScreenProps) {
  const resumable = saved !== null && saved.mode !== 'online' && isResumable(saved)

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

      <div className="home-choices">
        <button type="button" className="home-card" onClick={onPlaySolo}>
          <span className="home-card-title">Play solo</span>
          <span className={`home-card-sub ${resumable ? 'live' : ''}`}>
            {/* The round rather than a count of pieces: four players' turns
                are one round, and "10 pieces played" tells you nothing about
                how far in you are. */}
            {resumable && saved
              ? `Game in progress · ${describeRound(saved.state)}`
              : 'You against three computers'}
          </span>
        </button>

        <button type="button" className="home-card" onClick={onPlayFriends}>
          <span className="home-card-title">Play with friends</span>
          <span className={`home-card-sub ${waitingOnYou > 0 ? 'now' : ''}`}>
            {!account
              ? 'Pick a name and play the people you know'
              : waitingOnYou > 0
                ? `${waitingOnYou} waiting on you`
                : liveGames > 0
                  ? `${liveGames} ${liveGames === 1 ? 'game' : 'games'} going`
                  : 'Start a game with someone'}
          </span>
        </button>
      </div>

      <div className="home-footer">
        <button type="button" className="home-chip" onClick={onAccount}>
          {account ? (
            <>
              <Avatar username={account.username} photo={photo} size={24} />
              <span className="chip-name">@{account.username}</span>
            </>
          ) : (
            <span className="chip-name">Sign in</span>
          )}
        </button>

        <button type="button" className="home-chip" onClick={onStats}>
          <span className="chip-name">Stats</span>
        </button>

        <button
          type="button"
          className="home-chip"
          onClick={onSettings}
          aria-label="Settings"
          title="Settings"
        >
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </div>
  )
}
