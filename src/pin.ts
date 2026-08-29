/**
 * The four digits that stop a friend typing your name and becoming you.
 *
 * **What this does and does not buy, stated plainly.** There is no server code
 * here — only a database — so the PIN is checked on the device, which means the
 * check has to fetch what it compares against. Anyone holding the link can read
 * that stored value. It is a slow salted hash rather than the digits themselves,
 * so reading it does not hand anybody your PIN, but four digits is ten thousand
 * possibilities and somebody determined could grind through them offline.
 *
 * That is the intended trade, not an oversight. The thing being prevented is a
 * friend idly typing `eric` and finding themselves signed in as you. A friends
 * app does not need to survive an attacker who has the link, wants in, and is
 * prepared to write code — and buying that would mean a real login, which is
 * exactly the machinery this app has always chosen not to have.
 *
 * There is deliberately no recovery. Nothing here knows an email or a phone
 * number, so there is nothing to prove ownership against: forget the PIN and the
 * name is gone, along with the games filed under it. The app says so where a PIN
 * is set, because a surprise on that point is unrecoverable.
 */

export const PIN_LENGTH = 4

/**
 * How much work a single guess costs.
 *
 * Worth being clear-eyed about, because the arithmetic is not flattering. Four
 * digits is ten thousand possibilities, so the total cost of trying every one is
 * ten thousand times this. Even at a fifth of a second per guess — far more than
 * anyone will tolerate on a phone — that is under an hour. No iteration count
 * rescues a four-digit secret from somebody willing to grind it offline; raising
 * this only moves the number of minutes.
 *
 * So it is set where it costs a person nothing and a script something: high
 * enough that guessing is not instant, low enough to be imperceptible once per
 * device. What actually protects the account is that the people with the link
 * are friends.
 */
const ITERATIONS = 600_000

/**
 * A PIN as it is stored. `iterations` travels with it so the cost can be raised
 * later without locking out everybody who set one before.
 */
export interface PinRecord {
  salt: string
  hash: string
  iterations: number
}

/** Why a PIN can't be used, or null if it can. Written to be shown as-is. */
export function pinProblem(pin: string): string | null {
  if (pin.length === 0) return 'Pick a 4-digit PIN.'
  if (!/^\d+$/.test(pin)) return 'Digits only.'
  if (pin.length !== PIN_LENGTH) return `${PIN_LENGTH} digits.`
  return null
}

export function isPinValid(pin: string): boolean {
  return pinProblem(pin) === null
}

/** Turns a PIN into something safe to store. A fresh salt every time. */
export async function hashPin(pin: string, iterations = ITERATIONS): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return {
    salt: toBase64(salt),
    hash: toBase64(await derive(pin, salt, iterations)),
    iterations,
  }
}

/**
 * Whether `pin` is the one behind `record`.
 *
 * Re-derives with the record's own salt and iteration count rather than the
 * current defaults, so raising the cost later doesn't invalidate what is
 * already stored.
 */
export async function verifyPin(pin: string, record: PinRecord | null | undefined): Promise<boolean> {
  if (!record?.salt || !record?.hash) return false

  try {
    const derived = await derive(pin, fromBase64(record.salt), record.iterations || ITERATIONS)
    return toBase64(derived) === record.hash
  } catch {
    // A malformed record can't be matched by anything, which is the safe answer.
    return false
  }
}

/** Whether an account is protected at all. Legacy accounts have no PIN. */
export function hasPin(record: PinRecord | null | undefined): boolean {
  return Boolean(record?.salt && record?.hash)
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
