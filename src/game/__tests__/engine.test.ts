import { describe, expect, it } from 'vitest'
import { createEmptyBoard, placeCells } from '../board'
import { advanceTurn, applyMove, createGame, hasAnyLegalMove } from '../engine'
import type { GameState, PlayerState } from '../engine'
import { BOARD_SIZE } from '../types'

describe('createGame', () => {
  it('gives every player all 21 pieces and starts with player 0', () => {
    const state = createGame(['blue', 'yellow', 'red', 'green'])
    expect(state.players).toHaveLength(4)
    for (const player of state.players) {
      expect(player.remainingPieceIds).toHaveLength(21)
      expect(player.hasPlayedFirstMove).toBe(false)
    }
    expect(state.currentPlayerIndex).toBe(0)
    expect(state.gameOver).toBe(false)
  })
})

describe('applyMove', () => {
  it('places the first move, updates player state, and advances the turn', () => {
    const state = createGame(['blue', 'yellow'])
    const next = applyMove(state, { pieceId: 'domino', cells: [[0, 0], [1, 0]] })

    expect(next.board[0][0]).toBe('blue')
    expect(next.board[0][1]).toBe('blue')
    expect(next.players[0].remainingPieceIds).toHaveLength(20)
    expect(next.players[0].hasPlayedFirstMove).toBe(true)
    expect(next.players[0].lastPiecePlayedId).toBe('domino')
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.placedPieces).toHaveLength(1)
  })

  it('throws when the first move does not cover the start corner', () => {
    const state = createGame(['blue', 'yellow'])
    expect(() => applyMove(state, { pieceId: 'monomino', cells: [[5, 5]] })).toThrow(/Illegal move/)
  })

  it('throws when trying to play a piece the player no longer has', () => {
    const state = createGame(['blue', 'yellow'])
    const afterFirst = applyMove(state, { pieceId: 'domino', cells: [[0, 0], [1, 0]] })
    // it's yellow's turn now; simulate blue trying to go again with a piece it just used
    const fakeBlueTurn: GameState = { ...afterFirst, currentPlayerIndex: 0 }
    // corner-touches the existing blue domino at (1,0), so this only fails
    // because 'domino' was already used, not because of placement rules
    expect(() =>
      applyMove(fakeBlueTurn, { pieceId: 'domino', cells: [[2, 1], [3, 1]] }),
    ).toThrow(/piece already played/)
  })
})

describe('hasAnyLegalMove', () => {
  it('is true for a fresh player on an empty board (can always play the first move)', () => {
    const player: PlayerState = {
      color: 'blue',
      remainingPieceIds: ['monomino'],
      hasPlayedFirstMove: false,
      lastPiecePlayedId: null,
      passedOut: false,
    }
    expect(hasAnyLegalMove(createEmptyBoard(), player)).toBe(true)
  })

  it('is false when the board is completely full', () => {
    let board = createEmptyBoard()
    const allCells: [number, number][] = []
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) allCells.push([c, r])
    }
    board = placeCells(board, 'red', allCells)

    const player: PlayerState = {
      color: 'blue',
      remainingPieceIds: ['monomino'],
      hasPlayedFirstMove: true,
      lastPiecePlayedId: null,
      passedOut: false,
    }
    expect(hasAnyLegalMove(board, player)).toBe(false)
  })
})

describe('advanceTurn', () => {
  it('skips a player who has already played all their pieces', () => {
    const state: GameState = {
      board: createEmptyBoard(),
      players: [
        { color: 'blue', remainingPieceIds: [], hasPlayedFirstMove: true, lastPiecePlayedId: 'monomino', passedOut: false },
        { color: 'yellow', remainingPieceIds: ['monomino'], hasPlayedFirstMove: false, lastPiecePlayedId: null, passedOut: false },
      ],
      currentPlayerIndex: 0,
      placedPieces: [],
      gameOver: false,
    }
    const next = advanceTurn(state)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.gameOver).toBe(false)
  })

  it('ends the game when no remaining player has any pieces left', () => {
    const state: GameState = {
      board: createEmptyBoard(),
      players: [
        { color: 'blue', remainingPieceIds: [], hasPlayedFirstMove: true, lastPiecePlayedId: 'monomino', passedOut: false },
        { color: 'yellow', remainingPieceIds: [], hasPlayedFirstMove: true, lastPiecePlayedId: 'monomino', passedOut: false },
      ],
      currentPlayerIndex: 0,
      placedPieces: [],
      gameOver: false,
    }
    const next = advanceTurn(state)
    expect(next.gameOver).toBe(true)
  })
})
