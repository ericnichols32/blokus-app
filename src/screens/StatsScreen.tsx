import { useMemo } from 'react'
import { usePalette } from '../colors'
import { PieceIcon } from '../components/PieceIcon'
import { PIECE_BY_ID, strengthLabel } from '../game'
import type { Color, PieceId } from '../game'
import type { GameRecord } from '../history'
import { computeFriends, computeStats, MIN_GAMES_FOR_FAVORITES } from '../stats'
import { FriendRow } from './FriendStatsScreen'
import type { Outcome, PieceTally, RecentGame } from '../stats'
import type { Account } from '../account'
import './StatsScreen.css'

interface StatsScreenProps {
  history: GameRecord[]
  /** Whose stats these are, when a name has been claimed. */
  account: Account | null
  onClose: () => void
  onPlaySolo: () => void
  onOpenFriend: (friendId: string) => void
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  win: 'Won',
  draw: 'Drew',
  loss: 'Lost',
}

/** 'pentomino-X' reads as 'Pentomino X'. */
function pieceName(id: PieceId): string {
  const [family, letter] = id.split('-')
  const named = family.charAt(0).toUpperCase() + family.slice(1)
  return letter ? `${named} ${letter}` : named
}

/**
 * Day and month, which is as much as is worth showing on a phone. A record with
 * an unparseable date shows nothing rather than 'Invalid Date'.
 */
