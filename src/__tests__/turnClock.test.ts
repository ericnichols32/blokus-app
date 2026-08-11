import { describe, expect, it } from 'vitest'
import {
  PLACE_MS,
  SELECT_MS,
  phaseFor,
  remaining,
  secondsLeft,
  startTurn,
  switchPhase,
} from '../turnClock'

describe('a fresh turn', () => {
  it('starts on the selection clock with the full budget', () => {
    const clock = startTurn(1000)
    expect(clock.phase).toBe('select')
    expect(remaining(clock, 1000)).toBe(SELECT_MS)
  })

  it('counts down in real time and stops at zero', () => {
    const clock = startTurn(0)
    expect(remaining(clock, 5_000)).toBe(SELECT_MS - 5_000)
    expect(remaining(clock, SELECT_MS)).toBe(0)
    // A backgrounded tab can come back long after the deadline; that must read
    // as expired rather than as a negative countdown.
    expect(remaining(clock, SELECT_MS + 60_000)).toBe(0)
  })

  it('rounds seconds up, so 1 means part of the last second is left', () => {
    const clock = startTurn(0)
    expect(secondsLeft(clock, 0)).toBe(15)
    expect(secondsLeft(clock, 14_001)).toBe(1)
    expect(secondsLeft(clock, 15_000)).toBe(0)
  })
})

describe('picking a piece up', () => {
  it('switches to the placement clock, which starts full', () => {
    const clock = switchPhase(startTurn(0), 'place', 4_000)
    expect(clock.phase).toBe('place')
    expect(remaining(clock, 4_000)).toBe(PLACE_MS)
  })

  it('freezes whatever was left to select', () => {
    const clock = switchPhase(startTurn(0), 'place', 4_000)
    // Eight seconds pass on the placement clock; the selection budget is untouched.
    const back = switchPhase(clock, 'select', 12_000)
    expect(remaining(back, 12_000)).toBe(SELECT_MS - 4_000)
  })
})

describe('changing your mind', () => {
  /**
   * The property that keeps the mode honest. Swapping pieces must not hand back
   * time, or a turn could be held open indefinitely by tapping between two of
   * them.
   */
  it('does not refill either clock', () => {
    let clock = startTurn(0)
    clock = switchPhase(clock, 'place', 3_000) // picked one up at t=3s
    clock = switchPhase(clock, 'select', 8_000) // put it back at t=8s
    clock = switchPhase(clock, 'place', 9_000) // picked another at t=9s

    // 5s of the placement budget was spent on the first piece, and 1s more of
    // the selection budget while deciding.
    expect(remaining(clock, 9_000)).toBe(PLACE_MS - 5_000)
    expect(switchPhase(clock, 'select', 9_000).selectLeft).toBe(SELECT_MS - 4_000)
  })

  it('runs the placement clock out even across several pieces', () => {
    let clock = startTurn(0)
    clock = switchPhase(clock, 'place', 1_000)
    clock = switchPhase(clock, 'select', 8_000)
    clock = switchPhase(clock, 'place', 8_500)

    // 7s spent, 8s left — so it expires 8s later, not 15.
    expect(remaining(clock, 16_500)).toBe(0)
  })
})

describe('switchPhase', () => {
  it('is a no-op when already in that phase, so a stray render costs nothing', () => {
    const clock = startTurn(0)
    expect(switchPhase(clock, 'select', 5_000)).toBe(clock)
  })
})

describe('phaseFor', () => {
  it('follows whether a piece is in hand', () => {
    expect(phaseFor(null)).toBe('select')
    expect(phaseFor('pentomino-X')).toBe('place')
  })
})
