import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAccount,
  hasBeenPrompted,
  loadAccount,
  markPrompted,
  normalizeUsername,
  saveAccount,
  usernameProblem,
} from '../account'

// The tests run in node, which has no localStorage. A plain map is enough.
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

describe('usernameProblem', () => {
  it('accepts ordinary names', () => {
    for (const name of ['eric', 'Eric', 'eric_32', 'a1', 'sixteencharacter']) {
      expect(usernameProblem(name), name).toBeNull()
    }
  })

  it('rejects names that are empty, too short or too long', () => {
    expect(usernameProblem('')).not.toBeNull()
    expect(usernameProblem('   ')).not.toBeNull()
    expect(usernameProblem('e')).not.toBeNull()
    expect(usernameProblem('seventeencharacte')).not.toBeNull()
  })

  it('rejects anything that would not survive being read out loud', () => {
    expect(usernameProblem('eric nichols')).not.toBeNull()
    expect(usernameProblem('eric!')).not.toBeNull()
    expect(usernameProblem('éric')).not.toBeNull()
    // Digits alone read as an id rather than a name.
    expect(usernameProblem('1234')).not.toBeNull()
  })

  it('ignores surrounding whitespace, so a trailing space is not an error', () => {
    expect(usernameProblem('  eric  ')).toBeNull()
  })
})

describe('normalizeUsername', () => {
  it('treats capitalisation as cosmetic', () => {
    expect(normalizeUsername('Eric')).toBe('eric')
    expect(normalizeUsername('  ERIC ')).toBe('eric')
  })
})

describe('stored account', () => {
  beforeEach(() => {
    installStorage()
  })

  it('survives a round trip', () => {
    saveAccount({ playerId: 'p1', username: 'Eric' })
    expect(loadAccount()).toEqual({ playerId: 'p1', username: 'Eric' })
  })

  it('is empty to begin with, and after signing out', () => {
    expect(loadAccount()).toBeNull()
    saveAccount({ playerId: 'p1', username: 'eric' })
    clearAccount()
    expect(loadAccount()).toBeNull()
  })

  it('ignores a saved value it cannot use rather than throwing', () => {
    localStorage.setItem('blokus:account:v1', 'not json')
    expect(loadAccount()).toBeNull()

    localStorage.setItem('blokus:account:v1', JSON.stringify({ username: 'eric' }))
    expect(loadAccount()).toBeNull()
  })
})

describe('the first-visit prompt', () => {
  beforeEach(() => {
    installStorage()
  })

  it('is shown once and then remembered', () => {
    expect(hasBeenPrompted()).toBe(false)
    markPrompted()
    expect(hasBeenPrompted()).toBe(true)
  })

  it('stays quiet when storage is unavailable, rather than asking every load', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(hasBeenPrompted()).toBe(true)
  })
})