function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Whole percent. Only ever called with at least one game. */
function percent(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`
}

export function StatsScreen({
  history,
  account,
  onClose,
  onPlaySolo,
  onOpenFriend,
}: StatsScreenProps) {
  const palette = usePalette()
  const stats = useMemo(() => computeStats(history), [history])
  // Only meaningful for somebody with a name — the records are keyed by it.
  const friends = useMemo(
    () => (account ? computeFriends(history, account.playerId) : null),
    [history, account],
  )
  // The pieces are drawn in whatever colour you play most, so the screen looks
  // like your games rather than like a default.
  const inkColor: Color = stats.favoriteColor ?? 'blue'

  return (
    <div className="screen inner stats">
      <header className="screen-header">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
          ‹
        </button>
        <h1>Stats</h1>
        {account && <span className="whose">@{account.username}</span>}
      </header>

      {stats.games === 0 ? (
        <section className="empty">
          <p className="empty-title">No games to count yet</p>
          <p className="empty-sub">
            Finish a game against the computer and it lands here — wins, pieces left, the pieces you
            favor, and how you do with each color.
          </p>
          {stats.sharedGames > 0 && (
            /* Otherwise the home screen saying games are saved, next to a stats
               screen saying there are none, reads as a bug rather than a rule. */
            <p className="empty-sub">
              {stats.sharedGames === 1
                ? 'One older game is saved'
                : `${stats.sharedGames} older games are saved`}{' '}
              from back when four people could share one phone. Nothing in those records says which
              player was you, so they can't count towards a record.
            </p>
          )}
          <button type="button" className="btn primary tall" onClick={onPlaySolo}>
            <span>Play the computer</span>
          </button>
        </section>
      ) : (
        <>
          <section>
            <h2>Record</h2>
            <div className="tiles">
              <Tile value={stats.games} label={stats.games === 1 ? 'Game played' : 'Games played'} />
              <Tile value={stats.wins} label="Won" sub={percent(stats.wins, stats.games)} accent />
              <Tile value={stats.draws} label="Drawn" />
              <Tile value={stats.losses} label="Lost" />
            </div>
            {stats.draws > 0 && (
              <p className="note">
                A draw is finishing level at the top — Blokus ties are common enough to keep apart
                from wins.
              </p>
            )}
          </section>

          <section>
            <h2>Your game</h2>
            <div className="tiles">
              {/* Two halves of the same idea, side by side and worded the same
                  way, so the pair reads as one measurement at two scales. One
                  decimal on pieces because the number is small enough for the
                  fraction to matter; squares are whole, where it would be noise. */}
              <Tile
                value={stats.averagePiecesLeft?.toFixed(1) ?? '—'}
                label="Pieces left"
                sub="average per game"
              />
              <Tile
                value={stats.averageSquaresLeft?.toFixed(0) ?? '—'}
                label="Squares left"
                sub="average per game"
              />
              {/* Third of three, so it takes the whole row rather than sitting
                  on its own next to a gap. */}
              <Tile
                value={stats.perfectGames}
                label={stats.perfectGames === 1 ? 'Perfect game' : 'Perfect games'}
                sub="all 21 pieces placed"
                accent={stats.perfectGames > 0}
                wide
              />
            </div>
          </section>

          <section>
            <h2>Colors</h2>
            <ul className="color-list">
              {stats.colors.map((tally) => (
                <li key={tally.color}>
                  <span className="dot" style={{ background: palette[tally.color].hex }} />
                  <span className="color-name">{palette[tally.color].name}</span>
                  <span className="color-count">
                    {tally.won} of {tally.played} won
                  </span>
                  <span className="bar" aria-hidden="true">
                    <span
                      className="bar-fill"
                      style={{
                        width: percent(tally.won, tally.played),
                        background: palette[tally.color].hex,
                      }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            {stats.favoriteColor && stats.colors.length > 1 && (
              <p className="note">
                You play {palette[stats.favoriteColor].name.toLowerCase()} more than any other color.
              </p>
            )}
          </section>

          <section>
            <h2>Pieces</h2>
            {stats.favoritePiece === null ? (
              <p className="note">
                Your favorite piece needs {MIN_GAMES_FOR_FAVORITES} games to mean anything — {stats.games}{' '}
                so far. With fewer than that, any piece you happen to have placed twice ties for
                first.
              </p>
            ) : (
              <div className="stack">
                <PieceCard
                  heading="Favorite piece"
                  tally={stats.favoritePiece}
                  color={inkColor}
                  detail={favoriteDetail(stats.favoritePiece, stats.games)}
                />
                {stats.leftBehindPiece && (
                  <PieceCard
                    heading="Left behind most"
                    tally={stats.leftBehindPiece}
                    color={inkColor}
                    detail={`Still in your hand at the end of ${stats.leftBehindPiece.yours} ${
                      stats.leftBehindPiece.yours === 1 ? 'game' : 'games'
                    }.`}
                  />
                )}
              </div>
            )}
          </section>

          <section>
            <h2>Recent games</h2>
            <ul className="recent-list">
              {stats.recent.map((game) => (
                <RecentRow key={game.id} game={game} />
              ))}
            </ul>
          </section>

          {friends && (friends.friends.length > 0 || friends.unattributedGames > 0) && (
            <section>
              <h2>Friends</h2>
              <ul className="friend-list">
                {friends.friends.map((friend) => (
                  <FriendRow
                    key={friend.playerId}
                    friend={friend}
                    onOpen={() => onOpenFriend(friend.playerId)}
                  />
                ))}
              </ul>
              {friends.friends.length > 0 && (
                <p className="note">
                  Won, level, lost — against each of them, counting who finished above whom rather
                  than who won the game.
                </p>
              )}
              {friends.unattributedGames > 0 && (
                /* A thin record deserves its reason, rather than looking wrong. */
                <p className="note">
                  {friends.unattributedGames === 1
                    ? 'One earlier online game is'
                    : `${friends.unattributedGames} earlier online games are`}{' '}
                  missing from this: games only started recording who held each seat recently, so
                  anything before that can't be attributed to anyone.
                </p>
              )}
            </section>
          )}

          {stats.sharedGames > 0 && (
            <section>
              <h2>Not counted</h2>
              <p className="note">
                {stats.sharedGames === 1
                  ? 'One older game is'
                  : `${stats.sharedGames} older games are`}{' '}
                saved from when four people could share one phone. Nothing in those records says
                which player was you, so they stay out of the figures above.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Says how the favourite was arrived at, because "favourite" is a claim that
 * needs backing: it is the piece you get down more often than the computers do
 * in the same games, not simply the one you place most.
 */
function favoriteDetail(tally: PieceTally, games: number): string {
  const yours = `You place it in ${tally.yours} of ${games} ${games === 1 ? 'game' : 'games'}`
  const theirs = Math.round(tally.theirRate * 100)
  return `${yours} — your opponents manage it ${theirs}% of the time.`
}

interface TileProps {
  value: number | string
  label: string
  sub?: string
  accent?: boolean
  /** Spans both columns, for the odd tile at the end of a section. */
  wide?: boolean
}

function Tile({ value, label, sub, accent, wide }: TileProps) {
  return (
    <div className={`tile ${accent ? 'accent' : ''} ${wide ? 'wide' : ''}`}>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  )
}

interface PieceCardProps {
  heading: string
  tally: PieceTally
  color: Color
  detail: string
}

function PieceCard({ heading, tally, color, detail }: PieceCardProps) {
  return (
    <div className="piece-card">
      <div className="piece-art" aria-hidden="true">
        <PieceIcon cells={PIECE_BY_ID[tally.pieceId].cells} color={color} cellSize={12} />
      </div>
      <div className="piece-text">
        <span className="piece-heading">{heading}</span>
        <strong>{pieceName(tally.pieceId)}</strong>
        <span className="sub">{detail}</span>
      </div>
    </div>
  )
}

function RecentRow({ game }: { game: RecentGame }) {
  const palette = usePalette()
  return (
    <li>
      <span className="dot" style={{ background: palette[game.color].hex }} />
      <span className="recent-main">
        <span className={`outcome ${game.outcome}`}>{OUTCOME_LABEL[game.outcome]}</span>
        <span className="recent-sub">
          {game.score > 0 ? `+${game.score}` : game.score} ·{' '}
          {game.perfectGame
            ? 'all 21 placed'
            : `${game.piecesLeft} ${game.piecesLeft === 1 ? 'piece' : 'pieces'} left`}
          {game.strength !== null && ` · ${strengthLabel(game.strength)}`}
          {game.timed && ' · timed'}
        </span>
      </span>
      <span className="recent-date">{shortDate(game.finishedAt)}</span>
    </li>
  )
}
