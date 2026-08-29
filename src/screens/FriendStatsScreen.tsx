import { usePalette } from '../colors'
import { computeFriends } from '../stats'
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
        <h2>Head to head</h2>
        <div className="head-to-head">
          <Figure value={friend.wins} label="You" accent={friend.wins > friend.losses} />
          <Figure value={friend.draws} label="Level" />
          <Figure value={friend.losses} label="Them" accent={friend.losses > friend.wins} />
        </div>
        <p className="note">
          {friend.games === 1
            ? 'One game together.'
            : `${friend.games} games together — counting who finished above whom, not who won the game.`}
        </p>
      </section>

      <section>
        <h2>Average score</h2>
        <ul className="score-compare">
          <li>
            <span>You</span>
            <strong>{friend.yourAverageScore.toFixed(1)}</strong>
          </li>
          <li>
            <span>@{friend.username}</span>
            <strong>{friend.theirAverageScore.toFixed(1)}</strong>
          </li>
        </ul>
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

function Figure({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className={`figure ${accent ? 'accent' : ''}`}>
      <span className="figure-value">{value}</span>
      <span className="figure-label">{label}</span>
    </div>
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
        <span className="friend-record">
          {friend.wins}–{friend.draws}–{friend.losses}
        </span>
      </button>
    </li>
  )
}
