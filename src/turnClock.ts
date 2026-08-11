import type { PieceId } from './game'

/** Seconds to choose a piece, and then to get it down. */
export const SELECT_MS = 15_000
export const PLACE_MS = 15_000

export type ClockPhase = 'select' | 'place'

/**
 * The two budgets a timed turn is made of.
 *
 * They are separate and each runs only while its own phase is active — the
 * placement clock does not start until a piece is in hand, and the selection
 * clock stops the moment one is.
 *
 * Crucially both are *continuous across the whole turn* rather than restarted
 * whenever the phase changes. If picking up a different piece reset the
 * placement clock, holding a turn open forever would be a matter of tapping
 * between two pieces; if putting a piece back reset the selection clock, the
 * same trick would work one step earlier. So you get fifteen seconds to commit
 * to something and fifteen to land it, however many times you change your mind
 * in between.
 */
export interface ClockState {
  /** Which budget is currently draining. */
  phase: ClockPhase
  /** Milliseconds left in each, at `since`. */
  selectLeft: number
  placeLeft: number
  /** When the active phase last started draining. */
  since: number
}

export function startTurn(now: number): ClockState {
  return { phase: 'select', selectLeft: SELECT_MS, placeLeft: PLACE_MS, since: now }
}

/** Milliseconds left in the active phase, floored at zero. */
export function remaining(clock: ClockState, now: number): number {
  const budget = clock.phase === 'select' ? clock.selectLeft : clock.placeLeft
  return Math.max(0, budget - (now - clock.since))
}

/** Whole seconds left, rounded up — so "1" means some of the last second remains. */
export function secondsLeft(clock: ClockState, now: number): number {
  return Math.ceil(remaining(clock, now) / 1000)
}

/**
 * Moves to the other phase, banking whatever was left of the one being left.
 * Returns the clock unchanged if it is already in that phase, so this is safe
 * to call from a render that re-runs for unrelated reasons.
 */
export function switchPhase(clock: ClockState, phase: ClockPhase, now: number): ClockState {
  if (clock.phase === phase) return clock

  const left = remaining(clock, now)
  return {
    phase,
    selectLeft: clock.phase === 'select' ? left : clock.selectLeft,
    placeLeft: clock.phase === 'place' ? left : clock.placeLeft,
    since: now,
  }
}

/** Which phase a turn is in, given whether a piece is in hand. */
export function phaseFor(selectedPieceId: PieceId | null): ClockPhase {
  return selectedPieceId === null ? 'select' : 'place'
}
