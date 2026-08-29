import { useCallback, useEffect, useState } from 'react'
import { usePalette } from '../colors'
import { isOnline } from '../backend'
import { loadGames, describePlayers, describeSetup, yourColorIn } from '../onlineActions'
import { opponentsOf } from '../online'
import { OnlineError } from '../onlineActions'
import type { GroupedGames, ListEntry } from '../online'
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
  const [games, setGames] = useState<GroupedGames | null>(null)
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
          <h1>Online games</h1>
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
        // Nothing at all before the first load answers, rather than an empty
        // paragraph holding a gap open where the list is about to appear.
        loading ? <p className="note">Loading your games…</p> : null
      ) : games.yours.length + games.theirs.length + games.finished.length === 0 ? (
        <section className="empty">
          <p className="empty-title">No games yet</p>
          <p className="empty-sub">
            Start one above. Games wait for you — take your turn whenever you like and your friends
            will see it next time they look.
          </p>
        </section>
      ) : (
        <>
          {/* Shown even when empty, unlike the piles below it. "Is anything
              waiting on me" is the question this screen exists to answer, and a
              missing heading answers it only by implication. */}
          <Pile
            heading="Your turn"
            accent
            entries={games.yours}
            playerId={account.playerId}
            onOpenGame={onOpenGame}
            emptyNote="Nothing waiting on you."
          />
          {/* Only this pile repeats a status on each row, because "their turn"
              doesn't say whose — and with three friends in a game, that is the
              thing you actually want to know. */}
          <Pile
            heading="Their turn"
            showStatus
            entries={games.theirs}
            playerId={account.playerId}
            onOpenGame={onOpenGame}
          />
          <Pile
            heading="Finished"
            entries={games.finished}
            playerId={account.playerId}
            onOpenGame={onOpenGame}
          />
        </>
      )}
    </div>
  )
}

interface PileProps {
  heading: string
  entries: ListEntry[]
  playerId: string
  onOpenGame: (gameId: string) => void
  /** Given only for a pile worth showing empty; the rest just disappear. */
  emptyNote?: string
  /** Carries the "this needs you" green, now that no row does. */
  accent?: boolean
  /** Whether each row repeats its status. Only useful where it adds a name. */
  showStatus?: boolean
}

function Pile({ heading, entries, playerId, onOpenGame, emptyNote, accent, showStatus }: PileProps) {
  const palette = usePalette()
  if (entries.length === 0 && !emptyNote) return null

  return (
    <section>
      <h2 className={accent ? 'now' : ''}>{heading}</h2>
      {entries.length === 0 ? (
        <p className="note">{emptyNote}</p>
      ) : (
        <ul className="game-list">
          {entries.map((entry) => {
            const yours = yourColorIn(entry.game, playerId)
            return (
              <li key={entry.game.id}>
                <button type="button" onClick={() => onOpenGame(entry.game.id)}>
                  <span
                    className="dot"
                    style={{ background: yours ? palette[yours].hex : '#475569' }}
                    aria-hidden="true"
                  />
                  <span className="game-main">
                    {/* The people are the headline now that the heading above
                        carries whose turn it is. */}
                    <span className="game-who">{describePlayers(entry.game, playerId)}</span>
                    <span className="game-detail">
                      {[
                        // Naming who it waits on only helps when there is more
                        // than one candidate. Against a single friend the row
                        // above already names them, and repeating it reads as a
                        // stutter.
                        showStatus && opponentsOf(entry.game, playerId).length > 1
                          ? entry.status
                          : '',
                        describeSetup(entry.game, playerId),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="game-when">{ago(entry.game.updatedAt)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
