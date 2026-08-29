import { describe, expect, it } from 'vitest'
import { clampZoom, MAX_ZOOM, NO_ZOOM } from '../boardZoom'

const SIZE = 360

describe('zooming out', () => {
  it('snaps the board back square', () => {
    // "When you zoom all the way out the board will snap back into place."
    expect(clampZoom({ scale: 1, x: 40, y: -25 }, SIZE)).toEqual(NO_ZOOM)
    expect(clampZoom({ scale: 0.4, x: 40, y: -25 }, SIZE)).toEqual(NO_ZOOM)
  })
})

describe('zooming in', () => {
  it('keeps the zoom rather than springing back', () => {
    const zoomed = clampZoom({ scale: 2, x: 0, y: 0 }, SIZE)
    expect(zoomed.scale).toBe(2)
  })

  it('stops at the limit rather than growing without end', () => {
    expect(clampZoom({ scale: 99, x: 0, y: 0 }, SIZE).scale).toBe(MAX_ZOOM)
  })
})

describe('panning a zoomed board', () => {
  it('allows exactly the part hanging off the edge, and no more', () => {
    // Doubled, half the board is off-screen — so it may be pushed by a quarter
    // of its own width in each direction, and never further.
    const slack = (SIZE * 2 - SIZE) / 2

    expect(clampZoom({ scale: 2, x: slack, y: 0 }, SIZE).x).toBe(slack)
    expect(clampZoom({ scale: 2, x: slack + 500, y: 0 }, SIZE).x).toBe(slack)
    expect(clampZoom({ scale: 2, x: -slack - 500, y: 0 }, SIZE).x).toBe(-slack)
  })

  it('leaves no slack at all when the board is not zoomed', () => {
    // Which is what stops an unzoomed board being shoved off to one side.
    expect(clampZoom({ scale: 1, x: 100, y: 100 }, SIZE)).toEqual(NO_ZOOM)
  })

  it('clamps both axes independently', () => {
    const clamped = clampZoom({ scale: 3, x: 9999, y: -9999 }, SIZE)
    expect(clamped.x).toBe(SIZE)
    expect(clamped.y).toBe(-SIZE)
  })
})
