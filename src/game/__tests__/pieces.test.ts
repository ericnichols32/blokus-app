import { describe, expect, it } from 'vitest'
import { getOrientations, PIECE_DEFINITIONS } from '../pieces'

describe('PIECE_DEFINITIONS', () => {
  it('has exactly 21 pieces', () => {
    expect(PIECE_DEFINITIONS).toHaveLength(21)
  })

  it('has the correct total cell count per piece family (1+1+3x2+4x5+5x12=97... squares)', () => {
    const totalSquares = PIECE_DEFINITIONS.reduce((sum, p) => sum + p.cells.length, 0)
    // 1x1 + 1x2 + 2x3 + 5x4 + 12x5 = 1 + 2 + 6 + 20 + 60 = 89
    expect(totalSquares).toBe(89)
  })

  it('every piece is edge-connected (no floating cells)', () => {
    for (const piece of PIECE_DEFINITIONS) {
      const cellSet = new Set(piece.cells.map(([c, r]) => `${c},${r}`))
      const visited = new Set<string>()
      const stack = [piece.cells[0]]
      while (stack.length) {
        const [c, r] = stack.pop()!
        const k = `${c},${r}`
        if (visited.has(k)) continue
        visited.add(k)
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nk = `${c + dc},${r + dr}`
          if (cellSet.has(nk) && !visited.has(nk)) stack.push([c + dc, r + dr])
        }
      }
      expect(visited.size, `${piece.id} should be fully connected`).toBe(piece.cells.length)
    }
  })
})

describe('getOrientations', () => {
  it('monomino has exactly 1 orientation (fully symmetric)', () => {
    expect(getOrientations('monomino')).toHaveLength(1)
  })

  it('domino has exactly 2 orientations (horizontal/vertical)', () => {
    expect(getOrientations('domino')).toHaveLength(2)
  })

  it('tetromino-O (square) has exactly 1 orientation', () => {
    expect(getOrientations('tetromino-O')).toHaveLength(1)
  })

  it('pentomino-X (plus) has exactly 1 orientation', () => {
    expect(getOrientations('pentomino-X')).toHaveLength(1)
  })

  it('tromino-L has exactly 4 orientations (no reflection symmetry needed since L=rotated version covers it, but flips add none new)', () => {
    // An L-tromino's mirror image is reachable by rotation, so flip doesn't add new shapes.
    expect(getOrientations('tromino-L')).toHaveLength(4)
  })

  it('pentomino-F has 8 distinct orientations (chiral piece)', () => {
    expect(getOrientations('pentomino-F')).toHaveLength(8)
  })

  it('every orientation preserves the piece cell count', () => {
    for (const piece of PIECE_DEFINITIONS) {
      for (const orientation of getOrientations(piece.id)) {
        expect(orientation.cells).toHaveLength(piece.cells.length)
      }
    }
  })

  it('every orientation is normalized to a non-negative bounding box starting at 0,0', () => {
    for (const piece of PIECE_DEFINITIONS) {
      for (const orientation of getOrientations(piece.id)) {
        const minCol = Math.min(...orientation.cells.map((c) => c[0]))
        const minRow = Math.min(...orientation.cells.map((c) => c[1]))
        expect(minCol).toBe(0)
        expect(minRow).toBe(0)
      }
    }
  })
})
