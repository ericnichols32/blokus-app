import { avatarHue, avatarLetter } from '../photo'
import './Avatar.css'

interface AvatarProps {
  username: string
  /** A stored photo, if they have one. */
  photo?: string
  /** Edge length in pixels. */
  size: number
  className?: string
}

/**
 * Somebody's face, or the next best thing.
 *
 * A friend without a photo gets a letter on a colour derived from their name,
 * which is stable — so the tile is still recognisable before it has been read,
 * which is the whole job an avatar does in a grid.
 */
export function Avatar({ username, photo, size, className }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }

  if (photo) {
    return (
      <img
        className={`avatar ${className ?? ''}`}
        style={style}
        src={photo}
        // Announced by the name beside it in every place this is used, so the
        // picture itself is decoration rather than information.
        alt=""
      />
    )
  }

  return (
    <span
      className={`avatar letter ${className ?? ''}`}
      style={{ ...style, background: `hsl(${avatarHue(username)} 42% 34%)` }}
      aria-hidden="true"
    >
      {avatarLetter(username)}
    </span>
  )
}
