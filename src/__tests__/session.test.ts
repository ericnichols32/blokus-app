import { describe, expect, it } from 'vitest'
import { COLORS } from '../game'
import { drawFirstColor } from '../session'

describe('drawFirstColor', () => {
  it('can land on any of the four, yours included', () => {
    const seen = new Set(Array.from({ length: 400 }, () => drawFirstColor()))
    expect(seen).toEqual(new Set(COLORS))
  })

  it('picks each color with roughly equal chance', () => {
    // A flat index into COLORS, so a fixed random maps to a known color.
    expect(drawFirstColor(() => 0)).toBe(COLORS[0])
    expect(drawFirstColor(() => 0.999)).toBe(COLORS[3])
    expect(drawFirstColor(() => 0.5)).toBe(COLORS[2])
  })
})
