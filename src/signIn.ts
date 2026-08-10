import { newPlayerId, normalizeUsername, usernameProblem } from './account'
import type { Account } from './account'
import { getBackend } from './backend'
import type { PlayerProfile } from './backend'

/**
 * What happened when a name was looked up, and what the caller should do next.
 *
 * `taken` is not an error. With no passwords, typing a name that already exists
 * is how you sign in on a second device — so the UI asks "is this you?" rather
 * than "that name is unavailable". Only renaming treats it as a refusal.
 */
export type UsernameCheck =
  | { status: 'invalid'; reason: string }
  | { status: 'free' }
  | { status: 'taken'; profile: PlayerProfile }
  | { status: 'yours'; profile: PlayerProfile }
  | { status: 'error'; reason: string }

/**
 * Looks a name up. `currentPlayerId` is the person asking, when there is one,
 * so their own name comes back as `yours` rather than as somebody else's.
 */
export async function checkUsername(
  username: string,
  currentPlayerId?: string,
): Promise<UsernameCheck> {
  const problem = usernameProblem(username)
  if (problem) return { status: 'invalid', reason: problem }

  try {
    const profile = await getBackend().lookupUsername(username)
    if (!profile) return { status: 'free' }
    return profile.playerId === currentPlayerId
      ? { status: 'yours', profile }
      : { status: 'taken', profile }
  } catch (error) {
    return { status: 'error', reason: describeError(error) }
  }
}

/**
 * Takes the name, as a new person or as one who already exists.
 *
 * Pass `adoptPlayerId` to become an existing player — that is the second-device
 * case, and it is why the games follow you. Pass `existing` when an already
 * signed-in player is renaming, so the old name is released.
 */
export async function claim(
  username: string,
  options: { adoptPlayerId?: string; existing?: Account } = {},
): Promise<Account> {
  const trimmed = username.trim()
  const problem = usernameProblem(trimmed)
  if (problem) throw new Error(problem)

  const playerId = options.adoptPlayerId ?? options.existing?.playerId ?? newPlayerId()
  const renamedFrom =
    options.existing && normalizeUsername(options.existing.username) !== normalizeUsername(trimmed)
      ? options.existing.username
      : undefined

  await getBackend().claimUsername(playerId, trimmed, renamedFrom)
  return { playerId, username: trimmed }
}

/**
 * A message worth showing a player. Firebase's own errors name internal things
 * ("permission-denied", "unavailable"), so they get translated; anything else
 * falls back to its message.
 */
function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? ''

  if (code.includes('permission-denied')) return "The server wouldn't allow that. Try again later."
  if (code.includes('unavailable') || code.includes('network')) {
    return "Can't reach the server. Check your connection."
  }
  return error instanceof Error && error.message ? error.message : 'Something went wrong.'
}
