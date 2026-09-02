import { ago } from '../ago'
import { usePalette } from '../colors'
import type { GameRecord } from '../history'
import type { ListEntry } from '../online'
import { describePlayers, describeSetup, yourColorIn } from '../onlineActions'
import './PastGamesScreen.css'

interface PastGamesScreenProps {
  games: ListEntry[]
  /** Your own finished games, for the result each one ended in. */
  history: GameRecord[]
  playerId: string
  onOpenGame: (gameId: string) => void
  onClose: () => void
}

/**
 * How a finished game went, from the record this device filed when it saw the
 * result.
 *
 * Read out of the history rather than by replaying the game, because a screen
 * that rebuilt every finished board would get slower with every game anyone
 * ever finished. A game with no record — finished on somebody else's phone and
 * not yet opened here — simply says nothing, which is honest.
 */
function outcomeOf(gameId: string, history: GameRecord[]): string {
  const record = history.find((r) => r.id === gameId)
  if (!record) return ''

  const you = record.players.find((p) => p.color === record.yourColor)
  if (!you) return ''

  const shared = record.players.filter((p) => p.rank === you.rank).length > 1
  if (you.rank === 1) return shared ? 'Drew first' : 'You won'
  return `${you.rank}${['st', 'nd', 'rd'][you.rank - 1] ?? 'th'} of ${record.players.length}`
}

/**
 * Everything that is over.
 *
 * Kept off the friends page on purpose: that page is about what you can do now,
 * and a finished game is only ever worth a look back.
 */
export function PastGamesScreen({
  games,
  history,
  playerId,
  onOpenGame,
  onClose,
}: PastGamesScreenProps) {
  const palette = usePalette()

  return (
    <div className="screen inner past">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Past games</h1>
      </header>

      {games.length === 0 ? (
        <p className="note">Nothing finished yet.</p>
      ) : (
        <ul className="game-list">
          {games.map((entry) => {
            const yours = yourColorIn(entry.game, playerId)
            // Stopped by agreement, or played out and looked up in the history.
            const outcome = entry.game.abandoned
              ? 'Ended early'
              : outcomeOf(entry.game.id, history)
            return (
              <li key={entry.game.id}>
                <button type="button" onClick={() => onOpenGame(entry.game.id)}>
                  <span
                    className="dot"
                    style={{ background: yours ? palette[yours].hex : '#475569' }}
                    aria-hidden="true"
                  />
                  <span className="game-main">
                    <span className="game-who">{describePlayers(entry.game, playerId)}</span>
                    <span className="game-detail">
                      {[outcome, describeSetup(entry.game, playerId)].filter(Boolean).join(' · ')}
                    </span>
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
