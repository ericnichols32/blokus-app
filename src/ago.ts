/**
 * How long ago, in the roughest terms that are still useful.
 *
 * Deliberately vague past a day: in a game where a turn can take until tomorrow
 * morning, the difference between three days and four is the whole story and
 * the difference between 71 and 73 hours is nothing.
 */
export function ago(iso: string, now = Date.now()): string {
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
