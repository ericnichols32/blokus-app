import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetBackend } from '../backend'
import { stubBackend } from './helpers/backendStub'
import { createLocalBackend } from '../backend/local'
import { checkUsername, claim, setPin, unlocks } from '../signIn'

function installStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
  return store
}

beforeEach(() => {
  installStorage()
  // The local backend behaves like the real one for everything these tests
  // care about — claim, look up, release — without touching the network.
  resetBackend(createLocalBackend())
})

describe('claiming a name nobody has', () => {
  it('creates a new person', async () => {
    expect(await checkUsername('eric')).toEqual({ status: 'free' })

    const account = await claim('eric')
    expect(account.username).toBe('eric')
    expect(account.playerId).toBeTruthy()
  })

  it('keeps the capitals you typed but matches without them', async () => {
    const account = await claim('Eric')
    expect(account.username).toBe('Eric')

    const check = await checkUsername('eRIC')
    expect(check.status).toBe('taken')
    expect(check).toMatchObject({ profile: { playerId: account.playerId, username: 'Eric' } })
  })

  it('refuses a name the rules reject, without asking the server', async () => {
    expect(await checkUsername('a')).toMatchObject({ status: 'invalid' })
    await expect(claim('a')).rejects.toThrow()
  })
})

describe('signing in on a second device', () => {
  it('adopts the existing person, rather than making a new one', async () => {
    const first = await claim('eric')

    // A different device, so no local account — just the name, typed again.
    const check = await checkUsername('eric')
    expect(check.status).toBe('taken')
    if (check.status !== 'taken') throw new Error('unreachable')

    const second = await claim('eric', { adoptPlayerId: check.profile.playerId })
    expect(second.playerId).toBe(first.playerId)
  })

  it('brings that person the games already filed under them', async () => {
    const backend = createLocalBackend()
    resetBackend(backend)

    const first = await claim('eric')
    await backend.saveGame(first.playerId, { id: 'g1', players: [] } as never)

    const check = await checkUsername('eric')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    const second = await claim('eric', { adoptPlayerId: check.profile.playerId })

    expect(await backend.listGames(second.playerId)).toHaveLength(1)
  })
})

describe('changing your name', () => {
  it('keeps you the same person', async () => {
    const before = await claim('eric')
    const after = await claim('ericn', { existing: before })

    expect(after.playerId).toBe(before.playerId)
    expect(after.username).toBe('ericn')
  })

  it('reports your own name as yours, not as taken', async () => {
    const account = await claim('eric')
    expect(await checkUsername('eric', account.playerId)).toMatchObject({ status: 'yours' })
  })

  it('frees the name you gave up', async () => {
    const account = await claim('eric')
    await claim('ericn', { existing: account })

    expect(await checkUsername('eric')).toEqual({ status: 'free' })
  })

  it('leaves the name alone when only the capitalisation changed', async () => {
    const account = await claim('eric')
    await claim('Eric', { existing: account })

    // Still yours: a rename that only changes case must not release the name
    // and then immediately reclaim it, which would risk losing it.
    expect(await checkUsername('eric', account.playerId)).toMatchObject({ status: 'yours' })
  })
})

describe('when the server is unreachable', () => {
  it('reports something a player can act on', async () => {
    resetBackend(
      stubBackend({
        lookupUsername: () => Promise.reject(Object.assign(new Error('x'), { code: 'unavailable' })),
      }),
    )

    const check = await checkUsername('eric')
    expect(check.status).toBe('error')
    if (check.status !== 'error') throw new Error('unreachable')
    expect(check.reason).toMatch(/connection/i)
  })
})

describe('a PIN on a name', () => {
  it('is required to take a name that has one', async () => {
    const mine = await claim('eric', { pin: '4821' })

    const check = await checkUsername('eric')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(check.needsPin).toBe(true)
    expect(await unlocks(check.profile, '4821')).toBe(true)
    expect(await unlocks(check.profile, '0000')).toBe(false)
    expect(mine.username).toBe('eric')
  })

  it('is not required by a name claimed before PINs existed', async () => {
    // Locking somebody out of their own account is the one thing that cannot be
    // undone, so an account with no PIN stays reachable exactly as before.
    await claim('legacy')

    const check = await checkUsername('legacy')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(check.needsPin).toBe(false)
    expect(await unlocks(check.profile, '')).toBe(true)
    expect(await unlocks(check.profile, 'anything')).toBe(true)
  })

  it('survives signing in on another device', async () => {
    // Adopting an account passes no PIN, and that must leave the stored one
    // alone rather than wiping the protection by arriving.
    const first = await claim('eric', { pin: '4821' })
    await claim('eric', { adoptPlayerId: first.playerId })

    const check = await checkUsername('eric')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(check.needsPin).toBe(true)
    expect(await unlocks(check.profile, '4821')).toBe(true)
  })

  it('survives a rename', async () => {
    const account = await claim('eric', { pin: '4821' })
    await claim('erica', { existing: account })

    const check = await checkUsername('erica')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(check.needsPin).toBe(true)
    expect(await unlocks(check.profile, '4821')).toBe(true)
  })

  it('can be set later by whoever is already signed in', async () => {
    const account = await claim('eric')
    expect((await checkUsername('eric')).status).toBe('taken')

    await setPin(account, '1357')

    const check = await checkUsername('eric')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(check.needsPin).toBe(true)
    expect(await unlocks(check.profile, '1357')).toBe(true)
  })

  it('can be changed, and the old one stops working', async () => {
    const account = await claim('eric', { pin: '1111' })
    await setPin(account, '2222')

    const check = await checkUsername('eric')
    if (check.status !== 'taken') throw new Error('expected the name to be taken')
    expect(await unlocks(check.profile, '2222')).toBe(true)
    expect(await unlocks(check.profile, '1111')).toBe(false)
  })

  it('refuses to store something that is not four digits', async () => {
    await expect(claim('eric', { pin: '12' })).rejects.toThrow(/4 digits/)
    await expect(claim('eric', { pin: 'abcd' })).rejects.toThrow(/Digits only/)

    const account = await claim('dave')
    await expect(setPin(account, '99999')).rejects.toThrow(/4 digits/)
  })
})
