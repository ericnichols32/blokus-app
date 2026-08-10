import { readFirebaseConfig } from './config'
import { createFirebaseBackend } from './firebase'
import { createLocalBackend } from './local'
import type { Backend } from './types'

export type { Backend, PlayerProfile } from './types'

let backend: Backend | null = null

/**
 * The store the app should use: Firestore when a project is configured, and the
 * device-only stand-in when it isn't. Decided once, so the answer can't change
 * halfway through a session.
 */
export function getBackend(): Backend {
  const config = readFirebaseConfig()
  backend ??= config ? createFirebaseBackend(config) : createLocalBackend()
  return backend
}

/** True when accounts are actually shared with anyone else. */
export function isOnline(): boolean {
  return getBackend().kind === 'firebase'
}

/** Test seam: forces the next `getBackend` to decide again. */
export function resetBackend(replacement: Backend | null = null): void {
  backend = replacement
}
