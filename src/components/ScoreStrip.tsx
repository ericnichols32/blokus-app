import { usePalette } from '../colors'
import { computeScore } from '../game'
import type { Session } from '../session'
import './ScoreStrip.css'

interface ScoreStripProps {
  session: Session
}

export function ScoreStrip({ session }: ScoreStripProps) {
  const palette = usePalette()
  const state = session.state

  return (
    <ul className="score-strip">
      {state.players.map((player, index) => {
        // Squares still in hand — the running score in all but sign, since
        // final scoring is minus one per unplayed square. Lowest is winning.
        const { remainingSquares: left } = computeScore({
          remainingPieceIds: player.remainingPieceIds,
          lastPiecePlayedId: null,
        })
        const isTurn = index === state.currentPlayerIndex && !state.gameOver
        const isYou = session.seats[player.color].kind === 'human' && session.mode === 'solo'

        let className = 'score-chip'
        if (isTurn) className += ' current'
        if (player.passedOut) className += ' out'

        return (
          <li
            key={player.color}
            className={className}
            aria-label={`${palette[player.color].name}${isYou ? ', you' : ''}, ${left} squares left${
              player.passedOut ? ', out of the game' : ''
            }`}
          >
            <span className="dot" style={{ background: palette[player.color].hex }} />
            <span className="count">{left}</span>
            {isYou && <span className="you">you</span>}
          </li>
        )
      })}
    </ul>
  )
}
