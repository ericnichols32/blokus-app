import { describe, expect, it, vi } from 'vitest'
import { hasPin, hashPin, isPinValid, PIN_LENGTH, pinProblem, verifyPin } from '../pin'

// Real PBKDF2 at the real cost, several times over.
vi.setConfig({ testTimeout: 60_000 })

/** A cheap cost, for tests that don't care how slow the real one is. */
const FAST = 1_000

describe('what counts as a PIN', () => {
  it('takes four digits', () => {
    expect(pinProblem('0000')).toBeNull()
    expect(pinProblem('1234')).toBeNull()
    expect(isPinValid('9999')).toBe(true)
  })

  it('says what is wrong, in words worth showing', () => {
    expect(pinProblem('')).toMatch(/Pick a 4-digit PIN/)
    expect(pinProblem('12a4')).toBe('Digits only.')
    expect(pinProblem('123')).toBe(`${PIN_LENGTH} digits.`)
    expect(pinProblem('12345')).toBe(`${PIN_LENGTH} digits.`)
  })

  it('refuses a PIN with a space in it rather than trimming one', () => {
    // Trimming would let two different things be typed and both work, and the
    // one that gets stored is whichever was typed first.
    expect(pinProblem('12 4')).toBe('Digits only.')
  })
})

describe('storing a PIN', () => {
  it('never stores the digits themselves', async () => {
    const record = await hashPin('1234', FAST)
    expect(JSON.stringify(record)).not.toContain('1234')
  })

  it('salts every PIN separately, so two people sharing one do not match', async () => {
    const a = await hashPin('1234', FAST)
    const b = await hashPin('1234', FAST)

    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  it('carries its own cost, so raising it later locks nobody out', async () => {
    const old = await hashPin('1234', FAST)
    expect(old.iterations).toBe(FAST)
    // Verified against the cost it was made with, not today's default.
    expect(await verifyPin('1234', old)).toBe(true)
  })
})

describe('checking a PIN', () => {
  it('accepts the right one and refuses the rest', async () => {
    const record = await hashPin('4821', FAST)

    expect(await verifyPin('4821', record)).toBe(true)
    expect(await verifyPin('4822', record)).toBe(false)
    expect(await verifyPin('', record)).toBe(false)
    expect(await verifyPin('482', record)).toBe(false)
  })

  it('refuses everything when there is nothing to check against', async () => {
    // An account with no PIN must not be enterable by guessing an empty one.
    expect(await verifyPin('1234', null)).toBe(false)
    expect(await verifyPin('1234', undefined)).toBe(false)
    expect(await verifyPin('', null)).toBe(false)
  })

  it('refuses a damaged record rather than throwing', async () => {
    expect(await verifyPin('1234', { salt: 'not base64!!', hash: 'x', iterations: FAST })).toBe(false)
    expect(await verifyPin('1234', { salt: '', hash: '', iterations: FAST })).toBe(false)
  })
})

describe('hasPin', () => {
  it('tells a protected account from a legacy one', async () => {
    expect(hasPin(await hashPin('1234', FAST))).toBe(true)
    expect(hasPin(null)).toBe(false)
    expect(hasPin(undefined)).toBe(false)
    expect(hasPin({ salt: '', hash: '', iterations: 1 })).toBe(false)
  })
})

describe('the real cost', () => {
  it('is set high enough to be worth having', async () => {
    // Asserted on the stored figure rather than on the clock: how long this
    // takes depends entirely on the machine, and a millisecond threshold would
    // pass on a laptop and fail on a phone for no useful reason.
    const record = await hashPin('1234')
    expect(record.iterations).toBeGreaterThanOrEqual(500_000)
  })
})
