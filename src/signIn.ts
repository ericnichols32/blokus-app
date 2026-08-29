import { newPlayerId, normalizeUsername, usernameProblem } from './account'
import type { Account } from './account'
import { getBackend } from './backend'
import { hasPin, hashPin, pinProblem, verifyPin } from './pin'
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
  | { status: 'taken'; profile: PlayerProfile; needsPin: boolean }
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
    if (profile.playerId === currentPlayerId) return { status: 'yours', profile }

    // Names claimed before PINs existed have none, and must stay reachable by
    // their owners — locking somebody out of their own account is the one thing
    // that cannot be undone here.
    return { status: 'taken', profile, needsPin: hasPin(profile.pin) }
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
  options: { adoptPlayerId?: string; existing?: Account; pin?: string } = {},
): Promise<Account> {
  const trimmed = username.trim()
  const problem = usernameProblem(trimmed)
  if (problem) throw new Error(problem)

  if (options.pin !== undefined) {
    const pinIssue = pinProblem(options.pin)
    if (pinIssue) throw new Error(pinIssue)
  }

  const playerId = options.adoptPlayerId ?? options.existing?.playerId ?? newPlayerId()
  const renamedFrom =
    options.existing && normalizeUsername(options.existing.username) !== normalizeUsername(trimmed)
      ? options.existing.username
      : undefined

  // Hashing is deliberately slow, so only do it when a PIN is actually being
  // set. Leaving it undefined tells the store to keep whatever is already there.
  const record = options.pin === undefined ? undefined : await hashPin(options.pin)

  await getBackend().claimUsername(playerId, trimmed, renamedFrom, record)
  return { playerId, username: trimmed }
}

/**
 * Whether `pin` opens `profile`.
 *
 * An account with no PIN is open to anyone who types the name, exactly as every
 * account was before PINs existed. That is the deliberate cost of not locking
 * out the people who claimed a name first — the app asks them to set one.
 */
export async function unlocks(profile: PlayerProfile, pin: string): Promise<boolean> {
  if (!hasPin(profile.pin)) return true
  return verifyPin(pin, profile.pin)
}

/** Sets or replaces the PIN on the account already signed in on this device. */
export async function setPin(account: Account, pin: string): Promise<void> {
  const problem = pinProblem(pin)
  if (problem) throw new Error(problem)

  await getBackend().claimUsername(
    account.playerId,
    account.username,
    undefined,
    await hashPin(pin),
  )
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
