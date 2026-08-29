import { createContext, useContext } from 'react'
import { DEFAULT_PALETTE_ID, resolvePalette } from './palette'
import type { PaintedColor } from './palette'
import type { Color } from './game'

/**
 * The colours the app is currently drawn in, and what to call them.
 *
 * A context rather than the constant this used to be, because the palette is now
 * a setting: changing it has to repaint the board, and a module-level value
 * would change without anything re-rendering. Every component that draws a seat
 * reads it through `usePalette`.
 *
 * The default is the classic set, so a component rendered outside the provider —
 * in a test, most likely — still draws something sensible rather than nothing.
 */
const PaletteContext = createContext<Record<Color, PaintedColor>>(
  resolvePalette(DEFAULT_PALETTE_ID),
)

export const PaletteProvider = PaletteContext.Provider

export function usePalette(): Record<Color, PaintedColor> {
  return useContext(PaletteContext)
}

/** The hex of each seat, for the common case of just needing to paint one. */
export function useColorHex(): Record<Color, string> {
  const palette = usePalette()
  return {
    blue: palette.blue.hex,
    yellow: palette.yellow.hex,
    red: palette.red.hex,
    green: palette.green.hex,
  }
}
