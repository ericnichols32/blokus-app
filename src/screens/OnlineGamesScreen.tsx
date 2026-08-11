import { useCallback, useEffect, useState } from 'react'
import { COLOR_HEX } from '../colors'
import { isOnline } from '../backend'
import { loadGames, describePlayers, yourColorIn } from '../onlineActions'
import { OnlineError } from '../onlineActions'
import type { ListEntry } from '../online'
import type { Account } from '../account'
import './OnlineGamesScreen.css'

interface OnlineGamesScreenProps {
  account: Account | null
  onOpenGame: (gameId: string) => void
  onNewGame: () => void
  onSignIn: () => void
  onClose: () => void
}

/** How long ago, in the roughest terms that are still useful. */
function ago(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.round((now - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

export function OnlineGamesScreen({
  account,
  onOpenGame,
  onNewGame,
  onSignIn,
  onClose,
}: OnlineGamesScreenProps) {
  const [games, setGames] = useState<ListEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const playerId = account?.playerId

  const refresh = useCallback(async () => {
    if (!playerId) return
    setLoading(true)
    setError(null)
    try {
      setGames(await loadGames(playerId))
    } catch (e) {
      setError(e instanceof OnlineError ? e.message : 'Something went wrong loading your games.')
    } finally {
      setLoading(false)
    }
  }, [playerId])

  // On open, and again whenever the app comes back to the foreground — the whole
  // point of an async game is that somebody moved while you were elsewhere, and
  // a list that only loaded once would quietly go stale in your hand.
  useEffect(() => {
    void refresh()

    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  if (!account) {
    return (
      <div className="screen inner online">
        <header className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
            ‹
          </button>
          <h1>Play a friend</h1>
        </header>
        <section className="empty">
          <p className="empty-title">Pick a name first</p>
          <p className="empty-sub">
            Playing a friend means they need something to invite — and you need something for their
            games to show up under. No password, just a name.
          </p>
          <button type="button" className="btn primary tall" onClick={onSignIn}>
            <span>Pick a name</span>
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="screen inner online">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Your games</h1>
        <button
          type="button"
          className="icon-btn refresh"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Check for moves"
          title="Check for moves"
        >
          ⟳
        </button>
      </header>

      {!isOnline() && (
        /* Without keys the store is this browser alone, so a friend would never
           see the invite. Better to say so than to let someone wait for a turn
           that cannot arrive. */
        <p className="note warn">
          This copy of the app isn't connected to a server, so games stay on this device and friends
          won't see them.
        </p>
      )}

      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn primary tall" onClick={onNewGame}>
        <span>Start a new game</span>
        <span className="sub">Against one, two or three friends</span>
      </button>

      {games === null ? (
        <p className="note">{loading ? 'Loading your games…' : ''}</p>
      ) : games.length === 0 ? (
        <section className="empty">
          <p className="empty-title">No games yet</p>
          <p className="empty-sub">
            Start one above. Games wait for you — take your turn whenever you like and your friends
            will see it next time they look.
          </p>
        </section>
      ) : (
        <ul className="game-list">
          {games.map((entry) => {
            const yours = yourColorIn(entry.game, account.playerId)
            return (
              <li key={entry.game.id}>
                <button type="button" onClick={() => onOpenGame(entry.game.id)}>
                  <span
                    className="dot"
                    style={{ background: yours ? COLOR_HEX[yours] : '#475569' }}
                    aria-hidden="true"
                  />
                  <span className="game-main">
                    <span className={`game-status ${entry.yourTurn ? 'now' : ''}`}>
                      {entry.status}
                    </span>
                    <span className="game-who">{describePlayers(entry.game, account.playerId)}</span>
                  </span>
                  <span className="game-when">{ago(entry.game.updatedAt)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
