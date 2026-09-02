import { useState } from 'react'
import { ago } from '../ago'
import { Avatar } from '../components/Avatar'
import { isOnline } from '../backend'
import type { FriendCard, FriendRecord } from '../friends'
import { describePlayers, describeSetup } from '../onlineActions'
import { OnlineError } from '../onlineActions'
import { rematchAwaits } from '../online'
import type { ListEntry } from '../online'
import type { FriendsData } from '../useFriends'
import type { Account } from '../account'
import './FriendsScreen.css'

interface FriendsScreenProps {
  account: Account | null
  friends: FriendsData
  onOpenGame: (gameId: string) => void
  /** Start a new game against one person, with them already filled in. */
  onNewGameWith: (username: string) => void
  onNewGroupGame: () => void
  onPastGames: () => void
  onSignIn: () => void
  onClose: () => void
}

/**
 * Everyone you play, as a grid of faces.
 *
 * The page answers one question per card — can I play them right now, and how
 * do we stand — which is why the card carries a face, a name, what to do next
 * and the lifetime record, and nothing else. Anything longer belongs on the
 * stats screen.
 */
export function FriendsScreen({
  account,
  friends,
  onOpenGame,
  onNewGameWith,
  onNewGroupGame,
  onPastGames,
  onSignIn,
  onClose,
}: FriendsScreenProps) {
  const [managing, setManaging] = useState(false)
  /** The friend whose several games are being picked between. */
  const [choosing, setChoosing] = useState<FriendCard | null>(null)

  if (!account) {
    return (
      <div className="screen inner friends">
        <header className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
            ‹
          </button>
          <h1>Friends</h1>
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

  const { view, loaded, error } = friends

  function tapped(card: FriendCard) {
    if (card.games.length === 0) onNewGameWith(card.username)
    else if (card.games.length === 1) onOpenGame(card.games[0].game.id)
    // More than one game with the same person is rare enough that asking which
    // beats guessing — and guessing wrong opens the wrong board.
    else setChoosing(card)
  }

  return (
    <div className="screen inner friends">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Friends</h1>
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

      <section className="group-section">
        {view.groupGames.map((entry) => (
          <button
            key={entry.game.id}
            type="button"
            className={`group-tile ${entry.yourTurn || rematchAwaits(entry.game, account.playerId) ? 'now' : ''}`}
            onClick={() => onOpenGame(entry.game.id)}
          >
            <span className="group-main">
              <span className="group-who">{describePlayers(entry.game, account.playerId)}</span>
              <span className="group-detail">
                {rematchAwaits(entry.game, account.playerId) ? 'Wants a rematch' : entry.status}
              </span>
            </span>
            <span className="group-go" aria-hidden="true">
              ›
            </span>
          </button>
        ))}

        <button type="button" className="group-tile new" onClick={onNewGroupGame}>
          <span className="group-main">
            <span className="group-who">Group game</span>
            <span className="group-detail">Play two or three friends at once</span>
          </span>
          <span className="group-go" aria-hidden="true">
            +
          </span>
        </button>
      </section>

      <div className="friend-grid">
        {view.friends.map((card) => (
          <FriendTile
            key={card.playerId}
            card={card}
            playerId={account.playerId}
            onClick={() => tapped(card)}
          />
        ))}

        <button type="button" className="friend-tile add" onClick={() => setManaging(true)}>
          <span className="add-plus" aria-hidden="true">
            +
          </span>
          <span className="friend-name">Add a friend</span>
          <span className="friend-record">By their name</span>
        </button>
      </div>

      {view.friends.length === 0 && loaded && (
        <p className="note">
          Add a friend by the name they picked, and you can start a game with them from here.
          Anyone who starts a game with you turns up on this page by themselves.
        </p>
      )}

      {view.finished.length > 0 && (
        <button type="button" className="btn quiet past-games" onClick={onPastGames}>
          Past games ({view.finished.length})
        </button>
      )}

      {managing && (
        <ManageFriends friends={friends} onClose={() => setManaging(false)} />
      )}

      {choosing && (
        <ChooseGame
          card={choosing}
          playerId={account.playerId}
          onPick={(gameId) => {
            setChoosing(null)
            onOpenGame(gameId)
          }}
          onClose={() => setChoosing(null)}
        />
      )}
    </div>
  )
}

/** What the card says to do next, in the fewest words that are still true. */
function actionFor(card: FriendCard, playerId: string): { label: string; tone: string } {
  const next = card.games[0]
  if (!next) return { label: 'Play', tone: 'idle' }
  // Ahead of whose turn it is: a question addressed to you outranks a move, and
  // it is the only thing on this page that will sit unanswered otherwise.
  if (rematchAwaits(next.game, playerId)) return { label: 'Wants a rematch', tone: 'now' }
  if (next.yourTurn) return { label: 'Your turn', tone: 'now' }
  // Only ever seen in the gap before whoever moved last writes the computer's
  // replies, but "their turn" would be a lie about a seat nobody is holding.
  if (next.status.startsWith('Computer')) return { label: 'Thinking…', tone: 'waiting' }
  return { label: 'Their turn', tone: 'waiting' }
}

/**
 * The lifetime record, spelled out rather than written as 4–2.
 *
 * Which number is whose is not obvious in a score line that small, and getting
 * it backwards is the one way this stat can actively mislead.
 */
function recordLine(record: FriendRecord | null): string {
  if (!record) return 'No games yet'
  const parts = [`Won ${record.wins}`, `Lost ${record.losses}`]
  if (record.draws > 0) parts.push(`Level ${record.draws}`)
  return parts.join(' · ')
}

function FriendTile({
  card,
  playerId,
  onClick,
}: {
  card: FriendCard
  playerId: string
  onClick: () => void
}) {
  const action = actionFor(card, playerId)

  return (
    <button type="button" className={`friend-tile ${action.tone}`} onClick={onClick}>
      <Avatar username={card.username} photo={card.photo} size={84} />
      <span className="friend-name">@{card.username}</span>
      <span className={`friend-action ${action.tone}`}>
        {action.label}
        {/* Appended rather than put in place of the record: the record is the
            thing the card promises, and two games at once is the rarer case. */}
        {card.games.length > 1 ? ` · ${card.games.length} games` : ''}
      </span>
      <span className="friend-record">{recordLine(card.record)}</span>
    </button>
  )
}

interface ChooseGameProps {
  card: FriendCard
  playerId: string
  onPick: (gameId: string) => void
  onClose: () => void
}

function ChooseGame({ card, playerId, onPick, onClose }: ChooseGameProps) {
  return (
    <Sheet title={`Games with @${card.username}`} onClose={onClose}>
      <ul className="game-list">
        {card.games.map((entry: ListEntry) => (
          <li key={entry.game.id}>
            <button type="button" onClick={() => onPick(entry.game.id)}>
              <span className="game-main">
                <span className="game-who">{entry.status}</span>
                {/* Who is in them is on the heading above; what tells these two
                    apart is when each one last moved. */}
                <span className="game-detail">
                  {[ago(entry.game.updatedAt), describeSetup(entry.game, playerId)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

interface ManageFriendsProps {
  friends: FriendsData
  onClose: () => void
}

/**
 * Adding somebody, and taking them off again.
 *
 * Removal lives here rather than on the card because it is the rarer thing by
 * far, and a delete control on every tile is a delete control under everybody's
 * thumb on a page whose whole job is being tapped.
 */
function ManageFriends({ friends, onClose }: ManageFriendsProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof OnlineError ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="Your friends" onClose={onClose}>
      <form
        className="add-friend"
        onSubmit={(event) => {
          event.preventDefault()
          if (busy || !name.trim()) return
          void run(async () => {
            await friends.addFriend(name)
            setName('')
          })
        }}
      >
        <div className="name-field">
          <span className="at" aria-hidden="true">
            @
          </span>
          <input
            className="name-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="their name"
            // An iPhone would otherwise capitalise and autocorrect the name into
            // something nobody owns.
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="Their name"
            autoFocus
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}

      {friends.view.friends.length > 0 && (
        <ul className="manage-list">
          {friends.view.friends.map((card) => (
            <li key={card.playerId}>
              <Avatar username={card.username} photo={card.photo} size={32} />
              <span className="manage-name">@{card.username}</span>
              <button
                type="button"
                className="btn quiet"
                disabled={busy}
                onClick={() => void run(() => friends.removeFriend(card.playerId))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

interface SheetProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

function Sheet({ title, onClose, children }: SheetProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      {/* The panel swallows taps so that only the backdrop closes it — otherwise
          typing in the field would dismiss the thing being typed into. */}
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
