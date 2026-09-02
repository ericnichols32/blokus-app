import { usePalette } from '../colors'
import { PieceIcon } from '../components/PieceIcon'
import { PIECE_BY_ID } from '../game'
import { computeFriends, MIN_GAMES_FOR_FAVORITES } from '../stats'
import type { FriendMeeting, FriendStats } from '../stats'
import type { GameRecord } from '../history'
import './FriendStatsScreen.css'

interface FriendStatsScreenProps {
  history: GameRecord[]
  /** Whose record this is measured from. */
  playerId: string
  friendId: string
  onClose: () => void
}

const OUTCOME_LABEL: Record<FriendMeeting['outcome'], string> = {
  win: 'Beat them',
  draw: 'Level',
  loss: 'They beat you',
}

function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * One person's page: how the two of you have gone, game by game.
 *
 * Everything here is head to head — finishing above them, not winning the game.
 * In a four-player game those are different questions, and this is the one you
 * argue about afterwards.
 */
export function FriendStatsScreen({
  history,
  playerId,
  friendId,
  onClose,
}: FriendStatsScreenProps) {
  const palette = usePalette()
  const friend = computeFriends(history, playerId).friends.find((f) => f.playerId === friendId)

  if (!friend) {
    return (
      <div className="screen inner friend">
        <header className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
            ‹
          </button>
          <h1>Nobody there</h1>
        </header>
        <p className="note">You haven't finished a game with them yet.</p>
      </div>
    )
  }

  return (
    <div className="screen inner friend">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>@{friend.username}</h1>
      </header>

      <section>
        <h2>Side by side</h2>
        {/* Every figure paired rather than listed for you alone: on somebody
            else's page an average means nothing without theirs beside it. */}
        <table className="compare">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">You</th>
              <th scope="col">@{friend.username}</th>
            </tr>
          </thead>
          <tbody>
            {/* One number, not the same number twice: you have played each
                other exactly as often as each other. */}
            <tr>
              <th scope="row">Games together</th>
              <td colSpan={2}>{friend.games}</td>
            </tr>
            <CompareRow label="Won" yours={friend.wins} theirs={friend.losses} />
            <CompareRow label="Level" yours={friend.draws} theirs={friend.draws} />
            <CompareRow label="Lost" yours={friend.losses} theirs={friend.wins} />
            <CompareRow
              label="Average score"
              yours={friend.yourAverageScore.toFixed(1)}
              theirs={friend.theirAverageScore.toFixed(1)}
            />
            <CompareRow
              label="Avg pieces left"
              yours={friend.yourAveragePiecesLeft.toFixed(1)}
              theirs={friend.theirAveragePiecesLeft.toFixed(1)}
            />
            <CompareRow
              label="Avg squares left"
              yours={friend.yourAverageSquaresLeft.toFixed(1)}
              theirs={friend.theirAverageSquaresLeft.toFixed(1)}
            />
            <CompareRow
              label="Perfect games"
              yours={friend.yourPerfectGames}
              theirs={friend.theirPerfectGames}
            />
          </tbody>
        </table>
        <p className="note">
          Won, level and lost count who finished above whom, not who won the game — in a game with
          other people in it those are different questions.
        </p>
      </section>

      <section>
        <h2>Your piece against them</h2>
        {friend.favoritePiece ? (
          <div className="friend-piece">
            <PieceIcon
              cells={PIECE_BY_ID[friend.favoritePiece.pieceId].cells}
              color={friend.meetings[0]?.yourColor ?? 'blue'}
              cellSize={16}
            />
            <p className="note">
              You get this one down in {friend.favoritePiece.yours} of your{' '}
              {friend.games} games together
              {/* The comparison is the whole point: everybody places the small
                  pieces, so a plain count would name the same one for both of
                  you. */}
              {`, against their ${(friend.favoritePiece.theirRate * friend.games).toFixed(0)}.`}
            </p>
          </div>
        ) : (
          <p className="note">
            Needs {MIN_GAMES_FOR_FAVORITES} games together to mean anything — you have{' '}
            {friend.games}.
          </p>
        )}
      </section>

      <section>
        <h2>Every game</h2>
        <ul className="meeting-list">
          {friend.meetings.map((meeting) => (
            <li key={meeting.id}>
              <span className="dots" aria-hidden="true">
                <span className="dot" style={{ background: palette[meeting.yourColor].hex }} />
                <span className="dot" style={{ background: palette[meeting.theirColor].hex }} />
              </span>
              <span className="meeting-main">
                <span className={`meeting-outcome ${meeting.outcome}`}>
                  {OUTCOME_LABEL[meeting.outcome]}
                </span>
                <span className="meeting-sub">
                  {meeting.yourScore} to {meeting.theirScore}
                  {/* Worth flagging: you can finish above somebody in a game
                      neither of you won. */}
                  {meeting.wonOverall && ' · won the game'}
                </span>
              </span>
              <span className="meeting-when">{shortDate(meeting.finishedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function CompareRow({
  label,
  yours,
  theirs,
}: {
  label: string
  yours: number | string
  theirs: number | string
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{yours}</td>
      <td>{theirs}</td>
    </tr>
  )
}

/** The row that opens one of these, used on the stats screen. */
export function FriendRow({
  friend,
  onOpen,
}: {
  friend: FriendStats
  onOpen: () => void
}) {
  return (
    <li>
      <button type="button" onClick={onOpen}>
        <span className="friend-main">
          <span className="friend-name">@{friend.username}</span>
          <span className="friend-sub">
            {friend.games} {friend.games === 1 ? 'game' : 'games'} together
          </span>
        </span>
        <span className="friend-tally">
          {friend.wins}–{friend.draws}–{friend.losses}
        </span>
      </button>
    </li>
  )
}
