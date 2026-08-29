/**
 * How far the board is pinched, and the rules that keep it usable: it may be
 * pushed around by however much of it hangs off the edge, and no further, and
 * letting a pinch all the way out puts it back square.
 *
 * Kept out of the screen so it can be tested on its own — and because exporting
 * anything but components from a component file breaks fast refresh.
 */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/**
 * How far in a pinch may go. Three times is enough to pick out a single square
 * on a crowded late board without the whole thing becoming a keyhole.
 */
export const MAX_ZOOM = 3

/**
 * Below this, a pinch counts as having been let all the way out and the board
 * snaps back square. A hair above 1 rather than exactly 1, because fingers
 * rarely land on a round number and a board left at 1.004 would sit fractionally
 * off-centre for the rest of the game.
 */
export const ZOOM_SNAP_BACK = 1.02

export interface Zoom {
  scale: number
  x: number
  y: number
}

export const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 }

/**
 * Keeps a zoomed board covering its frame: you may push it around by however
 * much of it is hanging off the edge, and no further. At rest it is pinned
 * square, which is the "snaps back into place" half of zooming out.
 */
export function clampZoom(zoom: Zoom, size: number): Zoom {
  const scale = clamp(zoom.scale, 1, MAX_ZOOM)
  if (scale <= 1) return NO_ZOOM

  const slack = (size * scale - size) / 2
  return { scale, x: clamp(zoom.x, -slack, slack), y: clamp(zoom.y, -slack, slack) }
}
